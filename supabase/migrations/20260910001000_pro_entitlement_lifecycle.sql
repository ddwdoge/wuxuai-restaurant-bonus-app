-- WUXUAI Bonus PRO Phase 1: lifecycle-safe, restaurant-scoped entitlements.
-- This migration is additive and does not activate PRO for existing subscriptions.

alter table public.branch_subscriptions
  add column if not exists past_due_started_at timestamptz;

alter table public.branch_entitlement_overrides
  add column if not exists plan_override_key text,
  add column if not exists effective_from timestamptz,
  add column if not exists expires_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'branch_entitlement_overrides_plan_key_fkey'
      and conrelid = 'public.branch_entitlement_overrides'::regclass
  ) then
    alter table public.branch_entitlement_overrides
      add constraint branch_entitlement_overrides_plan_key_fkey
      foreign key (plan_override_key)
      references public.commercial_plan_catalog(plan_key);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'branch_entitlement_overrides_plan_allowed_check'
      and conrelid = 'public.branch_entitlement_overrides'::regclass
  ) then
    alter table public.branch_entitlement_overrides
      add constraint branch_entitlement_overrides_plan_allowed_check
      check (plan_override_key is null or plan_override_key in ('BASIC', 'PRO'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'branch_entitlement_overrides_window_check'
      and conrelid = 'public.branch_entitlement_overrides'::regclass
  ) then
    alter table public.branch_entitlement_overrides
      add constraint branch_entitlement_overrides_window_check
      check (expires_at is null or effective_from is null or expires_at > effective_from);
  end if;
end $$;

create table if not exists public.restaurant_entitlement_safety_blocks (
  id uuid primary key default extensions.gen_random_uuid(),
  scope_type text not null check (scope_type in ('GLOBAL', 'RESTAURANT')),
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  entitlement_key text not null check (
    entitlement_key in (
      'ALL', 'PLAN', 'OFFER_LIMIT', 'OFFER_NOTIFICATIONS', 'REWARD_NOTIFICATIONS'
    )
  ),
  reason text not null check (length(trim(reason)) >= 10),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  revoked_by uuid references auth.users(id) on delete restrict,
  revoked_at timestamptz,
  revoked_reason text,
  constraint restaurant_entitlement_safety_scope_check check (
    (scope_type = 'GLOBAL' and restaurant_id is null)
    or (scope_type = 'RESTAURANT' and restaurant_id is not null)
  ),
  constraint restaurant_entitlement_safety_window_check check (
    expires_at is null or expires_at > starts_at
  ),
  constraint restaurant_entitlement_safety_revocation_check check (
    (revoked_at is null and revoked_by is null)
    or (revoked_at is not null and revoked_by is not null and length(trim(coalesce(revoked_reason, ''))) >= 10)
  )
);

create index if not exists restaurant_entitlement_safety_active_idx
on public.restaurant_entitlement_safety_blocks (
  scope_type, restaurant_id, entitlement_key, starts_at, expires_at
)
where revoked_at is null;

alter table public.restaurant_entitlement_safety_blocks enable row level security;
revoke all on table public.restaurant_entitlement_safety_blocks
from public, anon, authenticated;

create or replace function public.track_branch_subscription_past_due_start()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_status text := lower(coalesce(new.subscription_status, new.status, ''));
  old_status text := case
    when tg_op = 'INSERT' then null
    else lower(coalesce(old.subscription_status, old.status, ''))
  end;
begin
  if new_status = 'past_due' then
    if tg_op = 'INSERT' or old_status is distinct from 'past_due' then
      new.past_due_started_at := coalesce(new.past_due_started_at, statement_timestamp());
    end if;
  else
    new.past_due_started_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists branch_subscriptions_track_past_due_start
on public.branch_subscriptions;
create trigger branch_subscriptions_track_past_due_start
before insert or update of status, subscription_status, past_due_started_at
on public.branch_subscriptions
for each row execute function public.track_branch_subscription_past_due_start();

revoke execute on function public.track_branch_subscription_past_due_start()
from public, anon, authenticated;

create or replace function public.block_unreleased_premium_plan()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if upper(coalesce(new.plan_key, '')) = 'PREMIUM' then
    raise exception using errcode = 'P0001', message = 'PREMIUM_NOT_RELEASED';
  end if;
  return new;
end;
$$;

drop trigger if exists branch_subscriptions_block_unreleased_premium
on public.branch_subscriptions;
create trigger branch_subscriptions_block_unreleased_premium
before insert or update of plan_key
on public.branch_subscriptions
for each row execute function public.block_unreleased_premium_plan();

revoke execute on function public.block_unreleased_premium_plan()
from public, anon, authenticated;

create or replace function public.resolve_subscription_plan_lifecycle_internal(
  input_plan_key text,
  input_subscription_status text,
  input_payment_status text,
  input_trial_started_at timestamptz,
  input_trial_ends_at timestamptz,
  input_period_ends_at timestamptz,
  input_past_due_started_at timestamptz,
  input_subscription_created_at timestamptz,
  input_at timestamptz default statement_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  plan_value text := upper(trim(coalesce(input_plan_key, '')));
  status_value text := lower(trim(coalesce(input_subscription_status, '')));
  payment_value text := lower(trim(coalesce(input_payment_status, '')));
  grace_ends_at timestamptz;
begin
  if status_value = 'canceled' then
    status_value := 'cancelled';
  end if;

  if plan_value = 'PREMIUM' then
    return jsonb_build_object(
      'eligible', false,
      'source', 'BASIC_FALLBACK',
      'reason_code', 'PREMIUM_NOT_RELEASED',
      'effective_from', null,
      'effective_until', null,
      'grace_status', 'NOT_APPLICABLE',
      'normalized_status', status_value
    );
  end if;

  if plan_value <> 'PRO' then
    return jsonb_build_object(
      'eligible', false,
      'source', 'BASIC_FALLBACK',
      'reason_code', case when plan_value = 'BASIC' then 'BASIC_PLAN' else 'PLAN_UNKNOWN' end,
      'effective_from', null,
      'effective_until', null,
      'grace_status', 'NOT_APPLICABLE',
      'normalized_status', status_value
    );
  end if;

  if status_value = 'active' then
    if payment_value in ('paid', 'manual') and input_period_ends_at > input_at then
      return jsonb_build_object(
        'eligible', true,
        'source', 'PAID_PLAN',
        'reason_code', 'PAID_PLAN_ACTIVE',
        'effective_from', input_subscription_created_at,
        'effective_until', input_period_ends_at,
        'grace_status', 'NOT_APPLICABLE',
        'normalized_status', status_value
      );
    end if;
    return jsonb_build_object(
      'eligible', false,
      'source', 'BASIC_FALLBACK',
      'reason_code', 'ACTIVE_PAYMENT_OR_PERIOD_INVALID',
      'effective_from', null,
      'effective_until', null,
      'grace_status', 'NOT_APPLICABLE',
      'normalized_status', status_value
    );
  end if;

  if status_value = 'trialing' then
    if payment_value = 'not_required' and input_trial_ends_at > input_at then
      return jsonb_build_object(
        'eligible', true,
        'source', 'TRIAL',
        'reason_code', 'TRIAL_ACTIVE',
        'effective_from', coalesce(input_trial_started_at, input_subscription_created_at),
        'effective_until', input_trial_ends_at,
        'grace_status', 'NOT_APPLICABLE',
        'normalized_status', status_value
      );
    end if;
    return jsonb_build_object(
      'eligible', false,
      'source', 'BASIC_FALLBACK',
      'reason_code', 'TRIAL_EXPIRED_OR_CONFLICTING',
      'effective_from', null,
      'effective_until', null,
      'grace_status', 'NOT_APPLICABLE',
      'normalized_status', status_value
    );
  end if;

  if status_value = 'past_due' then
    if input_past_due_started_at is null then
      return jsonb_build_object(
        'eligible', false,
        'source', 'BASIC_FALLBACK',
        'reason_code', 'PAST_DUE_START_UNKNOWN',
        'effective_from', null,
        'effective_until', null,
        'grace_status', 'UNKNOWN_START',
        'normalized_status', status_value
      );
    end if;
    grace_ends_at := input_past_due_started_at + interval '7 days';
    if payment_value in ('pending', 'failed')
      and input_past_due_started_at <= input_at
      and input_at <= grace_ends_at then
      return jsonb_build_object(
        'eligible', true,
        'source', 'PAST_DUE_GRACE',
        'reason_code', 'PAST_DUE_WITHIN_GRACE',
        'effective_from', input_past_due_started_at,
        'effective_until', grace_ends_at,
        'grace_status', 'WITHIN_GRACE',
        'normalized_status', status_value
      );
    end if;
    return jsonb_build_object(
      'eligible', false,
      'source', 'BASIC_FALLBACK',
      'reason_code', case
        when input_at > grace_ends_at then 'PAST_DUE_GRACE_EXPIRED'
        else 'PAST_DUE_PAYMENT_CONFLICT'
      end,
      'effective_from', null,
      'effective_until', grace_ends_at,
      'grace_status', case when input_at > grace_ends_at then 'EXPIRED' else 'CONFLICTING' end,
      'normalized_status', status_value
    );
  end if;

  if status_value = 'cancelled' then
    if payment_value in ('paid', 'manual') and input_period_ends_at > input_at then
      return jsonb_build_object(
        'eligible', true,
        'source', 'CANCELLED_PAID_PERIOD',
        'reason_code', 'CANCELLED_PERIOD_ACTIVE',
        'effective_from', input_subscription_created_at,
        'effective_until', input_period_ends_at,
        'grace_status', 'NOT_APPLICABLE',
        'normalized_status', status_value
      );
    end if;
    return jsonb_build_object(
      'eligible', false,
      'source', 'BASIC_FALLBACK',
      'reason_code', 'CANCELLED_PERIOD_ENDED_OR_UNPAID',
      'effective_from', null,
      'effective_until', input_period_ends_at,
      'grace_status', 'NOT_APPLICABLE',
      'normalized_status', status_value
    );
  end if;

  return jsonb_build_object(
    'eligible', false,
    'source', 'BASIC_FALLBACK',
    'reason_code', 'SUBSCRIPTION_STATUS_UNKNOWN_OR_INACTIVE',
    'effective_from', null,
    'effective_until', null,
    'grace_status', 'NOT_APPLICABLE',
    'normalized_status', status_value
  );
end;
$$;

revoke execute on function public.resolve_subscription_plan_lifecycle_internal(
  text, text, text, timestamptz, timestamptz, timestamptz, timestamptz,
  timestamptz, timestamptz
) from public, anon, authenticated;

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
        elsif override_record.effective_from is null or override_record.expires_at is null then
          override_status_value := 'INVALID_WINDOW';
        elsif override_record.effective_from > at_value then
          override_status_value := 'NOT_STARTED';
        elsif override_record.expires_at <= at_value then
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
      effective_from_value := override_record.effective_from;
      effective_until_value := override_record.expires_at;
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
    'contract_version', 'restaurant_entitlements_v2',
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
      'status', override_status_value,
      'effective_from', override_record.effective_from,
      'expires_at', override_record.expires_at,
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

create or replace function public.set_platform_restaurant_plan_override(
  input_restaurant_id uuid,
  input_plan_key text,
  input_expires_at timestamptz,
  input_reason text,
  input_confirmation text,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id_value uuid := auth.uid();
  role_value text := public.current_platform_role();
  restaurant_record public.restaurants%rowtype;
  subscription_record public.branch_subscriptions%rowtype;
  operation_id_value uuid;
  before_value jsonb;
  after_value jsonb;
  normalized_plan text := upper(trim(coalesce(input_plan_key, '')));
begin
  if actor_id_value is null
    or role_value not in ('platform_owner', 'platform_admin', 'billing_admin') then
    raise exception 'Nicht berechtigt.' using errcode = '42501';
  end if;
  if normalized_plan = 'PREMIUM' then
    raise exception using errcode = 'P0001', message = 'PREMIUM_NOT_RELEASED';
  end if;
  if normalized_plan not in ('BASIC', 'PRO') then
    raise exception 'Paket ist ungültig.';
  end if;
  if input_expires_at is null or input_expires_at <= statement_timestamp() then
    raise exception 'Ablaufzeitpunkt muss in der Zukunft liegen.';
  end if;
  if input_idempotency_key is null then
    raise exception 'Vorgangskennung fehlt.';
  end if;
  if length(trim(coalesce(input_reason, ''))) < 10 then
    raise exception 'Eine nachvollziehbare Begründung mit mindestens 10 Zeichen ist erforderlich.';
  end if;
  if input_confirmation <> 'CONFIRMED' then
    raise exception 'Bestätigung fehlt.';
  end if;

  select * into restaurant_record
  from public.restaurants
  where id = input_restaurant_id
  for update;
  if restaurant_record.id is null then
    raise exception 'Restaurant wurde nicht gefunden.';
  end if;
  if restaurant_record.primary_branch_id is null then
    raise exception 'Primärer Standort fehlt.';
  end if;

  select * into subscription_record
  from public.branch_subscriptions
  where branch_id = restaurant_record.primary_branch_id
  for update;
  if subscription_record.id is null then
    raise exception 'Abo-Zuordnung wurde nicht gefunden.';
  end if;

  select id into operation_id_value
  from public.platform_admin_operations
  where platform_admin_user_id = actor_id_value
    and action_type = 'PLAN_OVERRIDE_CHANGED'
    and tenant_id = input_restaurant_id
    and idempotency_key = input_idempotency_key;
  if operation_id_value is not null then
    return jsonb_build_object(
      'success', true,
      'idempotent', true,
      'operation_id', operation_id_value,
      'entitlements', public.resolve_restaurant_entitlements_internal(input_restaurant_id)
    );
  end if;

  before_value := public.resolve_restaurant_entitlements_internal(input_restaurant_id);

  insert into public.branch_entitlement_overrides (
    subscription_id, plan_override_key, effective_from, expires_at,
    reason, changed_by, changed_at
  ) values (
    subscription_record.id, normalized_plan, statement_timestamp(), input_expires_at,
    trim(input_reason), actor_id_value, statement_timestamp()
  ) on conflict (subscription_id) do update set
    plan_override_key = excluded.plan_override_key,
    effective_from = excluded.effective_from,
    expires_at = excluded.expires_at,
    reason = excluded.reason,
    changed_by = excluded.changed_by,
    changed_at = excluded.changed_at;

  after_value := public.resolve_restaurant_entitlements_internal(input_restaurant_id);

  insert into public.platform_admin_operations (
    platform_admin_user_id, platform_admin_role, action_type, entity_type, entity_id,
    tenant_id, severity, reason, before_state, after_state, result, idempotency_key
  ) values (
    actor_id_value, role_value, 'PLAN_OVERRIDE_CHANGED', 'branch_subscription', subscription_record.id,
    input_restaurant_id, 'SENSITIVE', trim(input_reason), before_value, after_value,
    'SUCCESS', input_idempotency_key
  ) returning id into operation_id_value;

  return jsonb_build_object(
    'success', true,
    'idempotent', false,
    'operation_id', operation_id_value,
    'entitlements', after_value
  );
end;
$$;

revoke execute on function public.set_platform_restaurant_plan_override(
  uuid, text, timestamptz, text, text, uuid
) from public, anon;
grant execute on function public.set_platform_restaurant_plan_override(
  uuid, text, timestamptz, text, text, uuid
) to authenticated;

notify pgrst, 'reload schema';
