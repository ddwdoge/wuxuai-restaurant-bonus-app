-- LOCAL ONLY: fresh synthetic current-schema path, never a remote database.
\set ON_ERROR_STOP on
\ir pro-commercial-release-lock-base.sql
\ir ../supabase/migrations/20260915001000_pro_commercial_release_lock.sql

select public.test_assert(
  (select count(*) = 6 and bool_and(plan_key = 'PRO'
    and release_state = 'LOCKED' and revision = 1)
   from public.commercial_plan_release_policy),
  'fresh policy is independently locked for every configured country'
);
select public.test_assert(
  (select relrowsecurity from pg_class where oid = 'public.commercial_plan_release_policy'::regclass),
  'release policy RLS enabled'
);
select public.test_assert(
  not has_table_privilege('authenticated','public.commercial_plan_release_policy','SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('service_role','public.commercial_plan_release_policy','SELECT,INSERT,UPDATE,DELETE'),
  'browser and service roles have no release policy table authority'
);
select public.test_assert(
  not has_function_privilege('authenticated','public.resolve_commercial_plan_release_internal(uuid,text)','EXECUTE')
  and not has_function_privilege('service_role','public.resolve_commercial_plan_release_internal(uuid,text)','EXECUTE'),
  'internal release resolver is not a direct API'
);
select public.test_assert(
  has_function_privilege('authenticated',
    'public.set_platform_commercial_pro_country_release(text,boolean,text,text,uuid)','EXECUTE')
  and not has_function_privilege('anon',
    'public.set_platform_commercial_pro_country_release(text,boolean,text,text,uuid)','EXECUTE'),
  'country mutator is authenticated RPC only'
);

insert into auth.users(id) values
  ('70000000-0000-4000-8000-000000000098'),
  ('71000000-0000-4000-8000-000000000099');
insert into public.restaurants(id,organization_id,primary_branch_id,name,owner_id) values
  ('71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000010','71000000-0000-4000-8000-000000000002','AT Real Bistro','70000000-0000-4000-8000-000000000098'),
  ('71000000-0000-4000-8000-000000000011','71000000-0000-4000-8000-000000000020','71000000-0000-4000-8000-000000000012','DE WUXUAI TEST Bistro','70000000-0000-4000-8000-000000000098');
insert into public.branches values
  ('71000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000010','AT'),
  ('71000000-0000-4000-8000-000000000012','71000000-0000-4000-8000-000000000011','71000000-0000-4000-8000-000000000020','DE');
insert into public.branch_subscriptions(id,organization_id,branch_id,status,plan_key,subscription_status,payment_status,trial_started_at,trial_ends_at)
values
  ('71000000-0000-4000-8000-000000000003','71000000-0000-4000-8000-000000000010','71000000-0000-4000-8000-000000000002','trialing','BASIC','trialing','not_required',now(),now()+interval '3 months'),
  ('71000000-0000-4000-8000-000000000013','71000000-0000-4000-8000-000000000020','71000000-0000-4000-8000-000000000012','trialing','BASIC','trialing','not_required',now(),now()+interval '3 months');

select public.test_assert(
  public.resolve_restaurant_entitlements_internal('71000000-0000-4000-8000-000000000001')#>>'{commercial_release,release_state}' = 'LOCKED'
  and public.resolve_restaurant_entitlements_internal('71000000-0000-4000-8000-000000000001')->>'plan_key' = 'BASIC'
  and public.resolve_restaurant_entitlements_internal('71000000-0000-4000-8000-000000000001')#>>'{effective,offer_limit}' = '5',
  'fresh AT Basic remains Basic while PRO locked'
);
select public.test_assert(
  public.resolve_restaurant_entitlements_internal('71000000-0000-4000-8000-000000000011')#>>'{commercial_release,release_state}' = 'LOCKED',
  'DE remains independently locked'
);
select public.test_block(
  $$insert into public.commercial_plan_release_policy(country_code,plan_key,release_state,revision)
    values('DE','PRO','RELEASED',1)$$,
  '23514', 'invalid RELEASED policy is rejected'
);

set role service_role;
select public.test_block(
  $$update public.commercial_plan_release_policy set release_state='RELEASED' where country_code='AT' and plan_key='PRO'$$,
  '42501', 'service role cannot mutate release policy'
);
select public.test_block(
  $$update public.branch_subscriptions set plan_key='PRO'
    where id='71000000-0000-4000-8000-000000000013'$$,
  '42501', 'direct subscription PRO elevation blocked'
);
select public.test_block(
  $$insert into public.branch_entitlement_overrides(subscription_id,offer_limit_unlimited,offer_notifications,reward_notifications)
    values('71000000-0000-4000-8000-000000000003',true,true,true)$$,
  '42501', 'direct feature PRO elevation blocked'
);
reset role;

set role authenticated;
set test.actor = '71000000-0000-4000-8000-000000000099';
set test.platform_role = 'platform_admin';
select public.test_block(
  $$select public.set_platform_restaurant_plan_override(
    '71000000-0000-4000-8000-000000000001','PRO',now()+interval '1 month',
    'Synthetic local security test','CONFIRMED','71000000-0000-4000-8000-000000000090',null)$$,
  '42501', 'Platform Admin activation RPC blocked'
);
select public.test_block(
  $$select public.resolve_commercial_plan_release_internal(
    '71000000-0000-4000-8000-000000000001','PRO')$$,
  '42501', 'Platform Admin cannot call internal policy resolver'
);
set test.platform_role = '';
set test.restaurant_id = '71000000-0000-4000-8000-000000000001';
select public.test_assert(
  public.get_restaurant_entitlements('71000000-0000-4000-8000-000000000001')->>'plan_key' = 'BASIC',
  'Owner reads own locked Basic result'
);
select public.test_block(
  $$select public.get_restaurant_entitlements('71000000-0000-4000-8000-000000000011')$$,
  '42501', 'cross-tenant direct URL/RPC read blocked'
);
reset role;

delete from public.commercial_plan_release_policy where country_code='AT' and plan_key='PRO';
select public.test_assert(
  public.resolve_restaurant_entitlements_internal('71000000-0000-4000-8000-000000000001')->>'plan_key' = 'BASIC'
  and public.resolve_restaurant_entitlements_internal('71000000-0000-4000-8000-000000000001')#>>'{commercial_release,reason_code}' = 'PRO_COMMERCIAL_POLICY_MISSING',
  'deleted policy still fails closed to Basic'
);
