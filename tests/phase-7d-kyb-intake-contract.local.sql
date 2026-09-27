\set ON_ERROR_STOP on
begin;
create temporary table kyb_intake_fixture(
  admin_id uuid default gen_random_uuid(), owner_id uuid default gen_random_uuid(), staff_id uuid default gen_random_uuid(),
  organization_id uuid default gen_random_uuid(), restaurant_id uuid default gen_random_uuid(), branch_id uuid default gen_random_uuid()
);
insert into kyb_intake_fixture default values;
grant select on kyb_intake_fixture to authenticated, anon;
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select user_id,'authenticated','authenticated','kyb-intake-'||user_id||'@example.invalid',now(),'{}','{}',now(),now()
from kyb_intake_fixture f cross join lateral unnest(array[f.admin_id,f.owner_id,f.staff_id]) user_id;
insert into public.platform_admins(user_id,role,active) select admin_id,'platform_owner',true from kyb_intake_fixture;
set local session_replication_role=replica;
insert into public.organizations(id,owner_id,name) select organization_id,owner_id,'KYB INTAKE LOCAL' from kyb_intake_fixture;
insert into public.restaurants(id,owner_id,name,slug,organization_id,activation_status,status)
select restaurant_id,owner_id,'KYB INTAKE LOCAL','kyb-intake-'||substr(restaurant_id::text,1,8),organization_id,'pending_activation','draft' from kyb_intake_fixture;
insert into public.branches(id,organization_id,restaurant_id,name,slug,country,address,postal_code,city)
select branch_id,organization_id,restaurant_id,'KYB INTAKE LOCAL','kyb-intake-'||substr(branch_id::text,1,8),'AT','Synthetic Road 1','1000','Synthetic City' from kyb_intake_fixture;
update public.restaurants r set primary_branch_id=f.branch_id from kyb_intake_fixture f where r.id=f.restaurant_id;
insert into public.restaurant_members(restaurant_id,organization_id,branch_id,user_id,role)
select restaurant_id,organization_id,branch_id,owner_id,'owner' from kyb_intake_fixture
union all select restaurant_id,organization_id,branch_id,staff_id,'staff' from kyb_intake_fixture;
insert into public.branch_subscriptions(organization_id,branch_id,status,subscription_status,selected_plan,plan_key,payment_status)
select organization_id,branch_id,'pending_activation','pending_activation','BASIC','BASIC','not_required' from kyb_intake_fixture;
insert into public.organization_legal_profiles(organization_id,company_name,legal_form,registered_address_source,
  address_source_restaurant_id,address_source_branch_id,email,responsible_person)
select organization_id,'KYB Intake Local GmbH','GmbH','restaurant',restaurant_id,branch_id,'synthetic@example.invalid','Synthetic Representative' from kyb_intake_fixture;
insert into public.platform_test_tenant_registry(restaurant_id,restaurant_name,organization_id,owner_user_id,test_session_id,marked_by)
select restaurant_id,'KYB INTAKE LOCAL',organization_id,owner_id,'kyb-intake-local',admin_id from kyb_intake_fixture;
update public.business_verification_environment set environment='STAGING',change_ref='LOCAL_SYNTHETIC_ONLY' where singleton;
set local session_replication_role=origin;

create function pg_temp.expect_denied(statement text) returns void language plpgsql as $f$
begin
  begin execute statement; exception when insufficient_privilege or invalid_parameter_value or raise_exception then return; end;
  raise exception 'EXPECTED_DENIAL';
end $f$;
grant execute on function pg_temp.expect_denied(text) to authenticated,anon;

select set_config('request.jwt.claim.sub',owner_id::text,true) from kyb_intake_fixture;
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select public.save_owner_kyb_intake_profile(restaurant_id,jsonb_build_object(
  'country_code','AT','gisa_number','SYNTHETIC-GISA-1','owner_is_authorized_representative',true,
  'authorized_representative_name','Synthetic Representative','authorized_representative_role','Geschäftsführung',
  'commercial_register_applicable',true,'commercial_register_number','FN SYNTHETIC'))
from kyb_intake_fixture;
reset role;
update public.business_verification_environment set environment='DISABLED' where singleton;
set local role authenticated;
select pg_temp.expect_denied(format('select public.submit_pending_business_verification_intake(%L,''MANUAL'',gen_random_uuid(),gen_random_uuid())',restaurant_id)) from kyb_intake_fixture;
reset role;
update public.business_verification_environment set environment='STAGING' where singleton;
set local session_replication_role=replica;
update public.platform_test_tenant_registry set deleted_at=clock_timestamp()
where restaurant_id=(select restaurant_id from kyb_intake_fixture);
set local session_replication_role=origin;
set local role authenticated;
select pg_temp.expect_denied(format('select public.submit_pending_business_verification_intake(%L,''MANUAL'',gen_random_uuid(),gen_random_uuid())',restaurant_id)) from kyb_intake_fixture;
reset role;
set local session_replication_role=replica;
update public.platform_test_tenant_registry set deleted_at=null
where restaurant_id=(select restaurant_id from kyb_intake_fixture);
set local session_replication_role=origin;
set local role authenticated;
do $f$ declare f kyb_intake_fixture%rowtype; result jsonb; begin
  select * into f from kyb_intake_fixture;
  result:=public.submit_pending_business_verification_intake(f.restaurant_id,'MANUAL',gen_random_uuid(),gen_random_uuid());
  if result->>'status'<>'PENDING_ACTIVATION' or result->>'intake_mode'<>'SYNTHETIC_TEST_ONLY'
    or (result->>'commercial_activation_allowed')::boolean then raise exception 'INTAKE_RESULT_INVALID'; end if;
end $f$;
reset role;

select set_config('request.jwt.claim.sub',staff_id::text,true) from kyb_intake_fixture;
set local role authenticated;
select pg_temp.expect_denied(format('select public.get_owner_kyb_intake_summary(%L)',restaurant_id)) from kyb_intake_fixture;
select pg_temp.expect_denied(format('select public.save_owner_kyb_intake_profile(%L,''{}''::jsonb)',restaurant_id)) from kyb_intake_fixture;
select pg_temp.expect_denied(format('select public.submit_pending_business_verification_intake(%L,''MANUAL'',gen_random_uuid(),gen_random_uuid())',restaurant_id)) from kyb_intake_fixture;
reset role;
set local role anon;
select pg_temp.expect_denied(format('select public.get_owner_kyb_intake_summary(%L)',restaurant_id)) from kyb_intake_fixture;
reset role;

do $f$ begin
  if public.country_launch_readiness_snapshot('AT')->>'ready' <> 'false' then raise exception 'COUNTRY_READINESS_WAS_LOOSENED'; end if;
  if (select count(*) from public.business_verification_cases)<>1 then raise exception 'CASE_COUNT_INVALID'; end if;
  if (select count(*) from public.business_verification_owner_submissions)<>1 then raise exception 'SUBMISSION_COUNT_INVALID'; end if;
  if exists(select 1 from public.restaurants r join kyb_intake_fixture f on r.id=f.restaurant_id where r.activation_status<>'pending_activation') then raise exception 'ACTIVATION_CHANGED'; end if;
  if exists(select 1 from public.branch_subscriptions s join kyb_intake_fixture f on s.branch_id=f.branch_id
    where s.subscription_status<>'pending_activation' or s.trial_started_at is not null or s.stripe_customer_id is not null) then raise exception 'BILLING_CHANGED'; end if;
  if exists(select 1 from public.commercial_pro_access_grants g join kyb_intake_fixture f on g.restaurant_id=f.restaurant_id) then raise exception 'PRO_GRANT_CREATED'; end if;
end $f$;
rollback;
