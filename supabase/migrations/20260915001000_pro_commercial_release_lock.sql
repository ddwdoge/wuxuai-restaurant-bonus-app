-- Phase 7B.1A: per-country commercial release, pilot and TEST_ONLY contract.
-- Local implementation only. Do not apply to Staging or Production without a
-- separate Founder approval. Existing subscription and override rows are kept
-- byte-for-byte; only effective entitlements and new elevation writes change.
begin;

create table if not exists public.commercial_plan_release_policy (
  country_code text not null,
  plan_key text not null references public.commercial_plan_catalog(plan_key),
  release_state text not null default 'LOCKED',
  revision integer not null default 1 check (revision > 0),
  founder_decision_ref text,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (country_code, plan_key),
  constraint commercial_plan_release_country_format
    check (country_code ~ '^[A-Z]{2}$'),
  constraint commercial_plan_release_pro_only
    check (plan_key = 'PRO'),
  constraint commercial_plan_release_state_contract check (
    (release_state = 'LOCKED' and founder_decision_ref is null and released_at is null)
    or
    (release_state = 'RELEASED'
      and length(trim(coalesce(founder_decision_ref, ''))) >= 10
      and released_at is not null and isfinite(released_at))
  )
);

insert into public.commercial_plan_release_policy (
  country_code, plan_key, release_state, revision,
  founder_decision_ref, released_at
)
values ('AT', 'PRO', 'LOCKED', 1, null, null)
on conflict (country_code, plan_key) do nothing;

insert into public.commercial_plan_release_policy (
  country_code, plan_key, release_state, revision,
  founder_decision_ref, released_at
)
select country_code, 'PRO', 'LOCKED', 1, null, null
from public.country_launch_policy
on conflict (country_code, plan_key) do nothing;

create table if not exists public.commercial_pro_access_grants (
  id uuid primary key default extensions.gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  organization_id uuid not null,
  access_kind text not null check (
    access_kind in ('REAL_BUSINESS_PILOT', 'INTERNAL_TEST_ONLY')
  ),
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  reason text not null check (length(trim(reason)) >= 10),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  revoked_by uuid references auth.users(id) on delete restrict,
  revoked_at timestamptz,
  revoke_reason text,
  request_id uuid not null,
  constraint commercial_pro_access_window check (
    isfinite(starts_at) and isfinite(expires_at) and expires_at > starts_at
  ),
  constraint commercial_pro_access_revocation check (
    (revoked_at is null and revoked_by is null and revoke_reason is null)
    or
    (revoked_at is not null and revoked_by is not null
      and length(trim(coalesce(revoke_reason, ''))) >= 10)
  ),
  unique (request_id)
);

create index if not exists commercial_pro_access_active_idx
on public.commercial_pro_access_grants (
  restaurant_id, organization_id, access_kind, starts_at, expires_at
)
where revoked_at is null;

create table if not exists public.commercial_pro_access_audit (
  id uuid primary key default extensions.gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete restrict,
  actor_role text not null,
  action_type text not null check (action_type in (
    'COUNTRY_PRO_RELEASED', 'COUNTRY_PRO_LOCKED',
    'PRO_ACCESS_GRANTED', 'PRO_ACCESS_EXTENDED', 'PRO_ACCESS_REVOKED'
  )),
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  plan_key text not null default 'PRO' check (plan_key = 'PRO'),
  restaurant_id uuid references public.restaurants(id) on delete restrict,
  organization_id uuid,
  access_grant_id uuid references public.commercial_pro_access_grants(id) on delete restrict,
  request_id uuid not null,
  reason text not null check (length(trim(reason)) >= 10),
  before_state jsonb,
  after_state jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (request_id)
);

alter table public.commercial_plan_release_policy enable row level security;
alter table public.commercial_pro_access_grants enable row level security;
alter table public.commercial_pro_access_audit enable row level security;
revoke all on table public.commercial_plan_release_policy
from public, anon, authenticated, service_role;
revoke all on table public.commercial_pro_access_grants
from public, anon, authenticated, service_role;
revoke all on table public.commercial_pro_access_audit
from public, anon, authenticated, service_role;

create or replace function public.protect_commercial_pro_access_audit()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $function$
begin
  raise exception 'COMMERCIAL_PRO_AUDIT_IMMUTABLE' using errcode = '42501';
end;
$function$;

revoke execute on function public.protect_commercial_pro_access_audit()
from public, anon, authenticated, service_role;
drop trigger if exists protect_commercial_pro_access_audit
on public.commercial_pro_access_audit;
create trigger protect_commercial_pro_access_audit
before update or delete on public.commercial_pro_access_audit
for each row execute function public.protect_commercial_pro_access_audit();

create or replace function public.require_recent_platform_auth_internal()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
stable
as $function$
declare
  actor_id_value uuid := auth.uid();
  claims_value jsonb := auth.jwt();
  authenticated_at_value timestamptz;
begin
  if actor_id_value is null
    or claims_value->>'sub' is distinct from actor_id_value::text
    or nullif(claims_value->>'session_id', '') is null
    or nullif(claims_value->>'auth_time', '') is null then
    raise exception 'RECENT_PLATFORM_AUTH_REQUIRED' using errcode = '42501';
  end if;

  begin
    authenticated_at_value := to_timestamp((claims_value->>'auth_time')::double precision);
  exception when others then
    raise exception 'RECENT_PLATFORM_AUTH_REQUIRED' using errcode = '42501';
  end;

  if authenticated_at_value > statement_timestamp() + interval '1 minute'
    or authenticated_at_value < statement_timestamp() - interval '10 minutes' then
    raise exception 'RECENT_PLATFORM_AUTH_REQUIRED' using errcode = '42501';
  end if;
end;
$function$;

revoke execute on function public.require_recent_platform_auth_internal()
from public, anon, authenticated, service_role;

-- The table remains private. Country changes are possible only through the
-- authenticated, role-checked, recent-auth SECURITY DEFINER RPC below.
create or replace function public.resolve_commercial_plan_release_internal(
  input_restaurant_id uuid,
  input_plan_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
stable
as $function$
declare
  normalized_plan text := upper(trim(coalesce(input_plan_key, '')));
  country_value text;
  policy_record public.commercial_plan_release_policy%rowtype;
  released_value boolean := false;
  reason_value text := 'PRO_COMMERCIAL_POLICY_MISSING';
begin
  if input_restaurant_id is null or normalized_plan is distinct from 'PRO' then
    return jsonb_build_object(
      'country_code', null,
      'plan_key', normalized_plan,
      'release_state', 'LOCKED',
      'released', false,
      'revision', null,
      'reason_code', 'PRO_COMMERCIAL_POLICY_INVALID'
    );
  end if;

  select upper(trim(branch.country))
  into country_value
  from public.restaurants restaurant
  join public.branches branch
    on branch.id = restaurant.primary_branch_id
   and branch.restaurant_id = restaurant.id
   and branch.organization_id = restaurant.organization_id
  where restaurant.id = input_restaurant_id;

  if country_value is null or country_value !~ '^[A-Z]{2}$' then
    return jsonb_build_object(
      'country_code', country_value,
      'plan_key', normalized_plan,
      'release_state', 'LOCKED',
      'released', false,
      'revision', null,
      'reason_code', 'PRO_COMMERCIAL_COUNTRY_UNRESOLVED'
    );
  end if;

  select * into policy_record
  from public.commercial_plan_release_policy
  where country_code = country_value and plan_key = normalized_plan;

  if policy_record.country_code is not null then
    released_value := policy_record.release_state = 'RELEASED'
      and policy_record.revision > 0
      and length(trim(coalesce(policy_record.founder_decision_ref, ''))) >= 10
      and policy_record.released_at is not null
      and isfinite(policy_record.released_at);
    reason_value := case
      when released_value then 'PRO_COMMERCIAL_RELEASED'
      when policy_record.release_state = 'LOCKED' then 'PRO_COMMERCIAL_RELEASE_LOCKED'
      else 'PRO_COMMERCIAL_POLICY_INVALID'
    end;
  end if;

  return jsonb_build_object(
    'country_code', country_value,
    'plan_key', normalized_plan,
    'release_state', case when released_value then 'RELEASED' else 'LOCKED' end,
    'released', released_value,
    'revision', policy_record.revision,
    'reason_code', reason_value
  );
exception when others then
  -- Policy/configuration failures must never grant PRO.
  return jsonb_build_object(
    'country_code', country_value,
    'plan_key', normalized_plan,
    'release_state', 'LOCKED',
    'released', false,
    'revision', null,
    'reason_code', 'PRO_COMMERCIAL_POLICY_INVALID'
  );
end;
$function$;

revoke execute on function public.resolve_commercial_plan_release_internal(uuid, text)
from public, anon, authenticated, service_role;

create or replace function public.resolve_restaurant_entitlements_internal(input_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
stable
as $function$
declare
  at_value timestamptz := statement_timestamp();
  restaurant_record public.restaurants%rowtype;
  subscription_record public.branch_subscriptions%rowtype;
  basic_plan_record public.commercial_plan_catalog%rowtype;
  effective_plan_record public.commercial_plan_catalog%rowtype;
  override_record public.branch_entitlement_overrides%rowtype;
  lifecycle_value jsonb;
  commercial_release_value jsonb;
  commercial_pro_released boolean := false;
  subscription_pro_valid boolean := false;
  real_business_pilot_valid boolean := false;
  internal_test_only_valid boolean := false;
  effective_pro_valid boolean := false;
  access_grant_id_value uuid;
  access_kind_value text;
  requested_pro boolean := false;
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
  basic_offer_limit_value integer := 5;
  effective_offer_limit integer;
  effective_offer_unlimited boolean;
  effective_offer_notifications boolean;
  effective_reward_notifications boolean;
begin
  select * into basic_plan_record
  from public.commercial_plan_catalog
  where plan_key = 'BASIC';
  if basic_plan_record.offer_limit between 1 and 5 then
    basic_offer_limit_value := basic_plan_record.offer_limit;
  end if;

  select * into restaurant_record
  from public.restaurants
  where id = input_restaurant_id;

  commercial_release_value := public.resolve_commercial_plan_release_internal(
    input_restaurant_id, 'PRO'
  );
  commercial_pro_released := coalesce(
    (commercial_release_value->>'released')::boolean, false
  );

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

    subscription_pro_valid := upper(coalesce(subscription_record.plan_key, '')) = 'PRO'
      and coalesce((lifecycle_value->>'eligible')::boolean, false);

    select grant_row.id into access_grant_id_value
    from public.commercial_pro_access_grants grant_row
    where grant_row.restaurant_id = restaurant_record.id
      and grant_row.organization_id = restaurant_record.organization_id
      and grant_row.access_kind = 'REAL_BUSINESS_PILOT'
      and grant_row.revoked_at is null
      and grant_row.starts_at <= at_value
      and grant_row.expires_at > at_value
    order by grant_row.expires_at desc, grant_row.id
    limit 1;
    real_business_pilot_valid := access_grant_id_value is not null;
    if real_business_pilot_valid then access_kind_value := 'REAL_BUSINESS_PILOT'; end if;

    if not real_business_pilot_valid then
      select grant_row.id into access_grant_id_value
      from public.commercial_pro_access_grants grant_row
      join public.platform_test_tenant_registry marker
        on marker.restaurant_id = restaurant_record.id
       and marker.organization_id = restaurant_record.organization_id
       and marker.restaurant_name = restaurant_record.name
       and marker.owner_user_id = restaurant_record.owner_id
       and marker.deleted_at is null
      where grant_row.restaurant_id = restaurant_record.id
        and grant_row.organization_id = restaurant_record.organization_id
        and grant_row.access_kind = 'INTERNAL_TEST_ONLY'
        and grant_row.revoked_at is null
        and grant_row.starts_at <= at_value
        and grant_row.expires_at > at_value
      order by grant_row.expires_at desc, grant_row.id
      limit 1;
      internal_test_only_valid := access_grant_id_value is not null;
      if internal_test_only_valid then access_kind_value := 'INTERNAL_TEST_ONLY'; end if;
    end if;

    effective_pro_valid := internal_test_only_valid
      or (commercial_pro_released and (
        subscription_pro_valid or real_business_pilot_valid
      ));

    if safety_plan then
      resolved_plan_key := 'BASIC';
      source_value := 'SAFETY_BLOCK';
      reason_code_value := 'PLAN_SAFETY_BLOCKED';
      feature_override_active := false;
    elsif internal_test_only_valid then
      resolved_plan_key := 'PRO';
      source_value := 'INTERNAL_TEST_ONLY';
      reason_code_value := 'INTERNAL_TEST_ONLY_ACTIVE';
    elsif commercial_pro_released and real_business_pilot_valid then
      resolved_plan_key := 'PRO';
      source_value := 'REAL_BUSINESS_PILOT';
      reason_code_value := 'REAL_BUSINESS_PILOT_ACTIVE';
    elsif commercial_pro_released and subscription_pro_valid then
      resolved_plan_key := 'PRO';
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

  requested_pro := upper(coalesce(subscription_record.plan_key, '')) = 'PRO'
    or upper(coalesce(override_record.plan_override_key, '')) = 'PRO'
    or (feature_override_active and (
      override_record.offer_limit_unlimited is true
      or coalesce(override_record.offer_limit, 0) > basic_offer_limit_value
      or override_record.offer_notifications is true
      or override_record.reward_notifications is true
    ));

  if not effective_pro_valid and (resolved_plan_key = 'PRO' or requested_pro) then
    resolved_plan_key := 'BASIC';
    source_value := 'COMMERCIAL_RELEASE_LOCK';
    reason_code_value := coalesce(
      commercial_release_value->>'reason_code',
      'PRO_COMMERCIAL_POLICY_INVALID'
    );
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

  if not effective_pro_valid then
    effective_offer_limit := least(
      coalesce(effective_offer_limit, basic_offer_limit_value),
      basic_offer_limit_value
    );
    effective_offer_unlimited := false;
    effective_offer_notifications := false;
    effective_reward_notifications := false;
  end if;

  if safety_offer_limit then
    effective_offer_limit := basic_offer_limit_value;
    effective_offer_unlimited := false;
  end if;
  if safety_offer_notifications then
    effective_offer_notifications := false;
  end if;
  if safety_reward_notifications then
    effective_reward_notifications := false;
  end if;

  return jsonb_build_object(
    'contract_version', 'restaurant_entitlements_v5',
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
    'commercial_release', commercial_release_value,
    'commercial_access', jsonb_build_object(
      'effective_pro', effective_pro_valid and not safety_plan,
      'paid_or_trial', subscription_pro_valid,
      'real_business_pilot', real_business_pilot_valid,
      'internal_test_only', internal_test_only_valid,
      'access_kind', access_kind_value,
      'access_grant_id', access_grant_id_value
    ),
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
$function$;

revoke execute on function public.resolve_restaurant_entitlements_internal(uuid)
from public, anon, authenticated, service_role;

create or replace function public.guard_pro_subscription_elevation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  restaurant_id_value uuid;
  release_value jsonb;
begin
  if upper(coalesce(new.plan_key, '')) <> 'PRO' then
    return new;
  end if;
  if tg_op = 'UPDATE' and upper(coalesce(old.plan_key, '')) = 'PRO' then
    return new;
  end if;

  select restaurant.id into restaurant_id_value
  from public.branches branch
  join public.restaurants restaurant
    on restaurant.id = branch.restaurant_id
   and restaurant.organization_id = branch.organization_id
   and restaurant.primary_branch_id = branch.id
  where branch.id = new.branch_id
    and branch.organization_id = new.organization_id;

  release_value := public.resolve_commercial_plan_release_internal(
    restaurant_id_value, 'PRO'
  );
  if coalesce((release_value->>'released')::boolean, false) is not true then
    raise exception 'PRO_COMMERCIAL_RELEASE_LOCKED' using errcode = '42501';
  end if;
  return new;
end;
$function$;

revoke execute on function public.guard_pro_subscription_elevation()
from public, anon, authenticated, service_role;
drop trigger if exists branch_subscriptions_commercial_release_guard
on public.branch_subscriptions;
create trigger branch_subscriptions_commercial_release_guard
before insert or update of plan_key on public.branch_subscriptions
for each row execute function public.guard_pro_subscription_elevation();

create or replace function public.guard_pro_override_elevation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  restaurant_id_value uuid;
  release_value jsonb;
  basic_offer_limit_value integer := 5;
  pro_elevation boolean := false;
begin
  select case when offer_limit between 1 and 5 then offer_limit else 5 end
  into basic_offer_limit_value
  from public.commercial_plan_catalog
  where plan_key = 'BASIC';
  basic_offer_limit_value := coalesce(basic_offer_limit_value, 5);

  if tg_op = 'INSERT' then
    pro_elevation := upper(coalesce(new.plan_override_key, '')) = 'PRO'
      or new.offer_limit_unlimited is true
      or coalesce(new.offer_limit, 0) > basic_offer_limit_value
      or new.offer_notifications is true
      or new.reward_notifications is true;
  else
    pro_elevation :=
      (upper(coalesce(new.plan_override_key, '')) = 'PRO' and (
        upper(coalesce(old.plan_override_key, '')) <> 'PRO'
        or new.plan_override_id is distinct from old.plan_override_id
        or new.plan_effective_from < old.plan_effective_from
        or new.plan_effective_until > old.plan_effective_until
      ))
      or (new.offer_limit_unlimited is true and old.offer_limit_unlimited is distinct from true)
      or (coalesce(new.offer_limit, 0) > basic_offer_limit_value
        and coalesce(new.offer_limit, 0) > coalesce(old.offer_limit, 0))
      or (new.offer_notifications is true and old.offer_notifications is distinct from true)
      or (new.reward_notifications is true and old.reward_notifications is distinct from true);
  end if;

  if not pro_elevation then
    return new;
  end if;

  select restaurant.id into restaurant_id_value
  from public.branch_subscriptions subscription
  join public.branches branch
    on branch.id = subscription.branch_id
   and branch.organization_id = subscription.organization_id
  join public.restaurants restaurant
    on restaurant.id = branch.restaurant_id
   and restaurant.organization_id = branch.organization_id
   and restaurant.primary_branch_id = branch.id
  where subscription.id = new.subscription_id;

  release_value := public.resolve_commercial_plan_release_internal(
    restaurant_id_value, 'PRO'
  );
  if coalesce((release_value->>'released')::boolean, false) is not true then
    raise exception 'PRO_COMMERCIAL_RELEASE_LOCKED' using errcode = '42501';
  end if;
  return new;
end;
$function$;

revoke execute on function public.guard_pro_override_elevation()
from public, anon, authenticated, service_role;
drop trigger if exists branch_entitlement_overrides_commercial_release_guard
on public.branch_entitlement_overrides;
create trigger branch_entitlement_overrides_commercial_release_guard
before insert or update on public.branch_entitlement_overrides
for each row execute function public.guard_pro_override_elevation();

create or replace function public.set_platform_restaurant_plan_override(
  input_restaurant_id uuid, input_plan_key text, input_expires_at timestamptz,
  input_reason text, input_confirmation text, input_idempotency_key uuid,
  input_starts_at timestamptz
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  actor_id_value uuid := auth.uid();
  role_value text := public.current_platform_role();
  restaurant_record public.restaurants%rowtype;
  subscription_record public.branch_subscriptions%rowtype;
  operation_record public.platform_admin_operations%rowtype;
  release_value jsonb;
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

  select * into restaurant_record from public.restaurants
    where id = input_restaurant_id for update;
  if restaurant_record.id is null or restaurant_record.primary_branch_id is null then
    raise exception 'TENANT_OR_PRIMARY_BRANCH_MISSING';
  end if;
  select * into subscription_record from public.branch_subscriptions
    where branch_id = restaurant_record.primary_branch_id for update;
  if subscription_record.id is null then raise exception 'SUBSCRIPTION_MISSING'; end if;

  -- The commercial lock is checked before idempotent replay. No historical
  -- success receipt may be used to report or recreate an effective PRO grant.
  release_value := public.resolve_commercial_plan_release_internal(
    input_restaurant_id, 'PRO'
  );
  if coalesce((release_value->>'released')::boolean, false) is not true then
    raise exception 'PRO_COMMERCIAL_RELEASE_LOCKED' using errcode = '42501';
  end if;

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

revoke execute on function public.set_platform_restaurant_plan_override(
  uuid, text, timestamptz, text, text, uuid, timestamptz
) from public, anon;
grant execute on function public.set_platform_restaurant_plan_override(
  uuid, text, timestamptz, text, text, uuid, timestamptz
) to authenticated;

create or replace function public.get_platform_commercial_pro_status(input_country text default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
stable
as $function$
declare
  code_value text := upper(trim(input_country));
begin
  if auth.uid() is null or public.current_platform_role() is null then
    raise exception 'COMMERCIAL_PRO_CONTROL_NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if code_value is not null and code_value !~ '^[A-Z]{2}$' then
    raise exception 'COMMERCIAL_PRO_COUNTRY_INVALID' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'policies', coalesce((select jsonb_agg(to_jsonb(policy_row) order by country_code)
      from public.commercial_plan_release_policy policy_row
      where code_value is null or country_code = code_value), '[]'::jsonb),
    'active_access', coalesce((select jsonb_agg(jsonb_build_object(
      'id', grant_row.id, 'restaurant_id', grant_row.restaurant_id,
      'organization_id', grant_row.organization_id, 'access_kind', grant_row.access_kind,
      'starts_at', grant_row.starts_at, 'expires_at', grant_row.expires_at,
      'revoked_at', grant_row.revoked_at
    ) order by grant_row.expires_at)
      from public.commercial_pro_access_grants grant_row
      join public.restaurants restaurant on restaurant.id = grant_row.restaurant_id
      join public.branches branch on branch.id = restaurant.primary_branch_id
        and branch.restaurant_id = restaurant.id
        and branch.organization_id = restaurant.organization_id
      where (code_value is null or upper(trim(branch.country)) = code_value)
        and grant_row.revoked_at is null
        and grant_row.expires_at > statement_timestamp()), '[]'::jsonb)
  );
end;
$function$;

revoke execute on function public.get_platform_commercial_pro_status(text)
from public, anon;
grant execute on function public.get_platform_commercial_pro_status(text)
to authenticated;

create or replace function public.set_platform_commercial_pro_country_release(
  input_country text,
  input_release boolean,
  input_reason text,
  input_confirmation text,
  input_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  actor_id_value uuid := auth.uid();
  actor_role_value text := public.current_platform_role();
  code_value text := upper(trim(input_country));
  desired_state text := case when input_release then 'RELEASED' else 'LOCKED' end;
  expected_confirmation text;
  prior_record public.commercial_plan_release_policy%rowtype;
  result_value jsonb;
  receipt_record public.commercial_pro_access_audit%rowtype;
  action_value text := case when input_release then 'COUNTRY_PRO_RELEASED' else 'COUNTRY_PRO_LOCKED' end;
begin
  if actor_id_value is null
    or coalesce(actor_role_value in ('platform_owner', 'platform_admin'), false) is not true then
    raise exception 'COMMERCIAL_PRO_CONTROL_NOT_AUTHORIZED' using errcode = '42501';
  end if;
  perform public.require_recent_platform_auth_internal();
  expected_confirmation := 'PRO ' || code_value || case
    when input_release then ' FREIGEBEN' else ' SPERREN' end;
  if code_value is null or code_value !~ '^[A-Z]{2}$'
    or input_release is null or input_request_id is null
    or length(trim(coalesce(input_reason, ''))) < 10
    or input_confirmation is distinct from expected_confirmation then
    raise exception 'COMMERCIAL_PRO_CONFIRMATION_REQUIRED' using errcode = '22023';
  end if;
  if not exists (select 1 from public.country_launch_policy where country_code = code_value) then
    raise exception 'COMMERCIAL_PRO_COUNTRY_UNKNOWN' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'commercial-pro-country:' || code_value, 0
  ));
  select * into receipt_record from public.commercial_pro_access_audit
  where request_id = input_request_id;
  if receipt_record.id is not null then
    if receipt_record.actor_id is distinct from actor_id_value
      or receipt_record.action_type is distinct from action_value
      or receipt_record.country_code is distinct from code_value
      or receipt_record.reason is distinct from trim(input_reason) then
      raise exception 'COMMERCIAL_PRO_REQUEST_CONFLICT' using errcode = '22023';
    end if;
    return receipt_record.after_state || jsonb_build_object('idempotent', true);
  end if;

  insert into public.commercial_plan_release_policy(
    country_code, plan_key, release_state, revision
  ) values (code_value, 'PRO', 'LOCKED', 1)
  on conflict (country_code, plan_key) do nothing;
  select * into prior_record from public.commercial_plan_release_policy
  where country_code = code_value and plan_key = 'PRO' for update;
  if prior_record.release_state = desired_state then
    raise exception 'COMMERCIAL_PRO_STATE_UNCHANGED' using errcode = '22023';
  end if;

  update public.commercial_plan_release_policy set
    release_state = desired_state,
    revision = revision + 1,
    founder_decision_ref = case when input_release
      then 'PLATFORM_ADMIN:' || input_request_id::text else null end,
    released_at = case when input_release then clock_timestamp() else null end,
    updated_at = clock_timestamp()
  where country_code = code_value and plan_key = 'PRO'
  returning to_jsonb(commercial_plan_release_policy.*) into result_value;

  insert into public.commercial_pro_access_audit(
    actor_id, actor_role, action_type, country_code, request_id, reason,
    before_state, after_state
  ) values (
    actor_id_value, actor_role_value, action_value, code_value,
    input_request_id, trim(input_reason), to_jsonb(prior_record), result_value
  );
  return result_value || jsonb_build_object('idempotent', false);
end;
$function$;

revoke execute on function public.set_platform_commercial_pro_country_release(
  text, boolean, text, text, uuid
) from public, anon;
grant execute on function public.set_platform_commercial_pro_country_release(
  text, boolean, text, text, uuid
) to authenticated;

create or replace function public.set_platform_commercial_pro_access(
  input_restaurant_id uuid,
  input_access_kind text,
  input_action text,
  input_starts_at timestamptz,
  input_expires_at timestamptz,
  input_reason text,
  input_confirmation text,
  input_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  actor_id_value uuid := auth.uid();
  actor_role_value text := public.current_platform_role();
  kind_value text := upper(trim(input_access_kind));
  action_value text := upper(trim(input_action));
  audit_action_value text;
  restaurant_record public.restaurants%rowtype;
  country_value text;
  grant_record public.commercial_pro_access_grants%rowtype;
  receipt_record public.commercial_pro_access_audit%rowtype;
  release_value jsonb;
  expected_confirmation text;
  before_value jsonb;
  after_value jsonb;
begin
  if actor_id_value is null
    or coalesce(actor_role_value in ('platform_owner', 'platform_admin'), false) is not true then
    raise exception 'COMMERCIAL_PRO_ACCESS_NOT_AUTHORIZED' using errcode = '42501';
  end if;
  perform public.require_recent_platform_auth_internal();
  if input_restaurant_id is null or input_request_id is null
    or kind_value not in ('REAL_BUSINESS_PILOT', 'INTERNAL_TEST_ONLY')
    or action_value not in ('GRANT', 'EXTEND', 'REVOKE')
    or length(trim(coalesce(input_reason, ''))) < 10 then
    raise exception 'COMMERCIAL_PRO_ACCESS_REQUEST_INVALID' using errcode = '22023';
  end if;

  select * into restaurant_record from public.restaurants
  where id = input_restaurant_id for update;
  if restaurant_record.id is not null then
    select upper(trim(branch.country)) into country_value
    from public.branches branch
    where branch.id = restaurant_record.primary_branch_id
      and branch.restaurant_id = restaurant_record.id
      and branch.organization_id = restaurant_record.organization_id;
  end if;
  if restaurant_record.id is null or country_value !~ '^[A-Z]{2}$' then
    raise exception 'COMMERCIAL_PRO_TENANT_COUNTRY_INVALID' using errcode = '22023';
  end if;

  expected_confirmation := 'PRO ' || case
    when kind_value = 'REAL_BUSINESS_PILOT' then 'PILOT '
    else 'TEST_ONLY ' end || restaurant_record.name || case action_value
    when 'GRANT' then ' FREIGEBEN'
    when 'EXTEND' then ' VERLAENGERN'
    else ' WIDERRUFEN' end;
  if input_confirmation is distinct from expected_confirmation then
    raise exception 'COMMERCIAL_PRO_ACCESS_CONFIRMATION_REQUIRED' using errcode = '22023';
  end if;

  if kind_value = 'REAL_BUSINESS_PILOT' and action_value <> 'REVOKE' then
    release_value := public.resolve_commercial_plan_release_internal(input_restaurant_id, 'PRO');
    if coalesce((release_value->>'released')::boolean, false) is not true then
      raise exception 'REAL_BUSINESS_PILOT_COUNTRY_LOCKED' using errcode = '42501';
    end if;
    if exists (select 1 from public.platform_test_tenant_registry marker
      where marker.restaurant_id = restaurant_record.id and marker.deleted_at is null) then
      raise exception 'REAL_BUSINESS_PILOT_TEST_ONLY_CONFLICT' using errcode = '42501';
    end if;
  elsif kind_value = 'INTERNAL_TEST_ONLY' and action_value <> 'REVOKE' then
    if not exists (
      select 1 from public.platform_test_tenant_registry marker
      where marker.restaurant_id = restaurant_record.id
        and marker.organization_id = restaurant_record.organization_id
        and marker.restaurant_name = restaurant_record.name
        and marker.owner_user_id = restaurant_record.owner_id
        and marker.deleted_at is null
    ) then
      raise exception 'TEST_ONLY_MARKER_REQUIRED' using errcode = '42501';
    end if;
  end if;

  audit_action_value := case action_value
    when 'GRANT' then 'PRO_ACCESS_GRANTED'
    when 'EXTEND' then 'PRO_ACCESS_EXTENDED'
    else 'PRO_ACCESS_REVOKED' end;

  perform pg_advisory_xact_lock(hashtextextended(
    'commercial-pro-access:' || input_restaurant_id::text || ':' || kind_value, 0
  ));
  select * into receipt_record from public.commercial_pro_access_audit
  where request_id = input_request_id;
  if receipt_record.id is not null then
    if receipt_record.actor_id is distinct from actor_id_value
      or receipt_record.action_type is distinct from audit_action_value
      or receipt_record.restaurant_id is distinct from input_restaurant_id
      or receipt_record.after_state->>'access_kind' is distinct from kind_value
      or receipt_record.reason is distinct from trim(input_reason)
      or (action_value = 'GRANT' and (
        (receipt_record.after_state->>'starts_at')::timestamptz is distinct from input_starts_at
        or (receipt_record.after_state->>'expires_at')::timestamptz is distinct from input_expires_at
      ))
      or (action_value = 'EXTEND'
        and (receipt_record.after_state->>'expires_at')::timestamptz is distinct from input_expires_at) then
      raise exception 'COMMERCIAL_PRO_REQUEST_CONFLICT' using errcode = '22023';
    end if;
    return receipt_record.after_state || jsonb_build_object('idempotent', true);
  end if;

  select * into grant_record from public.commercial_pro_access_grants
  where restaurant_id = input_restaurant_id and organization_id = restaurant_record.organization_id
    and access_kind = kind_value and revoked_at is null
    and expires_at > statement_timestamp()
  order by expires_at desc, id limit 1 for update;
  before_value := case when grant_record.id is null then null else to_jsonb(grant_record) end;

  if action_value = 'GRANT' then
    if grant_record.id is not null then
      raise exception 'COMMERCIAL_PRO_ACCESS_ALREADY_ACTIVE' using errcode = '22023';
    end if;
    if input_starts_at is null or input_expires_at is null
      or not isfinite(input_starts_at) or not isfinite(input_expires_at)
      or input_expires_at <= input_starts_at
      or input_expires_at <= statement_timestamp() then
      raise exception 'COMMERCIAL_PRO_ACCESS_WINDOW_INVALID' using errcode = '22023';
    end if;
    insert into public.commercial_pro_access_grants(
      restaurant_id, organization_id, access_kind, starts_at, expires_at,
      reason, created_by, request_id
    ) values (
      restaurant_record.id, restaurant_record.organization_id, kind_value,
      input_starts_at, input_expires_at, trim(input_reason), actor_id_value, input_request_id
    ) returning * into grant_record;
  elsif action_value = 'EXTEND' then
    if grant_record.id is null or input_expires_at is null
      or not isfinite(input_expires_at) or input_expires_at <= grant_record.expires_at then
      raise exception 'COMMERCIAL_PRO_ACCESS_EXTENSION_INVALID' using errcode = '22023';
    end if;
    update public.commercial_pro_access_grants set
      expires_at = input_expires_at
    where id = grant_record.id returning * into grant_record;
  else
    if grant_record.id is null then
      raise exception 'COMMERCIAL_PRO_ACCESS_NOT_ACTIVE' using errcode = '22023';
    end if;
    update public.commercial_pro_access_grants set
      revoked_by = actor_id_value,
      revoked_at = clock_timestamp(),
      revoke_reason = trim(input_reason)
    where id = grant_record.id returning * into grant_record;
  end if;

  after_value := to_jsonb(grant_record);
  insert into public.commercial_pro_access_audit(
    actor_id, actor_role, action_type, country_code, restaurant_id,
    organization_id, access_grant_id, request_id, reason, before_state, after_state
  ) values (
    actor_id_value, actor_role_value, audit_action_value, country_value,
    restaurant_record.id, restaurant_record.organization_id, grant_record.id,
    input_request_id, trim(input_reason), before_value, after_value
  );
  return after_value || jsonb_build_object('idempotent', false);
end;
$function$;

revoke execute on function public.set_platform_commercial_pro_access(
  uuid, text, text, timestamptz, timestamptz, text, text, uuid
) from public, anon;
grant execute on function public.set_platform_commercial_pro_access(
  uuid, text, text, timestamptz, timestamptz, text, text, uuid
) to authenticated;

notify pgrst, 'reload schema';
commit;
