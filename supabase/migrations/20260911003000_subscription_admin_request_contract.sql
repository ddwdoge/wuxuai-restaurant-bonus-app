-- Confirmed, target-bound and replay-safe entry point for the existing support writer.
begin;

create function public.update_platform_restaurant_subscription_confirmed(
  input_restaurant_id uuid,
  input_subscription_status text,
  input_payment_status text,
  input_restaurant_status text,
  input_trial_extension_days integer,
  input_reason text,
  input_confirmation text,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor_id_value uuid := auth.uid();
  role_value text := public.current_platform_role();
  restaurant_record public.restaurants%rowtype;
  subscription_record public.branch_subscriptions%rowtype;
  operation_record public.platform_admin_operations%rowtype;
  branch_id_value uuid;
  request_value jsonb;
  before_value jsonb;
  after_value jsonb;
  response_value jsonb;
begin
  if actor_id_value is null or role_value is null or role_value not in (
    'platform_owner', 'platform_admin', 'app_admin', 'super_admin', 'wuxuai_admin', 'billing_admin'
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if input_confirmation is distinct from 'CONFIRMED'
    or input_idempotency_key is null or input_restaurant_id is null
    or length(trim(coalesce(input_reason, ''))) < 10 then
    raise exception 'Confirmation, target, reason and request key required' using errcode = '22023';
  end if;
  if input_payment_status is not null or input_restaurant_status is not null then
    raise exception 'Payment and restaurant lifecycle changes are not permitted here' using errcode = '42501';
  end if;
  if (input_subscription_status is not null and input_subscription_status not in
      ('trialing', 'active', 'past_due', 'unpaid', 'cancelled', 'paused'))
    or (input_trial_extension_days is not null and input_trial_extension_days <= 0)
    or (input_subscription_status is null and input_trial_extension_days is null) then
    raise exception 'Invalid subscription action' using errcode = '22023';
  end if;
  request_value := jsonb_build_object('restaurant_id', input_restaurant_id,
    'subscription_status', input_subscription_status, 'trial_extension_days', input_trial_extension_days,
    'reason', trim(input_reason));

  -- Serializes retries and concurrent support actions with the plan-override lock order.
  select * into restaurant_record from public.restaurants
    where id = input_restaurant_id for update;
  if not found then
    raise exception 'Restaurant not found' using errcode = '22023';
  end if;
  select * into operation_record from public.platform_admin_operations
    where platform_admin_user_id = actor_id_value and tenant_id = input_restaurant_id
      and action_type = 'SUBSCRIPTION_UPDATED' and idempotency_key = input_idempotency_key;
  if found then
    if operation_record.after_state->'subscription_request' is distinct from request_value then
      raise exception 'Request key already used with different input' using errcode = '22023';
    end if;
    return operation_record.after_state->'subscription_response';
  end if;

  -- Canonical initialization avoids the legacy writer's pilot/30-day fallback.
  branch_id_value := public.ensure_restaurant_branch(input_restaurant_id);
  select * into subscription_record from public.branch_subscriptions
    where branch_id = branch_id_value for update;
  if not found or not exists (
    select 1 from public.branches b join public.restaurants r on r.id = input_restaurant_id
    where b.id = branch_id_value and b.restaurant_id = r.id
      and b.organization_id = r.organization_id
      and subscription_record.organization_id = r.organization_id
      and r.primary_branch_id = b.id
  ) then
    raise exception 'Subscription tenant binding invalid' using errcode = '42501';
  end if;
  before_value := to_jsonb(subscription_record);
  response_value := public.update_platform_restaurant_subscription_internal_v1(
    input_restaurant_id, input_subscription_status, null, null,
    input_trial_extension_days, trim(input_reason));
  select to_jsonb(s) into after_value from public.branch_subscriptions s
    where s.id = subscription_record.id;
  insert into public.platform_admin_operations (
    platform_admin_user_id, platform_admin_role, action_type, entity_type, entity_id,
    tenant_id, severity, reason, before_state, after_state, result, idempotency_key
  ) values (
    actor_id_value, role_value, 'SUBSCRIPTION_UPDATED', 'branch_subscriptions', subscription_record.id,
    input_restaurant_id, 'SENSITIVE', trim(input_reason), before_value,
    after_value || jsonb_build_object('subscription_request', request_value,
      'subscription_response', response_value), 'SUCCESS', input_idempotency_key
  );
  return response_value;
end;
$$;

revoke all on function public.update_platform_restaurant_subscription_confirmed(uuid,text,text,text,integer,text,text,uuid)
  from public, anon, authenticated;
grant execute on function public.update_platform_restaurant_subscription_confirmed(uuid,text,text,text,integer,text,text,uuid)
  to authenticated;
revoke execute on function public.update_platform_restaurant_subscription(uuid,text,text,text,integer,text)
  from public, anon, authenticated;
revoke execute on function public.update_platform_restaurant_subscription_internal_v1(uuid,text,text,text,integer,text)
  from public, anon, authenticated;
-- The server-only legacy implementation must not inherit a caller-controlled search path.
alter function public.update_platform_restaurant_subscription_internal_v1(uuid,text,text,text,integer,text)
  set search_path = pg_catalog, public, pg_temp;

notify pgrst, 'reload schema';
commit;
