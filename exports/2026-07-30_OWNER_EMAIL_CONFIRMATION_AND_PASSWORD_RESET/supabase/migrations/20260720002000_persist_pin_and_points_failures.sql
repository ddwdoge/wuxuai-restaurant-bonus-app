-- Failed PIN writes in legacy functions were rolled back together with the
-- raised exception. V1 wrappers now persist a safe failure result and return it.

create or replace function public.persist_daily_pin_rejection(
  input_restaurant_id uuid,
  input_customer_id uuid,
  input_branch_id uuid,
  input_customer_token_hash text,
  input_source text,
  input_actor_type text,
  input_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  restaurant_record public.restaurants%rowtype;
  attempt_record public.daily_pin_attempts%rowtype;
  local_date_value date;
  next_day_start timestamptz;
  message_value text;
begin
  select * into restaurant_record from public.restaurants where id = input_restaurant_id;
  if restaurant_record.id is null then
    return jsonb_build_object('success', false, 'error_code', 'RESTAURANT_NOT_FOUND',
      'error_message', 'Restaurant wurde nicht gefunden.');
  end if;

  local_date_value := timezone(coalesce(restaurant_record.timezone_name, 'Europe/Vienna'), now())::date;
  next_day_start := ((local_date_value + 1)::timestamp at time zone coalesce(restaurant_record.timezone_name, 'Europe/Vienna'));

  select * into attempt_record from public.daily_pin_attempts
  where restaurant_id = input_restaurant_id and branch_id = input_branch_id
    and customer_id = input_customer_id and valid_date = local_date_value
  for update;

  if attempt_record.id is null or attempt_record.locked_until is null or attempt_record.locked_until <= now() then
    insert into public.daily_pin_attempts (
      restaurant_id, organization_id, branch_id, customer_id, customer_token_hash,
      valid_date, failed_attempts, locked_until, last_failed_at, updated_at
    ) values (
      input_restaurant_id, restaurant_record.organization_id, input_branch_id,
      input_customer_id, input_customer_token_hash, local_date_value, 1, null, now(), now()
    )
    on conflict (restaurant_id, branch_id, customer_id, valid_date)
    do update set
      failed_attempts = public.daily_pin_attempts.failed_attempts + 1,
      locked_until = case when public.daily_pin_attempts.failed_attempts + 1 >= 5
        then next_day_start else public.daily_pin_attempts.locked_until end,
      last_failed_at = now(), updated_at = now(),
      customer_token_hash = coalesce(excluded.customer_token_hash, public.daily_pin_attempts.customer_token_hash)
    returning * into attempt_record;
  end if;

  message_value := case when attempt_record.failed_attempts >= 5 or attempt_record.locked_until > now()
    then 'Zu viele falsche Versuche. Bitte wende dich an das Restaurant.'
    else 'Die Tages-PIN ist nicht korrekt.' end;

  perform public.write_audit_event(input_restaurant_id, input_customer_id,
    input_actor_type, case when input_actor_type = 'customer' then input_customer_id else null end,
    'DAILY_PIN_REJECTED', case when attempt_record.failed_attempts >= 5 then 'blocked' else 'failed' end,
    input_source, 'daily_pin_attempts', attempt_record.id, input_request_id,
    jsonb_build_object('valid_date', local_date_value, 'failed_attempts', attempt_record.failed_attempts));

  if attempt_record.failed_attempts >= 5 then
    perform public.write_audit_event(input_restaurant_id, input_customer_id, 'system', null,
      'AUTHORIZATION_DENIED', 'blocked', input_source, 'daily_pin_attempts',
      attempt_record.id, input_request_id,
      jsonb_build_object('reason', 'daily_pin_locked', 'valid_date', local_date_value,
        'failed_attempts', attempt_record.failed_attempts, 'locked_until', attempt_record.locked_until));
  end if;

  return jsonb_build_object('success', false,
    'error_code', case when attempt_record.failed_attempts >= 5 then 'DAILY_PIN_LOCKED' else 'DAILY_PIN_REJECTED' end,
    'error_message', message_value, 'failed_attempts', attempt_record.failed_attempts);
end;
$$;

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
set search_path = public
as $$
declare
  restaurant_record public.restaurants%rowtype;
  customer_record public.customers%rowtype;
  request_record public.points_collection_requests%rowtype;
  request_result jsonb;
  token_hash_value text;
  branch_id_value uuid;
  safe_message text;
begin
  if input_idempotency_key is null then raise exception 'Buchungs-ID fehlt.'; end if;

  select * into restaurant_record from public.restaurants
  where slug = trim(input_restaurant_slug) and status = 'active';
  if restaurant_record.id is null then raise exception 'Restaurant wurde nicht gefunden.'; end if;

  token_hash_value := public.hash_public_token(input_customer_token);
  select c.* into customer_record
  from public.customer_qr_tokens cqt join public.customers c on c.id = cqt.customer_id
  where cqt.restaurant_id = restaurant_record.id and cqt.token_hash = token_hash_value
    and cqt.active = true and (cqt.expires_at is null or cqt.expires_at > now())
    and c.restaurant_id = restaurant_record.id limit 1;
  if customer_record.id is null then raise exception 'Kundenzugang ist nicht gültig.'; end if;

  branch_id_value := coalesce(customer_record.branch_id, restaurant_record.primary_branch_id,
    public.restaurant_primary_branch_id(restaurant_record.id));

  insert into public.points_collection_requests (
    restaurant_id, organization_id, branch_id, customer_id, idempotency_key, source
  ) values (
    restaurant_record.id, restaurant_record.organization_id, branch_id_value,
    customer_record.id, input_idempotency_key, 'customer_portal'
  ) on conflict do nothing;

  select * into request_record from public.points_collection_requests
  where restaurant_id = restaurant_record.id and branch_id = branch_id_value
    and customer_id = customer_record.id and idempotency_key = input_idempotency_key
  for update;
  if request_record.status = 'completed' then return request_record.result_payload; end if;

  begin
    request_result := public.collect_bonus_points(input_restaurant_slug,
      input_customer_token, input_amount_tier_key, input_daily_pin, input_device_id);
  exception when others then
    safe_message := case
      when sqlerrm = 'Du hast heute bereits Punkte gesammelt.' then 'Du hast heute bereits zweimal Punkte gesammelt. Morgen kannst du wieder Punkte sammeln.'
      when sqlerrm in ('Die Tages-PIN ist nicht korrekt.', 'Zu viele falsche Versuche. Bitte wende dich an das Restaurant.') then sqlerrm
      when sqlerrm = 'points already collected recently' then 'Diese Buchung wurde gerade schon erfasst.'
      else 'Punkte konnten gerade nicht gebucht werden. Bitte versuche es erneut.' end;

    if sqlerrm in ('Die Tages-PIN ist nicht korrekt.', 'Zu viele falsche Versuche. Bitte wende dich an das Restaurant.') then
      request_result := public.persist_daily_pin_rejection(restaurant_record.id,
        customer_record.id, branch_id_value, token_hash_value, 'customer_portal',
        'customer', input_idempotency_key);
    else
      perform public.write_audit_event(restaurant_record.id, customer_record.id,
        'customer', customer_record.id, 'POINTS_ADD_FAILED',
        case when sqlerrm in ('Du hast heute bereits Punkte gesammelt.', 'points already collected recently') then 'blocked' else 'failed' end,
        'customer_portal', 'points_collection_requests', request_record.id,
        input_idempotency_key, jsonb_build_object('reason', safe_message),
        'POINTS_COLLECTION_FAILED', safe_message);
      request_result := jsonb_build_object('success', false,
        'error_code', 'POINTS_COLLECTION_FAILED', 'error_message', safe_message);
    end if;
  end;

  update public.points_collection_requests
  set status = 'completed', result_payload = request_result, completed_at = now()
  where id = request_record.id;

  if coalesce((request_result->>'success')::boolean, true) then
    update public.points_transactions set idempotency_key = input_idempotency_key
    where id = (
      select pt.id from public.points_transactions pt
      where pt.restaurant_id = restaurant_record.id and pt.branch_id = branch_id_value
        and pt.customer_id = customer_record.id and pt.type = 'earn'
        and pt.idempotency_key is null and pt.created_at >= request_record.created_at
        and coalesce((request_result->>'points_added')::integer, 0) > 0
      order by pt.created_at desc limit 1
    );
  end if;
  return request_result;
end;
$$;

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
set search_path = public
as $$
declare
  restaurant_record public.restaurants%rowtype;
  customer_record public.customers%rowtype;
  branch_id_value uuid;
  request_record public.points_collection_requests%rowtype;
  request_result jsonb;
  safe_message text;
begin
  if not public.is_restaurant_member(input_restaurant_id) then raise exception 'Nicht berechtigt.'; end if;
  if input_idempotency_key is null then raise exception 'Buchungs-ID fehlt.'; end if;
  select * into restaurant_record from public.restaurants where id = input_restaurant_id and status = 'active';
  select * into customer_record from public.customers where id = input_customer_id and restaurant_id = input_restaurant_id;
  if restaurant_record.id is null or customer_record.id is null then raise exception 'Gast wurde nicht gefunden.'; end if;
  branch_id_value := coalesce(customer_record.branch_id, restaurant_record.primary_branch_id,
    public.restaurant_primary_branch_id(input_restaurant_id));

  insert into public.points_collection_requests (
    restaurant_id, organization_id, branch_id, customer_id, idempotency_key, source
  ) values (
    input_restaurant_id, restaurant_record.organization_id, branch_id_value,
    input_customer_id, input_idempotency_key, 'staff_portal'
  ) on conflict do nothing;
  select * into request_record from public.points_collection_requests
  where restaurant_id = input_restaurant_id and branch_id = branch_id_value
    and customer_id = input_customer_id and idempotency_key = input_idempotency_key for update;
  if request_record.status = 'completed' then return request_record.result_payload; end if;

  begin
    request_result := public.apply_staff_daily_pin_loyalty_action(
      input_restaurant_id, input_customer_id, input_daily_pin, input_loyalty_mode,
      input_points, input_stamps, input_reason, input_rule_id, input_bill_amount);
  exception when others then
    safe_message := case
      when sqlerrm = 'Du hast heute bereits Punkte gesammelt.' then 'Du hast heute bereits zweimal Punkte gesammelt. Morgen kannst du wieder Punkte sammeln.'
      when sqlerrm in ('Die Tages-PIN ist nicht korrekt.', 'Zu viele falsche Versuche. Bitte wende dich an das Restaurant.') then sqlerrm
      else 'Punkte konnten gerade nicht gebucht werden. Bitte versuche es erneut.' end;
    if sqlerrm in ('Die Tages-PIN ist nicht korrekt.', 'Zu viele falsche Versuche. Bitte wende dich an das Restaurant.') then
      request_result := public.persist_daily_pin_rejection(input_restaurant_id,
        input_customer_id, branch_id_value, null, 'staff_portal', 'staff', input_idempotency_key);
    else
      perform public.write_audit_event(input_restaurant_id, input_customer_id,
        'staff', null, 'POINTS_ADD_FAILED',
        case when sqlerrm = 'Du hast heute bereits Punkte gesammelt.' then 'blocked' else 'failed' end,
        'staff_portal', 'points_collection_requests', request_record.id,
        input_idempotency_key, jsonb_build_object('reason', safe_message),
        'POINTS_COLLECTION_FAILED', safe_message);
      request_result := jsonb_build_object('success', false,
        'error_code', 'POINTS_COLLECTION_FAILED', 'error_message', safe_message);
    end if;
  end;

  update public.points_collection_requests
  set status = 'completed', result_payload = request_result, completed_at = now()
  where id = request_record.id;
  if coalesce((request_result->>'success')::boolean, true) then
    update public.points_transactions set idempotency_key = input_idempotency_key
    where id = (
      select pt.id from public.points_transactions pt
      where pt.restaurant_id = input_restaurant_id and pt.branch_id = branch_id_value
        and pt.customer_id = input_customer_id and pt.type = 'earn'
        and pt.idempotency_key is null and pt.created_at >= request_record.created_at
        and coalesce((request_result->>'points_added')::integer, 0) > 0
      order by pt.created_at desc limit 1
    );
  end if;
  return request_result;
end;
$$;

revoke execute on function public.persist_daily_pin_rejection(uuid, uuid, uuid, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.collect_bonus_points_v1(text, text, text, text, text, uuid) from public;
grant execute on function public.collect_bonus_points_v1(text, text, text, text, text, uuid) to anon, authenticated;
revoke execute on function public.apply_staff_daily_pin_loyalty_action_v1(uuid, uuid, text, text, integer, integer, text, uuid, numeric, uuid) from public, anon;
grant execute on function public.apply_staff_daily_pin_loyalty_action_v1(uuid, uuid, text, text, integer, integer, text, uuid, numeric, uuid) to authenticated;

notify pgrst, 'reload schema';
