\set ON_ERROR_STOP on
begin;

-- Synthetic local-only read fixture. Every row is rolled back.
set local session_replication_role = replica;

insert into auth.users (id, email, created_at, updated_at) values
  ('7c500000-0000-4000-8000-000000000001', 'phase7c5-owner@example.invalid', now(), now()),
  ('7c500000-0000-4000-8000-000000000002', 'phase7c5-stranger@example.invalid', now(), now());
insert into public.organizations (id, owner_id, name) values
  ('7c500000-0000-4000-8000-000000000010', '7c500000-0000-4000-8000-000000000001', 'Phase 7C.5 Local');
insert into public.restaurants (id, owner_id, name, slug, organization_id) values
  ('7c500000-0000-4000-8000-000000000011', '7c500000-0000-4000-8000-000000000001', 'Phase 7C.5 Local', 'phase-7c5-local', '7c500000-0000-4000-8000-000000000010');
insert into public.branches (id, organization_id, restaurant_id, name, slug, country) values
  ('7c500000-0000-4000-8000-000000000012', '7c500000-0000-4000-8000-000000000010', '7c500000-0000-4000-8000-000000000011', 'Phase 7C.5 Local', 'phase-7c5-local', 'AT');
update public.restaurants set primary_branch_id = '7c500000-0000-4000-8000-000000000012'
where id = '7c500000-0000-4000-8000-000000000011';
insert into public.restaurant_members (restaurant_id, organization_id, branch_id, user_id, role) values
  ('7c500000-0000-4000-8000-000000000011', '7c500000-0000-4000-8000-000000000010', '7c500000-0000-4000-8000-000000000012', '7c500000-0000-4000-8000-000000000001', 'owner');
insert into public.branch_subscriptions (
  id, organization_id, branch_id, status, plan_key, subscription_status,
  payment_status, current_period_end, created_at
) values (
  '7c500000-0000-4000-8000-000000000013', '7c500000-0000-4000-8000-000000000010',
  '7c500000-0000-4000-8000-000000000012', 'active', 'BASIC', 'active',
  'manual', now() + interval '30 days', now()
);

set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7c500000-0000-4000-8000-000000000001","role":"authenticated"}', true);

do $test$
declare snapshot jsonb;
begin
  snapshot := public.get_restaurant_capacity('7c500000-0000-4000-8000-000000000011');
  if snapshot#>>'{plan,plan_key}' <> 'BASIC' then raise exception 'effective plan mismatch: %', snapshot; end if;
  if snapshot#>>'{offers,status}' <> 'AVAILABLE' or snapshot#>>'{offers,usage_percent}' <> '0' then raise exception 'zero status mismatch: %', snapshot; end if;
  if snapshot#>>'{active_customers,status}' <> 'AVAILABLE' then raise exception 'customer zero status mismatch: %', snapshot; end if;
  if snapshot#>>'{catalog,offer_addon,monthly_price_minor}' <> '1900' or snapshot#>>'{catalog,offer_addon,capacity_per_unit}' <> '5' then raise exception 'offer addon catalog mismatch: %', snapshot; end if;
  if snapshot#>>'{catalog,customer_addon,monthly_price_minor}' <> '2900' or snapshot#>>'{catalog,customer_addon,capacity_per_unit}' <> '5000' then raise exception 'customer addon catalog mismatch: %', snapshot; end if;
  if snapshot#>>'{commercial_release,country_code}' <> 'AT' or snapshot#>>'{commercial_release,release_state}' <> 'LOCKED' then raise exception 'commercial lock mismatch: %', snapshot; end if;
  if snapshot#>>'{warning_contract,dispatch_active}' <> 'true' or snapshot#>>'{warning_contract,forecast_active}' <> 'true' or snapshot#>>'{warning_contract,decision_required}' <> 'false' then raise exception 'warning dispatch contract mismatch: %', snapshot; end if;
  if snapshot#>>'{write_enforcement,offers}' <> 'true' or snapshot#>>'{write_enforcement,active_customers}' <> 'true' then raise exception 'enforcement flags mismatch: %', snapshot; end if;
end;
$test$;

reset role;
set local session_replication_role = replica;
insert into public.restaurant_offers (
  id, restaurant_id, branch_id, offer_type, title, short_description,
  valid_from, valid_to, status, is_active
)
select md5('phase7c5-offer-' || series.value)::uuid,
  '7c500000-0000-4000-8000-000000000011', '7c500000-0000-4000-8000-000000000012',
  'NEWS', 'Capacity ' || series.value, 'Capacity fixture', now() - interval '1 day',
  now() + interval '30 days', 'PUBLISHED', true
from generate_series(1, 4) series(value);
set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7c500000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $test$
declare snapshot jsonb;
begin
  snapshot := public.get_restaurant_capacity('7c500000-0000-4000-8000-000000000011');
  if snapshot#>>'{offers,status}' <> 'WARNING_80' or snapshot#>>'{offers,usage_percent}' <> '80' then raise exception '80 percent status mismatch: %', snapshot; end if;
end;
$test$;

reset role;
set local session_replication_role = replica;
insert into public.restaurant_offers (id, restaurant_id, branch_id, offer_type, title, short_description, valid_from, valid_to, status, is_active) values
  ('7c500000-0000-4000-8000-000000000105', '7c500000-0000-4000-8000-000000000011', '7c500000-0000-4000-8000-000000000012', 'NEWS', 'Capacity 5', 'Capacity fixture', now() - interval '1 day', now() + interval '30 days', 'PUBLISHED', true);
set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7c500000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $test$
declare snapshot jsonb;
begin
  snapshot := public.get_restaurant_capacity('7c500000-0000-4000-8000-000000000011');
  if snapshot#>>'{offers,status}' <> 'AT_LIMIT' or snapshot#>>'{offers,usage_percent}' <> '100' then raise exception 'at-limit status mismatch: %', snapshot; end if;
end;
$test$;

reset role;
set local session_replication_role = replica;
insert into public.restaurant_offers (id, restaurant_id, branch_id, offer_type, title, short_description, valid_from, valid_to, status, is_active) values
  ('7c500000-0000-4000-8000-000000000106', '7c500000-0000-4000-8000-000000000011', '7c500000-0000-4000-8000-000000000012', 'NEWS', 'Capacity 6', 'Capacity fixture', now() - interval '1 day', now() + interval '30 days', 'PUBLISHED', true);
set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7c500000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $test$
declare snapshot jsonb;
begin
  snapshot := public.get_restaurant_capacity('7c500000-0000-4000-8000-000000000011');
  if snapshot#>>'{offers,status}' <> 'OVER_LIMIT' or snapshot#>>'{offers,remaining}' <> '0' then raise exception 'over-limit status mismatch: %', snapshot; end if;
end;
$test$;

select set_config('request.jwt.claims', '{"sub":"7c500000-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $test$
begin
  begin
    perform public.get_restaurant_capacity('7c500000-0000-4000-8000-000000000011');
    raise exception 'cross-tenant capacity read unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$test$;
reset role;

do $test$
begin
  if has_function_privilege('anon', 'public.get_restaurant_capacity(uuid)', 'execute') then raise exception 'anonymous execute present'; end if;
  if not has_function_privilege('authenticated', 'public.get_restaurant_capacity(uuid)', 'execute') then raise exception 'owner RPC execute missing'; end if;
  if has_function_privilege('authenticated', 'public.resolve_restaurant_capacity_internal(uuid,timestamptz)', 'execute') then raise exception 'internal resolver exposed'; end if;
end;
$test$;

rollback;
select 'PHASE_7C5_OWNER_CAPACITY_LOCAL_SQL_PASS';
