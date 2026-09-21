-- Phase 7C.4: transactional customer-capacity enforcement.
-- Registration, login and membership remain allowed. Only the first
-- qualifying activity of a not-yet-active customer identity consumes a slot.

create or replace function public.list_restaurant_active_customer_capacity_keys_internal(
  input_restaurant_id uuid,
  input_at timestamptz,
  input_excluded_points_id uuid default null,
  input_excluded_redemption_id uuid default null,
  input_identity_key text default null
)
returns table(identity_key text)
language sql
security definer
set search_path = pg_catalog, public, pg_temp
stable
as $function$
  with qualifying_customers as (
    select points.customer_id
    from public.points_transactions points
    join public.customers customer
      on customer.id = points.customer_id
     and customer.restaurant_id = input_restaurant_id
     and customer.is_test_customer = false
    where points.restaurant_id = input_restaurant_id
      and points.id is distinct from input_excluded_points_id
      and points.type = 'earn'
      and points.points > 0
      and points.reversal_of is null
      and points.collection_source in ('restaurant_controlled', 'customer_initiated')
      and points.created_at >= input_at - interval '365 days'
      and points.created_at < input_at
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
      and journal.id is distinct from input_excluded_redemption_id
      and journal.status = 'ACTIVE'
      and journal.cancelled_at is null
      and journal.is_test_event = false
      and journal.redeemed_at >= input_at - interval '365 days'
      and journal.redeemed_at < input_at
  ), customer_account_keys as (
    select distinct coalesce(membership.account_id::text, qualifying.customer_id::text) as identity_key
    from qualifying_customers qualifying
    left join public.customer_account_memberships membership
      on membership.restaurant_id = input_restaurant_id
     and membership.customer_id = qualifying.customer_id
  )
  select account_key.identity_key
  from customer_account_keys account_key
  where input_identity_key is null or account_key.identity_key = input_identity_key;
$function$;

revoke execute on function public.list_restaurant_active_customer_capacity_keys_internal(
  uuid, timestamptz, uuid, uuid, text
) from public, anon, authenticated, service_role;

comment on function public.list_restaurant_active_customer_capacity_keys_internal(
  uuid, timestamptz, uuid, uuid, text
) is
  'Canonical privacy-minimal active-customer identity set for one restaurant and the half-open [as_of - 365 days, as_of) window.';

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

  offer_limit_value := plan_record.base_offer_limit + offer_addon_units * 5::bigint;
  customer_limit_value := plan_record.base_customer_limit + customer_addon_units * 5000::bigint;

  select count(*)::bigint into offer_usage_value
  from public.restaurant_offers offer
  where offer.restaurant_id = input_restaurant_id
    and offer.status = 'PUBLISHED'
    and offer.is_active = true
    and offer.valid_to > at_value;

  select count(*)::bigint into customer_usage_value
  from public.list_restaurant_active_customer_capacity_keys_internal(
    input_restaurant_id,
    at_value
  );

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

create or replace function public.enforce_customer_capacity_activity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  at_value timestamptz := clock_timestamp();
  activity_kind_value text;
  qualifies_value boolean := false;
  old_qualifies_value boolean := false;
  customer_record public.customers%rowtype;
  identity_key_value text;
  excluded_points_id uuid;
  excluded_redemption_id uuid;
  is_active_now boolean := false;
  was_active_before boolean := false;
  capacity_snapshot jsonb;
  capacity_usage bigint;
  capacity_limit bigint;
begin
  if tg_table_name = 'points_transactions' then
    activity_kind_value := 'POINTS_EARN';
    qualifies_value := new.type = 'earn'
      and new.points > 0
      and new.reversal_of is null
      and new.collection_source in ('restaurant_controlled', 'customer_initiated');
    if tg_op = 'UPDATE' then
      old_qualifies_value := old.type = 'earn'
        and old.points > 0
        and old.reversal_of is null
        and old.collection_source in ('restaurant_controlled', 'customer_initiated')
        and old.restaurant_id = new.restaurant_id
        and old.customer_id = new.customer_id
        and old.created_at >= at_value - interval '365 days'
        and old.created_at < at_value
        and not exists (
          select 1
          from public.points_transactions reversal
          where reversal.reversal_of = old.id
        );
    end if;
    excluded_points_id := new.id;
  elsif tg_table_name = 'redemption_activity_journal' then
    activity_kind_value := 'REDEMPTION';
    qualifies_value := new.customer_id is not null
      and new.status = 'ACTIVE'
      and new.cancelled_at is null
      and new.is_test_event = false;
    if tg_op = 'UPDATE' then
      old_qualifies_value := old.customer_id is not null
        and old.status = 'ACTIVE'
        and old.cancelled_at is null
        and old.is_test_event = false
        and old.restaurant_id = new.restaurant_id
        and old.customer_id = new.customer_id
        and old.redeemed_at >= at_value - interval '365 days'
        and old.redeemed_at < at_value;
    end if;
    excluded_redemption_id := new.id;
  else
    raise exception using errcode = '55000', message = 'CUSTOMER_CAPACITY_TRIGGER_TARGET_INVALID';
  end if;

  if not qualifies_value or old_qualifies_value then
    return new;
  end if;

  select customer.* into customer_record
  from public.customers customer
  where customer.id = new.customer_id
    and customer.restaurant_id = new.restaurant_id;

  if customer_record.id is null or customer_record.is_test_customer then
    return new;
  end if;

  select coalesce(membership.account_id::text, customer_record.id::text)
  into identity_key_value
  from (select 1) singleton
  left join public.customer_account_memberships membership
    on membership.restaurant_id = customer_record.restaurant_id
   and membership.customer_id = customer_record.id;

  perform pg_advisory_xact_lock(hashtextextended(
    'customer-capacity:' || customer_record.restaurant_id::text,
    0
  ));

  select exists (
    select 1
    from public.list_restaurant_active_customer_capacity_keys_internal(
      customer_record.restaurant_id,
      at_value,
      null,
      null,
      identity_key_value
    )
  ) into is_active_now;

  if not is_active_now then
    return new;
  end if;

  select exists (
    select 1
    from public.list_restaurant_active_customer_capacity_keys_internal(
      customer_record.restaurant_id,
      at_value,
      excluded_points_id,
      excluded_redemption_id,
      identity_key_value
    )
  ) into was_active_before;

  if was_active_before then
    return new;
  end if;

  capacity_snapshot := public.resolve_restaurant_capacity_internal(
    customer_record.restaurant_id,
    at_value
  );
  capacity_usage := (capacity_snapshot #>> '{active_customers,usage}')::bigint;
  capacity_limit := (capacity_snapshot #>> '{active_customers,effective_limit}')::bigint;

  if capacity_usage is null or capacity_limit is null then
    raise exception using errcode = 'P0001', message = 'CUSTOMER_CAPACITY_UNAVAILABLE';
  end if;

  if capacity_usage > capacity_limit then
    raise exception using
      errcode = 'P0001',
      message = 'CUSTOMER_CAPACITY_REACHED',
      detail = jsonb_build_object(
        'metric', 'ACTIVE_CUSTOMERS',
        'activity_kind', activity_kind_value,
        'usage', capacity_usage - 1,
        'effective_limit', capacity_limit,
        'remaining', 0,
        'plan_key', capacity_snapshot #>> '{plan,plan_key}',
        'addon_units', (capacity_snapshot #>> '{active_customers,addon_units}')::bigint,
        'over_limit', (capacity_usage - 1) > capacity_limit
      )::text;
  end if;

  return new;
end;
$function$;

revoke execute on function public.enforce_customer_capacity_activity()
from public, anon, authenticated, service_role;

drop trigger if exists enforce_customer_capacity_points_activity
on public.points_transactions;
create trigger enforce_customer_capacity_points_activity
after insert or update of restaurant_id, customer_id, type, points,
  reversal_of, collection_source, created_at
on public.points_transactions
for each row execute function public.enforce_customer_capacity_activity();

drop trigger if exists enforce_customer_capacity_redemption_activity
on public.redemption_activity_journal;
create trigger enforce_customer_capacity_redemption_activity
after insert or update of restaurant_id, customer_id, status,
  cancelled_at, is_test_event, redeemed_at
on public.redemption_activity_journal
for each row execute function public.enforce_customer_capacity_activity();

create or replace function public.get_restaurant_capacity(input_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
stable
as $function$
declare
  capacity_snapshot jsonb;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if not public.is_restaurant_admin(input_restaurant_id)
     and not public.is_platform_admin() then
    raise exception 'CAPACITY_READ_FORBIDDEN' using errcode = '42501';
  end if;

  capacity_snapshot := public.resolve_restaurant_capacity_internal(
    input_restaurant_id,
    statement_timestamp()
  );
  capacity_snapshot := jsonb_set(
    capacity_snapshot,
    '{write_enforcement_active}',
    'true'::jsonb,
    true
  );
  return jsonb_set(
    capacity_snapshot,
    '{write_enforcement}',
    jsonb_build_object('offers', true, 'active_customers', true),
    true
  );
end;
$function$;

revoke execute on function public.get_restaurant_capacity(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.get_restaurant_capacity(uuid) to authenticated;

comment on function public.get_restaurant_capacity(uuid) is
  'Authorized privacy-minimal capacity snapshot. Offer and active-customer write enforcement are active from Phase 7C.4.';

notify pgrst, 'reload schema';
