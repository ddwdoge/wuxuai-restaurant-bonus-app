-- Scope points idempotency by operation so an earn and its reversal may safely
-- use the same client key without weakening either operation's retry contract.

create unique index if not exists points_transactions_restaurant_operation_idempotency_idx
on public.points_transactions (
  restaurant_id,
  (
    case
      when type = 'earn' then 'earn'
      when reversal_of is not null or collection_source = 'reversal' then 'reverse'
      else 'other:' || coalesce(collection_source, type, 'unknown')
    end
  ),
  idempotency_key
)
where idempotency_key is not null;

drop index if exists public.points_transactions_restaurant_idempotency_idx;

create table if not exists public.points_reverse_idempotency_claims (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  idempotency_key uuid not null,
  original_transaction_id uuid not null references public.points_transactions(id) on delete restrict,
  payload_fingerprint text not null check (
    payload_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  status text not null default 'processing' check (
    status in ('processing', 'completed')
  ),
  reversal_transaction_id uuid references public.points_transactions(id) on delete restrict,
  result_payload jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (restaurant_id, idempotency_key)
);

alter table public.points_reverse_idempotency_claims enable row level security;
revoke all on table public.points_reverse_idempotency_claims from anon, authenticated;

create index if not exists points_reverse_idempotency_claims_reversal_idx
on public.points_reverse_idempotency_claims (reversal_transaction_id)
where reversal_transaction_id is not null;

create or replace function public.normalize_points_reversal_reason_v1(input_reason text)
returns text
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $$
  select nullif(regexp_replace(btrim(input_reason), '[[:space:]]+', ' ', 'g'), '')
$$;

revoke execute on function public.normalize_points_reversal_reason_v1(text)
from public, anon, authenticated;

create or replace function public.compute_points_reverse_fingerprint_v1(
  input_restaurant_id uuid,
  input_original_transaction_id uuid,
  input_reason text
)
returns text
language sql
immutable
parallel safe
set search_path = public, extensions, pg_temp
as $$
  select encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'restaurant_id', input_restaurant_id,
          'operation_type', 'reverse',
          'original_transaction_id', input_original_transaction_id,
          'reason', public.normalize_points_reversal_reason_v1(input_reason)
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
$$;

revoke execute on function public.compute_points_reverse_fingerprint_v1(
  uuid, uuid, text
) from public, anon, authenticated;

create or replace function public.reverse_restaurant_controlled_points(
  input_restaurant_id uuid,
  input_transaction_id uuid,
  input_reason text,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  original public.points_transactions%rowtype;
  existing_claim public.points_reverse_idempotency_claims%rowtype;
  existing_reversal public.points_transactions%rowtype;
  normalized_reason text;
  request_fingerprint_value text;
  historical_fingerprint text;
  reversal_id uuid;
  next_balance integer;
  response_payload jsonb;
begin
  if not exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = input_restaurant_id
      and rm.user_id = auth.uid()
      and rm.role in ('owner', 'manager')
  ) then
    raise exception 'Nicht berechtigt.';
  end if;

  normalized_reason := public.normalize_points_reversal_reason_v1(input_reason);
  if input_idempotency_key is null or length(coalesce(normalized_reason, '')) < 5 then
    raise exception 'Buchungs-ID und Begründung sind erforderlich.';
  end if;

  request_fingerprint_value := public.compute_points_reverse_fingerprint_v1(
    input_restaurant_id,
    input_transaction_id,
    normalized_reason
  );

  -- Reverse keys are independent of earn keys but serialize all retries of the
  -- same reverse operation inside the restaurant.
  perform pg_advisory_xact_lock(hashtextextended(
    'points-reverse-idempotency:' || input_restaurant_id::text || ':' ||
      input_idempotency_key::text,
    0
  ));

  select * into existing_claim
  from public.points_reverse_idempotency_claims pric
  where pric.restaurant_id = input_restaurant_id
    and pric.idempotency_key = input_idempotency_key
  for update;

  if existing_claim.idempotency_key is not null then
    if existing_claim.original_transaction_id <> input_transaction_id
      or existing_claim.payload_fingerprint <> request_fingerprint_value then
      return jsonb_build_object(
        'success', false,
        'error_code', 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH',
        'error_message', 'Diese Buchungs-ID wurde bereits für einen anderen Vorgang verwendet.'
      );
    end if;

    if existing_claim.status = 'completed' then
      return existing_claim.result_payload;
    end if;

    return jsonb_build_object(
      'success', false,
      'error_code', 'POINTS_REQUEST_IN_PROGRESS',
      'error_message', 'Diese Buchung wird bereits verarbeitet.'
    );
  end if;

  -- Bind reversal rows created before this migration on their first retry.
  select * into existing_reversal
  from public.points_transactions pt
  where pt.restaurant_id = input_restaurant_id
    and pt.idempotency_key = input_idempotency_key
    and pt.reversal_of is not null
    and pt.collection_source = 'reversal'
  limit 1;

  if existing_reversal.id is not null then
    historical_fingerprint := public.compute_points_reverse_fingerprint_v1(
      existing_reversal.restaurant_id,
      existing_reversal.reversal_of,
      existing_reversal.reason
    );
    if existing_reversal.reversal_of <> input_transaction_id
      or historical_fingerprint <> request_fingerprint_value then
      return jsonb_build_object(
        'success', false,
        'error_code', 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH',
        'error_message', 'Diese Buchungs-ID wurde bereits für einen anderen Vorgang verwendet.'
      );
    end if;

    select c.points_balance into next_balance
    from public.customers c
    where c.id = existing_reversal.customer_id
      and c.restaurant_id = input_restaurant_id;

    response_payload := jsonb_build_object(
      'reversal_transaction_id', existing_reversal.id,
      'points_balance', next_balance,
      'already_reversed', true
    );

    insert into public.points_reverse_idempotency_claims (
      restaurant_id, idempotency_key, original_transaction_id,
      payload_fingerprint, status, reversal_transaction_id,
      result_payload, completed_at
    ) values (
      input_restaurant_id, input_idempotency_key, input_transaction_id,
      request_fingerprint_value, 'completed', existing_reversal.id,
      response_payload, now()
    );
    return response_payload;
  end if;

  insert into public.points_reverse_idempotency_claims (
    restaurant_id, idempotency_key, original_transaction_id,
    payload_fingerprint
  ) values (
    input_restaurant_id, input_idempotency_key, input_transaction_id,
    request_fingerprint_value
  );

  select * into original
  from public.points_transactions pt
  where pt.id = input_transaction_id
    and pt.restaurant_id = input_restaurant_id
    and pt.type = 'earn'
    and pt.collection_source = 'restaurant_controlled'
  for update;
  if original.id is null then
    raise exception 'Buchung wurde nicht gefunden.';
  end if;

  select * into existing_reversal
  from public.points_transactions pt
  where pt.reversal_of = original.id
  limit 1;

  if existing_reversal.id is not null then
    select c.points_balance into next_balance
    from public.customers c
    where c.id = original.customer_id
      and c.restaurant_id = input_restaurant_id;

    response_payload := jsonb_build_object(
      'reversal_transaction_id', existing_reversal.id,
      'points_balance', next_balance,
      'already_reversed', true
    );

    update public.points_reverse_idempotency_claims pric
    set status = 'completed',
        reversal_transaction_id = existing_reversal.id,
        result_payload = response_payload,
        completed_at = now()
    where pric.restaurant_id = input_restaurant_id
      and pric.idempotency_key = input_idempotency_key;
    return response_payload;
  end if;

  update public.customers c
  set points_balance = greatest(0, c.points_balance - original.points)
  where c.id = original.customer_id
    and c.restaurant_id = input_restaurant_id
  returning c.points_balance into next_balance;

  insert into public.points_transactions (
    restaurant_id, organization_id, branch_id, customer_id, type, points,
    reason, idempotency_key, amount_cents, rule_version, applied_rate,
    collection_source, staff_user_id, reversal_of, base_points,
    boost_multiplier, boost_source, boost_expires_at, bonus_rule_version
  ) values (
    original.restaurant_id, original.organization_id, original.branch_id,
    original.customer_id, 'adjust', -original.points, normalized_reason,
    input_idempotency_key, original.amount_cents, original.rule_version,
    original.applied_rate, 'reversal', auth.uid(), original.id,
    original.base_points, original.boost_multiplier, original.boost_source,
    original.boost_expires_at, original.bonus_rule_version
  ) returning id into reversal_id;

  perform public.write_audit_event(
    input_restaurant_id, original.customer_id, 'admin', auth.uid(),
    'POINTS_CREDIT_REVERSED', 'completed', 'owner_portal',
    'points_transactions', reversal_id, input_idempotency_key,
    jsonb_build_object(
      'original_transaction_id', original.id,
      'base_points', original.base_points,
      'boost_multiplier', original.boost_multiplier,
      'points_reversed', original.points,
      'bonus_rule_version', original.bonus_rule_version,
      'reason', normalized_reason
    )
  );

  response_payload := jsonb_build_object(
    'reversal_transaction_id', reversal_id,
    'points_balance', next_balance,
    'already_reversed', false
  );

  update public.points_reverse_idempotency_claims pric
  set status = 'completed',
      reversal_transaction_id = reversal_id,
      result_payload = response_payload,
      completed_at = now()
  where pric.restaurant_id = input_restaurant_id
    and pric.idempotency_key = input_idempotency_key;

  return response_payload;
end;
$$;

revoke execute on function public.reverse_restaurant_controlled_points(
  uuid, uuid, text, uuid
) from public, anon;
grant execute on function public.reverse_restaurant_controlled_points(
  uuid, uuid, text, uuid
) to authenticated;

notify pgrst, 'reload schema';
