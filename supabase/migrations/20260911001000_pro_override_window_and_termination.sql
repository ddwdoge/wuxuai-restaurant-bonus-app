-- Phase 1C. Apply only to approved Staging; no automatic grant or subscription change.
-- Plan windows are separate from the existing feature-exception window.
-- Valid legacy grants retain exactly their old interval. Invalid legacy grants
-- remain fail-closed; no invented expiry or extension is backfilled.
-- Forward-fix rollback: withdraw browser EXECUTE on the two new RPCs, keep all
-- columns and immutable audit rows, then issue a reviewed forward fix. Never
-- restore the old direct PLAN_CHANGED path or delete evidence.
alter table public.branch_entitlement_overrides
  add column if not exists plan_override_id uuid,
  add column if not exists plan_effective_from timestamptz,
  add column if not exists plan_effective_until timestamptz;

update public.branch_entitlement_overrides
set plan_override_id = extensions.gen_random_uuid(),
    plan_effective_from = effective_from,
    plan_effective_until = expires_at
where plan_override_key is not null and plan_override_id is null
  and plan_effective_from is null and plan_effective_until is null
  and isfinite(effective_from) and isfinite(expires_at)
  and expires_at > effective_from;

do $migration$
begin
  if not exists (select 1 from pg_constraint
    where conrelid = 'public.branch_entitlement_overrides'::regclass
      and conname = 'plan_override_finite_window') then
    alter table public.branch_entitlement_overrides
      add constraint plan_override_finite_window check (
        (plan_override_id is null and plan_effective_from is null and plan_effective_until is null)
        or (plan_override_id is not null and plan_override_key is not null and plan_override_key in ('BASIC', 'PRO')
          and plan_effective_from is not null and plan_effective_until is not null
          and isfinite(plan_effective_from) and isfinite(plan_effective_until)
          and plan_effective_until > plan_effective_from)
      );
    -- Legacy BASIC overrides are retained, never promoted to PRO.
  end if;
end;
$migration$;

create or replace function public.resolve_restaurant_entitlements_internal(input_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  at_value timestamptz := statement_timestamp();
  restaurant_record public.restaurants%rowtype;
  subscription_record public.branch_subscriptions%rowtype;
  basic_plan_record public.commercial_plan_catalog%rowtype;
  effective_plan_record public.commercial_plan_catalog%rowtype;
  override_record public.branch_entitlement_overrides%rowtype;
  lifecycle_value jsonb;
  resolved_plan_key text := 'BASIC';
  source_value text := 'BASIC_FALLBACK';
  reason_code_value text := 'SUBSCRIPTION_MISSING';
  effective_from_value timestamptz;
  effective_until_value timestamptz;
  override_status_value text := 'ABSENT';
  override_plan_valid boolean := false;
  feature_override_active boolean := false;
  safety_plan boolean := false;
  safety_offer_limit boolean := false;
  safety_offer_notifications boolean := false;
  safety_reward_notifications boolean := false;
  effective_offer_limit integer;
  effective_offer_unlimited boolean;
  effective_offer_notifications boolean;
  effective_reward_notifications boolean;
begin
  select * into basic_plan_record
  from public.commercial_plan_catalog
  where plan_key = 'BASIC';

  select * into restaurant_record
  from public.restaurants
  where id = input_restaurant_id;

  if restaurant_record.id is null then
    reason_code_value := 'RESTAURANT_NOT_FOUND';
  elsif restaurant_record.primary_branch_id is null then
    reason_code_value := 'PRIMARY_BRANCH_MISSING';
  else
    select * into subscription_record
    from public.branch_subscriptions
    where branch_id = restaurant_record.primary_branch_id;

    if subscription_record.id is not null then
      select * into override_record
      from public.branch_entitlement_overrides
      where subscription_id = subscription_record.id;

      lifecycle_value := public.resolve_subscription_plan_lifecycle_internal(
        subscription_record.plan_key,
        coalesce(subscription_record.subscription_status, subscription_record.status),
        subscription_record.payment_status,
        subscription_record.trial_started_at,
        subscription_record.trial_ends_at,
        coalesce(subscription_record.current_period_end, subscription_record.current_period_ends_at),
        subscription_record.past_due_started_at,
        subscription_record.created_at,
        at_value
      );

      if override_record.subscription_id is not null then
        if override_record.plan_override_key is null then
          override_status_value := case
            when override_record.expires_at is not null and override_record.expires_at <= at_value then 'EXPIRED'
            when override_record.effective_from is not null and override_record.effective_from > at_value then 'NOT_STARTED'
            else 'FEATURE_ONLY'
          end;
        elsif override_record.plan_override_id is null
          or override_record.plan_effective_from is null or override_record.plan_effective_until is null
          or not isfinite(override_record.plan_effective_from) or not isfinite(override_record.plan_effective_until)
          or override_record.plan_effective_until <= override_record.plan_effective_from then
          override_status_value := 'INVALID_WINDOW';
        elsif override_record.plan_effective_from > at_value then
          override_status_value := 'NOT_STARTED';
        elsif override_record.plan_effective_until <= at_value then
          override_status_value := 'EXPIRED';
        else
          override_status_value := 'VALID';
          override_plan_valid := true;
        end if;

        feature_override_active :=
          coalesce(override_record.effective_from <= at_value, true)
          and coalesce(override_record.expires_at > at_value, true);
      end if;
    end if;

    select
      coalesce(bool_or(block.entitlement_key in ('ALL', 'PLAN')), false),
      coalesce(bool_or(block.entitlement_key in ('ALL', 'OFFER_LIMIT')), false),
      coalesce(bool_or(block.entitlement_key in ('ALL', 'OFFER_NOTIFICATIONS')), false),
      coalesce(bool_or(block.entitlement_key in ('ALL', 'REWARD_NOTIFICATIONS')), false)
    into safety_plan, safety_offer_limit, safety_offer_notifications, safety_reward_notifications
    from public.restaurant_entitlement_safety_blocks block
    where block.revoked_at is null
      and block.starts_at <= at_value
      and (block.expires_at is null or block.expires_at > at_value)
      and (
        block.scope_type = 'GLOBAL'
        or (block.scope_type = 'RESTAURANT' and block.restaurant_id = input_restaurant_id)
      );

    if safety_plan then
      resolved_plan_key := 'BASIC';
      source_value := 'SAFETY_BLOCK';
      reason_code_value := 'PLAN_SAFETY_BLOCKED';
      feature_override_active := false;
    elsif override_plan_valid then
      resolved_plan_key := override_record.plan_override_key;
      source_value := 'PLATFORM_ADMIN_OVERRIDE';
      reason_code_value := 'ADMIN_OVERRIDE_ACTIVE';
      effective_from_value := override_record.plan_effective_from;
      effective_until_value := override_record.plan_effective_until;
    elsif coalesce((lifecycle_value->>'eligible')::boolean, false) then
      resolved_plan_key := upper(subscription_record.plan_key);
      source_value := lifecycle_value->>'source';
      reason_code_value := lifecycle_value->>'reason_code';
      effective_from_value := (lifecycle_value->>'effective_from')::timestamptz;
      effective_until_value := (lifecycle_value->>'effective_until')::timestamptz;
    elsif subscription_record.id is not null then
      reason_code_value := coalesce(lifecycle_value->>'reason_code', 'SUBSCRIPTION_INVALID');
    end if;
  end if;

  if resolved_plan_key not in ('BASIC', 'PRO') then
    resolved_plan_key := 'BASIC';
    source_value := 'BASIC_FALLBACK';
    reason_code_value := 'PLAN_UNKNOWN_OR_UNRELEASED';
    effective_from_value := null;
    effective_until_value := null;
  end if;

  select * into effective_plan_record
  from public.commercial_plan_catalog
  where plan_key = resolved_plan_key;

  if feature_override_active and override_record.offer_limit_unlimited is true then
    effective_offer_limit := null;
    effective_offer_unlimited := true;
  elsif feature_override_active and override_record.offer_limit_unlimited is false then
    effective_offer_limit := override_record.offer_limit;
    effective_offer_unlimited := false;
  else
    effective_offer_limit := effective_plan_record.offer_limit;
    effective_offer_unlimited := effective_plan_record.offer_limit is null;
  end if;

  effective_offer_notifications := case
    when feature_override_active and override_record.offer_notifications is not null
      then override_record.offer_notifications
    else coalesce(effective_plan_record.offer_notifications, false)
  end;
  effective_reward_notifications := case
    when feature_override_active and override_record.reward_notifications is not null
      then override_record.reward_notifications
    else coalesce(effective_plan_record.reward_notifications, false)
  end;

  if safety_offer_limit then
    effective_offer_limit := basic_plan_record.offer_limit;
    effective_offer_unlimited := false;
  end if;
  if safety_offer_notifications then
    effective_offer_notifications := false;
  end if;
  if safety_reward_notifications then
    effective_reward_notifications := false;
  end if;

  return jsonb_build_object(
    'contract_version', 'restaurant_entitlements_v3',
    'plan_key', resolved_plan_key,
    'effective_plan', resolved_plan_key,
    'stored_plan_key', subscription_record.plan_key,
    'plan_scope', jsonb_build_object(
      'type', 'RESTAURANT_LOCATION',
      'restaurant_id', input_restaurant_id,
      'branch_id', restaurant_record.primary_branch_id
    ),
    'entitlement_source', source_value,
    'effective_from', effective_from_value,
    'effective_until', effective_until_value,
    'reason_code', reason_code_value,
    'monthly_price_eur_ex_vat', coalesce(effective_plan_record.monthly_price_eur_ex_vat, 59),
    'publicly_available', coalesce(effective_plan_record.publicly_available, false),
    'subscription_status', coalesce(subscription_record.subscription_status, subscription_record.status),
    'payment_status', subscription_record.payment_status,
    'trial_ends_at', subscription_record.trial_ends_at,
    'period_ends_at', coalesce(subscription_record.current_period_end, subscription_record.current_period_ends_at),
    'grace_status', coalesce(lifecycle_value->>'grace_status', 'NOT_APPLICABLE'),
    'override_status', override_status_value,
    'subscription', jsonb_build_object(
      'id', subscription_record.id,
      'status', coalesce(subscription_record.subscription_status, subscription_record.status),
      'payment_status', subscription_record.payment_status,
      'trial_started_at', subscription_record.trial_started_at,
      'trial_ends_at', subscription_record.trial_ends_at,
      'period_ends_at', coalesce(subscription_record.current_period_end, subscription_record.current_period_ends_at),
      'past_due_started_at', subscription_record.past_due_started_at,
      'grace_ends_at', case
        when subscription_record.past_due_started_at is null then null
        else subscription_record.past_due_started_at + interval '7 days'
      end
    ),
    'safety', jsonb_build_object(
      'plan_blocked', safety_plan,
      'offer_limit_blocked', safety_offer_limit,
      'offer_notifications_blocked', safety_offer_notifications,
      'reward_notifications_blocked', safety_reward_notifications
    ),
    'commercial_default', jsonb_build_object(
      'offer_limit', effective_plan_record.offer_limit,
      'offer_limit_unlimited', effective_plan_record.offer_limit is null,
      'offer_notifications', coalesce(effective_plan_record.offer_notifications, false),
      'reward_notifications', coalesce(effective_plan_record.reward_notifications, false),
      'gift_cards', false,
      'pos_integration', false
    ),
    'override', case when override_record.subscription_id is null then null else jsonb_build_object(
      'plan_key', override_record.plan_override_key,
      'id', override_record.plan_override_id,
      'status', override_status_value,
      'effective_from', override_record.plan_effective_from,
      'expires_at', override_record.plan_effective_until,
      'offer_limit', override_record.offer_limit,
      'offer_limit_unlimited', override_record.offer_limit_unlimited,
      'offer_notifications', override_record.offer_notifications,
      'reward_notifications', override_record.reward_notifications,
      'gift_cards', false,
      'pos_integration', false,
      'reason', override_record.reason,
      'changed_by', override_record.changed_by,
      'changed_at', override_record.changed_at
    ) end,
    'effective', jsonb_build_object(
      'offer_limit', effective_offer_limit,
      'offer_limit_unlimited', effective_offer_unlimited,
      'offer_notifications', effective_offer_notifications,
      'reward_notifications', effective_reward_notifications,
      'gift_cards', false,
      'pos_integration', false
    ),
    'subscription_id', subscription_record.id,
    'stripe_mapping', jsonb_build_object(
      'lookup_key', effective_plan_record.stripe_price_lookup_key,
      'configured', false
    )
  );
end;
$$;

revoke execute on function public.resolve_restaurant_entitlements_internal(uuid)
from public, anon, authenticated;

-- All parameters are explicit. A NULL start means "immediately" on the server.
create or replace function public.set_platform_restaurant_plan_override(
  input_restaurant_id uuid, input_plan_key text, input_expires_at timestamptz,
  input_reason text, input_confirmation text, input_idempotency_key uuid,
  input_starts_at timestamptz
)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $function$
declare
  actor_id_value uuid := auth.uid();
  role_value text := public.current_platform_role();
  restaurant_record public.restaurants%rowtype;
  subscription_record public.branch_subscriptions%rowtype;
  operation_record public.platform_admin_operations%rowtype;
  before_value jsonb;
  after_value jsonb;
  request_value jsonb;
  now_value timestamptz;
  starts_value timestamptz;
  override_id_value uuid;
  operation_id_value uuid;
begin
  if actor_id_value is null or role_value is null
    or role_value not in ('platform_owner', 'platform_admin', 'billing_admin') then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if input_plan_key = 'PREMIUM' then raise exception 'PREMIUM_NOT_RELEASED'; end if;
  if input_plan_key is distinct from 'PRO' or input_restaurant_id is null then
    raise exception 'INVALID_PLAN_OR_TENANT' using errcode = '22023';
  end if;
  if input_idempotency_key is null or length(trim(coalesce(input_reason, ''))) < 10
    or input_confirmation is distinct from 'CONFIRMED' then
    raise exception 'REASON_CONFIRMATION_AND_REQUEST_REQUIRED' using errcode = '22023';
  end if;
  request_value := jsonb_build_object('plan', input_plan_key, 'starts_at', input_starts_at,
    'expires_at', input_expires_at, 'reason', trim(input_reason));

  -- Both writes lock in the same order, including first-time grants without a row.
  select * into restaurant_record from public.restaurants
    where id = input_restaurant_id for update;
  if restaurant_record.id is null or restaurant_record.primary_branch_id is null then
    raise exception 'TENANT_OR_PRIMARY_BRANCH_MISSING';
  end if;
  select * into subscription_record from public.branch_subscriptions
    where branch_id = restaurant_record.primary_branch_id for update;
  if subscription_record.id is null then raise exception 'SUBSCRIPTION_MISSING'; end if;

  select * into operation_record from public.platform_admin_operations
    where platform_admin_user_id = actor_id_value and tenant_id = input_restaurant_id
      and action_type = 'PLAN_OVERRIDE_ACTIVATED' and idempotency_key = input_idempotency_key;
  if operation_record.id is not null then
    if operation_record.after_state->'plan_override_request' is distinct from request_value then
      raise exception 'IDEMPOTENCY_PAYLOAD_MISMATCH' using errcode = '22023';
    end if;
    return jsonb_build_object('success', true, 'idempotent', true, 'operation_id', operation_record.id,
      'entitlements', public.resolve_restaurant_entitlements_internal(input_restaurant_id));
  end if;

  now_value := clock_timestamp();
  starts_value := coalesce(input_starts_at, statement_timestamp());
  if input_expires_at is null or not isfinite(input_expires_at)
    or not isfinite(starts_value) or input_expires_at <= now_value
    or input_expires_at <= starts_value
    or (input_starts_at is not null and starts_value < now_value) then
    raise exception 'INVALID_OVERRIDE_WINDOW' using errcode = '22023';
  end if;
  before_value := public.resolve_restaurant_entitlements_internal(input_restaurant_id);
  override_id_value := extensions.gen_random_uuid();
  insert into public.branch_entitlement_overrides (
    subscription_id, plan_override_key, plan_override_id, plan_effective_from, plan_effective_until,
    reason, changed_by, changed_at
  ) values (
    subscription_record.id, 'PRO', override_id_value, starts_value, input_expires_at,
    trim(input_reason), actor_id_value, now_value
  ) on conflict (subscription_id) do update set
    plan_override_key = excluded.plan_override_key, plan_override_id = excluded.plan_override_id,
    plan_effective_from = excluded.plan_effective_from, plan_effective_until = excluded.plan_effective_until;
  -- Feature values, feature expiry and subscription data are deliberately untouched.
  after_value := public.resolve_restaurant_entitlements_internal(input_restaurant_id)
    || jsonb_build_object('plan_override_request', request_value);
  insert into public.platform_admin_operations (
    platform_admin_user_id, platform_admin_role, action_type, entity_type, entity_id,
    tenant_id, severity, reason, before_state, after_state, result, idempotency_key
  ) values (
    actor_id_value, role_value, 'PLAN_OVERRIDE_ACTIVATED', 'plan_override', override_id_value,
    input_restaurant_id, 'SENSITIVE', trim(input_reason), before_value, after_value, 'SUCCESS', input_idempotency_key
  ) returning id into operation_id_value;
  return jsonb_build_object('success', true, 'idempotent', false, 'operation_id', operation_id_value,
    'entitlements', public.resolve_restaurant_entitlements_internal(input_restaurant_id));
end;
$function$;

create or replace function public.end_platform_restaurant_plan_override(
  input_restaurant_id uuid, input_override_id uuid, input_reason text,
  input_confirmation text, input_idempotency_key uuid
)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $function$
declare
  actor_id_value uuid := auth.uid();
  role_value text := public.current_platform_role();
  restaurant_record public.restaurants%rowtype;
  subscription_record public.branch_subscriptions%rowtype;
  override_record public.branch_entitlement_overrides%rowtype;
  operation_record public.platform_admin_operations%rowtype;
  before_value jsonb;
  after_value jsonb;
  operation_id_value uuid;
begin
  if actor_id_value is null or role_value is null
    or role_value not in ('platform_owner', 'platform_admin', 'billing_admin') then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if input_restaurant_id is null or input_override_id is null or input_idempotency_key is null
    or length(trim(coalesce(input_reason, ''))) < 10
    or input_confirmation is distinct from 'CONFIRMED' then
    raise exception 'TARGET_REASON_CONFIRMATION_AND_REQUEST_REQUIRED' using errcode = '22023';
  end if;
  select * into restaurant_record from public.restaurants
    where id = input_restaurant_id for update;
  if restaurant_record.id is null or restaurant_record.primary_branch_id is null then
    raise exception 'TENANT_OR_PRIMARY_BRANCH_MISSING';
  end if;
  select * into subscription_record from public.branch_subscriptions
    where branch_id = restaurant_record.primary_branch_id for update;
  if subscription_record.id is null then raise exception 'SUBSCRIPTION_MISSING'; end if;
  select * into operation_record from public.platform_admin_operations
    where platform_admin_user_id = actor_id_value and tenant_id = input_restaurant_id
      and action_type = 'PLAN_OVERRIDE_ENDED' and idempotency_key = input_idempotency_key;
  if operation_record.id is not null then
    if operation_record.entity_id is distinct from input_override_id
      or operation_record.reason is distinct from trim(input_reason) then
      raise exception 'IDEMPOTENCY_PAYLOAD_MISMATCH' using errcode = '22023';
    end if;
    return jsonb_build_object('success', true, 'idempotent', true, 'operation_id', operation_record.id,
      'entitlements', public.resolve_restaurant_entitlements_internal(input_restaurant_id));
  end if;
  select * into override_record from public.branch_entitlement_overrides
    where subscription_id = subscription_record.id for update;
  if override_record.plan_override_id is distinct from input_override_id
    or override_record.plan_override_key is null then
    raise exception 'OVERRIDE_CHANGED_REFRESH_REQUIRED' using errcode = '40001';
  end if;
  before_value := public.resolve_restaurant_entitlements_internal(input_restaurant_id);
  update public.branch_entitlement_overrides
    set plan_override_key = null, plan_override_id = null,
        plan_effective_from = null, plan_effective_until = null
    where subscription_id = subscription_record.id and plan_override_id = input_override_id;
  after_value := public.resolve_restaurant_entitlements_internal(input_restaurant_id);
  insert into public.platform_admin_operations (
    platform_admin_user_id, platform_admin_role, action_type, entity_type, entity_id,
    tenant_id, severity, reason, before_state, after_state, result, idempotency_key
  ) values (
    actor_id_value, role_value, 'PLAN_OVERRIDE_ENDED', 'plan_override', input_override_id,
    input_restaurant_id, 'SENSITIVE', trim(input_reason), before_value, after_value, 'SUCCESS', input_idempotency_key
  ) returning id into operation_id_value;
  return jsonb_build_object('success', true, 'idempotent', false, 'operation_id', operation_id_value,
    'entitlements', after_value);
end;
$function$;

-- Old direct subscription writes and untargeted override clearing are not browser APIs.
revoke execute on function public.update_platform_restaurant_entitlements(uuid,text,text,integer,boolean,boolean,text,text,uuid)
  from public, anon, authenticated;
revoke execute on function public.set_platform_restaurant_plan_override(uuid,text,timestamptz,text,text,uuid)
  from public, anon, authenticated;
revoke execute on function public.set_platform_restaurant_plan_override(uuid,text,timestamptz,text,text,uuid,timestamptz)
  from public, anon;
revoke execute on function public.end_platform_restaurant_plan_override(uuid,uuid,text,text,uuid)
  from public, anon;
grant execute on function public.set_platform_restaurant_plan_override(uuid,text,timestamptz,text,text,uuid,timestamptz)
  to authenticated;
grant execute on function public.end_platform_restaurant_plan_override(uuid,uuid,text,text,uuid)
  to authenticated;

notify pgrst, 'reload schema';
