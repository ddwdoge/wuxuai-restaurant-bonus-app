\set ON_ERROR_STOP on
begin;

create function pg_temp.expect_capacity_error(statement text)
returns void language plpgsql as $function$
begin
  begin
    execute statement;
    raise exception 'expected OFFER_CAPACITY_REACHED';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'OFFER_CAPACITY_REACHED' then raise; end if;
  end;
end;
$function$;

set local session_replication_role = replica;

insert into auth.users (id, email, created_at, updated_at) values
  ('7c300000-0000-4000-8000-000000000001', 'phase7c3-owner@example.invalid', now(), now()),
  ('7c300000-0000-4000-8000-000000000002', 'phase7c3-stranger@example.invalid', now(), now());

insert into public.organizations (id, owner_id, name) values
  ('7c300000-0000-4000-8000-000000000010', '7c300000-0000-4000-8000-000000000001', '7C3 Basic'),
  ('7c300000-0000-4000-8000-000000000020', '7c300000-0000-4000-8000-000000000001', '7C3 Basic Add-on'),
  ('7c300000-0000-4000-8000-000000000030', '7c300000-0000-4000-8000-000000000001', '7C3 Pro'),
  ('7c300000-0000-4000-8000-000000000040', '7c300000-0000-4000-8000-000000000001', '7C3 Pro Add-on');

insert into public.restaurants (id, owner_id, name, slug, organization_id) values
  ('7c300000-0000-4000-8000-000000000011', '7c300000-0000-4000-8000-000000000001', '7C3 Basic', 'phase-7c3-basic', '7c300000-0000-4000-8000-000000000010'),
  ('7c300000-0000-4000-8000-000000000021', '7c300000-0000-4000-8000-000000000001', '7C3 Basic Add-on', 'phase-7c3-basic-addon', '7c300000-0000-4000-8000-000000000020'),
  ('7c300000-0000-4000-8000-000000000031', '7c300000-0000-4000-8000-000000000001', '7C3 Pro', 'phase-7c3-pro', '7c300000-0000-4000-8000-000000000030'),
  ('7c300000-0000-4000-8000-000000000041', '7c300000-0000-4000-8000-000000000001', '7C3 Pro Add-on', 'phase-7c3-pro-addon', '7c300000-0000-4000-8000-000000000040');

insert into public.branches (id, organization_id, restaurant_id, name, slug, country) values
  ('7c300000-0000-4000-8000-000000000012', '7c300000-0000-4000-8000-000000000010', '7c300000-0000-4000-8000-000000000011', '7C3 Basic', 'phase-7c3-basic', 'AT'),
  ('7c300000-0000-4000-8000-000000000022', '7c300000-0000-4000-8000-000000000020', '7c300000-0000-4000-8000-000000000021', '7C3 Basic Add-on', 'phase-7c3-basic-addon', 'AT'),
  ('7c300000-0000-4000-8000-000000000032', '7c300000-0000-4000-8000-000000000030', '7c300000-0000-4000-8000-000000000031', '7C3 Pro', 'phase-7c3-pro', 'AT'),
  ('7c300000-0000-4000-8000-000000000042', '7c300000-0000-4000-8000-000000000040', '7c300000-0000-4000-8000-000000000041', '7C3 Pro Add-on', 'phase-7c3-pro-addon', 'AT');

update public.restaurants restaurant set primary_branch_id = branch.id
from public.branches branch where branch.restaurant_id = restaurant.id
  and restaurant.id::text like '7c300000-%';

insert into public.restaurant_members (restaurant_id, organization_id, branch_id, user_id, role)
select restaurant.id, restaurant.organization_id, restaurant.primary_branch_id,
  '7c300000-0000-4000-8000-000000000001', 'owner'
from public.restaurants restaurant where restaurant.id::text like '7c300000-%';

insert into public.branch_subscriptions (
  id, organization_id, branch_id, status, plan_key, subscription_status,
  payment_status, current_period_end, created_at
) values
  ('7c300000-0000-4000-8000-000000000013', '7c300000-0000-4000-8000-000000000010', '7c300000-0000-4000-8000-000000000012', 'active', 'BASIC', 'active', 'manual', now() + interval '30 days', now()),
  ('7c300000-0000-4000-8000-000000000023', '7c300000-0000-4000-8000-000000000020', '7c300000-0000-4000-8000-000000000022', 'active', 'BASIC', 'active', 'manual', now() + interval '30 days', now()),
  ('7c300000-0000-4000-8000-000000000033', '7c300000-0000-4000-8000-000000000030', '7c300000-0000-4000-8000-000000000032', 'active', 'PRO', 'active', 'paid', now() + interval '30 days', now()),
  ('7c300000-0000-4000-8000-000000000043', '7c300000-0000-4000-8000-000000000040', '7c300000-0000-4000-8000-000000000042', 'active', 'PRO', 'active', 'paid', now() + interval '30 days', now());

update public.commercial_plan_release_policy
set release_state = 'RELEASED', revision = revision + 1,
  founder_decision_ref = 'LOCAL_PHASE_7C3_FIXTURE', released_at = now(), updated_at = now()
where country_code = 'AT' and plan_key = 'PRO';

insert into public.restaurant_capacity_addon_entitlements (
  entitlement_key, revision, restaurant_id, organization_id, branch_id,
  addon_key, addon_version, units, status, effective_from, source, request_id, reason
) values
  ('7c300000-0000-4000-8000-000000000101', 1, '7c300000-0000-4000-8000-000000000021', '7c300000-0000-4000-8000-000000000020', '7c300000-0000-4000-8000-000000000022', 'OFFER_CAPACITY', 1, 1, 'ACTIVE', now() - interval '1 day', 'TEST_FIXTURE', '7c300000-0000-4000-8000-000000000201', 'Local Phase 7C.3 fixture'),
  ('7c300000-0000-4000-8000-000000000102', 1, '7c300000-0000-4000-8000-000000000041', '7c300000-0000-4000-8000-000000000040', '7c300000-0000-4000-8000-000000000042', 'OFFER_CAPACITY', 1, 1, 'ACTIVE', now() - interval '1 day', 'TEST_FIXTURE', '7c300000-0000-4000-8000-000000000202', 'Local Phase 7C.3 fixture');

insert into public.restaurant_offers (
  restaurant_id, branch_id, offer_type, title, short_description,
  valid_from, valid_to, status, is_active
)
select fixture.restaurant_id, fixture.branch_id, 'NEWS',
  'Baseline ' || series.value, 'Local capacity fixture',
  now() - interval '1 day', now() + interval '30 days', 'PUBLISHED', true
from (values
  ('7c300000-0000-4000-8000-000000000011'::uuid, '7c300000-0000-4000-8000-000000000012'::uuid, 4),
  ('7c300000-0000-4000-8000-000000000021'::uuid, '7c300000-0000-4000-8000-000000000022'::uuid, 9),
  ('7c300000-0000-4000-8000-000000000031'::uuid, '7c300000-0000-4000-8000-000000000032'::uuid, 14),
  ('7c300000-0000-4000-8000-000000000041'::uuid, '7c300000-0000-4000-8000-000000000042'::uuid, 19)
) fixture(restaurant_id, branch_id, amount)
cross join lateral generate_series(1, fixture.amount) series(value);

set local session_replication_role = origin;

do $test$
declare snapshot jsonb;
begin
  snapshot := public.resolve_restaurant_capacity_internal('7c300000-0000-4000-8000-000000000011', statement_timestamp());
  if snapshot#>>'{plan,plan_key}' <> 'BASIC' or snapshot#>>'{offers,effective_limit}' <> '5' or snapshot#>>'{offers,usage}' <> '4' then raise exception 'Basic fixture mismatch: %', snapshot; end if;
  snapshot := public.resolve_restaurant_capacity_internal('7c300000-0000-4000-8000-000000000021', statement_timestamp());
  if snapshot#>>'{offers,effective_limit}' <> '10' or snapshot#>>'{offers,usage}' <> '9' then raise exception 'Basic add-on fixture mismatch: %', snapshot; end if;
  snapshot := public.resolve_restaurant_capacity_internal('7c300000-0000-4000-8000-000000000031', statement_timestamp());
  if snapshot#>>'{plan,plan_key}' <> 'PRO' or snapshot#>>'{offers,effective_limit}' <> '15' or snapshot#>>'{offers,usage}' <> '14' then raise exception 'Pro fixture mismatch: %', snapshot; end if;
  snapshot := public.resolve_restaurant_capacity_internal('7c300000-0000-4000-8000-000000000041', statement_timestamp());
  if snapshot#>>'{offers,effective_limit}' <> '20' or snapshot#>>'{offers,usage}' <> '19' then raise exception 'Pro add-on fixture mismatch: %', snapshot; end if;
end;
$test$;

-- The last free slot succeeds in every canonical configuration.
insert into public.restaurant_offers (restaurant_id, branch_id, offer_type, title, short_description, valid_from, valid_to, status, is_active)
select restaurant_id, branch_id, 'NEWS', 'Last slot', 'Local capacity fixture', now() + interval '10 days', now() + interval '40 days', 'PUBLISHED', true
from (values
  ('7c300000-0000-4000-8000-000000000011'::uuid, '7c300000-0000-4000-8000-000000000012'::uuid),
  ('7c300000-0000-4000-8000-000000000021'::uuid, '7c300000-0000-4000-8000-000000000022'::uuid),
  ('7c300000-0000-4000-8000-000000000031'::uuid, '7c300000-0000-4000-8000-000000000032'::uuid),
  ('7c300000-0000-4000-8000-000000000041'::uuid, '7c300000-0000-4000-8000-000000000042'::uuid)
) fixture(restaurant_id, branch_id);

select pg_temp.expect_capacity_error($$insert into public.restaurant_offers
  (restaurant_id,branch_id,offer_type,title,short_description,valid_from,valid_to,status,is_active)
  values ('7c300000-0000-4000-8000-000000000011','7c300000-0000-4000-8000-000000000012','NEWS','Overflow','Overflow',now(),now()+interval '1 day','PUBLISHED',true)$$);
select pg_temp.expect_capacity_error($$insert into public.restaurant_offers
  (restaurant_id,branch_id,offer_type,title,short_description,valid_from,valid_to,status,is_active)
  values ('7c300000-0000-4000-8000-000000000021','7c300000-0000-4000-8000-000000000022','NEWS','Overflow','Overflow',now(),now()+interval '1 day','PUBLISHED',true)$$);
select pg_temp.expect_capacity_error($$insert into public.restaurant_offers
  (restaurant_id,branch_id,offer_type,title,short_description,valid_from,valid_to,status,is_active)
  values ('7c300000-0000-4000-8000-000000000031','7c300000-0000-4000-8000-000000000032','NEWS','Overflow','Overflow',now(),now()+interval '1 day','PUBLISHED',true)$$);
select pg_temp.expect_capacity_error($$insert into public.restaurant_offers
  (restaurant_id,branch_id,offer_type,title,short_description,valid_from,valid_to,status,is_active)
  values ('7c300000-0000-4000-8000-000000000041','7c300000-0000-4000-8000-000000000042','NEWS','Overflow','Overflow',now(),now()+interval '1 day','PUBLISHED',true)$$);

-- Draft, disabled, archived and expired rows do not consume capacity.
insert into public.restaurant_offers (id, restaurant_id, branch_id, offer_type, title, short_description, valid_from, valid_to, status, is_active) values
  ('7c300000-0000-4000-8000-000000000301', '7c300000-0000-4000-8000-000000000011', '7c300000-0000-4000-8000-000000000012', 'NEWS', 'Draft at limit', 'Draft', now(), now() + interval '1 day', 'DRAFT', false),
  ('7c300000-0000-4000-8000-000000000302', '7c300000-0000-4000-8000-000000000011', '7c300000-0000-4000-8000-000000000012', 'NEWS', 'Disabled at limit', 'Disabled', now(), now() + interval '1 day', 'DISABLED', false),
  ('7c300000-0000-4000-8000-000000000303', '7c300000-0000-4000-8000-000000000011', '7c300000-0000-4000-8000-000000000012', 'NEWS', 'Archived at limit', 'Archived', now(), now() + interval '1 day', 'ARCHIVED', false),
  ('7c300000-0000-4000-8000-000000000304', '7c300000-0000-4000-8000-000000000011', '7c300000-0000-4000-8000-000000000012', 'NEWS', 'Expired at limit', 'Expired', now() - interval '2 days', now() - interval '1 day', 'PUBLISHED', true);

select pg_temp.expect_capacity_error($$update public.restaurant_offers set status='PUBLISHED',is_active=true where id='7c300000-0000-4000-8000-000000000301'$$);
select pg_temp.expect_capacity_error($$update public.restaurant_offers set status='PUBLISHED',is_active=true where id='7c300000-0000-4000-8000-000000000302'$$);
select pg_temp.expect_capacity_error($$update public.restaurant_offers set status='PUBLISHED',is_active=true where id='7c300000-0000-4000-8000-000000000303'$$);
select pg_temp.expect_capacity_error($$update public.restaurant_offers set valid_to=now()+interval '1 day' where id='7c300000-0000-4000-8000-000000000304'$$);

-- Capacity-reducing mutations and an edit of an already counted row always remain possible.
update public.restaurant_offers set title = title || ' edited'
where restaurant_id = '7c300000-0000-4000-8000-000000000011' and status = 'PUBLISHED' and valid_to > now();
update public.restaurant_offers set status = 'DISABLED', is_active = false
where id = (select id from public.restaurant_offers where restaurant_id = '7c300000-0000-4000-8000-000000000011' and status='PUBLISHED' and valid_to>now() limit 1);
update public.restaurant_offers set status='PUBLISHED', is_active=true
where id='7c300000-0000-4000-8000-000000000301';
delete from public.restaurant_offers where id='7c300000-0000-4000-8000-000000000303';

-- A bulk statement cannot partially consume the final slot.
update public.restaurant_offers set status='DISABLED', is_active=false
where id=(select id from public.restaurant_offers where restaurant_id='7c300000-0000-4000-8000-000000000011' and status='PUBLISHED' and valid_to>now() limit 1);
select pg_temp.expect_capacity_error($$insert into public.restaurant_offers
  (restaurant_id,branch_id,offer_type,title,short_description,valid_from,valid_to,status,is_active)
  values
  ('7c300000-0000-4000-8000-000000000011','7c300000-0000-4000-8000-000000000012','NEWS','Bulk one','Bulk',now(),now()+interval '1 day','PUBLISHED',true),
  ('7c300000-0000-4000-8000-000000000011','7c300000-0000-4000-8000-000000000012','NEWS','Bulk two','Bulk',now(),now()+interval '1 day','PUBLISHED',true)$$);
do $test$ begin
  if (select count(*) from public.restaurant_offers where restaurant_id='7c300000-0000-4000-8000-000000000011' and title like 'Bulk %') <> 0 then
    raise exception 'multi-row statement partially committed';
  end if;
end $test$;

-- Grandfathered over-limit rows can be edited and reduced.
set local session_replication_role = replica;
insert into public.restaurant_offers (id, restaurant_id, branch_id, offer_type, title, short_description, valid_from, valid_to, status, is_active)
values ('7c300000-0000-4000-8000-000000000305','7c300000-0000-4000-8000-000000000011','7c300000-0000-4000-8000-000000000012','NEWS','Grandfathered','Over limit',now(),now()+interval '1 day','PUBLISHED',true);
set local session_replication_role = origin;
update public.restaurant_offers set title='Grandfathered edited' where id='7c300000-0000-4000-8000-000000000305';
update public.restaurant_offers set status='ARCHIVED',is_active=false where id='7c300000-0000-4000-8000-000000000305';

-- Tenant identity is immutable and browser roles cannot bypass RPC/table security.
do $test$ begin
  begin
    update public.restaurant_offers set restaurant_id='7c300000-0000-4000-8000-000000000021'
    where id='7c300000-0000-4000-8000-000000000301';
    raise exception 'tenant mutation unexpectedly succeeded';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'OFFER_TENANT_IMMUTABLE' then raise; end if;
  end;
end $test$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7c300000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $test$
declare snapshot jsonb;
begin
  snapshot := public.get_restaurant_capacity('7c300000-0000-4000-8000-000000000011');
  if not (snapshot->>'write_enforcement_active')::boolean then
    raise exception 'public capacity read did not report active write enforcement';
  end if;
end $test$;
select set_config('request.jwt.claims', '{"sub":"7c300000-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $test$ begin
  begin
    perform public.get_restaurant_capacity('7c300000-0000-4000-8000-000000000011');
    raise exception 'cross-tenant capacity read unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.restaurant_offers set title=title where restaurant_id='7c300000-0000-4000-8000-000000000011';
    raise exception 'authenticated direct DML unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end $test$;
reset role;

rollback;
select 'PHASE_7C3_LOCAL_SQL_MATRIX_PASS';
