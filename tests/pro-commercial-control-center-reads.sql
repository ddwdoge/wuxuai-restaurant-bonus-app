-- LOCAL ONLY: Phase 7B.3A read model, authorization and lifecycle matrix.
\set ON_ERROR_STOP on
\ir pro-commercial-release-lock-base.sql

create table public.organizations (
  id uuid primary key,
  owner_id uuid not null,
  name text not null
);
alter table public.branches
  add column name text not null default 'Synthetic location',
  add column city text,
  add column postal_code text;
create or replace function public.country_launch_readiness_snapshot(input_country text)
returns jsonb language sql stable as $function$
  select jsonb_build_object('country_code', input_country, 'ready', false, 'checks', '[]'::jsonb)
$function$;

insert into auth.users(id) values
  ('74000000-0000-4000-8000-000000000090'),
  ('74000000-0000-4000-8000-000000000091'),
  ('74000000-0000-4000-8000-000000000092');
insert into public.organizations(id,owner_id,name) values
  ('74000000-0000-4000-8000-000000000010','74000000-0000-4000-8000-000000000091','Real Gastro GmbH'),
  ('74000000-0000-4000-8000-000000000020','74000000-0000-4000-8000-000000000092','Internal Test Org'),
  ('74000000-0000-4000-8000-000000000030','74000000-0000-4000-8000-000000000091','Expired Trial Org'),
  ('74000000-0000-4000-8000-000000000040','74000000-0000-4000-8000-000000000091','Scheduled Trial Org');
insert into public.restaurants(id,organization_id,primary_branch_id,name,owner_id) values
  ('74000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000010','74000000-0000-4000-8000-000000000002','Real Vienna Bistro','74000000-0000-4000-8000-000000000091'),
  ('74000000-0000-4000-8000-000000000011','74000000-0000-4000-8000-000000000020','74000000-0000-4000-8000-000000000012','Technical Fixture','74000000-0000-4000-8000-000000000092'),
  ('74000000-0000-4000-8000-000000000021','74000000-0000-4000-8000-000000000030','74000000-0000-4000-8000-000000000022','Berlin Cafe','74000000-0000-4000-8000-000000000091'),
  ('74000000-0000-4000-8000-000000000031','74000000-0000-4000-8000-000000000040','74000000-0000-4000-8000-000000000032','Salzburg Cafe','74000000-0000-4000-8000-000000000091');
insert into public.branches(id,restaurant_id,organization_id,country,name,city,postal_code) values
  ('74000000-0000-4000-8000-000000000002','74000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000010','AT','Vienna Center','Wien','1010'),
  ('74000000-0000-4000-8000-000000000012','74000000-0000-4000-8000-000000000011','74000000-0000-4000-8000-000000000020','DE','Test Lab','Berlin','10115'),
  ('74000000-0000-4000-8000-000000000022','74000000-0000-4000-8000-000000000021','74000000-0000-4000-8000-000000000030','DE','Berlin Mitte','Berlin','10117'),
  ('74000000-0000-4000-8000-000000000032','74000000-0000-4000-8000-000000000031','74000000-0000-4000-8000-000000000040','AT','Salzburg Mitte','Salzburg','5020');
insert into public.branch_subscriptions(
  id,organization_id,branch_id,status,plan_key,subscription_status,payment_status,
  trial_started_at,trial_ends_at,current_period_end,created_at
) values
  ('74000000-0000-4000-8000-000000000003','74000000-0000-4000-8000-000000000010','74000000-0000-4000-8000-000000000002','active','PRO','active','paid',null,null,clock_timestamp()+interval '30 days',clock_timestamp()-interval '30 days'),
  ('74000000-0000-4000-8000-000000000013','74000000-0000-4000-8000-000000000020','74000000-0000-4000-8000-000000000012','active','BASIC','active','manual',null,null,null,clock_timestamp()-interval '30 days'),
  ('74000000-0000-4000-8000-000000000023','74000000-0000-4000-8000-000000000030','74000000-0000-4000-8000-000000000022','trialing','PRO','trialing','not_required',clock_timestamp()-interval '60 days',clock_timestamp()-interval '30 days',null,clock_timestamp()-interval '60 days'),
  ('74000000-0000-4000-8000-000000000033','74000000-0000-4000-8000-000000000040','74000000-0000-4000-8000-000000000032','trialing','PRO','trialing','not_required',clock_timestamp()+interval '1 day',clock_timestamp()+interval '31 days',null,clock_timestamp());
insert into public.platform_test_tenant_registry(
  restaurant_id,restaurant_name,organization_id,owner_user_id,test_session_id,marked_by
) values (
  '74000000-0000-4000-8000-000000000011','Technical Fixture',
  '74000000-0000-4000-8000-000000000020','74000000-0000-4000-8000-000000000092',
  'phase7b3a-test','74000000-0000-4000-8000-000000000090'
);

\ir ../supabase/migrations/20260915001000_pro_commercial_release_lock.sql

insert into public.commercial_pro_access_grants(
  id,restaurant_id,organization_id,access_kind,starts_at,expires_at,reason,created_by,
  revoked_by,revoked_at,revoke_reason,request_id
) values
  ('74000000-0000-4000-8000-000000000101','74000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000010','REAL_BUSINESS_PILOT',clock_timestamp()-interval '1 day',clock_timestamp()+interval '29 days','Active synthetic pilot reason','74000000-0000-4000-8000-000000000090',null,null,null,'74000000-0000-4000-8000-000000000201'),
  ('74000000-0000-4000-8000-000000000102','74000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000010','REAL_BUSINESS_PILOT',clock_timestamp()-interval '60 days',clock_timestamp()-interval '30 days','Expired synthetic pilot reason','74000000-0000-4000-8000-000000000090',null,null,null,'74000000-0000-4000-8000-000000000202'),
  ('74000000-0000-4000-8000-000000000103','74000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000010','REAL_BUSINESS_PILOT',clock_timestamp()-interval '10 days',clock_timestamp()+interval '20 days','Revoked synthetic pilot reason','74000000-0000-4000-8000-000000000090','74000000-0000-4000-8000-000000000090',clock_timestamp()-interval '1 day','Synthetic revocation reason','74000000-0000-4000-8000-000000000203'),
  ('74000000-0000-4000-8000-000000000104','74000000-0000-4000-8000-000000000031','74000000-0000-4000-8000-000000000040','REAL_BUSINESS_PILOT',clock_timestamp()+interval '1 day',clock_timestamp()+interval '31 days','Scheduled synthetic pilot reason','74000000-0000-4000-8000-000000000090',null,null,null,'74000000-0000-4000-8000-000000000204'),
  ('74000000-0000-4000-8000-000000000105','74000000-0000-4000-8000-000000000011','74000000-0000-4000-8000-000000000020','INTERNAL_TEST_ONLY',clock_timestamp()-interval '1 day',clock_timestamp()+interval '6 days','Active internal test reason','74000000-0000-4000-8000-000000000090',null,null,null,'74000000-0000-4000-8000-000000000205');

update public.commercial_plan_release_policy
set updated_at = clock_timestamp() - interval '1 hour'
where country_code = 'AT' and plan_key = 'PRO';
insert into public.commercial_pro_access_audit(
  actor_id,actor_role,action_type,country_code,restaurant_id,organization_id,
  access_grant_id,request_id,reason,before_state,after_state,created_at
) values
  ('74000000-0000-4000-8000-000000000090','platform_admin','COUNTRY_PRO_LOCKED','AT',null,null,null,
   '74000000-0000-4000-8000-000000000301','Synthetic country remains locked',
   '{"release_state":"LOCKED"}'::jsonb,'{"release_state":"LOCKED"}'::jsonb,clock_timestamp()-interval '1 hour'),
  ('74000000-0000-4000-8000-000000000090','platform_admin','PRO_ACCESS_GRANTED','AT',
   '74000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000010',
   '74000000-0000-4000-8000-000000000101','74000000-0000-4000-8000-000000000302',
   'Active synthetic pilot reason',null,
   '{"access_kind":"REAL_BUSINESS_PILOT","expires_at":"2099-01-01T00:00:00Z"}'::jsonb,
   clock_timestamp()-interval '30 minutes');

\ir ../supabase/migrations/20260915002000_pro_commercial_control_center_reads.sql
\ir ../supabase/migrations/20260915002000_pro_commercial_control_center_reads.sql

set role authenticated;
set test.actor = '74000000-0000-4000-8000-000000000090';
set test.platform_role = 'platform_admin';

select public.test_assert(
  public.get_platform_pro_country_status('AT')#>>'{items,0,release_state}' = 'LOCKED'
  and public.get_platform_pro_country_status('AT')#>>'{items,0,last_actor_role}' = 'platform_admin'
  and public.get_platform_pro_country_status('AT')#>>'{items,0,last_reason}' = 'Synthetic country remains locked'
  and (public.get_platform_pro_country_status('AT')#>>'{items,0,active_paid_count}')::integer = 1
  and (public.get_platform_pro_country_status('AT')#>>'{items,0,active_pilot_count}')::integer = 1,
  'country read stays locked and exposes last actor reason and active counts'
);
select public.test_assert(
  (public.get_platform_pro_entitlements(null,null,null,null,100,0)->>'total')::integer = 8
  and (public.get_platform_pro_entitlements(null,null,'active',null,100,0)->>'total')::integer = 3
  and (public.get_platform_pro_entitlements(null,null,'expired',null,100,0)->>'total')::integer = 2
  and (public.get_platform_pro_entitlements(null,null,'revoked',null,100,0)->>'total')::integer = 1
  and (public.get_platform_pro_entitlements(null,null,'scheduled',null,100,0)->>'total')::integer = 2,
  'paid trial pilot and TEST_ONLY inventory classifies all states'
);
select public.test_assert(
  (public.search_platform_pro_real_businesses(null,null,100,0)->>'total')::integer = 3
  and (public.search_platform_pro_real_businesses(null,'DE',100,0)->>'total')::integer = 1
  and (public.get_platform_pro_test_only_businesses(null,null,100,0)->>'total')::integer = 1
  and public.get_platform_pro_test_only_businesses(null,null,100,0)#>>'{items,0,business_name}' = 'Technical Fixture',
  'real business and exact TEST_ONLY lists are disjoint and country filtered'
);
select public.test_assert(
  (public.get_platform_pro_commercial_audit('AT',null,null,100,0)->>'total')::integer = 2
  and public.get_platform_pro_commercial_audit('AT','COUNTRY_PRO_LOCKED',null,100,0)#>>'{items,0,result}' = 'SUCCESS'
  and public.get_platform_pro_commercial_audit('AT','COUNTRY_PRO_LOCKED',null,100,0)#>>'{items,0,idempotency_reference}' = '74000000-0000-4000-8000-000000000301',
  'commercial audit is complete filterable and has idempotency evidence'
);
select public.test_assert(
  jsonb_array_length(public.get_platform_pro_entitlements(null,null,null,null,500,0)->'items') <= 100
  and public.get_platform_pro_entitlements(null,null,null,null,2,0)->'items'
    = public.get_platform_pro_entitlements(null,null,null,null,2,0)->'items',
  'pagination is capped and sorting is stable'
);

reset role;
do $block$
declare before_grants bigint; before_audit bigint; before_policy jsonb;
begin
  select count(*) into before_grants from public.commercial_pro_access_grants;
  select count(*) into before_audit from public.commercial_pro_access_audit;
  select jsonb_agg(to_jsonb(policy) order by country_code) into before_policy
    from public.commercial_plan_release_policy policy;
  perform public.get_platform_pro_country_status(null);
  perform public.get_platform_pro_entitlements(null,null,null,null,50,0);
  perform public.search_platform_pro_real_businesses(null,null,50,0);
  perform public.get_platform_pro_test_only_businesses(null,null,50,0);
  perform public.get_platform_pro_commercial_audit(null,null,null,50,0);
  perform public.test_assert(before_grants = (select count(*) from public.commercial_pro_access_grants)
    and before_audit = (select count(*) from public.commercial_pro_access_audit)
    and before_policy = (select jsonb_agg(to_jsonb(policy) order by country_code)
      from public.commercial_plan_release_policy policy),
    'all control-center reads are side-effect free');
end
$block$;

set role authenticated;
do $block$
declare role_name text;
begin
  foreach role_name in array array['owner','staff','customer',''] loop
    perform set_config('test.platform_role',role_name,true);
    perform public.test_block(
      $$select public.get_platform_pro_country_status(null)$$,
      '42501',coalesce(nullif(role_name,''),'roleless authenticated')||' cannot read PRO control center'
    );
  end loop;
end
$block$;

set test.platform_role = 'platform_admin';
select public.test_block(
  $$select public.get_platform_pro_country_status('AUT')$$,
  '22023','invalid country filter is rejected'
);
select public.test_block(
  $$select public.get_platform_pro_entitlements(null,'unknown',null,null,50,0)$$,
  '22023','invalid entitlement type filter is rejected'
);
select public.test_block(
  $$update public.commercial_pro_access_grants set reason='Browser mutation attempt'$$,
  '42501','authenticated browser direct grant DML remains blocked'
);
reset role;

set role anon;
select public.test_block(
  $$select public.get_platform_pro_country_status(null)$$,
  '42501','anonymous caller has no control-center execute grant'
);
reset role;

select public.test_block(
  $$update public.commercial_pro_access_audit set reason='Tamper attempt'$$,
  '42501','commercial audit remains append-only after read migration'
);
select public.test_assert(
  (select release_state = 'LOCKED' from public.commercial_plan_release_policy
    where country_code = 'AT' and plan_key = 'PRO'),
  'AT PRO remains locked'
);
