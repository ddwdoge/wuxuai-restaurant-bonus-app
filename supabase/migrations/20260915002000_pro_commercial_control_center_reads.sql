-- Phase 7B.3A: additive, read-only Platform Admin PRO control-center contract.
-- This migration does not change release policy, grants, subscriptions or audit history.
begin;

create or replace function public.platform_pro_control_center_reader_internal()
returns boolean
language sql
security definer
set search_path = pg_catalog, public, pg_temp
stable
as $function$
  select auth.uid() is not null
    and coalesce(public.current_platform_role() in ('platform_owner', 'platform_admin'), false)
$function$;

revoke all on function public.platform_pro_control_center_reader_internal()
from public, anon, authenticated, service_role;

create or replace function public.get_platform_pro_country_status(
  input_country text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
stable
as $function$
declare
  code_value text := nullif(upper(trim(input_country)), '');
  result_value jsonb;
begin
  if not public.platform_pro_control_center_reader_internal() then
    raise exception 'PRO_CONTROL_CENTER_NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if code_value is not null and code_value !~ '^[A-Z]{2}$' then
    raise exception 'PRO_CONTROL_CENTER_COUNTRY_INVALID' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(to_jsonb(country_rows) order by country_rows.country_code), '[]'::jsonb)
  into result_value
  from (
    select policy.country_code,
      policy.plan_key,
      policy.release_state,
      policy.released_at as effective_from,
      coalesce(last_change.created_at, policy.updated_at) as last_changed_at,
      last_change.actor_id as last_actor_id,
      last_change.actor_role as last_actor_role,
      last_change.reason as last_reason,
      public.country_launch_readiness_snapshot(policy.country_code) as readiness,
      coalesce(entitlement_counts.paid_count, 0) as active_paid_count,
      coalesce(entitlement_counts.trial_count, 0) as active_trial_count,
      coalesce(grant_counts.pilot_count, 0) as active_pilot_count,
      coalesce(grant_counts.test_only_count, 0) as active_test_only_count,
      coalesce(entitlement_counts.paid_count, 0)
        + coalesce(entitlement_counts.trial_count, 0)
        + coalesce(grant_counts.pilot_count, 0)
        + coalesce(grant_counts.test_only_count, 0) as active_entitlement_count
    from public.commercial_plan_release_policy policy
    left join lateral (
      select audit.actor_id, audit.actor_role, audit.reason, audit.created_at
      from public.commercial_pro_access_audit audit
      where audit.country_code = policy.country_code
        and audit.action_type in ('COUNTRY_PRO_RELEASED', 'COUNTRY_PRO_LOCKED')
      order by audit.created_at desc, audit.id desc
      limit 1
    ) last_change on true
    left join lateral (
      select
        count(*) filter (where lifecycle.value->>'source' = 'PAID_PLAN')::integer as paid_count,
        count(*) filter (where lifecycle.value->>'source' = 'TRIAL')::integer as trial_count
      from public.restaurants restaurant
      join public.branches branch on branch.id = restaurant.primary_branch_id
        and branch.restaurant_id = restaurant.id
        and branch.organization_id = restaurant.organization_id
      join public.branch_subscriptions subscription on subscription.branch_id = branch.id
        and subscription.organization_id = restaurant.organization_id
      cross join lateral (select public.resolve_subscription_plan_lifecycle_internal(
        subscription.plan_key, subscription.subscription_status, subscription.payment_status,
        subscription.trial_started_at, subscription.trial_ends_at,
        coalesce(subscription.current_period_end, subscription.current_period_ends_at),
        subscription.past_due_started_at, subscription.created_at, statement_timestamp()
      ) as value) lifecycle
      where upper(trim(branch.country)) = policy.country_code
        and coalesce((lifecycle.value->>'eligible')::boolean, false)
        and coalesce(subscription.trial_started_at, subscription.created_at) <= statement_timestamp()
    ) entitlement_counts on true
    left join lateral (
      select
        count(*) filter (where grant_row.access_kind = 'REAL_BUSINESS_PILOT')::integer as pilot_count,
        count(*) filter (where grant_row.access_kind = 'INTERNAL_TEST_ONLY')::integer as test_only_count
      from public.commercial_pro_access_grants grant_row
      join public.restaurants restaurant on restaurant.id = grant_row.restaurant_id
        and restaurant.organization_id = grant_row.organization_id
      join public.branches branch on branch.id = restaurant.primary_branch_id
        and branch.restaurant_id = restaurant.id
        and branch.organization_id = restaurant.organization_id
      where upper(trim(branch.country)) = policy.country_code
        and grant_row.revoked_at is null
        and grant_row.starts_at <= statement_timestamp()
        and grant_row.expires_at > statement_timestamp()
    ) grant_counts on true
    where policy.plan_key = 'PRO'
      and (code_value is null or policy.country_code = code_value)
  ) country_rows;

  return jsonb_build_object('items', result_value, 'count', jsonb_array_length(result_value));
end;
$function$;

create or replace function public.get_platform_pro_entitlements(
  input_country text default null,
  input_grant_type text default null,
  input_state text default null,
  input_search text default null,
  input_limit integer default 50,
  input_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
stable
as $function$
declare
  code_value text := nullif(upper(trim(input_country)), '');
  type_value text := nullif(lower(trim(input_grant_type)), '');
  state_value text := nullif(lower(trim(input_state)), '');
  search_value text := nullif(lower(trim(input_search)), '');
  limit_value integer := least(greatest(coalesce(input_limit, 50), 1), 100);
  offset_value integer := greatest(coalesce(input_offset, 0), 0);
  result_value jsonb;
  total_value bigint;
begin
  if not public.platform_pro_control_center_reader_internal() then
    raise exception 'PRO_CONTROL_CENTER_NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if (code_value is not null and code_value !~ '^[A-Z]{2}$')
    or (type_value is not null and type_value not in ('paid', 'trial', 'pilot', 'test_only'))
    or (state_value is not null and state_value not in ('active', 'expired', 'revoked', 'scheduled'))
    or length(coalesce(search_value, '')) > 100 then
    raise exception 'PRO_CONTROL_CENTER_FILTER_INVALID' using errcode = '22023';
  end if;

  with subscription_rows as (
    select subscription.id as grant_id, restaurant.organization_id,
      organization.name as organization_name, restaurant.id as restaurant_id,
      restaurant.name as business_name, upper(trim(branch.country)) as country_code,
      case when subscription.subscription_status = 'trialing' then 'trial' else 'paid' end as grant_type,
      case
        when coalesce(subscription.trial_started_at, subscription.created_at) > statement_timestamp() then 'scheduled'
        when coalesce((lifecycle.value->>'eligible')::boolean, false) then 'active'
        else 'expired'
      end as grant_state,
      case when subscription.subscription_status = 'trialing'
        then subscription.trial_started_at else subscription.created_at end as starts_at,
      case when subscription.subscription_status = 'trialing'
        then subscription.trial_ends_at
        else coalesce(subscription.current_period_end, subscription.current_period_ends_at) end as expires_at,
      null::uuid as created_by, null::text as reason,
      null::uuid as revoked_by, null::timestamptz as revoked_at, null::text as revoke_reason,
      public.resolve_restaurant_entitlements_internal(restaurant.id)->>'plan_key' as effective_plan,
      coalesce(locations.value, '[]'::jsonb) as locations
    from public.restaurants restaurant
    join public.organizations organization on organization.id = restaurant.organization_id
    join public.branches branch on branch.id = restaurant.primary_branch_id
      and branch.restaurant_id = restaurant.id and branch.organization_id = restaurant.organization_id
    join public.branch_subscriptions subscription on subscription.branch_id = branch.id
      and subscription.organization_id = restaurant.organization_id
    cross join lateral (select public.resolve_subscription_plan_lifecycle_internal(
      subscription.plan_key, subscription.subscription_status, subscription.payment_status,
      subscription.trial_started_at, subscription.trial_ends_at,
      coalesce(subscription.current_period_end, subscription.current_period_ends_at),
      subscription.past_due_started_at, subscription.created_at, statement_timestamp()
    ) as value) lifecycle
    left join lateral (
      select jsonb_agg(jsonb_build_object('name', location.name, 'city', location.city,
        'postal_code', location.postal_code, 'country_code', upper(trim(location.country)))
        order by location.name, location.id) as value
      from public.branches location
      where location.restaurant_id = restaurant.id
        and location.organization_id = restaurant.organization_id
    ) locations on true
    where upper(coalesce(subscription.plan_key, '')) = 'PRO'
  ), access_rows as (
    select grant_row.id as grant_id, grant_row.organization_id,
      organization.name as organization_name, restaurant.id as restaurant_id,
      restaurant.name as business_name, upper(trim(branch.country)) as country_code,
      case grant_row.access_kind when 'REAL_BUSINESS_PILOT' then 'pilot' else 'test_only' end as grant_type,
      case when grant_row.revoked_at is not null then 'revoked'
        when grant_row.starts_at > statement_timestamp() then 'scheduled'
        when grant_row.expires_at <= statement_timestamp() then 'expired'
        else 'active' end as grant_state,
      grant_row.starts_at, grant_row.expires_at, grant_row.created_by, grant_row.reason,
      grant_row.revoked_by, grant_row.revoked_at, grant_row.revoke_reason,
      public.resolve_restaurant_entitlements_internal(restaurant.id)->>'plan_key' as effective_plan,
      coalesce(locations.value, '[]'::jsonb) as locations
    from public.commercial_pro_access_grants grant_row
    join public.restaurants restaurant on restaurant.id = grant_row.restaurant_id
      and restaurant.organization_id = grant_row.organization_id
    join public.organizations organization on organization.id = restaurant.organization_id
    join public.branches branch on branch.id = restaurant.primary_branch_id
      and branch.restaurant_id = restaurant.id and branch.organization_id = restaurant.organization_id
    left join lateral (
      select jsonb_agg(jsonb_build_object('name', location.name, 'city', location.city,
        'postal_code', location.postal_code, 'country_code', upper(trim(location.country)))
        order by location.name, location.id) as value
      from public.branches location
      where location.restaurant_id = restaurant.id
        and location.organization_id = restaurant.organization_id
    ) locations on true
  ), filtered as (
    select * from subscription_rows
    union all
    select * from access_rows
  ), matching as (
    select * from filtered row_value
    where (code_value is null or row_value.country_code = code_value)
      and (type_value is null or row_value.grant_type = type_value)
      and (state_value is null or row_value.grant_state = state_value)
      and (search_value is null
        or strpos(lower(row_value.organization_name), search_value) > 0
        or strpos(lower(row_value.business_name), search_value) > 0)
  ), counted as (select count(*) as value from matching), paged as (
    select * from matching
    order by expires_at desc nulls last, grant_type, grant_id
    limit limit_value offset offset_value
  )
  select coalesce((select value from counted), 0),
    coalesce((select jsonb_agg(to_jsonb(paged) order by expires_at desc nulls last, grant_type, grant_id)
      from paged), '[]'::jsonb)
  into total_value, result_value;

  return jsonb_build_object('items', result_value, 'total', total_value,
    'limit', limit_value, 'offset', offset_value);
end;
$function$;

create or replace function public.search_platform_pro_real_businesses(
  input_search text default null,
  input_country text default null,
  input_limit integer default 50,
  input_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
stable
as $function$
declare
  search_value text := nullif(lower(trim(input_search)), '');
  code_value text := nullif(upper(trim(input_country)), '');
  limit_value integer := least(greatest(coalesce(input_limit, 50), 1), 100);
  offset_value integer := greatest(coalesce(input_offset, 0), 0);
  result_value jsonb;
  total_value bigint;
begin
  if not public.platform_pro_control_center_reader_internal() then
    raise exception 'PRO_CONTROL_CENTER_NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if length(coalesce(search_value, '')) > 100
    or (code_value is not null and code_value !~ '^[A-Z]{2}$') then
    raise exception 'PRO_CONTROL_CENTER_FILTER_INVALID' using errcode = '22023';
  end if;

  with matching as (
    select restaurant.organization_id, organization.name as organization_name,
      restaurant.id as restaurant_id, restaurant.name as business_name,
      upper(trim(branch.country)) as country_code,
      subscription.plan_key as stored_plan,
      public.resolve_restaurant_entitlements_internal(restaurant.id)->>'plan_key' as effective_plan,
      subscription.subscription_status, subscription.payment_status,
      subscription.trial_started_at, subscription.trial_ends_at,
      release_policy.release_state as country_release_state,
      coalesce(pilot.value, '{}'::jsonb) as pilot,
      coalesce(locations.value, '[]'::jsonb) as locations
    from public.restaurants restaurant
    join public.organizations organization on organization.id = restaurant.organization_id
    join public.branches branch on branch.id = restaurant.primary_branch_id
      and branch.restaurant_id = restaurant.id and branch.organization_id = restaurant.organization_id
    left join public.branch_subscriptions subscription on subscription.branch_id = branch.id
      and subscription.organization_id = restaurant.organization_id
    left join public.commercial_plan_release_policy release_policy
      on release_policy.country_code = upper(trim(branch.country)) and release_policy.plan_key = 'PRO'
    left join lateral (
      select jsonb_build_object('grant_id', grant_row.id,
        'starts_at', grant_row.starts_at, 'expires_at', grant_row.expires_at,
        'state', case when grant_row.starts_at > statement_timestamp() then 'scheduled'
          when grant_row.expires_at <= statement_timestamp() then 'expired' else 'active' end) as value
      from public.commercial_pro_access_grants grant_row
      where grant_row.restaurant_id = restaurant.id
        and grant_row.organization_id = restaurant.organization_id
        and grant_row.access_kind = 'REAL_BUSINESS_PILOT'
        and grant_row.revoked_at is null
      order by grant_row.expires_at desc, grant_row.id desc limit 1
    ) pilot on true
    left join lateral (
      select jsonb_agg(jsonb_build_object('name', location.name, 'city', location.city,
        'postal_code', location.postal_code, 'country_code', upper(trim(location.country)))
        order by location.name, location.id) as value
      from public.branches location where location.restaurant_id = restaurant.id
        and location.organization_id = restaurant.organization_id
    ) locations on true
    where not exists (select 1 from public.platform_test_tenant_registry marker
      where marker.restaurant_id = restaurant.id
        and marker.organization_id = restaurant.organization_id
        and marker.restaurant_name = restaurant.name
        and marker.owner_user_id = restaurant.owner_id
        and marker.deleted_at is null)
      and (code_value is null or upper(trim(branch.country)) = code_value)
      and (search_value is null or strpos(lower(organization.name), search_value) > 0
        or strpos(lower(restaurant.name), search_value) > 0)
  ), counted as (select count(*) as value from matching), paged as (
    select * from matching order by business_name, restaurant_id
    limit limit_value offset offset_value
  )
  select coalesce((select value from counted), 0),
    coalesce((select jsonb_agg(to_jsonb(paged) order by business_name, restaurant_id) from paged), '[]'::jsonb)
  into total_value, result_value;
  return jsonb_build_object('items', result_value, 'total', total_value,
    'limit', limit_value, 'offset', offset_value);
end;
$function$;

create or replace function public.get_platform_pro_test_only_businesses(
  input_search text default null,
  input_country text default null,
  input_limit integer default 50,
  input_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
stable
as $function$
declare
  search_value text := nullif(lower(trim(input_search)), '');
  code_value text := nullif(upper(trim(input_country)), '');
  limit_value integer := least(greatest(coalesce(input_limit, 50), 1), 100);
  offset_value integer := greatest(coalesce(input_offset, 0), 0);
  result_value jsonb;
  total_value bigint;
begin
  if not public.platform_pro_control_center_reader_internal() then
    raise exception 'PRO_CONTROL_CENTER_NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if length(coalesce(search_value, '')) > 100
    or (code_value is not null and code_value !~ '^[A-Z]{2}$') then
    raise exception 'PRO_CONTROL_CENTER_FILTER_INVALID' using errcode = '22023';
  end if;

  with matching as (
    select marker.organization_id, organization.name as organization_name,
      restaurant.id as restaurant_id, restaurant.name as business_name,
      upper(trim(branch.country)) as country_code,
      public.resolve_restaurant_entitlements_internal(restaurant.id)->>'plan_key' as effective_plan,
      coalesce(test_grant.value, '{}'::jsonb) as grant,
      coalesce(locations.value, '[]'::jsonb) as locations
    from public.platform_test_tenant_registry marker
    join public.restaurants restaurant on restaurant.id = marker.restaurant_id
      and restaurant.organization_id = marker.organization_id
      and restaurant.name = marker.restaurant_name
      and restaurant.owner_id = marker.owner_user_id
    join public.organizations organization on organization.id = marker.organization_id
    join public.branches branch on branch.id = restaurant.primary_branch_id
      and branch.restaurant_id = restaurant.id and branch.organization_id = restaurant.organization_id
    left join lateral (
      select jsonb_build_object('grant_id', grant_row.id, 'starts_at', grant_row.starts_at,
        'expires_at', grant_row.expires_at,
        'state', case when grant_row.revoked_at is not null then 'revoked'
          when grant_row.starts_at > statement_timestamp() then 'scheduled'
          when grant_row.expires_at <= statement_timestamp() then 'expired' else 'active' end) as value
      from public.commercial_pro_access_grants grant_row
      where grant_row.restaurant_id = restaurant.id
        and grant_row.organization_id = restaurant.organization_id
        and grant_row.access_kind = 'INTERNAL_TEST_ONLY'
      order by (grant_row.revoked_at is null) desc, grant_row.expires_at desc, grant_row.id desc limit 1
    ) test_grant on true
    left join lateral (
      select jsonb_agg(jsonb_build_object('name', location.name, 'city', location.city,
        'postal_code', location.postal_code, 'country_code', upper(trim(location.country)))
        order by location.name, location.id) as value
      from public.branches location where location.restaurant_id = restaurant.id
        and location.organization_id = restaurant.organization_id
    ) locations on true
    where marker.deleted_at is null
      and (code_value is null or upper(trim(branch.country)) = code_value)
      and (search_value is null or strpos(lower(organization.name), search_value) > 0
        or strpos(lower(restaurant.name), search_value) > 0)
  ), counted as (select count(*) as value from matching), paged as (
    select * from matching order by business_name, restaurant_id
    limit limit_value offset offset_value
  )
  select coalesce((select value from counted), 0),
    coalesce((select jsonb_agg(to_jsonb(paged) order by business_name, restaurant_id) from paged), '[]'::jsonb)
  into total_value, result_value;
  return jsonb_build_object('items', result_value, 'total', total_value,
    'limit', limit_value, 'offset', offset_value);
end;
$function$;

create or replace function public.get_platform_pro_commercial_audit(
  input_country text default null,
  input_action text default null,
  input_restaurant_id uuid default null,
  input_limit integer default 50,
  input_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
stable
as $function$
declare
  code_value text := nullif(upper(trim(input_country)), '');
  action_value text := nullif(upper(trim(input_action)), '');
  limit_value integer := least(greatest(coalesce(input_limit, 50), 1), 100);
  offset_value integer := greatest(coalesce(input_offset, 0), 0);
  result_value jsonb;
  total_value bigint;
begin
  if not public.platform_pro_control_center_reader_internal() then
    raise exception 'PRO_CONTROL_CENTER_NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if (code_value is not null and code_value !~ '^[A-Z]{2}$')
    or (action_value is not null and action_value not in (
      'COUNTRY_PRO_RELEASED', 'COUNTRY_PRO_LOCKED', 'PRO_ACCESS_GRANTED',
      'PRO_ACCESS_EXTENDED', 'PRO_ACCESS_REVOKED')) then
    raise exception 'PRO_CONTROL_CENTER_FILTER_INVALID' using errcode = '22023';
  end if;

  with matching as (
    select audit.id, audit.action_type as action, audit.country_code,
      audit.organization_id, organization.name as organization_name,
      audit.restaurant_id, restaurant.name as business_name,
      audit.access_grant_id as grant_id, audit.before_state, audit.after_state,
      audit.actor_id, audit.actor_role, audit.created_at, audit.reason,
      audit.request_id as idempotency_reference,
      audit.after_state->>'expires_at' as expires_at,
      'SUCCESS'::text as result
    from public.commercial_pro_access_audit audit
    left join public.organizations organization on organization.id = audit.organization_id
    left join public.restaurants restaurant on restaurant.id = audit.restaurant_id
      and (audit.organization_id is null or restaurant.organization_id = audit.organization_id)
    where (code_value is null or audit.country_code = code_value)
      and (action_value is null or audit.action_type = action_value)
      and (input_restaurant_id is null or audit.restaurant_id = input_restaurant_id)
  ), counted as (select count(*) as value from matching), paged as (
    select * from matching order by created_at desc, id desc
    limit limit_value offset offset_value
  )
  select coalesce((select value from counted), 0),
    coalesce((select jsonb_agg(to_jsonb(paged) order by created_at desc, id desc) from paged), '[]'::jsonb)
  into total_value, result_value;
  return jsonb_build_object('items', result_value, 'total', total_value,
    'limit', limit_value, 'offset', offset_value);
end;
$function$;

revoke all on function public.get_platform_pro_country_status(text)
from public, anon, authenticated, service_role;
revoke all on function public.get_platform_pro_entitlements(text, text, text, text, integer, integer)
from public, anon, authenticated, service_role;
revoke all on function public.search_platform_pro_real_businesses(text, text, integer, integer)
from public, anon, authenticated, service_role;
revoke all on function public.get_platform_pro_test_only_businesses(text, text, integer, integer)
from public, anon, authenticated, service_role;
revoke all on function public.get_platform_pro_commercial_audit(text, text, uuid, integer, integer)
from public, anon, authenticated, service_role;

grant execute on function public.get_platform_pro_country_status(text) to authenticated;
grant execute on function public.get_platform_pro_entitlements(text, text, text, text, integer, integer) to authenticated;
grant execute on function public.search_platform_pro_real_businesses(text, text, integer, integer) to authenticated;
grant execute on function public.get_platform_pro_test_only_businesses(text, text, integer, integer) to authenticated;
grant execute on function public.get_platform_pro_commercial_audit(text, text, uuid, integer, integer) to authenticated;

notify pgrst, 'reload schema';
commit;
