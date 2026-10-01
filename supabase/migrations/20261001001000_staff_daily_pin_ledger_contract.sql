-- Bind the legacy Staff daily-PIN compatibility flow to the canonical points
-- ledger contract. Historical rows and constraints remain unchanged.

create or replace function public.apply_staff_daily_pin_loyalty_action_v2(
  input_restaurant_id uuid,
  input_customer_id uuid,
  input_daily_pin text,
  input_amount_cents integer,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $$
declare
  restaurant_record public.restaurants%rowtype;
  customer_record public.customers%rowtype;
  settings_record public.loyalty_settings%rowtype;
  staff_member_record public.staff_members%rowtype;
  daily_pin_record public.restaurant_daily_pins%rowtype;
  attempt_record public.daily_pin_attempts%rowtype;
  request_record public.points_collection_requests%rowtype;
  existing_claim public.points_idempotency_claims%rowtype;
  existing_transaction public.points_transactions%rowtype;
  validation jsonb;
  response_payload jsonb;
  request_fingerprint_value text;
  local_date_value date;
  local_day_start timestamptz;
  local_next_day_start timestamptz;
  transaction_id_value uuid;
  audit_id_value uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'STAFF_ACTION_ACCESS_DENIED';
  end if;
  if input_idempotency_key is null then
    raise exception using errcode = '22023', message = 'POINTS_IDEMPOTENCY_KEY_REQUIRED';
  end if;

  select r.* into restaurant_record
  from public.restaurants r
  where r.id = input_restaurant_id
    and r.status = 'active';
  if restaurant_record.id is null then
    raise exception using errcode = '42501', message = 'RESTAURANT_NOT_OPERATIONAL';
  end if;

  select sm.* into staff_member_record
  from public.restaurant_members rm
  join public.staff_members sm
    on sm.restaurant_id = rm.restaurant_id
   and sm.organization_id = rm.organization_id
   and sm.branch_id = rm.branch_id
   and sm.auth_user_id = rm.user_id
  where rm.restaurant_id = restaurant_record.id
    and rm.organization_id = restaurant_record.organization_id
    and rm.user_id = auth.uid()
    and rm.role in ('staff', 'supervisor')
    and sm.role in ('staff', 'supervisor')
    and sm.active = true
    and sm.account_status = 'active'
    and sm.archived_at is null
  limit 1;
  if staff_member_record.id is null then
    raise exception using errcode = '42501', message = 'STAFF_ACTION_ACCESS_DENIED';
  end if;

  select c.* into customer_record
  from public.customers c
  join public.branches b
    on b.id = c.branch_id
   and b.restaurant_id = c.restaurant_id
   and b.organization_id = c.organization_id
   and b.status = 'active'
  where c.id = input_customer_id
    and c.restaurant_id = restaurant_record.id
    and c.organization_id = restaurant_record.organization_id
    and c.membership_status = 'active'
    and exists (
      select 1
      from public.customer_account_memberships cam
      where cam.restaurant_id = restaurant_record.id
        and cam.customer_id = c.id
    )
  for update of c;
  if customer_record.id is null then
    raise exception using errcode = '42501', message = 'CUSTOMER_MEMBERSHIP_ACCESS_DENIED';
  end if;

  select ls.* into settings_record
  from public.loyalty_settings ls
  where ls.restaurant_id = restaurant_record.id
    and ls.organization_id = restaurant_record.organization_id
    and ls.branch_id = customer_record.branch_id
    and ls.active = true;
  if settings_record.id is null
    or settings_record.loyalty_mode <> 'amount_based'
    or settings_record.points_collection_mode not in ('customer_initiated_only', 'both') then
    raise exception using errcode = '42501', message = 'STAFF_AMOUNT_COLLECTION_MODE_BLOCKED';
  end if;

  validation := public.validate_minimum_points_amount_v1(input_amount_cents);
  if not coalesce((validation->>'success')::boolean, false) then
    return validation;
  end if;
  if input_amount_cents > settings_record.points_collection_max_amount_cents then
    return jsonb_build_object(
      'success', false,
      'error_code', 'POINTS_AMOUNT_LIMIT_EXCEEDED',
      'error_message', 'Der Betrag überschreitet das für dieses Restaurant festgelegte Limit.'
    );
  end if;

  request_fingerprint_value := public.compute_points_request_fingerprint_v1(
    restaurant_record.id,
    customer_record.id,
    'customer_initiated',
    input_amount_cents,
    null,
    null,
    'earn',
    'staff_daily_pin_amount_v2'
  );

  perform pg_advisory_xact_lock(hashtextextended(
    'points-idempotency:' || restaurant_record.id::text || ':' || input_idempotency_key::text,
    0
  ));

  select pic.* into existing_claim
  from public.points_idempotency_claims pic
  where pic.restaurant_id = restaurant_record.id
    and pic.idempotency_key = input_idempotency_key
  for update;
  if existing_claim.idempotency_key is not null then
    if existing_claim.action_type <> 'customer_initiated_earn'
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

  select pt.* into existing_transaction
  from public.points_transactions pt
  where pt.restaurant_id = restaurant_record.id
    and pt.idempotency_key = input_idempotency_key
  limit 1;
  if existing_transaction.id is not null then
    return jsonb_build_object(
      'success', false,
      'error_code', 'LEGACY_IDEMPOTENCY_KEY_UNVERIFIABLE',
      'error_message', 'Diese Buchungs-ID kann nicht sicher erneut verwendet werden.'
    );
  end if;

  insert into public.points_idempotency_claims (
    restaurant_id, idempotency_key, action_type, payload_fingerprint
  ) values (
    restaurant_record.id, input_idempotency_key,
    'customer_initiated_earn', request_fingerprint_value
  );

  insert into public.points_collection_requests (
    restaurant_id, organization_id, branch_id, customer_id, idempotency_key, source
  ) values (
    restaurant_record.id, restaurant_record.organization_id, customer_record.branch_id,
    customer_record.id, input_idempotency_key, 'staff_portal'
  ) on conflict do nothing;

  select pcr.* into request_record
  from public.points_collection_requests pcr
  where pcr.restaurant_id = restaurant_record.id
    and pcr.branch_id = customer_record.branch_id
    and pcr.customer_id = customer_record.id
    and pcr.idempotency_key = input_idempotency_key
  for update;
  if request_record.id is null then
    raise exception using errcode = 'P0001', message = 'POINTS_REQUEST_NOT_CREATED';
  end if;
  if request_record.status = 'completed' then
    response_payload := jsonb_build_object(
      'success', false,
      'error_code', 'LEGACY_IDEMPOTENCY_KEY_UNVERIFIABLE',
      'error_message', 'Diese Buchungs-ID kann nicht sicher erneut verwendet werden.'
    );
    update public.points_idempotency_claims
    set status = 'completed', result_payload = response_payload, completed_at = statement_timestamp()
    where restaurant_id = restaurant_record.id and idempotency_key = input_idempotency_key;
    return response_payload;
  end if;

  local_date_value := timezone(coalesce(restaurant_record.timezone_name, 'Europe/Vienna'), now())::date;
  local_day_start := local_date_value::timestamp at time zone coalesce(restaurant_record.timezone_name, 'Europe/Vienna');
  local_next_day_start := (local_date_value + 1)::timestamp at time zone coalesce(restaurant_record.timezone_name, 'Europe/Vienna');
  daily_pin_record := public.ensure_today_restaurant_pin(restaurant_record.id, customer_record.branch_id);

  select d.* into attempt_record
  from public.daily_pin_attempts d
  where d.restaurant_id = restaurant_record.id
    and d.branch_id = customer_record.branch_id
    and d.customer_id = customer_record.id
    and d.valid_date = local_date_value
  for update;

  if attempt_record.locked_until > now() then
    response_payload := jsonb_build_object(
      'success', false, 'error_code', 'DAILY_PIN_LOCKED',
      'error_message', 'Zu viele falsche Versuche. Bitte wende dich an das Restaurant.'
    );
  elsif daily_pin_record.valid_until <= now() then
    response_payload := jsonb_build_object(
      'success', false, 'error_code', 'DAILY_PIN_EXPIRED',
      'error_message', 'Die Tages-PIN ist nicht mehr gültig.'
    );
  elsif daily_pin_record.pin_code <> btrim(coalesce(input_daily_pin, '')) then
    response_payload := public.persist_daily_pin_rejection(
      restaurant_record.id, customer_record.id, customer_record.branch_id,
      null, 'staff_portal', 'staff', input_idempotency_key
    );
  elsif (
    select count(*)
    from public.points_transactions pt
    where pt.restaurant_id = restaurant_record.id
      and pt.branch_id = customer_record.branch_id
      and pt.customer_id = customer_record.id
      and pt.type = 'earn'
      and pt.points > 0
      and pt.created_at >= local_day_start
      and pt.created_at < local_next_day_start
  ) >= 2 then
    response_payload := jsonb_build_object(
      'success', false, 'error_code', 'POINTS_DAILY_LIMIT',
      'error_message', 'Du hast heute bereits zweimal Punkte gesammelt. Morgen kannst du wieder Punkte sammeln.'
    );
    perform public.write_audit_event(
      restaurant_record.id, customer_record.id, 'staff', staff_member_record.id,
      'POINTS_DAILY_LIMIT_BLOCKED', 'blocked', 'staff_portal', 'customers',
      customer_record.id, input_idempotency_key, jsonb_build_object('limit', 2)
    );
  elsif exists (
    select 1
    from public.points_transactions pt
    where pt.restaurant_id = restaurant_record.id
      and pt.customer_id = customer_record.id
      and pt.type = 'earn'
      and pt.created_at > now() - interval '30 seconds'
  ) then
    response_payload := jsonb_build_object(
      'success', false, 'error_code', 'POINTS_COLLECTION_RECENT',
      'error_message', 'Diese Buchung wurde gerade schon erfasst.'
    );
  else
    response_payload := public.award_points_v1(
      restaurant_record.id,
      customer_record.id,
      customer_record.branch_id,
      input_amount_cents,
      'customer_initiated',
      'staff_daily_pin',
      input_idempotency_key,
      null,
      auth.uid()
    );

    transaction_id_value := nullif(response_payload->>'transaction_id', '')::uuid;
    if transaction_id_value is null then
      raise exception using errcode = 'P0001', message = 'POINTS_TRANSACTION_NOT_CREATED';
    end if;

    update public.points_transactions pt
    set staff_member_id = staff_member_record.id,
        request_fingerprint = request_fingerprint_value
    where pt.id = transaction_id_value
      and pt.restaurant_id = restaurant_record.id
      and pt.customer_id = customer_record.id;

    update public.daily_pin_attempts d
    set failed_attempts = 0, locked_until = null, updated_at = now()
    where d.restaurant_id = restaurant_record.id
      and d.branch_id = customer_record.branch_id
      and d.customer_id = customer_record.id
      and d.valid_date = local_date_value;

    audit_id_value := public.write_audit_event(
      restaurant_record.id, customer_record.id, 'staff', staff_member_record.id,
      'STAFF_LOYALTY_CREDIT', 'completed', 'staff_portal', 'points_transactions',
      transaction_id_value, input_idempotency_key,
      jsonb_build_object(
        'confirmed_by_daily_pin', true,
        'collection_source', 'customer_initiated',
        'amount_cents', input_amount_cents,
        'staff_member_id', staff_member_record.id,
        'rpc_version', 'v2'
      )
    );
    response_payload := response_payload || jsonb_build_object(
      'success', true,
      'audit_id', audit_id_value,
      'collection_source', 'customer_initiated',
      'amount_cents', input_amount_cents,
      'stamp_balance', customer_record.stamp_balance
    );
  end if;

  update public.points_collection_requests pcr
  set status = 'completed', result_payload = response_payload, completed_at = statement_timestamp()
  where pcr.id = request_record.id;

  update public.points_idempotency_claims pic
  set status = 'completed',
      transaction_id = transaction_id_value,
      result_payload = response_payload,
      completed_at = statement_timestamp()
  where pic.restaurant_id = restaurant_record.id
    and pic.idempotency_key = input_idempotency_key;

  return response_payload;
end;
$$;

revoke all on function public.apply_staff_daily_pin_loyalty_action_v2(
  uuid, uuid, text, integer, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.apply_staff_daily_pin_loyalty_action_v2(
  uuid, uuid, text, integer, uuid
) to authenticated;

-- The old browser contract accepted Numeric money and client-supplied points.
-- It remains callable only to return a deterministic fail-closed upgrade result
-- during the migration-to-web deployment window.
create or replace function public.apply_staff_daily_pin_loyalty_action_v1(
  input_restaurant_id uuid,
  input_customer_id uuid,
  input_daily_pin text,
  input_loyalty_mode text,
  input_points integer,
  input_stamps integer,
  input_reason text,
  input_rule_id uuid,
  input_bill_amount numeric,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if input_loyalty_mode = 'stamp_based' then
    return public.apply_staff_daily_pin_loyalty_action(
      input_restaurant_id, input_customer_id, input_daily_pin,
      input_loyalty_mode, input_points, input_stamps, input_reason,
      input_rule_id, input_bill_amount
    );
  end if;
  return jsonb_build_object(
    'success', false,
    'error_code', 'STAFF_POINTS_RPC_UPGRADE_REQUIRED',
    'error_message', 'Diese Punktefunktion wurde sicher aktualisiert. Bitte lade die Seite neu.'
  );
end;
$$;

revoke all on function public.apply_staff_daily_pin_loyalty_action_v1(
  uuid, uuid, text, text, integer, integer, text, uuid, numeric, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.apply_staff_daily_pin_loyalty_action_v1(
  uuid, uuid, text, text, integer, integer, text, uuid, numeric, uuid
) to authenticated;

revoke all on function public.apply_staff_daily_pin_loyalty_action(
  uuid, uuid, text, text, integer, integer, text, uuid, numeric
) from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
