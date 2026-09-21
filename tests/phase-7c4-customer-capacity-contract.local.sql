\set ON_ERROR_STOP on
begin;

create function pg_temp.expect_customer_capacity_error(statement text)
returns void language plpgsql as $function$
begin
  begin
    execute statement;
    raise exception 'expected CUSTOMER_CAPACITY_REACHED';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'CUSTOMER_CAPACITY_REACHED' then raise; end if;
  end;
end;
$function$;

create temp table phase_7c4_control_fingerprint as
select
  (select count(*) from public.commercial_pro_access_grants) as grants,
  (select count(*) from public.platform_test_tenant_registry) as test_tenants,
  (select count(*) from public.country_launch_policy) as country_policies;

set local session_replication_role = replica;

insert into auth.users (id, email, created_at, updated_at) values
  ('7c400000-0000-4000-8000-000000000001', 'phase7c4-owner@example.invalid', now(), now()),
  ('7c400000-0000-4000-8000-000000000002', 'phase7c4-stranger@example.invalid', now(), now());

insert into public.organizations (id, owner_id, name) values
  ('7c400000-0000-4000-8000-000000000010', '7c400000-0000-4000-8000-000000000001', '7C4 Basic'),
  ('7c400000-0000-4000-8000-000000000020', '7c400000-0000-4000-8000-000000000001', '7C4 Basic Add-on'),
  ('7c400000-0000-4000-8000-000000000030', '7c400000-0000-4000-8000-000000000001', '7C4 Pro'),
  ('7c400000-0000-4000-8000-000000000040', '7c400000-0000-4000-8000-000000000001', '7C4 Pro Add-ons'),
  ('7c400000-0000-4000-8000-000000000050', '7c400000-0000-4000-8000-000000000001', '7C4 Window');

insert into public.restaurants (id, owner_id, name, slug, organization_id) values
  ('7c400000-0000-4000-8000-000000000011', '7c400000-0000-4000-8000-000000000001', '7C4 Basic', 'phase-7c4-basic', '7c400000-0000-4000-8000-000000000010'),
  ('7c400000-0000-4000-8000-000000000021', '7c400000-0000-4000-8000-000000000001', '7C4 Basic Add-on', 'phase-7c4-basic-addon', '7c400000-0000-4000-8000-000000000020'),
  ('7c400000-0000-4000-8000-000000000031', '7c400000-0000-4000-8000-000000000001', '7C4 Pro', 'phase-7c4-pro', '7c400000-0000-4000-8000-000000000030'),
  ('7c400000-0000-4000-8000-000000000041', '7c400000-0000-4000-8000-000000000001', '7C4 Pro Add-ons', 'phase-7c4-pro-addons', '7c400000-0000-4000-8000-000000000040'),
  ('7c400000-0000-4000-8000-000000000051', '7c400000-0000-4000-8000-000000000001', '7C4 Window', 'phase-7c4-window', '7c400000-0000-4000-8000-000000000050');

insert into public.branches (id, organization_id, restaurant_id, name, slug, country) values
  ('7c400000-0000-4000-8000-000000000012', '7c400000-0000-4000-8000-000000000010', '7c400000-0000-4000-8000-000000000011', '7C4 Basic', 'phase-7c4-basic', 'AT'),
  ('7c400000-0000-4000-8000-000000000022', '7c400000-0000-4000-8000-000000000020', '7c400000-0000-4000-8000-000000000021', '7C4 Basic Add-on', 'phase-7c4-basic-addon', 'AT'),
  ('7c400000-0000-4000-8000-000000000032', '7c400000-0000-4000-8000-000000000030', '7c400000-0000-4000-8000-000000000031', '7C4 Pro', 'phase-7c4-pro', 'AT'),
  ('7c400000-0000-4000-8000-000000000042', '7c400000-0000-4000-8000-000000000040', '7c400000-0000-4000-8000-000000000041', '7C4 Pro Add-ons', 'phase-7c4-pro-addons', 'AT'),
  ('7c400000-0000-4000-8000-000000000052', '7c400000-0000-4000-8000-000000000050', '7c400000-0000-4000-8000-000000000051', '7C4 Window', 'phase-7c4-window', 'AT');

update public.restaurants restaurant set primary_branch_id = branch.id
from public.branches branch
where branch.restaurant_id = restaurant.id and restaurant.id::text like '7c400000-%';

insert into public.restaurant_members (restaurant_id, organization_id, branch_id, user_id, role)
select id, organization_id, primary_branch_id, '7c400000-0000-4000-8000-000000000001', 'owner'
from public.restaurants where id::text like '7c400000-%';

insert into public.branch_subscriptions (
  id, organization_id, branch_id, status, plan_key, subscription_status,
  payment_status, current_period_end, created_at
) values
  ('7c400000-0000-4000-8000-000000000013', '7c400000-0000-4000-8000-000000000010', '7c400000-0000-4000-8000-000000000012', 'active', 'BASIC', 'active', 'manual', now() + interval '30 days', now()),
  ('7c400000-0000-4000-8000-000000000023', '7c400000-0000-4000-8000-000000000020', '7c400000-0000-4000-8000-000000000022', 'active', 'BASIC', 'active', 'manual', now() + interval '30 days', now()),
  ('7c400000-0000-4000-8000-000000000033', '7c400000-0000-4000-8000-000000000030', '7c400000-0000-4000-8000-000000000032', 'active', 'PRO', 'active', 'paid', now() + interval '30 days', now()),
  ('7c400000-0000-4000-8000-000000000043', '7c400000-0000-4000-8000-000000000040', '7c400000-0000-4000-8000-000000000042', 'active', 'PRO', 'active', 'paid', now() + interval '30 days', now()),
  ('7c400000-0000-4000-8000-000000000053', '7c400000-0000-4000-8000-000000000050', '7c400000-0000-4000-8000-000000000052', 'active', 'BASIC', 'active', 'manual', now() + interval '30 days', now());

update public.commercial_plan_release_policy
set release_state = 'RELEASED', revision = revision + 1,
  founder_decision_ref = 'LOCAL_PHASE_7C4_FIXTURE', released_at = now(), updated_at = now()
where country_code = 'AT' and plan_key = 'PRO';

insert into public.restaurant_capacity_addon_entitlements (
  entitlement_key, revision, restaurant_id, organization_id, branch_id,
  addon_key, addon_version, units, status, effective_from, source, request_id, reason
) values
  ('7c400000-0000-4000-8000-000000000201', 1, '7c400000-0000-4000-8000-000000000021', '7c400000-0000-4000-8000-000000000020', '7c400000-0000-4000-8000-000000000022', 'CUSTOMER_CAPACITY', 1, 1, 'ACTIVE', now() - interval '1 day', 'TEST_FIXTURE', '7c400000-0000-4000-8000-000000000211', 'Local Phase 7C.4 fixture'),
  ('7c400000-0000-4000-8000-000000000202', 1, '7c400000-0000-4000-8000-000000000041', '7c400000-0000-4000-8000-000000000040', '7c400000-0000-4000-8000-000000000042', 'CUSTOMER_CAPACITY', 1, 2, 'ACTIVE', now() - interval '1 day', 'TEST_FIXTURE', '7c400000-0000-4000-8000-000000000212', 'Local Phase 7C.4 fixture');

with tenants(restaurant_id, organization_id, branch_id, prefix, amount) as (
  values
    ('7c400000-0000-4000-8000-000000000011'::uuid, '7c400000-0000-4000-8000-000000000010'::uuid, '7c400000-0000-4000-8000-000000000012'::uuid, 'B', 2999),
    ('7c400000-0000-4000-8000-000000000021'::uuid, '7c400000-0000-4000-8000-000000000020'::uuid, '7c400000-0000-4000-8000-000000000022'::uuid, 'A', 7999),
    ('7c400000-0000-4000-8000-000000000031'::uuid, '7c400000-0000-4000-8000-000000000030'::uuid, '7c400000-0000-4000-8000-000000000032'::uuid, 'P', 14999),
    ('7c400000-0000-4000-8000-000000000041'::uuid, '7c400000-0000-4000-8000-000000000040'::uuid, '7c400000-0000-4000-8000-000000000042'::uuid, 'X', 24999)
)
insert into public.customers (
  id, restaurant_id, organization_id, branch_id, name, customer_code,
  phone, normalized_phone, is_test_customer
)
select md5(tenant.prefix || '-customer-' || series.value)::uuid,
  tenant.restaurant_id, tenant.organization_id, tenant.branch_id,
  'Capacity ' || tenant.prefix || ' ' || series.value,
  tenant.prefix || '-' || series.value,
  '+439' || ascii(tenant.prefix)::text || lpad(series.value::text, 8, '0'),
  '+439' || ascii(tenant.prefix)::text || lpad(series.value::text, 8, '0'), false
from tenants tenant
cross join lateral generate_series(1, tenant.amount) series(value);

insert into public.points_transactions (
  id, restaurant_id, organization_id, branch_id, customer_id, type, points,
  amount_cents, collection_source, created_at
)
select md5('point-' || customer.id::text)::uuid,
  customer.restaurant_id, customer.organization_id, customer.branch_id,
  customer.id, 'earn', 10, 1000, 'restaurant_controlled', now() - interval '1 day'
from public.customers customer
where customer.restaurant_id in (
  '7c400000-0000-4000-8000-000000000011',
  '7c400000-0000-4000-8000-000000000021',
  '7c400000-0000-4000-8000-000000000031',
  '7c400000-0000-4000-8000-000000000041'
);

insert into public.customers (
  id, restaurant_id, organization_id, branch_id, name, customer_code,
  normalized_phone, is_test_customer
) values
  ('7c400000-0000-4000-8000-000000000101', '7c400000-0000-4000-8000-000000000011', '7c400000-0000-4000-8000-000000000010', '7c400000-0000-4000-8000-000000000012', 'Basic last', 'B-LAST', '+439100000001', false),
  ('7c400000-0000-4000-8000-000000000102', '7c400000-0000-4000-8000-000000000011', '7c400000-0000-4000-8000-000000000010', '7c400000-0000-4000-8000-000000000012', 'Basic overflow', 'B-OVER', '+439100000002', false),
  ('7c400000-0000-4000-8000-000000000103', '7c400000-0000-4000-8000-000000000011', '7c400000-0000-4000-8000-000000000010', '7c400000-0000-4000-8000-000000000012', 'Basic test', 'B-TEST', '+439100000003', true),
  ('7c400000-0000-4000-8000-000000000121', '7c400000-0000-4000-8000-000000000021', '7c400000-0000-4000-8000-000000000020', '7c400000-0000-4000-8000-000000000022', 'Addon last', 'A-LAST', '+439200000001', false),
  ('7c400000-0000-4000-8000-000000000122', '7c400000-0000-4000-8000-000000000021', '7c400000-0000-4000-8000-000000000020', '7c400000-0000-4000-8000-000000000022', 'Addon overflow', 'A-OVER', '+439200000002', false),
  ('7c400000-0000-4000-8000-000000000131', '7c400000-0000-4000-8000-000000000031', '7c400000-0000-4000-8000-000000000030', '7c400000-0000-4000-8000-000000000032', 'Pro last', 'P-LAST', '+439300000001', false),
  ('7c400000-0000-4000-8000-000000000132', '7c400000-0000-4000-8000-000000000031', '7c400000-0000-4000-8000-000000000030', '7c400000-0000-4000-8000-000000000032', 'Pro overflow', 'P-OVER', '+439300000002', false),
  ('7c400000-0000-4000-8000-000000000141', '7c400000-0000-4000-8000-000000000041', '7c400000-0000-4000-8000-000000000040', '7c400000-0000-4000-8000-000000000042', 'Pro addon last', 'X-LAST', '+439400000001', false),
  ('7c400000-0000-4000-8000-000000000142', '7c400000-0000-4000-8000-000000000041', '7c400000-0000-4000-8000-000000000040', '7c400000-0000-4000-8000-000000000042', 'Pro addon overflow', 'X-OVER', '+439400000002', false);

-- Half-open rolling-window fixtures: exact lower bound and just inside count;
-- just outside and exact upper bound do not count.
insert into public.customers (
  id, restaurant_id, organization_id, branch_id, name, customer_code,
  normalized_phone, is_test_customer
) values
  ('7c400000-0000-4000-8000-000000000151', '7c400000-0000-4000-8000-000000000051', '7c400000-0000-4000-8000-000000000050', '7c400000-0000-4000-8000-000000000052', 'Window exact', 'W-EXACT', '+439500000001', false),
  ('7c400000-0000-4000-8000-000000000152', '7c400000-0000-4000-8000-000000000051', '7c400000-0000-4000-8000-000000000050', '7c400000-0000-4000-8000-000000000052', 'Window inside', 'W-IN', '+439500000002', false),
  ('7c400000-0000-4000-8000-000000000153', '7c400000-0000-4000-8000-000000000051', '7c400000-0000-4000-8000-000000000050', '7c400000-0000-4000-8000-000000000052', 'Window outside', 'W-OUT', '+439500000003', false),
  ('7c400000-0000-4000-8000-000000000154', '7c400000-0000-4000-8000-000000000051', '7c400000-0000-4000-8000-000000000050', '7c400000-0000-4000-8000-000000000052', 'Window upper', 'W-UPPER', '+439500000004', false);

insert into public.points_transactions (
  id, restaurant_id, organization_id, branch_id, customer_id, type, points,
  amount_cents, collection_source, created_at
) values
  ('7c400000-0000-4000-8000-000000000251', '7c400000-0000-4000-8000-000000000051', '7c400000-0000-4000-8000-000000000050', '7c400000-0000-4000-8000-000000000052', '7c400000-0000-4000-8000-000000000151', 'earn', 10, 1000, 'restaurant_controlled', '2029-01-01 00:00:00+00'),
  ('7c400000-0000-4000-8000-000000000252', '7c400000-0000-4000-8000-000000000051', '7c400000-0000-4000-8000-000000000050', '7c400000-0000-4000-8000-000000000052', '7c400000-0000-4000-8000-000000000152', 'earn', 10, 1000, 'restaurant_controlled', '2029-01-01 00:00:00.000001+00'),
  ('7c400000-0000-4000-8000-000000000253', '7c400000-0000-4000-8000-000000000051', '7c400000-0000-4000-8000-000000000050', '7c400000-0000-4000-8000-000000000052', '7c400000-0000-4000-8000-000000000153', 'earn', 10, 1000, 'restaurant_controlled', '2028-12-31 23:59:59.999999+00'),
  ('7c400000-0000-4000-8000-000000000254', '7c400000-0000-4000-8000-000000000051', '7c400000-0000-4000-8000-000000000050', '7c400000-0000-4000-8000-000000000052', '7c400000-0000-4000-8000-000000000154', 'earn', 10, 1000, 'restaurant_controlled', '2030-01-01 00:00:00+00');

set local session_replication_role = origin;

do $test$
declare snapshot jsonb;
begin
  snapshot := public.resolve_restaurant_capacity_internal('7c400000-0000-4000-8000-000000000011', clock_timestamp());
  if snapshot#>>'{plan,plan_key}' <> 'BASIC' or snapshot#>>'{active_customers,usage}' <> '2999' or snapshot#>>'{active_customers,effective_limit}' <> '3000' then raise exception 'Basic 2999 mismatch: %', snapshot; end if;
  snapshot := public.resolve_restaurant_capacity_internal('7c400000-0000-4000-8000-000000000021', clock_timestamp());
  if snapshot#>>'{active_customers,usage}' <> '7999' or snapshot#>>'{active_customers,effective_limit}' <> '8000' then raise exception 'Basic addon 7999 mismatch: %', snapshot; end if;
  snapshot := public.resolve_restaurant_capacity_internal('7c400000-0000-4000-8000-000000000031', clock_timestamp());
  if snapshot#>>'{plan,plan_key}' <> 'PRO' or snapshot#>>'{active_customers,usage}' <> '14999' or snapshot#>>'{active_customers,effective_limit}' <> '15000' then raise exception 'Pro 14999 mismatch: %', snapshot; end if;
  snapshot := public.resolve_restaurant_capacity_internal('7c400000-0000-4000-8000-000000000041', clock_timestamp());
  if snapshot#>>'{active_customers,usage}' <> '24999' or snapshot#>>'{active_customers,effective_limit}' <> '25000' then raise exception 'Pro addon 24999 mismatch: %', snapshot; end if;
  snapshot := public.resolve_restaurant_capacity_internal('7c400000-0000-4000-8000-000000000051', '2030-01-01 00:00+00');
  if snapshot#>>'{active_customers,usage}' <> '2' then raise exception 'Half-open rolling window mismatch: %', snapshot; end if;
end;
$test$;

-- The last available customer slot succeeds for all canonical capacities.
insert into public.points_transactions (
  restaurant_id, organization_id, branch_id, customer_id, type, points,
  amount_cents, collection_source
) values
  ('7c400000-0000-4000-8000-000000000011', '7c400000-0000-4000-8000-000000000010', '7c400000-0000-4000-8000-000000000012', '7c400000-0000-4000-8000-000000000101', 'earn', 10, 1000, 'restaurant_controlled'),
  ('7c400000-0000-4000-8000-000000000021', '7c400000-0000-4000-8000-000000000020', '7c400000-0000-4000-8000-000000000022', '7c400000-0000-4000-8000-000000000121', 'earn', 10, 1000, 'restaurant_controlled'),
  ('7c400000-0000-4000-8000-000000000031', '7c400000-0000-4000-8000-000000000030', '7c400000-0000-4000-8000-000000000032', '7c400000-0000-4000-8000-000000000131', 'earn', 10, 1000, 'restaurant_controlled'),
  ('7c400000-0000-4000-8000-000000000041', '7c400000-0000-4000-8000-000000000040', '7c400000-0000-4000-8000-000000000042', '7c400000-0000-4000-8000-000000000141', 'earn', 10, 1000, 'restaurant_controlled');

select pg_temp.expect_customer_capacity_error($$insert into public.points_transactions (restaurant_id,organization_id,branch_id,customer_id,type,points,amount_cents,collection_source) values ('7c400000-0000-4000-8000-000000000011','7c400000-0000-4000-8000-000000000010','7c400000-0000-4000-8000-000000000012','7c400000-0000-4000-8000-000000000102','earn',10,1000,'restaurant_controlled')$$);
select pg_temp.expect_customer_capacity_error($$insert into public.points_transactions (restaurant_id,organization_id,branch_id,customer_id,type,points,amount_cents,collection_source) values ('7c400000-0000-4000-8000-000000000021','7c400000-0000-4000-8000-000000000020','7c400000-0000-4000-8000-000000000022','7c400000-0000-4000-8000-000000000122','earn',10,1000,'restaurant_controlled')$$);
select pg_temp.expect_customer_capacity_error($$insert into public.points_transactions (restaurant_id,organization_id,branch_id,customer_id,type,points,amount_cents,collection_source) values ('7c400000-0000-4000-8000-000000000031','7c400000-0000-4000-8000-000000000030','7c400000-0000-4000-8000-000000000032','7c400000-0000-4000-8000-000000000132','earn',10,1000,'restaurant_controlled')$$);
select pg_temp.expect_customer_capacity_error($$insert into public.points_transactions (restaurant_id,organization_id,branch_id,customer_id,type,points,amount_cents,collection_source) values ('7c400000-0000-4000-8000-000000000041','7c400000-0000-4000-8000-000000000040','7c400000-0000-4000-8000-000000000042','7c400000-0000-4000-8000-000000000142','earn',10,1000,'restaurant_controlled')$$);

-- Trusted direct updates cannot move historical activity into the rolling
-- window to bypass the same first-activity capacity decision.
insert into public.points_transactions (id,restaurant_id,organization_id,branch_id,customer_id,type,points,amount_cents,collection_source,created_at)
values (md5('phase-7c4-historical-point')::uuid,'7c400000-0000-4000-8000-000000000011','7c400000-0000-4000-8000-000000000010','7c400000-0000-4000-8000-000000000012','7c400000-0000-4000-8000-000000000102','earn',10,1000,'restaurant_controlled',clock_timestamp()-interval '366 days');
select pg_temp.expect_customer_capacity_error($$update public.points_transactions set created_at=clock_timestamp() where id=md5('phase-7c4-historical-point')::uuid$$);

-- Repeated points, visits represented by repeated confirmed activity, and
-- test-customer actions do not consume another slot.
insert into public.points_transactions (restaurant_id,organization_id,branch_id,customer_id,type,points,amount_cents,collection_source) values
  ('7c400000-0000-4000-8000-000000000011','7c400000-0000-4000-8000-000000000010','7c400000-0000-4000-8000-000000000012','7c400000-0000-4000-8000-000000000101','earn',5,1000,'customer_initiated'),
  ('7c400000-0000-4000-8000-000000000011','7c400000-0000-4000-8000-000000000010','7c400000-0000-4000-8000-000000000012','7c400000-0000-4000-8000-000000000103','earn',5,1000,'customer_initiated');

-- Registration and account membership remain possible at the limit.
insert into public.customers (id,restaurant_id,organization_id,branch_id,name,customer_code,phone,normalized_phone,is_test_customer)
values ('7c400000-0000-4000-8000-000000000104','7c400000-0000-4000-8000-000000000011','7c400000-0000-4000-8000-000000000010','7c400000-0000-4000-8000-000000000012','Registered at limit','B-REGISTERED','+439100000004','+439100000004',false);
insert into public.customer_accounts (id) values ('7c400000-0000-4000-8000-000000000301');
insert into public.customer_account_memberships (account_id,restaurant_id,customer_id)
values ('7c400000-0000-4000-8000-000000000301','7c400000-0000-4000-8000-000000000011','7c400000-0000-4000-8000-000000000104');

-- A first completed redemption is blocked at the limit and fully rolled back.
select pg_temp.expect_customer_capacity_error($$insert into public.redemption_activity_journal
  (activity_number,restaurant_id,organization_id,branch_id,customer_id,customer_reference,source_type,source_id,reward_type,redeemed_at,actor_role,status,snapshot_completeness,is_test_event)
  values ('7C4-BLOCKED','7c400000-0000-4000-8000-000000000011','7c400000-0000-4000-8000-000000000010','7c400000-0000-4000-8000-000000000012','7c400000-0000-4000-8000-000000000102','blocked','POINT_REWARD','7c400000-0000-4000-8000-000000000401','POINT_REWARD',clock_timestamp(),'staff','ACTIVE','complete',false)$$);

do $test$ begin
  if exists (select 1 from public.redemption_activity_journal where activity_number='7C4-BLOCKED') then raise exception 'blocked redemption survived'; end if;
  if (public.resolve_restaurant_capacity_internal('7c400000-0000-4000-8000-000000000011',clock_timestamp())#>>'{active_customers,usage}')::bigint <> 3000 then raise exception 'unique count changed after repeats'; end if;
end $test$;

-- Reversal frees one slot; the same candidate can then become active through
-- redemption and later points without double counting.
insert into public.points_transactions (
  restaurant_id,organization_id,branch_id,customer_id,type,points,
  collection_source,reversal_of
)
select original.restaurant_id,original.organization_id,original.branch_id,
  original.customer_id,'adjust',-original.points,'reversal',original.id
from public.points_transactions original
where original.id = md5('point-' || md5('B-customer-1')::uuid::text)::uuid;

insert into public.redemption_activity_journal
  (activity_number,restaurant_id,organization_id,branch_id,customer_id,customer_reference,source_type,source_id,reward_type,redeemed_at,actor_role,status,snapshot_completeness,is_test_event)
values ('7C4-ALLOWED','7c400000-0000-4000-8000-000000000011','7c400000-0000-4000-8000-000000000010','7c400000-0000-4000-8000-000000000012','7c400000-0000-4000-8000-000000000102','allowed','WELCOME_GIFT','7c400000-0000-4000-8000-000000000402','WELCOME_GIFT',clock_timestamp(),'staff','ACTIVE','complete',false);
insert into public.points_transactions (restaurant_id,organization_id,branch_id,customer_id,type,points,amount_cents,collection_source)
values ('7c400000-0000-4000-8000-000000000011','7c400000-0000-4000-8000-000000000010','7c400000-0000-4000-8000-000000000012','7c400000-0000-4000-8000-000000000102','earn',5,1000,'restaurant_controlled');

-- Deactivation does not rewrite the rolling activity contract.
update public.customers set membership_status='terminated' where id=md5('B-customer-2')::uuid;
do $test$ begin
  if (public.resolve_restaurant_capacity_internal('7c400000-0000-4000-8000-000000000011',clock_timestamp())#>>'{active_customers,usage}')::bigint <> 3000 then raise exception 'inactive retained customer was silently removed'; end if;
end $test$;

-- Plan upgrade allows growth; downgrade preserves data and blocks only a new
-- first activity while existing active customers remain allowed.
set local session_replication_role = replica;
update public.branch_subscriptions set plan_key='PRO' where id='7c400000-0000-4000-8000-000000000013';
set local session_replication_role = origin;
insert into public.points_transactions (restaurant_id,organization_id,branch_id,customer_id,type,points,amount_cents,collection_source)
values ('7c400000-0000-4000-8000-000000000011','7c400000-0000-4000-8000-000000000010','7c400000-0000-4000-8000-000000000012','7c400000-0000-4000-8000-000000000104','earn',5,1000,'restaurant_controlled');
set local session_replication_role = replica;
update public.branch_subscriptions set plan_key='BASIC' where id='7c400000-0000-4000-8000-000000000013';
set local session_replication_role = origin;
insert into public.points_transactions (restaurant_id,organization_id,branch_id,customer_id,type,points,amount_cents,collection_source)
values ('7c400000-0000-4000-8000-000000000011','7c400000-0000-4000-8000-000000000010','7c400000-0000-4000-8000-000000000012','7c400000-0000-4000-8000-000000000104','earn',5,1000,'restaurant_controlled');
insert into public.customers (id,restaurant_id,organization_id,branch_id,name,customer_code,phone,normalized_phone,is_test_customer)
values (md5('new-after-downgrade')::uuid,'7c400000-0000-4000-8000-000000000011','7c400000-0000-4000-8000-000000000010','7c400000-0000-4000-8000-000000000012','New after downgrade','B-DOWNGRADE','+439100000005','+439100000005',false);
select pg_temp.expect_customer_capacity_error($$insert into public.points_transactions (restaurant_id,organization_id,branch_id,customer_id,type,points,amount_cents,collection_source) values ('7c400000-0000-4000-8000-000000000011','7c400000-0000-4000-8000-000000000010','7c400000-0000-4000-8000-000000000012',md5('new-after-downgrade')::uuid,'earn',5,1000,'restaurant_controlled')$$);

-- The referenced customer for the blocked downgrade attempt exists, but no
-- activity, membership or ledger row is deleted by over-limit enforcement.
-- Add-on payment failure after grace removes only capacity.
insert into public.restaurant_capacity_addon_entitlements (
  entitlement_key,revision,restaurant_id,organization_id,branch_id,addon_key,
  addon_version,units,status,effective_from,past_due_started_at,source,request_id,reason
) values ('7c400000-0000-4000-8000-000000000201',2,'7c400000-0000-4000-8000-000000000021','7c400000-0000-4000-8000-000000000020','7c400000-0000-4000-8000-000000000022','CUSTOMER_CAPACITY',1,1,'PAST_DUE',now()-interval '30 days',now()-interval '8 days','TEST_FIXTURE','7c400000-0000-4000-8000-000000000213','Local expired payment grace');
insert into public.points_transactions (restaurant_id,organization_id,branch_id,customer_id,type,points,amount_cents,collection_source)
values ('7c400000-0000-4000-8000-000000000021','7c400000-0000-4000-8000-000000000020','7c400000-0000-4000-8000-000000000022','7c400000-0000-4000-8000-000000000121','earn',5,1000,'restaurant_controlled');
select pg_temp.expect_customer_capacity_error($$insert into public.points_transactions (restaurant_id,organization_id,branch_id,customer_id,type,points,amount_cents,collection_source) values ('7c400000-0000-4000-8000-000000000021','7c400000-0000-4000-8000-000000000020','7c400000-0000-4000-8000-000000000022','7c400000-0000-4000-8000-000000000122','earn',5,1000,'restaurant_controlled')$$);

-- Country lock still determines effective PRO authority.
set local session_replication_role = replica;
update public.commercial_plan_release_policy
set release_state='LOCKED', founder_decision_ref=null, released_at=null
where country_code='AT' and plan_key='PRO';
set local session_replication_role = origin;
do $test$ declare snapshot jsonb; begin
  snapshot := public.resolve_restaurant_capacity_internal('7c400000-0000-4000-8000-000000000031',clock_timestamp());
  if snapshot#>>'{plan,plan_key}' <> 'BASIC' or snapshot#>>'{active_customers,effective_limit}' <> '3000' then raise exception 'Country lock bypassed: %', snapshot; end if;
end $test$;

-- ACL, role and direct-DML matrix.
do $test$ begin
  if has_function_privilege('anon','public.list_restaurant_active_customer_capacity_keys_internal(uuid,timestamptz,uuid,uuid,text)','execute') then raise exception 'anon internal key access'; end if;
  if has_function_privilege('authenticated','public.enforce_customer_capacity_activity()','execute') then raise exception 'authenticated trigger execute'; end if;
  if has_function_privilege('service_role','public.enforce_customer_capacity_activity()','execute') then raise exception 'service role trigger execute'; end if;
  if has_table_privilege('anon','public.points_transactions','insert') then raise exception 'anon points insert'; end if;
  if has_table_privilege('authenticated','public.points_transactions','insert') then raise exception 'authenticated points insert'; end if;
  if has_table_privilege('anon','public.redemption_activity_journal','insert') then raise exception 'anon journal insert'; end if;
  if has_table_privilege('authenticated','public.redemption_activity_journal','insert') then raise exception 'authenticated journal insert'; end if;
end $test$;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"7c400000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $test$ declare snapshot jsonb; begin
  snapshot := public.get_restaurant_capacity('7c400000-0000-4000-8000-000000000011');
  if not (snapshot#>>'{write_enforcement,offers}')::boolean or not (snapshot#>>'{write_enforcement,active_customers}')::boolean then raise exception 'enforcement read flags missing'; end if;
end $test$;
select set_config('request.jwt.claims','{"sub":"7c400000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $test$ begin
  begin perform public.get_restaurant_capacity('7c400000-0000-4000-8000-000000000011'); raise exception 'cross tenant read succeeded';
  exception when insufficient_privilege then null; end;
  begin insert into public.points_transactions (restaurant_id,organization_id,branch_id,customer_id,type,points) values ('7c400000-0000-4000-8000-000000000011','7c400000-0000-4000-8000-000000000010','7c400000-0000-4000-8000-000000000012','7c400000-0000-4000-8000-000000000102','earn',1); raise exception 'authenticated direct DML succeeded';
  exception when insufficient_privilege then null; end;
end $test$;
reset role;

do $test$ declare control record; begin
  select * into control from phase_7c4_control_fingerprint;
  if (select count(*) from public.commercial_pro_access_grants) <> control.grants then raise exception 'grant contract changed'; end if;
  if (select count(*) from public.platform_test_tenant_registry) <> control.test_tenants then raise exception 'TEST_ONLY contract changed'; end if;
  if (select count(*) from public.country_launch_policy) <> control.country_policies then raise exception 'country policy inventory changed'; end if;
  if not exists (select 1 from public.customers where id='7c400000-0000-4000-8000-000000000104') then raise exception 'over-limit deleted customer'; end if;
  if not exists (select 1 from public.customer_account_memberships where customer_id='7c400000-0000-4000-8000-000000000104') then raise exception 'over-limit deleted membership'; end if;
end $test$;

rollback;
select 'PHASE_7C4_LOCAL_SQL_MATRIX_PASS';
