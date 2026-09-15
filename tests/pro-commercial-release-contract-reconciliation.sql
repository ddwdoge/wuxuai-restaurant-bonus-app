-- LOCAL ONLY: Phase 7B.1A country, pilot, TEST_ONLY and audit matrix.
\set ON_ERROR_STOP on
\ir pro-commercial-release-lock-base.sql
\ir ../supabase/migrations/20260915001000_pro_commercial_release_lock.sql

insert into auth.users(id) values
  ('73000000-0000-4000-8000-000000000090'),
  ('73000000-0000-4000-8000-000000000091'),
  ('73000000-0000-4000-8000-000000000092');
insert into public.restaurants(id,organization_id,primary_branch_id,name,owner_id) values
  ('73000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000010','73000000-0000-4000-8000-000000000002','AT Pilot Bistro','73000000-0000-4000-8000-000000000091'),
  ('73000000-0000-4000-8000-000000000011','73000000-0000-4000-8000-000000000020','73000000-0000-4000-8000-000000000012','DE WUXUAI TEST Bistro','73000000-0000-4000-8000-000000000092'),
  ('73000000-0000-4000-8000-000000000021','73000000-0000-4000-8000-000000000030','73000000-0000-4000-8000-000000000022','DE Unmarked Bistro','73000000-0000-4000-8000-000000000092');
insert into public.branches values
  ('73000000-0000-4000-8000-000000000002','73000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000010','AT'),
  ('73000000-0000-4000-8000-000000000012','73000000-0000-4000-8000-000000000011','73000000-0000-4000-8000-000000000020','DE'),
  ('73000000-0000-4000-8000-000000000022','73000000-0000-4000-8000-000000000021','73000000-0000-4000-8000-000000000030','DE');
insert into public.branch_subscriptions(id,organization_id,branch_id,status,plan_key,subscription_status,payment_status,trial_started_at,trial_ends_at) values
  ('73000000-0000-4000-8000-000000000003','73000000-0000-4000-8000-000000000010','73000000-0000-4000-8000-000000000002','active','BASIC','active','manual',null,null),
  ('73000000-0000-4000-8000-000000000013','73000000-0000-4000-8000-000000000020','73000000-0000-4000-8000-000000000012','active','BASIC','active','manual',null,null),
  ('73000000-0000-4000-8000-000000000023','73000000-0000-4000-8000-000000000030','73000000-0000-4000-8000-000000000022','active','BASIC','active','manual',null,null);
insert into public.platform_test_tenant_registry(
  restaurant_id,restaurant_name,organization_id,owner_user_id,test_session_id,marked_by
) values (
  '73000000-0000-4000-8000-000000000011','DE WUXUAI TEST Bistro',
  '73000000-0000-4000-8000-000000000020','73000000-0000-4000-8000-000000000092',
  'phase7b1a-de-test','73000000-0000-4000-8000-000000000090'
);

set role authenticated;
set test.actor = '73000000-0000-4000-8000-000000000090';
set test.platform_role = 'platform_admin';
select set_config('test.jwt',jsonb_build_object(
  'sub','73000000-0000-4000-8000-000000000090','session_id','stale-session',
  'auth_time',extract(epoch from clock_timestamp()-interval '1 hour')::bigint
)::text,false);
select public.test_block(
  $$select public.set_platform_commercial_pro_country_release(
    'AT',true,'Synthetic country release reason','PRO AT FREIGEBEN',
    '73000000-0000-4000-8000-000000000100')$$,
  '42501','stale Platform Admin authentication is rejected'
);

select set_config('test.jwt',jsonb_build_object(
  'sub','73000000-0000-4000-8000-000000000090','session_id','recent-session',
  'auth_time',extract(epoch from clock_timestamp())::bigint
)::text,false);
select public.set_platform_commercial_pro_country_release(
  'AT',true,'Synthetic country release reason','PRO AT FREIGEBEN',
  '73000000-0000-4000-8000-000000000100');
select public.test_assert(
  public.get_platform_commercial_pro_status('AT')#>>'{policies,0,release_state}'='RELEASED'
  and public.get_platform_commercial_pro_status('DE')#>>'{policies,0,release_state}'='LOCKED',
  'AT release is country-isolated and DE stays locked'
);
select public.test_assert(
  public.get_restaurant_entitlements('73000000-0000-4000-8000-000000000001')->>'plan_key'='BASIC',
  'country release alone never upgrades a Basic restaurant'
);

reset role;
set role service_role;
update public.branch_subscriptions set
  plan_key='PRO',subscription_status='trialing',payment_status='not_required',
  trial_started_at=clock_timestamp()-interval '1 day',
  trial_ends_at=clock_timestamp()+interval '30 days'
where id='73000000-0000-4000-8000-000000000003';
reset role;
set role authenticated;
set test.actor = '73000000-0000-4000-8000-000000000090';
set test.platform_role = 'platform_admin';
select set_config('test.jwt',jsonb_build_object(
  'sub','73000000-0000-4000-8000-000000000090','session_id','recent-session',
  'auth_time',extract(epoch from clock_timestamp())::bigint
)::text,false);
select public.test_assert(
  public.get_restaurant_entitlements('73000000-0000-4000-8000-000000000001')->>'plan_key'='PRO',
  'valid trial grants PRO only after country release'
);
reset role;
set role service_role;
update public.branch_subscriptions set plan_key='BASIC',subscription_status='active',
  payment_status='manual',trial_started_at=null,trial_ends_at=null
where id='73000000-0000-4000-8000-000000000003';
reset role;
set role authenticated;
set test.actor = '73000000-0000-4000-8000-000000000090';
set test.platform_role = 'platform_admin';
select set_config('test.jwt',jsonb_build_object(
  'sub','73000000-0000-4000-8000-000000000090','session_id','recent-session',
  'auth_time',extract(epoch from clock_timestamp())::bigint
)::text,false);

select public.set_platform_commercial_pro_access(
  '73000000-0000-4000-8000-000000000001','REAL_BUSINESS_PILOT','GRANT',
  clock_timestamp()-interval '1 minute',clock_timestamp()+interval '30 days',
  'Synthetic real business pilot','PRO PILOT AT Pilot Bistro FREIGEBEN',
  '73000000-0000-4000-8000-000000000101');
select public.test_assert(
  public.get_restaurant_entitlements('73000000-0000-4000-8000-000000000001')->>'plan_key'='PRO'
  and public.get_restaurant_entitlements('73000000-0000-4000-8000-000000000001')#>>'{commercial_access,real_business_pilot}'='true',
  'real business pilot grants PRO only in released country'
);
select public.set_platform_commercial_pro_access(
  '73000000-0000-4000-8000-000000000001','REAL_BUSINESS_PILOT','EXTEND',
  null,clock_timestamp()+interval '60 days','Synthetic pilot extension reason',
  'PRO PILOT AT Pilot Bistro VERLAENGERN','73000000-0000-4000-8000-000000000102');
select public.set_platform_commercial_pro_access(
  '73000000-0000-4000-8000-000000000001','REAL_BUSINESS_PILOT','REVOKE',
  null,null,'Synthetic pilot revocation reason','PRO PILOT AT Pilot Bistro WIDERRUFEN',
  '73000000-0000-4000-8000-000000000103');
select public.test_assert(
  public.get_restaurant_entitlements('73000000-0000-4000-8000-000000000001')->>'plan_key'='BASIC',
  'pilot revocation returns effective plan to Basic without deleting state'
);

select public.set_platform_commercial_pro_access(
  '73000000-0000-4000-8000-000000000011','INTERNAL_TEST_ONLY','GRANT',
  clock_timestamp()-interval '1 minute',clock_timestamp()+interval '30 days',
  'Synthetic internal test access','PRO TEST_ONLY DE WUXUAI TEST Bistro FREIGEBEN',
  '73000000-0000-4000-8000-000000000104');
select public.test_assert(
  public.get_restaurant_entitlements('73000000-0000-4000-8000-000000000011')->>'plan_key'='PRO'
  and public.get_restaurant_entitlements('73000000-0000-4000-8000-000000000011')#>>'{commercial_release,release_state}'='LOCKED'
  and public.get_restaurant_entitlements('73000000-0000-4000-8000-000000000011')#>>'{commercial_access,internal_test_only}'='true',
  'server-confirmed TEST_ONLY access works before country release'
);
select public.test_block(
  $$select public.set_platform_commercial_pro_access(
    '73000000-0000-4000-8000-000000000021','INTERNAL_TEST_ONLY','GRANT',
    clock_timestamp(),clock_timestamp()+interval '30 days','Synthetic unmarked test denial',
    'PRO TEST_ONLY DE Unmarked Bistro FREIGEBEN','73000000-0000-4000-8000-000000000105')$$,
  '42501','unmarked restaurant cannot receive TEST_ONLY access'
);
select public.test_block(
  $$select public.set_platform_commercial_pro_access(
    '73000000-0000-4000-8000-000000000021','REAL_BUSINESS_PILOT','GRANT',
    clock_timestamp(),clock_timestamp()+interval '30 days','Synthetic locked pilot denial',
    'PRO PILOT DE Unmarked Bistro FREIGEBEN','73000000-0000-4000-8000-000000000106')$$,
  '42501','real business pilot cannot bypass locked country'
);
select public.set_platform_commercial_pro_access(
  '73000000-0000-4000-8000-000000000011','INTERNAL_TEST_ONLY','REVOKE',
  null,null,'Synthetic internal test revocation',
  'PRO TEST_ONLY DE WUXUAI TEST Bistro WIDERRUFEN',
  '73000000-0000-4000-8000-000000000107');
select public.test_assert(
  public.get_restaurant_entitlements('73000000-0000-4000-8000-000000000011')->>'plan_key'='BASIC',
  'TEST_ONLY revocation returns the locked-country restaurant to Basic'
);

select public.set_platform_commercial_pro_access(
  '73000000-0000-4000-8000-000000000001','REAL_BUSINESS_PILOT','GRANT',
  clock_timestamp()-interval '1 second',clock_timestamp()+interval '2 seconds',
  'Synthetic expiring pilot access','PRO PILOT AT Pilot Bistro FREIGEBEN',
  '73000000-0000-4000-8000-000000000108');
select pg_sleep(2.2);
select public.test_assert(
  public.get_restaurant_entitlements('73000000-0000-4000-8000-000000000001')->>'plan_key'='BASIC',
  'pilot expires automatically to Basic'
);

reset role;
set role service_role;
update public.branch_subscriptions set plan_key='PRO',subscription_status='active',
  payment_status='paid',current_period_end=clock_timestamp()+interval '30 days'
where id='73000000-0000-4000-8000-000000000003';
reset role;
set role authenticated;
set test.actor = '73000000-0000-4000-8000-000000000090';
set test.platform_role = 'platform_admin';
select set_config('test.jwt',jsonb_build_object(
  'sub','73000000-0000-4000-8000-000000000090','session_id','recent-session',
  'auth_time',extract(epoch from clock_timestamp())::bigint
)::text,false);
select public.test_assert(
  public.get_restaurant_entitlements('73000000-0000-4000-8000-000000000001')->>'plan_key'='PRO',
  'valid paid subscription grants PRO only while country is released'
);
select public.set_platform_commercial_pro_access(
  '73000000-0000-4000-8000-000000000001','REAL_BUSINESS_PILOT','GRANT',
  clock_timestamp(),clock_timestamp()+interval '30 days',
  'Synthetic pilot before country relock','PRO PILOT AT Pilot Bistro FREIGEBEN',
  '73000000-0000-4000-8000-000000000113');

select public.set_platform_commercial_pro_country_release(
  'AT',false,'Synthetic country relock reason','PRO AT SPERREN',
  '73000000-0000-4000-8000-000000000109');
select public.test_assert(
  public.get_restaurant_entitlements('73000000-0000-4000-8000-000000000001')->>'plan_key'='BASIC'
  and public.get_restaurant_entitlements('73000000-0000-4000-8000-000000000001')->>'stored_plan_key'='PRO',
  'country relock is fail-closed and preserves paid PRO state'
);
select public.set_platform_commercial_pro_access(
  '73000000-0000-4000-8000-000000000001','REAL_BUSINESS_PILOT','REVOKE',
  null,null,'Synthetic revoke after country relock',
  'PRO PILOT AT Pilot Bistro WIDERRUFEN','73000000-0000-4000-8000-000000000114');
select public.test_assert(
  public.get_restaurant_entitlements('73000000-0000-4000-8000-000000000001')->>'plan_key'='BASIC',
  'pilot can be revoked while country remains locked'
);

do $block$
declare role_name text;
begin
  foreach role_name in array array['owner','staff','customer',''] loop
    perform set_config('test.platform_role',role_name,true);
    perform public.test_block(
      $$select public.set_platform_commercial_pro_country_release(
        'DE',true,'Unauthorized role attempt','PRO DE FREIGEBEN',
        '73000000-0000-4000-8000-000000000110')$$,
      '42501',coalesce(nullif(role_name,''),'roleless authenticated')||' cannot mutate country policy'
    );
  end loop;
end
$block$;
select public.test_block(
  $$insert into public.commercial_pro_access_grants(
    restaurant_id,organization_id,access_kind,starts_at,expires_at,reason,created_by,request_id
  ) values(
    '73000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000010',
    'REAL_BUSINESS_PILOT',now(),now()+interval '1 day','Direct browser DML attempt',
    '73000000-0000-4000-8000-000000000090','73000000-0000-4000-8000-000000000111')$$,
  '42501','authenticated browser direct grant DML is blocked'
);
select public.test_block(
  $$update public.commercial_plan_release_policy set revision=revision+1
    where country_code='DE' and plan_key='PRO'$$,
  '42501','authenticated browser direct country-policy DML is blocked'
);
reset role;

select public.test_assert(
  (select count(*)=3 from public.commercial_pro_access_grants
    where restaurant_id='73000000-0000-4000-8000-000000000001'),
  'pilot expiry and revocation preserve historical grant rows'
);
select public.test_assert(
  (select count(*)=10 from public.commercial_pro_access_audit)
  and not exists(select 1 from public.commercial_pro_access_audit
    where actor_id is null or country_code is null or reason is null
      or after_state is null or request_id is null),
  'country and access actions have complete immutable audit rows'
);
select public.test_block(
  $$update public.commercial_pro_access_audit set reason='tampered audit reason'$$,
  '42501','commercial PRO audit cannot be updated'
);
select public.test_block(
  $$delete from public.commercial_pro_access_audit$$,
  '42501','commercial PRO audit cannot be deleted'
);

set role anon;
select public.test_block(
  $$select public.set_platform_commercial_pro_country_release(
    'DE',true,'Anonymous release attempt','PRO DE FREIGEBEN',
    '73000000-0000-4000-8000-000000000112')$$,
  '42501','anonymous caller has no country mutator execute grant'
);
reset role;
