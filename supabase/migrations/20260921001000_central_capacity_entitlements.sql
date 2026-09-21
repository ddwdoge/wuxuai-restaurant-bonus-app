-- Phase 7C.2: versioned BASIC/PRO capacity contract and read-only resolver.
-- This migration deliberately does not enforce capacity in productive writes,
-- change historical commercial rows, configure Stripe, or unlock a country.

create table if not exists public.commercial_capacity_plan_versions (
  id uuid primary key default extensions.gen_random_uuid(),
  plan_key text not null check (plan_key in ('BASIC', 'PRO')),
  version integer not null check (version > 0),
  monthly_price_minor bigint not null check (monthly_price_minor > 0),
  currency text not null check (currency = 'EUR'),
  tax_treatment text not null check (tax_treatment = 'EX_VAT'),
  base_offer_limit bigint not null check (base_offer_limit > 0),
  base_customer_limit bigint not null check (base_customer_limit > 0),
  effective_from timestamptz not null,
  effective_until timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  unique (plan_key, version),
  check (isfinite(effective_from)),
  check (effective_until is null or (isfinite(effective_until) and effective_until > effective_from))
);

create table if not exists public.commercial_capacity_addon_versions (
  id uuid primary key default extensions.gen_random_uuid(),
  addon_key text not null check (addon_key in ('OFFER_CAPACITY', 'CUSTOMER_CAPACITY')),
  metric_key text not null check (metric_key in ('OFFERS', 'ACTIVE_CUSTOMERS')),
  version integer not null check (version > 0),
  capacity_per_unit bigint not null check (capacity_per_unit > 0),
  monthly_price_minor bigint not null check (monthly_price_minor > 0),
  currency text not null check (currency = 'EUR'),
  tax_treatment text not null check (tax_treatment = 'EX_VAT'),
  effective_from timestamptz not null,
  effective_until timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  unique (addon_key, version),
  check (isfinite(effective_from)),
  check (effective_until is null or (isfinite(effective_until) and effective_until > effective_from)),
  check (
    (addon_key = 'OFFER_CAPACITY' and metric_key = 'OFFERS' and capacity_per_unit = 5)
    or
    (addon_key = 'CUSTOMER_CAPACITY' and metric_key = 'ACTIVE_CUSTOMERS' and capacity_per_unit = 5000)
  )
);

-- Rows are append-only revisions. The highest revision of one entitlement_key
-- is authoritative, preserving lifecycle history and out-of-order evidence.
create table if not exists public.restaurant_capacity_addon_entitlements (
  id uuid primary key default extensions.gen_random_uuid(),
  entitlement_key uuid not null,
  revision bigint not null check (revision > 0),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  addon_key text not null check (addon_key in ('OFFER_CAPACITY', 'CUSTOMER_CAPACITY')),
  addon_version integer not null,
  units bigint not null check (units between 1 and 1000000),
  status text not null check (status in ('ACTIVE', 'CANCELLED', 'PAST_DUE', 'EXPIRED', 'CHARGEBACK', 'REVOKED')),
  effective_from timestamptz not null,
  effective_until timestamptz,
  past_due_started_at timestamptz,
  source text not null check (source in ('BILLING', 'MANUAL_MIGRATION', 'TEST_FIXTURE')),
  external_reference text,
  request_id uuid not null,
  reason text not null check (length(trim(reason)) >= 10),
  created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  unique (restaurant_id, entitlement_key, revision),
  unique (request_id),
  foreign key (addon_key, addon_version)
    references public.commercial_capacity_addon_versions(addon_key, version),
  check (isfinite(effective_from)),
  check (effective_until is null or (isfinite(effective_until) and effective_until > effective_from)),
  check ((status = 'PAST_DUE') = (past_due_started_at is not null)),
  check (past_due_started_at is null or isfinite(past_due_started_at)),
  check (external_reference is null or length(trim(external_reference)) between 1 and 200)
);

insert into public.commercial_capacity_plan_versions (
  plan_key, version, monthly_price_minor, currency, tax_treatment,
  base_offer_limit, base_customer_limit, effective_from
) values
  ('BASIC', 1, 5900, 'EUR', 'EX_VAT', 5, 3000, '2026-09-01 00:00:00+00'),
  ('PRO', 1, 14900, 'EUR', 'EX_VAT', 15, 15000, '2026-09-01 00:00:00+00')
on conflict (plan_key, version) do nothing;

insert into public.commercial_capacity_addon_versions (
  addon_key, metric_key, version, capacity_per_unit, monthly_price_minor,
  currency, tax_treatment, effective_from
) values
  ('OFFER_CAPACITY', 'OFFERS', 1, 5, 1900, 'EUR', 'EX_VAT', '2026-09-01 00:00:00+00'),
  ('CUSTOMER_CAPACITY', 'ACTIVE_CUSTOMERS', 1, 5000, 2900, 'EUR', 'EX_VAT', '2026-09-01 00:00:00+00')
on conflict (addon_key, version) do nothing;

create index if not exists commercial_capacity_plan_effective_idx
  on public.commercial_capacity_plan_versions (plan_key, effective_from desc);
create index if not exists commercial_capacity_addon_effective_idx
  on public.commercial_capacity_addon_versions (addon_key, effective_from desc);
create index if not exists restaurant_capacity_addon_latest_idx
  on public.restaurant_capacity_addon_entitlements (restaurant_id, entitlement_key, revision desc);
create index if not exists points_transactions_capacity_activity_idx
  on public.points_transactions (restaurant_id, customer_id, created_at desc)
  where type = 'earn' and points > 0 and reversal_of is null
    and collection_source in ('restaurant_controlled', 'customer_initiated');
create index if not exists redemption_activity_capacity_idx
  on public.redemption_activity_journal (restaurant_id, customer_id, redeemed_at desc)
  where status = 'ACTIVE' and cancelled_at is null and customer_id is not null and is_test_event = false;

alter table public.commercial_capacity_plan_versions enable row level security;
alter table public.commercial_capacity_addon_versions enable row level security;
alter table public.restaurant_capacity_addon_entitlements enable row level security;

revoke all on table public.commercial_capacity_plan_versions from public, anon, authenticated;
revoke all on table public.commercial_capacity_addon_versions from public, anon, authenticated;
revoke all on table public.restaurant_capacity_addon_entitlements from public, anon, authenticated;

create or replace function public.block_capacity_contract_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  raise exception 'CAPACITY_CONTRACT_ROWS_ARE_APPEND_ONLY' using errcode = '55000';
end;
$function$;

revoke execute on function public.block_capacity_contract_mutation()
from public, anon, authenticated, service_role;

drop trigger if exists commercial_capacity_plan_versions_immutable
on public.commercial_capacity_plan_versions;
create trigger commercial_capacity_plan_versions_immutable
before update or delete on public.commercial_capacity_plan_versions
for each row execute function public.block_capacity_contract_mutation();

drop trigger if exists commercial_capacity_addon_versions_immutable
on public.commercial_capacity_addon_versions;
create trigger commercial_capacity_addon_versions_immutable
before update or delete on public.commercial_capacity_addon_versions
for each row execute function public.block_capacity_contract_mutation();

drop trigger if exists restaurant_capacity_addon_entitlements_immutable
on public.restaurant_capacity_addon_entitlements;
create trigger restaurant_capacity_addon_entitlements_immutable
before update or delete on public.restaurant_capacity_addon_entitlements
for each row execute function public.block_capacity_contract_mutation();

create or replace function public.resolve_restaurant_capacity_internal(
  input_restaurant_id uuid,
  input_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
stable
as $function$
declare
  at_value timestamptz := input_at;
  restaurant_record public.restaurants%rowtype;
  entitlement_value jsonb;
  resolved_plan_key text;
  plan_record public.commercial_capacity_plan_versions%rowtype;
  offer_addon_units bigint := 0;
  customer_addon_units bigint := 0;
  offer_limit_value bigint;
  customer_limit_value bigint;
  offer_usage_value bigint := 0;
  customer_usage_value bigint := 0;
  offer_status_value text;
  customer_status_value text;
begin
  if input_restaurant_id is null or at_value is null or not isfinite(at_value) then
    raise exception 'CAPACITY_INPUT_INVALID' using errcode = '22023';
  end if;

  select * into restaurant_record
  from public.restaurants
  where id = input_restaurant_id;
  if restaurant_record.id is null then
    raise exception 'RESTAURANT_NOT_FOUND' using errcode = 'P0002';
  end if;

  entitlement_value := public.resolve_restaurant_entitlements_internal(input_restaurant_id);
  resolved_plan_key := case
    when entitlement_value->>'effective_plan' = 'PRO' then 'PRO'
    else 'BASIC'
  end;

  select * into plan_record
  from public.commercial_capacity_plan_versions plan_version
  where plan_version.plan_key = resolved_plan_key
    and plan_version.effective_from <= at_value
    and (plan_version.effective_until is null or plan_version.effective_until > at_value)
  order by plan_version.effective_from desc, plan_version.version desc
  limit 1;

  if plan_record.id is null and resolved_plan_key <> 'BASIC' then
    resolved_plan_key := 'BASIC';
    select * into plan_record
    from public.commercial_capacity_plan_versions plan_version
    where plan_version.plan_key = 'BASIC'
      and plan_version.effective_from <= at_value
      and (plan_version.effective_until is null or plan_version.effective_until > at_value)
    order by plan_version.effective_from desc, plan_version.version desc
    limit 1;
  end if;
  if plan_record.id is null then
    raise exception 'CAPACITY_PLAN_NOT_CONFIGURED' using errcode = '55000';
  end if;

  with latest_revisions as (
    select distinct on (row.entitlement_key) row.*
    from public.restaurant_capacity_addon_entitlements row
    where row.restaurant_id = input_restaurant_id
    order by row.entitlement_key, row.revision desc, row.created_at desc, row.id desc
  ), active_rows as (
    select row.*
    from latest_revisions row
    where row.organization_id = restaurant_record.organization_id
      and row.branch_id = restaurant_record.primary_branch_id
      and row.effective_from <= at_value
      and (row.effective_until is null or row.effective_until > at_value)
      and (
        row.status = 'ACTIVE'
        or row.status = 'CANCELLED'
        or (
          row.status = 'PAST_DUE'
          and row.past_due_started_at <= at_value
          and row.past_due_started_at + interval '7 days' > at_value
        )
      )
  )
  select
    coalesce(sum(row.units) filter (where row.addon_key = 'OFFER_CAPACITY'), 0),
    coalesce(sum(row.units) filter (where row.addon_key = 'CUSTOMER_CAPACITY'), 0)
  into offer_addon_units, customer_addon_units
  from active_rows row;

  -- bigint arithmetic plus bounded units prevents integer overflow and never
  -- uses NULL or a magic high value as an unlimited entitlement.
  offer_limit_value := plan_record.base_offer_limit + offer_addon_units * 5::bigint;
  customer_limit_value := plan_record.base_customer_limit + customer_addon_units * 5000::bigint;

  select count(*)::bigint into offer_usage_value
  from public.restaurant_offers offer
  where offer.restaurant_id = input_restaurant_id
    and offer.status = 'PUBLISHED'
    and offer.is_active = true
    and offer.valid_to > at_value;

  with qualifying_customers as (
    select points.customer_id
    from public.points_transactions points
    join public.customers customer
      on customer.id = points.customer_id
     and customer.restaurant_id = input_restaurant_id
     and customer.is_test_customer = false
    where points.restaurant_id = input_restaurant_id
      and points.type = 'earn'
      and points.points > 0
      and points.reversal_of is null
      and points.collection_source in ('restaurant_controlled', 'customer_initiated')
      and points.created_at >= at_value - interval '365 days'
      and points.created_at < at_value
      and not exists (
        select 1
        from public.points_transactions reversal
        where reversal.reversal_of = points.id
      )
    union
    select journal.customer_id
    from public.redemption_activity_journal journal
    join public.customers customer
      on customer.id = journal.customer_id
     and customer.restaurant_id = input_restaurant_id
     and customer.is_test_customer = false
    where journal.restaurant_id = input_restaurant_id
      and journal.status = 'ACTIVE'
      and journal.cancelled_at is null
      and journal.is_test_event = false
      and journal.redeemed_at >= at_value - interval '365 days'
      and journal.redeemed_at < at_value
  ), customer_account_keys as (
    select distinct coalesce(membership.account_id::text, qualifying.customer_id::text) as identity_key
    from qualifying_customers qualifying
    left join public.customer_account_memberships membership
      on membership.restaurant_id = input_restaurant_id
     and membership.customer_id = qualifying.customer_id
  )
  select count(*)::bigint into customer_usage_value
  from customer_account_keys;

  offer_status_value := case when offer_usage_value > offer_limit_value then 'OVER_LIMIT' else 'WITHIN_LIMIT' end;
  customer_status_value := case when customer_usage_value > customer_limit_value then 'OVER_LIMIT' else 'WITHIN_LIMIT' end;

  return jsonb_build_object(
    'contract_version', 'restaurant_capacity_v1',
    'as_of', at_value,
    'scope', jsonb_build_object(
      'restaurant_id', restaurant_record.id,
      'organization_id', restaurant_record.organization_id,
      'branch_id', restaurant_record.primary_branch_id
    ),
    'plan', jsonb_build_object(
      'plan_key', resolved_plan_key,
      'version', plan_record.version,
      'monthly_price_minor', plan_record.monthly_price_minor,
      'currency', plan_record.currency,
      'tax_treatment', plan_record.tax_treatment,
      'entitlement_source', entitlement_value->>'entitlement_source',
      'reason_code', entitlement_value->>'reason_code',
      'subscription_status', entitlement_value->>'subscription_status',
      'payment_status', entitlement_value->>'payment_status'
    ),
    'offers', jsonb_build_object(
      'base_limit', plan_record.base_offer_limit,
      'addon_units', offer_addon_units,
      'addon_capacity_per_unit', 5,
      'effective_limit', offer_limit_value,
      'usage', offer_usage_value,
      'remaining', greatest(offer_limit_value - offer_usage_value, 0),
      'status', offer_status_value
    ),
    'active_customers', jsonb_build_object(
      'window_days', 365,
      'window_from', at_value - interval '365 days',
      'window_to_exclusive', at_value,
      'base_limit', plan_record.base_customer_limit,
      'addon_units', customer_addon_units,
      'addon_capacity_per_unit', 5000,
      'effective_limit', customer_limit_value,
      'usage', customer_usage_value,
      'remaining', greatest(customer_limit_value - customer_usage_value, 0),
      'status', customer_status_value
    ),
    'over_limit', jsonb_build_object(
      'offers', offer_status_value = 'OVER_LIMIT',
      'active_customers', customer_status_value = 'OVER_LIMIT',
      'any', offer_status_value = 'OVER_LIMIT' or customer_status_value = 'OVER_LIMIT'
    ),
    'write_enforcement_active', false,
    'unlimited', false
  );
end;
$function$;

revoke execute on function public.resolve_restaurant_capacity_internal(uuid, timestamptz)
from public, anon, authenticated, service_role;

create or replace function public.get_restaurant_capacity(input_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
stable
as $function$
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if not public.is_restaurant_admin(input_restaurant_id)
     and not public.is_platform_admin() then
    raise exception 'CAPACITY_READ_FORBIDDEN' using errcode = '42501';
  end if;
  return public.resolve_restaurant_capacity_internal(
    input_restaurant_id,
    statement_timestamp()
  );
end;
$function$;

revoke execute on function public.get_restaurant_capacity(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.get_restaurant_capacity(uuid) to authenticated;

comment on function public.get_restaurant_capacity(uuid) is
  'Authorized, read-only Phase 7C.2 capacity snapshot. It never grants capacity or mutates product data.';

notify pgrst, 'reload schema';
