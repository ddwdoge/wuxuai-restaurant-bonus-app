-- Final premium portal readiness fixes:
-- 1. persist exactly one audit event for an already-consumed redemption code;
-- 2. attach a verified platform test session to initial registration events.

create or replace function public.consume_redemption_code(
  input_restaurant_id uuid,
  input_code text,
  input_staff_session_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  code_record public.redemption_codes%rowtype;
  staff_record public.staff_members%rowtype;
  code_hash_value text;
  reward_title text;
begin
  if not public.is_restaurant_member(input_restaurant_id) then
    if nullif(trim(coalesce(input_staff_session_token, '')), '') is null then
      raise exception 'Nicht berechtigt.';
    end if;
    staff_record := public.get_staff_from_session(input_restaurant_id, input_staff_session_token);
    if staff_record.id is null then raise exception 'Mitarbeitersitzung ist nicht gültig.'; end if;
  end if;

  if trim(coalesce(input_code, '')) !~ '^[0-9]{6}$' then raise exception 'Einlösecode ist nicht gültig.'; end if;
  perform public.expire_redemption_codes(now());
  code_hash_value := encode(extensions.digest(trim(input_code), 'sha256'), 'hex');

  select * into code_record from public.redemption_codes
  where restaurant_id = input_restaurant_id and code_hash = code_hash_value
  order by case status when 'active' then 0 when 'redeemed' then 1 else 2 end,
    created_at desc
  limit 1
  for update;
  if code_record.id is null then raise exception 'Einlösecode ist nicht gültig.'; end if;
  if code_record.status = 'expired' or code_record.expires_at <= now() then raise exception 'Einlösecode ist abgelaufen.'; end if;

  if code_record.status = 'redeemed' then
    perform public.write_audit_event(
      code_record.restaurant_id,
      code_record.customer_id,
      case when staff_record.id is null then 'admin' else 'staff' end,
      coalesce(staff_record.id, auth.uid()),
      'REWARD_REDEMPTION_BLOCKED',
      'blocked',
      'staff_portal',
      'redemption_codes',
      code_record.id,
      code_record.idempotency_key,
      jsonb_build_object(
        'reason', 'already_redeemed',
        'redemption_type', code_record.redemption_type,
        'reward_id', code_record.reward_id
      )
    );

    return jsonb_build_object(
      'success', false,
      'error_code', 'REWARD_REDEMPTION_BLOCKED',
      'error_message', 'Einlösecode wurde bereits verwendet.'
    );
  end if;

  if code_record.status <> 'active' then raise exception 'Einlösecode ist nicht mehr verfügbar.'; end if;

  update public.redemption_codes
  set status = 'redeemed', redeemed_at = now(), deactivated_at = now()
  where id = code_record.id and status = 'active';

  if code_record.redemption_type = 'points_redemption' then
    update public.reward_redemption_events
    set status = 'redeemed', completed_at = now(), redeemed_at = now()
    where id = code_record.source_id and status = 'started';
  else
    update public.customer_rewards
    set status = 'redeemed', redeemed_at = now(), staff_member_id = staff_record.id
    where id = code_record.source_id and status = 'redemption_started';
  end if;

  select title into reward_title from public.rewards where id = code_record.reward_id;
  insert into public.audit_log (
    restaurant_id, organization_id, branch_id, actor_type, actor_id, action,
    target_table, target_id, metadata
  ) values (
    code_record.restaurant_id, code_record.organization_id, code_record.branch_id,
    case when staff_record.id is null then 'admin' else 'staff' end,
    coalesce(staff_record.id, auth.uid()), 'redemption_code_consumed',
    'redemption_codes', code_record.id,
    jsonb_build_object('redemption_type', code_record.redemption_type,
      'source_id', code_record.source_id, 'reward_id', code_record.reward_id)
  );

  return jsonb_build_object('success', true, 'redemption_type', code_record.redemption_type,
    'title', reward_title, 'redeemed_at', now());
end;
$$;

revoke execute on function public.consume_redemption_code(uuid, text, text) from public;
grant execute on function public.consume_redemption_code(uuid, text, text) to anon, authenticated;

create or replace function public.set_platform_customer_test_mode(
  input_customer_id uuid,
  input_is_test_customer boolean,
  input_test_session_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  platform_role_value text := public.current_platform_role();
  customer_record public.customers%rowtype;
  was_test_customer boolean;
begin
  if platform_role_value not in ('platform_owner', 'platform_admin', 'app_admin', 'super_admin', 'wuxuai_admin', 'security_admin') then
    raise exception 'Nicht berechtigt.';
  end if;
  if input_is_test_customer and nullif(trim(coalesce(input_test_session_id, '')), '') is null then
    raise exception 'Test-Sitzungs-ID fehlt.';
  end if;

  select is_test_customer into was_test_customer
  from public.customers
  where id = input_customer_id
  for update;

  update public.customers
  set is_test_customer = input_is_test_customer,
      test_session_id = case when input_is_test_customer then trim(input_test_session_id) else null end
  where id = input_customer_id
  returning * into customer_record;
  if customer_record.id is null then raise exception 'Gast wurde nicht gefunden.'; end if;

  -- Registration triggers run before the platform can mark the new customer as
  -- a test customer. Backfill only this freshly-created customer's initial
  -- registration events, and only on the first verified test-mode transition.
  if input_is_test_customer
     and not coalesce(was_test_customer, false)
     and customer_record.created_at >= now() - interval '30 minutes' then
    update public.audit_log
    set is_test_event = true,
        test_session_id = customer_record.test_session_id
    where customer_id = customer_record.id
      and restaurant_id = customer_record.restaurant_id
      and event_type in ('CUSTOMER_REGISTERED', 'CUSTOMER_JOINED_RESTAURANT')
      and test_session_id is null
      and created_at >= customer_record.created_at - interval '5 seconds'
      and created_at <= now();
  end if;

  perform public.write_audit_event(customer_record.restaurant_id, customer_record.id,
    'admin', auth.uid(), 'TEST_CUSTOMER_STATUS_CHANGED', 'success', 'platform_admin',
    'customers', customer_record.id, null,
    jsonb_build_object('is_test_customer', customer_record.is_test_customer,
      'test_session_id', customer_record.test_session_id, 'platform_role', platform_role_value));

  return jsonb_build_object('customer_id', customer_record.id,
    'is_test_customer', customer_record.is_test_customer,
    'test_session_id', customer_record.test_session_id);
end;
$$;

revoke execute on function public.set_platform_customer_test_mode(uuid, boolean, text) from public, anon;
grant execute on function public.set_platform_customer_test_mode(uuid, boolean, text) to authenticated;

notify pgrst, 'reload schema';
