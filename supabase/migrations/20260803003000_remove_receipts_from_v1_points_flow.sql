-- V1 has no POS or receipt-number integration. Keep historical nullable data,
-- but remove receipt numbers from the active browser contract and safeguards.

drop index if exists public.points_transactions_unique_receipt_per_restaurant_idx;

comment on column public.points_transactions.receipt_number is
  'Legacy placeholder reserved for a future V3/V4 POS integration. Unused by V1.';

-- Preserve the applied historical implementation as a private compatibility
-- dependency. Its receipt argument is always NULL from the V1 entry point.
alter function public.confirm_restaurant_controlled_points(
  uuid, text, integer, text, uuid, text
) rename to confirm_restaurant_controlled_points_with_legacy_receipt_v1;

revoke execute on function public.confirm_restaurant_controlled_points_with_legacy_receipt_v1(
  uuid, text, integer, text, uuid, text
) from public, anon, authenticated;

create or replace function public.confirm_restaurant_controlled_points(
  input_restaurant_id uuid,
  input_qr_reference text,
  input_amount_cents integer,
  input_daily_pin text,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return public.confirm_restaurant_controlled_points_with_legacy_receipt_v1(
    input_restaurant_id,
    input_qr_reference,
    input_amount_cents,
    input_daily_pin,
    input_idempotency_key,
    null
  );
end;
$$;

revoke execute on function public.confirm_restaurant_controlled_points(
  uuid, text, integer, text, uuid
) from public, anon;
grant execute on function public.confirm_restaurant_controlled_points(
  uuid, text, integer, text, uuid
) to authenticated;

comment on function public.confirm_restaurant_controlled_points(
  uuid, text, integer, text, uuid
) is 'V1 restaurant-controlled points confirmation without receipt or POS data.';

comment on function public.confirm_restaurant_controlled_points_with_legacy_receipt_v1(
  uuid, text, integer, text, uuid, text
) is 'Private compatibility implementation. Receipt input is disabled for V1.';

-- Reverse idempotency also binds the server-resolved authorized role. This
-- helper contains no receipt, PIN, access token, points value or timestamp.
create or replace function public.compute_points_reverse_fingerprint_v2(
  input_restaurant_id uuid,
  input_original_transaction_id uuid,
  input_actor_role text,
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
          'actor_role', input_actor_role,
          'reason', public.normalize_points_reversal_reason_v1(input_reason)
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
$$;

revoke execute on function public.compute_points_reverse_fingerprint_v2(
  uuid, uuid, text, text
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
  actor_role text;
  normalized_reason text;
  request_fingerprint_value text;
  legacy_fingerprint text;
  historical_fingerprint text;
  historical_legacy_fingerprint text;
  reversal_id uuid;
  next_balance integer;
  response_payload jsonb;
begin
  select rm.role into actor_role
  from public.restaurant_members rm
  where rm.restaurant_id = input_restaurant_id
    and rm.user_id = auth.uid()
    and rm.role in ('owner', 'manager')
  order by case rm.role when 'owner' then 1 else 2 end
  limit 1;

  if actor_role is null then
    raise exception 'Nicht berechtigt.';
  end if;

  normalized_reason := public.normalize_points_reversal_reason_v1(input_reason);
  if input_idempotency_key is null or length(coalesce(normalized_reason, '')) < 5 then
    raise exception 'Buchungs-ID und Begründung sind erforderlich.';
  end if;

  request_fingerprint_value := public.compute_points_reverse_fingerprint_v2(
    input_restaurant_id,
    input_transaction_id,
    actor_role,
    normalized_reason
  );
  legacy_fingerprint := public.compute_points_reverse_fingerprint_v1(
    input_restaurant_id,
    input_transaction_id,
    normalized_reason
  );

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
      or existing_claim.payload_fingerprint not in (
        request_fingerprint_value,
        legacy_fingerprint
      ) then
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

  -- Bind reversals created before this migration without rewriting history.
  select * into existing_reversal
  from public.points_transactions pt
  where pt.restaurant_id = input_restaurant_id
    and pt.idempotency_key = input_idempotency_key
    and pt.reversal_of is not null
    and pt.collection_source = 'reversal'
  limit 1;

  if existing_reversal.id is not null then
    historical_fingerprint := public.compute_points_reverse_fingerprint_v2(
      existing_reversal.restaurant_id,
      existing_reversal.reversal_of,
      actor_role,
      existing_reversal.reason
    );
    historical_legacy_fingerprint := public.compute_points_reverse_fingerprint_v1(
      existing_reversal.restaurant_id,
      existing_reversal.reversal_of,
      existing_reversal.reason
    );

    if existing_reversal.reversal_of <> input_transaction_id
      or request_fingerprint_value not in (
        historical_fingerprint,
        historical_legacy_fingerprint
      ) then
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
      'actor_role', actor_role,
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
