\set ON_ERROR_STOP on
begin;
create temporary table bv_fixture(
  admin_id uuid default gen_random_uuid(),
  owner_id uuid default gen_random_uuid(),
  staff_id uuid default gen_random_uuid(),
  customer_id uuid default gen_random_uuid(),
  organization_id uuid default gen_random_uuid(),
  restaurant_id uuid default gen_random_uuid(),
  branch_id uuid default gen_random_uuid(),
  first_request uuid default gen_random_uuid()
);
insert into bv_fixture default values;
grant select on bv_fixture to authenticated,anon,service_role;
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select user_id,'authenticated','authenticated','bv-local-'||user_id||'@example.invalid',now(),'{}','{}',now(),now()
from bv_fixture f cross join lateral unnest(array[f.admin_id,f.owner_id,f.staff_id,f.customer_id]) user_id;
insert into public.platform_admins(user_id,role,active) select admin_id,'platform_owner',true from bv_fixture;
set local session_replication_role=replica;
insert into public.organizations(id,owner_id,name)
select organization_id,owner_id,'WUXUAI TEST Verification' from bv_fixture;
insert into public.restaurants(id,owner_id,name,slug,organization_id,activation_status)
select restaurant_id,owner_id,'WUXUAI TEST Verification','bv-local-'||substr(restaurant_id::text,1,12),
  organization_id,'pending_activation' from bv_fixture;
insert into public.branches(id,organization_id,restaurant_id,name,slug,country)
select branch_id,organization_id,restaurant_id,'WUXUAI TEST Verification',
  'bv-local-'||substr(branch_id::text,1,12),'AT' from bv_fixture;
update public.restaurants r set primary_branch_id=f.branch_id from bv_fixture f where r.id=f.restaurant_id;
insert into public.restaurant_members(restaurant_id,organization_id,branch_id,user_id,role)
select restaurant_id,organization_id,branch_id,owner_id,'owner' from bv_fixture;
insert into public.restaurant_members(restaurant_id,organization_id,branch_id,user_id,role)
select restaurant_id,organization_id,branch_id,staff_id,'staff' from bv_fixture;
insert into public.platform_test_tenant_registry(restaurant_id,restaurant_name,organization_id,
  owner_user_id,test_session_id,marked_by)
select restaurant_id,'WUXUAI TEST Verification',organization_id,owner_id,
  'bv-local-'||substr(restaurant_id::text,1,12),admin_id from bv_fixture;
set local session_replication_role=origin;

create function pg_temp.bv_call(action_value text,method_value text,profile_value jsonb,request_value uuid)
returns jsonb language plpgsql as $function$
declare t uuid:=(select restaurant_id from bv_fixture);
begin
  return public.manage_business_verification(t,action_value,method_value,
    'SYNTHETIC_LOCAL_QA','SYNTHETIC LOCAL QA ONLY',profile_value,
    request_value,'00000000-0000-4000-8000-000000000169'::uuid,
    'CONFIRMED:WUXUAI TEST Verification:'||t::text||':'||action_value);
end $function$;
grant execute on function pg_temp.bv_call(text,text,jsonb,uuid) to authenticated,anon,service_role;
create function pg_temp.bv_denied(statement text) returns void language plpgsql as $function$
begin
  begin execute statement;
  exception when insufficient_privilege or invalid_parameter_value or unique_violation then return;
  end;
  raise exception 'BV_EXPECTED_DENIAL';
end $function$;
grant execute on function pg_temp.bv_denied(text) to authenticated,anon,service_role;

do $function$ declare t uuid:=(select restaurant_id from bv_fixture); answer jsonb;
begin
  answer:=public.resolve_business_verification_readiness_internal(t,'TEST',statement_timestamp());
  if answer->>'status'<>'PENDING_ACTIVATION' or (answer->>'checkout_allowed')::boolean
    or (answer->>'real_verified')::boolean then raise exception 'BV_PENDING_FAIL'; end if;
  if (select environment from public.business_verification_environment where singleton)<>'DISABLED' then
    raise exception 'BV_ENV_NOT_FAIL_CLOSED'; end if;
end $function$;
select set_config('request.jwt.claim.sub',admin_id::text,true) from bv_fixture;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated',
  'session_id',gen_random_uuid(),'auth_time',extract(epoch from now()))::text,true) from bv_fixture;
set local role authenticated;
do $function$ declare answer jsonb; t uuid:=(select restaurant_id from bv_fixture);
  k uuid:=(select first_request from bv_fixture);
begin
  answer:=pg_temp.bv_call('START_REVIEW','MANUAL',null,k);
  if answer->>'status'<>'IN_REVIEW' or (answer->>'idempotent')::boolean then
    raise exception 'BV_REVIEW_FAIL'; end if;
  if not (pg_temp.bv_call('START_REVIEW','MANUAL',null,k)->>'idempotent')::boolean then
    raise exception 'BV_IDEMPOTENCY_FAIL'; end if;
  perform pg_temp.bv_denied(format('select public.manage_business_verification(%L,''START_REVIEW'',''DIGITAL'',
    ''SYNTHETIC_LOCAL_QA'',''SYNTHETIC LOCAL QA ONLY'',null,%L,
    ''00000000-0000-4000-8000-000000000169'',''CONFIRMED:WUXUAI TEST Verification:%s:START_REVIEW'')',t,k,t));
  perform pg_temp.bv_denied('insert into public.business_verification_decisions default values');
  perform pg_temp.bv_denied('update public.business_verification_cases set status=''VERIFIED''');
  perform pg_temp.bv_denied(format('select public.confirm_real_business_verification(%L,%L,%L,''CONFIRMED'')',
    t,gen_random_uuid(),gen_random_uuid()));
  perform pg_temp.bv_denied(format('select pg_temp.bv_call(''GRANT_TEST'',null,null,%L)',gen_random_uuid()));
end $function$;
reset role;
update public.business_verification_environment set environment='STAGING',changed_at=clock_timestamp(),
  change_ref='SYNTHETIC_LOCAL_TRANSACTION' where singleton;
set local role authenticated;
do $function$ declare t uuid:=(select restaurant_id from bv_fixture); answer jsonb; profile_value jsonb;
begin
  profile_value:=jsonb_build_object('legal_name','WUXUAI TEST Verification','legal_form','Synthetic GmbH',
    'business_street','Synthetic Street 1','business_postal_code','1000',
    'business_city','Synthetic City','business_country','AT');
  answer:=pg_temp.bv_call('CORRECT_PROFILE',null,profile_value,gen_random_uuid());
  if answer->>'status'<>'IN_REVIEW' or not (answer->>'profile_revision_created')::boolean then
    raise exception 'BV_PROFILE_FAIL'; end if;
  profile_value:=profile_value||jsonb_build_object('business_street','Synthetic Street 2');
  perform pg_temp.bv_call('CORRECT_PROFILE',null,profile_value,gen_random_uuid());
  if (public.get_business_verification_profile(t)->>'revision')::integer<>2 then
    raise exception 'BV_PROFILE_REVISION_FAIL'; end if;
  if public.get_business_verification_profile(t)->>'business_street'<>'Synthetic Street 2' then
    raise exception 'BV_OWNER_PROFILE_READ_FAIL'; end if;
  answer:=pg_temp.bv_call('GRANT_TEST',null,null,gen_random_uuid());
  if not (answer->>'test_receipt_created')::boolean then raise exception 'BV_TEST_GRANT_FAIL'; end if;
end $function$;
do $function$ declare t uuid:=(select restaurant_id from bv_fixture); answer jsonb;
begin
  answer:=public.get_business_verification_readiness(t,'TEST');
  if not (answer->>'staging_test_verified')::boolean or (answer->>'real_verified')::boolean
    or (answer->>'checkout_allowed')::boolean then raise exception 'BV_TEST_READINESS_FAIL'; end if;
  if (public.get_business_verification_readiness(t,'LIVE')->>'staging_test_verified')::boolean then
    raise exception 'BV_LIVE_BYPASS'; end if;
end $function$;
reset role;
do $function$ declare t uuid:=(select restaurant_id from bv_fixture);
begin
  if (public.resolve_business_verification_readiness_internal(t,'TEST',statement_timestamp()+interval '25 hours')->>'staging_test_verified')::boolean then
    raise exception 'BV_EXPIRY_FAIL'; end if;
end $function$;
set local role authenticated;
do $function$ declare t uuid:=(select restaurant_id from bv_fixture);
begin
  perform pg_temp.bv_call('REVOKE_TEST',null,null,gen_random_uuid());
  if (public.get_business_verification_readiness(t,'TEST')->>'staging_test_verified')::boolean then
    raise exception 'BV_REVOKE_FAIL'; end if;
  if pg_temp.bv_call('REJECT',null,null,gen_random_uuid())->>'status'<>'REJECTED' then
    raise exception 'BV_REJECT_FAIL'; end if;
  if pg_temp.bv_call('START_REVIEW','DIGITAL',null,gen_random_uuid())->>'status'<>'IN_REVIEW' then
    raise exception 'BV_DIGITAL_REVIEW_FAIL'; end if;
end $function$;
reset role;

-- Synthetic local-only model probe: superuser fixture stands in for a future
-- audited real-verification writer, which is intentionally not released.
do $function$ declare c public.business_verification_cases%rowtype;
  previous_profile public.business_verified_profile_revisions%rowtype;
begin
  select * into c from public.business_verification_cases
    where restaurant_id=(select restaurant_id from bv_fixture);
  select * into previous_profile from public.business_verified_profile_revisions
    where case_id=c.id order by revision desc limit 1;
  insert into public.business_verified_profile_revisions(case_id,revision,legal_name,legal_form,
    business_street,business_postal_code,business_city,business_country,supersedes_revision_id,
    status,decision_ref,created_by)
  values(c.id,previous_profile.revision+1,'WUXUAI TEST Verification','Synthetic GmbH',
    'Synthetic Street 2','1000','Synthetic City','AT',previous_profile.id,
    'VERIFIED',gen_random_uuid(),(select admin_id from bv_fixture));
  update public.business_verification_cases set test_only=false,status='VERIFIED',
    decided_at=clock_timestamp(),expires_at=clock_timestamp()+interval '1 day'
    where id=c.id;
  if not (public.resolve_business_verification_readiness_internal(c.restaurant_id,'TEST',clock_timestamp())->>'real_verified')::boolean then
    raise exception 'BV_SYNTHETIC_REAL_RESOLVER_FAIL'; end if;
end $function$;
select set_config('request.jwt.claim.sub',admin_id::text,true) from bv_fixture;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated',
  'session_id',gen_random_uuid(),'auth_time',extract(epoch from now()))::text,true) from bv_fixture;
set local role authenticated;
do $function$ begin
  if pg_temp.bv_call('SUSPEND',null,null,gen_random_uuid())->>'status'<>'SUSPENDED' then
    raise exception 'BV_SUSPEND_FAIL'; end if;
  if pg_temp.bv_call('CORRECT_PROFILE',null,jsonb_build_object(
      'legal_name','WUXUAI TEST Verification','legal_form','Synthetic GmbH',
      'business_street','Synthetic Street 3','business_postal_code','1000',
      'business_city','Synthetic City','business_country','DE'),gen_random_uuid())
      ->>'status'<>'IN_REVIEW' then raise exception 'BV_COUNTRY_REVIEW_FAIL'; end if;
end $function$;
reset role;
do $function$ declare t uuid:=(select restaurant_id from bv_fixture);
begin
  if (public.resolve_business_verification_readiness_internal(t,'TEST',clock_timestamp())->>'real_verified')::boolean
    or (public.resolve_business_verification_readiness_internal(t,'TEST',clock_timestamp())->>'staging_test_verified')::boolean then
    raise exception 'BV_COUNTRY_CHANGE_BYPASS'; end if;
end $function$;

-- Owner can read only own status/profile, but cannot make any decision.
select set_config('request.jwt.claim.sub',owner_id::text,true) from bv_fixture;
select set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true) from bv_fixture;
set local role authenticated;
do $function$ declare t uuid:=(select restaurant_id from bv_fixture);
begin
  if public.get_business_verification_readiness(t,'TEST')->>'status'<>'IN_REVIEW' then
    raise exception 'BV_OWNER_READ_FAIL'; end if;
  perform pg_temp.bv_denied('select pg_temp.bv_call(''REJECT'',null,null,gen_random_uuid())');
end $function$;
reset role;
select set_config('request.jwt.claim.sub',staff_id::text,true) from bv_fixture;
set local role authenticated;
do $function$ declare t uuid:=(select restaurant_id from bv_fixture);
begin
  perform pg_temp.bv_denied(format('select public.get_business_verification_readiness(%L,''TEST'')',t));
  perform pg_temp.bv_denied(format('select public.get_business_verification_profile(%L)',t));
  perform pg_temp.bv_denied('select pg_temp.bv_call(''REJECT'',null,null,gen_random_uuid())');
end $function$;
reset role;
select set_config('request.jwt.claim.sub',customer_id::text,true) from bv_fixture;
set local role authenticated;
select pg_temp.bv_denied(format('select public.get_business_verification_readiness(%L,''TEST'')',restaurant_id)) from bv_fixture;
reset role;
set local role anon;
select pg_temp.bv_denied(format('select public.get_business_verification_readiness(%L,''TEST'')',restaurant_id)) from bv_fixture;
reset role;
set local role service_role;
select pg_temp.bv_denied('select pg_temp.bv_call(''GRANT_TEST'',null,null,gen_random_uuid())');
select pg_temp.bv_denied('delete from public.business_verification_decisions');
reset role;

do $function$ begin
  if (select count(*) from public.business_verification_decisions)<>9 then
    raise exception 'BV_AUDIT_COUNT_FAIL'; end if;
  if exists(select 1 from public.branch_subscriptions s join bv_fixture f on s.organization_id=f.organization_id) then
    raise exception 'BV_SUBSCRIPTION_WRITE'; end if;
  if exists(select 1 from public.business_verification_test_receipts where expires_at>effective_at+interval '24 hours') then
    raise exception 'BV_TEST_WINDOW_FAIL'; end if;
end $function$;
rollback;
select 'BUSINESS_VERIFICATION_LOCAL_FOCUSED_PASS';
