-- STAGING ONLY. Entire synthetic fixture, Auth rows and business writes roll back.
-- Never run this file against Production. The runner must verify the linked ref.
begin;
create temporary table country_gate_checks(label text primary key);
create temporary table country_gate_fixture(actor uuid,tenant uuid);
grant all on country_gate_checks,country_gate_fixture to authenticated,anon;
create function pg_temp.country_assert(ok boolean,label text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'COUNTRY TEST FAILED: %',label; end if;
  insert into country_gate_checks values(label);
end $$;
create function pg_temp.country_block(statement text,expected text,label text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlstate<>expected then raise; end if;
    perform pg_temp.country_assert(true,label); return;
  end;
  raise exception 'COUNTRY TEST UNEXPECTED SUCCESS: %',label;
end $$;
insert into country_gate_fixture(actor) values(gen_random_uuid());
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select actor,'authenticated','authenticated','country-gate-'||actor::text||'@example.invalid',now(),'{}','{}',now(),now()
from country_gate_fixture;
select set_config('request.jwt.claim.sub',actor::text,true) from country_gate_fixture;
select set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true) from country_gate_fixture;
set local role authenticated;
do $$ declare code text; begin
  foreach code in array array['DE','CH','FR','IT','ES','XX'] loop
    perform pg_temp.country_block(format('select public.start_restaurant_owner_trial(''Synthetic Country Test'',''COUNTRY TEST ONLY'',null,%L)',code),'42501','blocked_'||code);
  end loop;
end $$;
select pg_temp.country_block('select public.start_restaurant_owner_trial(''Synthetic'',''COUNTRY TEST ONLY'',null,null)','22023','missing_country');
select pg_temp.country_block('select public.start_restaurant_owner_trial(''Synthetic'',''COUNTRY TEST ONLY'',null,'''')','22023','blank_country');
select pg_temp.country_block('select public.start_restaurant_owner_trial_country_internal(''Synthetic'',''COUNTRY TEST ONLY'',null)','42501','internal_trial_blocked');
select pg_temp.country_block('update public.country_launch_policy set enabled=true where country_code=''DE''','42501','browser_policy_blocked');
select pg_temp.country_block('select public.set_platform_country_launch_status(''DE'',true,''Synthetic test reason'',''CONFIRMED:DE'',gen_random_uuid())','42501','nonplatform_control_blocked');
select pg_temp.country_block('insert into public.restaurants(owner_id,name,slug) values(auth.uid(),''Synthetic'',''country-test-escape'')','42501','direct_restaurant_blocked');
select pg_temp.country_block('insert into public.organizations(owner_id,name) values(auth.uid(),''Synthetic'')','42501','direct_organization_blocked');
update country_gate_fixture set tenant=(public.start_restaurant_owner_trial('Synthetic Country Test','COUNTRY TEST ONLY',null,'AT')->'restaurant'->>'id')::uuid;
do $$ begin
  perform public.start_restaurant_owner_trial('Synthetic Country Test','COUNTRY TEST ONLY',null,'AT');
  if public.start_restaurant_owner_trial('Ignored','Ignored',null)->>'already_exists' is distinct from 'true' then
    raise exception 'Existing owner read-only resume failed';
  end if;
end $$;
select pg_temp.country_assert((select count(*)=1 from public.restaurants where owner_id=auth.uid()),'at_exactly_once');
select pg_temp.country_block('update public.branches set country=''DE'' where restaurant_id=(select tenant from country_gate_fixture)','42501','branch_country_manipulation');
select pg_temp.country_block('update public.restaurants set onboarding_status=''completed'' where id=(select tenant from country_gate_fixture)','42501','direct_onboarding_blocked');
select pg_temp.country_block('select public.complete_restaurant_onboarding((select tenant from country_gate_fixture),''{"country":"DE"}'',''{}'',true,gen_random_uuid())','42501','rpc_legal_country_blocked');
select pg_temp.country_block('select public.complete_restaurant_onboarding((select tenant from country_gate_fixture),''{}'',''{}'',true,gen_random_uuid())','22023','rpc_missing_legal_country');
select pg_temp.country_block('update public.branch_subscriptions set plan_key=''PRO'' where branch_id in(select id from public.branches where restaurant_id=(select tenant from country_gate_fixture))','42501','subscription_dml_blocked');
select pg_temp.country_block('select public.get_platform_country_launch_status()','42501','owner_platform_read_blocked');
reset role;
select pg_temp.country_assert((select count(*)=1 from public.country_launch_audit where restaurant_id=(select tenant from country_gate_fixture) and event='COUNTRY_REGISTRATION_ALLOWED'),'registration_audit_once');
select pg_temp.country_assert((select count(*)=0 from public.country_launch_creation_context),'private_context_empty');
select pg_temp.country_assert((select b.country='AT' and s.plan_key='BASIC' and s.trial_ends_at=s.trial_started_at+interval '3 months'
  from public.branches b join public.branch_subscriptions s on s.branch_id=b.id where b.restaurant_id=(select tenant from country_gate_fixture)),'basic_trial_at');
select pg_temp.country_assert((select count(*)=1 and bool_and(country_code='AT') from public.country_launch_policy where enabled),'only_at_active');
select pg_temp.country_assert(not has_function_privilege('authenticated','public.start_restaurant_owner_trial_country_internal(text,text,text)','execute'),'internal_grant_closed');
select pg_temp.country_assert((select bool_and(relrowsecurity) from pg_class where oid in('public.country_launch_policy'::regclass,'public.country_launch_audit'::regclass,'public.country_launch_creation_context'::regclass,'public.country_launch_existing_businesses'::regclass)),'rls_enabled');
select pg_temp.country_block('delete from public.country_launch_audit where restaurant_id=(select tenant from country_gate_fixture)','42501','immutable_country_audit');
set local role anon;
select pg_temp.country_block('select public.start_restaurant_owner_trial(''Synthetic'',''Synthetic'',null,''AT'')','42501','unauthenticated_trial_blocked');
select pg_temp.country_block('select public.get_platform_country_launch_status()','42501','unauthenticated_platform_blocked');
select pg_temp.country_assert(jsonb_array_length(public.get_registration_countries())=6,'public_availability_only');
reset role;
-- Dedicated synthetic Platform Admin exists only inside this rollback transaction.
insert into public.platform_admins(user_id,role,active) select actor,'platform_admin',true from country_gate_fixture;
set local role authenticated;
select pg_temp.country_block('select public.set_platform_country_launch_status(''AT'',true,''Synthetic policy test'',null,gen_random_uuid())','22023','platform_confirmation_required');
select pg_temp.country_block('select public.set_platform_country_launch_status(''AT'',true,''short'',''CONFIRMED:AT'',gen_random_uuid())','22023','platform_reason_required');
select public.set_platform_country_launch_status('AT',true,'Synthetic policy verification','CONFIRMED:AT','20000000-0000-4000-8000-000000000091');
select public.set_platform_country_launch_status('AT',true,'Synthetic policy verification','CONFIRMED:AT','20000000-0000-4000-8000-000000000091');
select pg_temp.country_block('select public.set_platform_country_launch_status(''AT'',false,''Synthetic policy verification'',''CONFIRMED:AT'',''20000000-0000-4000-8000-000000000091'')','22023','platform_request_collision');
reset role;
select pg_temp.country_assert((select count(*)=1 and bool_and(before_state is not null and after_state is not null and actor_role='platform_admin')
  from public.country_launch_audit where actor_id=(select actor from country_gate_fixture) and event='COUNTRY_POLICY_CHANGED'),'platform_audit_idempotency');
select pg_temp.country_assert((select count(*)=1 and bool_and(country_code='AT') from public.country_launch_policy where enabled),'blocked_countries_never_activated');
select pg_temp.country_assert((select count(*)=35 from country_gate_checks),'exact_check_count');
rollback;
select 'COUNTRY_STAGING_ROLLBACK_PASS_36_CHECKS' as result;
