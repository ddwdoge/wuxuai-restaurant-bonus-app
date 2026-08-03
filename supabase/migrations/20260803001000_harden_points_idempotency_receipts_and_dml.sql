-- Harden points receipt uniqueness, payload-bound idempotency and ledger writes.
-- This migration is additive and intentionally leaves historical rows unchanged.

create or replace function public.normalize_points_receipt_number_v1(input_receipt_number text)
returns text
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $$
  select upper(nullif(btrim(input_receipt_number), ''))
$$;

revoke execute on function public.normalize_points_receipt_number_v1(text)
from public, anon, authenticated;

-- Refuse to install the uniqueness guarantee over ambiguous historical data.
do $$
declare
  duplicate_groups integer;
  legacy_missing_sources integer;
begin
  select count(*) into duplicate_groups
  from (
    select pt.restaurant_id,
      public.normalize_points_receipt_number_v1(pt.receipt_number)
    from public.points_transactions pt
    where pt.type = 'earn'
      and public.normalize_points_receipt_number_v1(pt.receipt_number) is not null
    group by pt.restaurant_id,
      public.normalize_points_receipt_number_v1(pt.receipt_number)
    having count(*) > 1
  ) duplicates;

  if duplicate_groups > 0 then
    raise exception using
      errcode = '23505',
      message = 'POINTS_RECEIPT_LEGACY_DUPLICATES',
      detail = 'Resolve duplicate normalized receipt numbers before applying this migration.';
  end if;

  select count(*) into legacy_missing_sources
  from public.points_transactions pt
  where pt.type = 'earn'
    and pt.collection_source is null;

  if legacy_missing_sources > 0 then
    raise notice 'Existing earn rows without collection_source remain unchanged: %',
      legacy_missing_sources;
  end if;
end
$$;

create unique index if not exists points_transactions_unique_receipt_per_restaurant_idx
on public.points_transactions (
  restaurant_id,
  public.normalize_points_receipt_number_v1(receipt_number)
)
where type = 'earn'
  and public.normalize_points_receipt_number_v1(receipt_number) is not null;

alter table public.points_transactions
  add column if not exists request_fingerprint text;

alter table public.points_transactions
  drop constraint if exists points_transactions_request_fingerprint_check;
alter table public.points_transactions
  add constraint points_transactions_request_fingerprint_check
  check (
    request_fingerprint is null
    or request_fingerprint ~ '^[0-9a-f]{64}$'
  ) not valid;

alter table public.points_transactions
  drop constraint if exists points_transactions_earn_source_check;
alter table public.points_transactions
  add constraint points_transactions_earn_source_check
  check (
    type <> 'earn'
    or (
      collection_source is not null
      and collection_source in ('restaurant_controlled', 'customer_initiated')
    )
  ) not valid;

create table if not exists public.points_idempotency_claims (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  idempotency_key uuid not null,
  action_type text not null check (
    action_type in ('restaurant_controlled_earn', 'customer_initiated_earn', 'reverse')
  ),
  payload_fingerprint text not null check (
    payload_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  status text not null default 'processing' check (
    status in ('processing', 'completed')
  ),
  transaction_id uuid references public.points_transactions(id) on delete restrict,
  result_payload jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (restaurant_id, idempotency_key)
);

alter table public.points_idempotency_claims enable row level security;
revoke all on table public.points_idempotency_claims from anon, authenticated;

create index if not exists points_idempotency_claims_transaction_idx
on public.points_idempotency_claims (transaction_id)
where transaction_id is not null;

create or replace function public.compute_points_request_fingerprint_v1(
  input_restaurant_id uuid,
  input_customer_id uuid,
  input_collection_source text,
  input_amount_cents integer,
  input_normalized_receipt_number text,
  input_qr_reference_id uuid,
  input_action_type text,
  input_context text
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
          'customer_id', input_customer_id,
          'collection_source', input_collection_source,
          'amount_cents', input_amount_cents,
          'receipt_number', public.normalize_points_receipt_number_v1(
            input_normalized_receipt_number
          ),
          'qr_reference_id', input_qr_reference_id,
          'action_type', input_action_type,
          'context', input_context
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
$$;

revoke execute on function public.compute_points_request_fingerprint_v1(
  uuid, uuid, text, integer, text, uuid, text, text
) from public, anon, authenticated;

create or replace function public.points_transaction_result_v1(input_transaction_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'transaction_id', pt.id,
    'base_points', pt.base_points,
    'boost_multiplier', coalesce(pt.boost_multiplier, 1),
    'points_added', pt.points,
    'final_points', pt.points,
    'points_balance', c.points_balance,
    'amount_cents', pt.amount_cents,
    'bonus_rule_version', pt.bonus_rule_version,
    'boost_source', pt.boost_source,
    'boost_expires_at', pt.boost_expires_at,
    'already_completed', true
  )
  from public.points_transactions pt
  join public.customers c
    on c.id = pt.customer_id
   and c.restaurant_id = pt.restaurant_id
  where pt.id = input_transaction_id
$$;

revoke execute on function public.points_transaction_result_v1(uuid)
from public, anon, authenticated;

-- Browser roles may read only through the existing tenant-scoped SELECT policy.
revoke insert, update, delete, truncate, references, trigger
on table public.points_transactions from anon, authenticated;
drop policy if exists "points transactions admin insert"
on public.points_transactions;

-- Keep the minimum-amount wrapper intact as a private dependency and install a
-- payload-bound public confirmation contract around it.
alter function public.confirm_restaurant_controlled_points(
  uuid, text, integer, text, uuid, text
) rename to confirm_restaurant_controlled_points_before_security_guard;

revoke execute on function public.confirm_restaurant_controlled_points_before_security_guard(
  uuid, text, integer, text, uuid, text
) from public, anon, authenticated;

create or replace function public.confirm_restaurant_controlled_points(
  input_restaurant_id uuid,
  input_qr_reference text,
  input_amount_cents integer,
  input_daily_pin text,
  input_idempotency_key uuid,
  input_receipt_number text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  validation jsonb;
  response_payload jsonb;
  qr_record public.customer_points_qr_references%rowtype;
  settings_record public.loyalty_settings%rowtype;
  existing_claim public.points_idempotency_claims%rowtype;
  existing_transaction public.points_transactions%rowtype;
  existing_qr_id uuid;
  normalized_receipt text;
  hashed_reference text;
  request_fingerprint_value text;
  historical_fingerprint text;
  violated_constraint text;
begin
  if not public.is_restaurant_member(input_restaurant_id) then
    raise exception 'Nicht berechtigt.';
  end if;
  if input_idempotency_key is null then
    raise exception 'Buchungs-ID fehlt.';
  end if;

  validation := public.validate_minimum_points_amount_v1(input_amount_cents);
  if not coalesce((validation->>'success')::boolean, false) then
    return validation;
  end if;

  normalized_receipt := public.normalize_points_receipt_number_v1(
    input_receipt_number
  );

  select * into settings_record
  from public.loyalty_settings ls
  where ls.restaurant_id = input_restaurant_id
    and ls.active = true;
  if settings_record.id is null
    or settings_record.points_collection_mode not in ('restaurant_controlled_only', 'both')
    or input_amount_cents > settings_record.points_collection_max_amount_cents then
    -- Preserve the existing controlled error and amount-limit audit contract,
    -- but do not claim an idempotency key for a request rejected preflight.
    return public.confirm_restaurant_controlled_points_before_security_guard(
      input_restaurant_id,
      input_qr_reference,
      input_amount_cents,
      input_daily_pin,
      input_idempotency_key,
      normalized_receipt
    );
  end if;

  hashed_reference := public.hash_public_token(
    regexp_replace(coalesce(input_qr_reference, ''), '\\s', '', 'g')
  );

  -- Resolve only server-owned identifiers; the raw QR value is never persisted.
  select q.* into qr_record
  from public.customer_points_qr_references q
  where q.restaurant_id = input_restaurant_id
    and (q.token_hash = hashed_reference or q.manual_code_hash = hashed_reference)
  limit 1;

  if qr_record.id is null then
    return public.confirm_restaurant_controlled_points_before_security_guard(
      input_restaurant_id,
      input_qr_reference,
      input_amount_cents,
      input_daily_pin,
      input_idempotency_key,
      normalized_receipt
    );
  end if;

  request_fingerprint_value := public.compute_points_request_fingerprint_v1(
    input_restaurant_id,
    qr_record.customer_id,
    'restaurant_controlled',
    input_amount_cents,
    normalized_receipt,
    qr_record.id,
    'earn',
    'restaurant_controlled_confirm_v2'
  );

  -- Global lock order: idempotency key, normalized receipt, QR row, customer.
  perform pg_advisory_xact_lock(hashtextextended(
    'points-idempotency:' || input_restaurant_id::text || ':' ||
      input_idempotency_key::text,
    0
  ));

  select * into existing_claim
  from public.points_idempotency_claims pic
  where pic.restaurant_id = input_restaurant_id
    and pic.idempotency_key = input_idempotency_key
  for update;

  if existing_claim.idempotency_key is not null then
    if existing_claim.payload_fingerprint <> request_fingerprint_value
      or existing_claim.action_type <> 'restaurant_controlled_earn' then
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

  -- Safely bind successful pre-migration transactions on their first retry.
  select * into existing_transaction
  from public.points_transactions pt
  where pt.restaurant_id = input_restaurant_id
    and pt.idempotency_key = input_idempotency_key
  limit 1;

  if existing_transaction.id is not null then
    if existing_transaction.type <> 'earn'
      or existing_transaction.collection_source <> 'restaurant_controlled' then
      return jsonb_build_object(
        'success', false,
        'error_code', 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH',
        'error_message', 'Diese Buchungs-ID wurde bereits für einen anderen Vorgang verwendet.'
      );
    end if;

    select q.id into existing_qr_id
    from public.customer_points_qr_references q
    where q.consumed_transaction_id = existing_transaction.id
    limit 1;

    historical_fingerprint := coalesce(
      existing_transaction.request_fingerprint,
      public.compute_points_request_fingerprint_v1(
        existing_transaction.restaurant_id,
        existing_transaction.customer_id,
        existing_transaction.collection_source,
        existing_transaction.amount_cents,
        existing_transaction.receipt_number,
        existing_qr_id,
        'earn',
        'restaurant_controlled_confirm_v2'
      )
    );

    if historical_fingerprint <> request_fingerprint_value then
      return jsonb_build_object(
        'success', false,
        'error_code', 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH',
        'error_message', 'Diese Buchungs-ID wurde bereits für einen anderen Vorgang verwendet.'
      );
    end if;

    response_payload := public.points_transaction_result_v1(existing_transaction.id);
    insert into public.points_idempotency_claims (
      restaurant_id, idempotency_key, action_type, payload_fingerprint,
      status, transaction_id, result_payload, completed_at
    ) values (
      input_restaurant_id, input_idempotency_key,
      'restaurant_controlled_earn', request_fingerprint_value,
      'completed', existing_transaction.id, response_payload, now()
    );
    return response_payload;
  end if;

  insert into public.points_idempotency_claims (
    restaurant_id, idempotency_key, action_type, payload_fingerprint
  ) values (
    input_restaurant_id, input_idempotency_key,
    'restaurant_controlled_earn', request_fingerprint_value
  );

  if normalized_receipt is not null then
    perform pg_advisory_xact_lock(hashtextextended(
      'points-receipt:' || input_restaurant_id::text || ':' || normalized_receipt,
      0
    ));
  end if;

  begin
    response_payload := public.confirm_restaurant_controlled_points_before_security_guard(
      input_restaurant_id,
      input_qr_reference,
      input_amount_cents,
      input_daily_pin,
      input_idempotency_key,
      normalized_receipt
    );
  exception
    when unique_violation then
      get stacked diagnostics violated_constraint = constraint_name;
      if violated_constraint = 'points_transactions_unique_receipt_per_restaurant_idx' then
        response_payload := jsonb_build_object(
          'success', false,
          'error_code', 'RECEIPT_ALREADY_USED',
          'error_message', 'Diese Bonnummer wurde bereits verwendet.'
        );
      else
        raise;
      end if;
    when raise_exception then
      if sqlerrm = 'Diese Bonnummer wurde bereits verwendet.' then
        response_payload := jsonb_build_object(
          'success', false,
          'error_code', 'RECEIPT_ALREADY_USED',
          'error_message', 'Diese Bonnummer wurde bereits verwendet.'
        );
      else
        raise;
      end if;
  end;

  if response_payload->>'error_code' = 'RECEIPT_ALREADY_USED' then
    update public.points_idempotency_claims pic
    set status = 'completed',
        result_payload = response_payload,
        completed_at = now()
    where pic.restaurant_id = input_restaurant_id
      and pic.idempotency_key = input_idempotency_key;
    return response_payload;
  end if;

  if nullif(response_payload->>'transaction_id', '') is not null then
    update public.points_transactions pt
    set request_fingerprint = request_fingerprint_value
    where pt.id = (response_payload->>'transaction_id')::uuid
      and pt.restaurant_id = input_restaurant_id
      and pt.request_fingerprint is null;

    update public.points_idempotency_claims pic
    set status = 'completed',
        transaction_id = (response_payload->>'transaction_id')::uuid,
        result_payload = response_payload,
        completed_at = now()
    where pic.restaurant_id = input_restaurant_id
      and pic.idempotency_key = input_idempotency_key;
  else
    -- Retryable validation and PIN failures must not permanently consume a key.
    delete from public.points_idempotency_claims pic
    where pic.restaurant_id = input_restaurant_id
      and pic.idempotency_key = input_idempotency_key;
  end if;

  return response_payload;
end;
$$;

revoke execute on function public.confirm_restaurant_controlled_points(
  uuid, text, integer, text, uuid, text
) from public, anon;
grant execute on function public.confirm_restaurant_controlled_points(
  uuid, text, integer, text, uuid, text
) to authenticated;

-- Apply the same payload binding to the retained customer-initiated mode.
alter function public.collect_bonus_points_v1(
  text, text, text, text, text, uuid
) rename to collect_bonus_points_v1_before_idempotency_guard;

revoke execute on function public.collect_bonus_points_v1_before_idempotency_guard(
  text, text, text, text, text, uuid
) from public, anon, authenticated;

create or replace function public.collect_bonus_points_v1(
  input_restaurant_slug text,
  input_customer_token text,
  input_amount_tier_key text,
  input_daily_pin text,
  input_device_id text,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  restaurant_record public.restaurants%rowtype;
  customer_record public.customers%rowtype;
  settings_record public.loyalty_settings%rowtype;
  existing_claim public.points_idempotency_claims%rowtype;
  existing_transaction public.points_transactions%rowtype;
  tier_record jsonb;
  amount_cents_value integer;
  tier_amount numeric;
  request_fingerprint_value text;
  historical_fingerprint text;
  response_payload jsonb;
begin
  if input_idempotency_key is null then
    raise exception 'Buchungs-ID fehlt.';
  end if;

  select * into restaurant_record
  from public.restaurants r
  where r.slug = trim(input_restaurant_slug)
    and r.status = 'active';
  if restaurant_record.id is null then
    raise exception 'Restaurant wurde nicht gefunden.';
  end if;

  select c.* into customer_record
  from public.customer_qr_tokens cqt
  join public.customers c on c.id = cqt.customer_id
  where cqt.restaurant_id = restaurant_record.id
    and cqt.token_hash = public.hash_public_token(input_customer_token)
    and cqt.active = true
    and (cqt.expires_at is null or cqt.expires_at > now())
    and c.restaurant_id = restaurant_record.id
    and c.membership_status = 'active'
  limit 1;
  if customer_record.id is null then
    raise exception 'Kundenzugang ist nicht gültig.';
  end if;

  select * into settings_record
  from public.loyalty_settings ls
  where ls.restaurant_id = restaurant_record.id
    and ls.active = true;
  if settings_record.id is null then
    raise exception 'Bonusprogramm wurde nicht gefunden.';
  end if;

  select tier into tier_record
  from jsonb_array_elements(settings_record.bonus_amount_tiers) tier
  where tier->>'key' = input_amount_tier_key
  limit 1;
  if tier_record is null then
    raise exception 'Bon-Stufe wurde nicht gefunden.';
  end if;

  tier_amount := greatest(
    coalesce((tier_record->>'min')::numeric, (tier_record->>'amount')::numeric, 0),
    0
  );
  amount_cents_value := round(tier_amount * 100)::integer;

  request_fingerprint_value := public.compute_points_request_fingerprint_v1(
    restaurant_record.id,
    customer_record.id,
    'customer_initiated',
    amount_cents_value,
    null,
    null,
    'earn',
    'customer_initiated_collect_v2:' || coalesce(input_amount_tier_key, '')
  );

  perform pg_advisory_xact_lock(hashtextextended(
    'points-idempotency:' || restaurant_record.id::text || ':' ||
      input_idempotency_key::text,
    0
  ));

  select * into existing_claim
  from public.points_idempotency_claims pic
  where pic.restaurant_id = restaurant_record.id
    and pic.idempotency_key = input_idempotency_key
  for update;

  if existing_claim.idempotency_key is not null then
    if existing_claim.payload_fingerprint <> request_fingerprint_value
      or existing_claim.action_type <> 'customer_initiated_earn' then
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

  select * into existing_transaction
  from public.points_transactions pt
  where pt.restaurant_id = restaurant_record.id
    and pt.idempotency_key = input_idempotency_key
  limit 1;

  if existing_transaction.id is not null then
    if existing_transaction.type <> 'earn'
      or existing_transaction.collection_source <> 'customer_initiated' then
      return jsonb_build_object(
        'success', false,
        'error_code', 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH',
        'error_message', 'Diese Buchungs-ID wurde bereits für einen anderen Vorgang verwendet.'
      );
    end if;

    historical_fingerprint := coalesce(
      existing_transaction.request_fingerprint,
      public.compute_points_request_fingerprint_v1(
        existing_transaction.restaurant_id,
        existing_transaction.customer_id,
        existing_transaction.collection_source,
        existing_transaction.amount_cents,
        null,
        null,
        'earn',
        'customer_initiated_collect_v2:' || coalesce(input_amount_tier_key, '')
      )
    );
    if historical_fingerprint <> request_fingerprint_value then
      return jsonb_build_object(
        'success', false,
        'error_code', 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH',
        'error_message', 'Diese Buchungs-ID wurde bereits für einen anderen Vorgang verwendet.'
      );
    end if;

    response_payload := public.points_transaction_result_v1(existing_transaction.id);
    insert into public.points_idempotency_claims (
      restaurant_id, idempotency_key, action_type, payload_fingerprint,
      status, transaction_id, result_payload, completed_at
    ) values (
      restaurant_record.id, input_idempotency_key,
      'customer_initiated_earn', request_fingerprint_value,
      'completed', existing_transaction.id, response_payload, now()
    );
    return response_payload;
  end if;

  insert into public.points_idempotency_claims (
    restaurant_id, idempotency_key, action_type, payload_fingerprint
  ) values (
    restaurant_record.id, input_idempotency_key,
    'customer_initiated_earn', request_fingerprint_value
  );

  response_payload := public.collect_bonus_points_v1_before_idempotency_guard(
    input_restaurant_slug,
    input_customer_token,
    input_amount_tier_key,
    input_daily_pin,
    input_device_id,
    input_idempotency_key
  );

  if nullif(response_payload->>'transaction_id', '') is not null then
    update public.points_transactions pt
    set request_fingerprint = request_fingerprint_value
    where pt.id = (response_payload->>'transaction_id')::uuid
      and pt.restaurant_id = restaurant_record.id
      and pt.request_fingerprint is null;

    update public.points_idempotency_claims pic
    set status = 'completed',
        transaction_id = (response_payload->>'transaction_id')::uuid,
        result_payload = response_payload,
        completed_at = now()
    where pic.restaurant_id = restaurant_record.id
      and pic.idempotency_key = input_idempotency_key;
  else
    delete from public.points_idempotency_claims pic
    where pic.restaurant_id = restaurant_record.id
      and pic.idempotency_key = input_idempotency_key;
  end if;

  return response_payload;
end;
$$;

revoke execute on function public.collect_bonus_points_v1(
  text, text, text, text, text, uuid
) from public;
grant execute on function public.collect_bonus_points_v1(
  text, text, text, text, text, uuid
) to anon, authenticated;

notify pgrst, 'reload schema';
