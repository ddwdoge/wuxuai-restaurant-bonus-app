-- LOCAL ONLY: minimum synthetic pre-Phase-7B.1 schema.
\set ON_ERROR_STOP on

do $block$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $block$;
alter role service_role bypassrls;

create schema if not exists auth;
create schema if not exists extensions;
grant usage on schema public, auth to anon, authenticated, service_role;

create table auth.users (id uuid primary key);

create or replace function auth.uid() returns uuid
language sql stable
as $function$
  select nullif(current_setting('test.actor', true), '')::uuid
$function$;

create or replace function auth.jwt() returns jsonb
language sql stable
as $function$
  select coalesce(nullif(current_setting('test.jwt', true), '')::jsonb, '{}'::jsonb)
$function$;

create or replace function extensions.gen_random_uuid() returns uuid
language sql volatile
as $function$
  select pg_catalog.gen_random_uuid()
$function$;

create or replace function public.current_platform_role() returns text
language sql stable
as $function$
  select nullif(current_setting('test.platform_role', true), '')
$function$;

create or replace function public.is_platform_admin() returns boolean
language sql stable
as $function$
  select coalesce(public.current_platform_role() in ('platform_owner','platform_admin','billing_admin','support'), false)
$function$;

create table public.commercial_plan_catalog (
  plan_key text primary key,
  monthly_price_eur_ex_vat numeric not null,
  publicly_available boolean not null default false,
  offer_limit integer,
  offer_notifications boolean not null default false,
  reward_notifications boolean not null default false,
  gift_cards boolean not null default false,
  pos_integration boolean not null default false,
  stripe_price_lookup_key text
);
insert into public.commercial_plan_catalog values
  ('BASIC',59,true,5,false,false,false,false,'wuxuai_bonus_basic_monthly'),
  ('PRO',149,false,null,true,true,false,false,'wuxuai_bonus_pro_monthly');

create table public.country_launch_policy (
  country_code text primary key,
  enabled boolean not null default false
);
insert into public.country_launch_policy values
  ('AT',true),('DE',false),('CH',false),('FR',false),('IT',false),('ES',false);

create table public.restaurants (
  id uuid primary key,
  organization_id uuid not null,
  primary_branch_id uuid,
  name text not null default 'Synthetic Restaurant',
  owner_id uuid not null default '70000000-0000-4000-8000-000000000098'
);
create table public.branches (
  id uuid primary key,
  restaurant_id uuid not null,
  organization_id uuid not null,
  country text
);
create table public.branch_subscriptions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_id uuid not null,
  branch_id uuid not null unique,
  status text,
  plan_key text,
  subscription_status text,
  payment_status text,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  current_period_ends_at timestamptz,
  past_due_started_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.branch_entitlement_overrides (
  subscription_id uuid primary key,
  offer_limit integer,
  offer_limit_unlimited boolean,
  offer_notifications boolean,
  reward_notifications boolean,
  effective_from timestamptz,
  expires_at timestamptz,
  reason text,
  changed_by uuid,
  changed_at timestamptz,
  plan_override_key text,
  plan_override_id uuid,
  plan_effective_from timestamptz,
  plan_effective_until timestamptz
);
create table public.restaurant_entitlement_safety_blocks (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  scope_type text not null,
  restaurant_id uuid,
  entitlement_key text not null,
  starts_at timestamptz not null,
  expires_at timestamptz,
  revoked_at timestamptz
);
create table public.platform_admin_operations (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  platform_admin_user_id uuid,
  platform_admin_role text,
  action_type text,
  entity_type text,
  entity_id uuid,
  tenant_id uuid,
  severity text,
  reason text,
  before_state jsonb,
  after_state jsonb,
  result text,
  idempotency_key uuid
);
create table public.platform_test_tenant_registry (
  restaurant_id uuid primary key,
  restaurant_name text not null,
  organization_id uuid not null,
  owner_user_id uuid not null,
  test_session_id text not null,
  marked_by uuid not null,
  marked_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz
);
create table public.restaurant_offers (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  restaurant_id uuid,
  status text,
  is_active boolean,
  valid_to timestamptz
);

alter table public.branch_subscriptions enable row level security;
alter table public.branch_entitlement_overrides enable row level security;
revoke all on public.commercial_plan_catalog, public.branch_subscriptions,
  public.branch_entitlement_overrides, public.platform_admin_operations,
  public.platform_test_tenant_registry
from public, anon, authenticated;
grant select, insert, update, delete on public.branch_subscriptions,
  public.branch_entitlement_overrides to service_role;

create or replace function public.resolve_subscription_plan_lifecycle_internal(
  input_plan_key text,
  input_subscription_status text,
  input_payment_status text,
  input_trial_started_at timestamptz,
  input_trial_ends_at timestamptz,
  input_period_ends_at timestamptz,
  input_past_due_started_at timestamptz,
  input_created_at timestamptz,
  input_at timestamptz
)
returns jsonb language plpgsql stable
as $function$
begin
  if upper(coalesce(input_plan_key,'')) <> 'PRO' then
    return jsonb_build_object('eligible',false,'source','BASIC_FALLBACK','reason_code','BASIC_PLAN','grace_status','NOT_APPLICABLE');
  end if;
  if input_subscription_status = 'trialing' and input_payment_status = 'not_required'
    and input_trial_ends_at > input_at then
    return jsonb_build_object('eligible',true,'source','TRIAL','reason_code','TRIAL_ACTIVE',
      'effective_from',input_trial_started_at,'effective_until',input_trial_ends_at,'grace_status','NOT_APPLICABLE');
  end if;
  if input_subscription_status = 'active' and input_payment_status in ('paid','manual')
    and input_period_ends_at > input_at then
    return jsonb_build_object('eligible',true,'source','PAID_PLAN','reason_code','PAID_PLAN_ACTIVE',
      'effective_from',input_created_at,'effective_until',input_period_ends_at,'grace_status','NOT_APPLICABLE');
  end if;
  return jsonb_build_object('eligible',false,'source','BASIC_FALLBACK','reason_code','SUBSCRIPTION_INVALID','grace_status','NOT_APPLICABLE');
end
$function$;

create or replace function public.resolve_restaurant_entitlements_internal(input_restaurant_id uuid)
returns jsonb language sql stable
as $function$ select jsonb_build_object('plan_key','BASIC') $function$;

create or replace function public.is_restaurant_admin(input_restaurant_id uuid)
returns boolean language sql stable
as $function$
  select nullif(current_setting('test.restaurant_id', true), '')::uuid = input_restaurant_id
$function$;

create or replace function public.get_restaurant_entitlements(input_restaurant_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp stable
as $function$
begin
  if auth.uid() is null or not (
    public.is_restaurant_admin(input_restaurant_id) or public.is_platform_admin()
  ) then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
  return public.resolve_restaurant_entitlements_internal(input_restaurant_id);
end
$function$;
revoke execute on function public.get_restaurant_entitlements(uuid) from public, anon;
grant execute on function public.get_restaurant_entitlements(uuid) to authenticated;

create or replace function public.test_assert(input_ok boolean, input_label text)
returns void language plpgsql as $function$
begin
  if input_ok is distinct from true then raise exception 'ASSERT_FAIL: %', input_label; end if;
  raise notice 'PASS: %', input_label;
end
$function$;

create or replace function public.test_block(input_sql text, input_state text, input_label text)
returns void language plpgsql as $function$
begin
  begin
    execute input_sql;
  exception when others then
    if sqlstate = input_state then
      raise notice 'PASS: %', input_label;
      return;
    end if;
    raise exception 'ASSERT_FAIL: % expected %, got % (%)', input_label, input_state, sqlstate, sqlerrm;
  end;
  raise exception 'ASSERT_FAIL: % was not blocked', input_label;
end
$function$;
