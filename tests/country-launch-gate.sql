-- LOCAL ONLY: synthetic fixture. The onboarding delegate models the status write;
-- actual legal publication and Founder consent remain the physical Staging gate.
\set ON_ERROR_STOP on
do $$ begin
  if current_database()<>'wuxuai_subscription_lock_local' then raise exception 'LOCAL TEST DATABASE REQUIRED'; end if;
end $$;
alter table public.restaurants add operational_ready boolean default false;
alter table public.branches add country text default 'AT';
create table public.restaurant_legal_profiles(restaurant_id uuid primary key, country text);
create table public.organization_legal_profiles(organization_id uuid primary key, country text,
  registered_address_source text, address_source_branch_id uuid);
create table public.kassa_compliance_acknowledgements(restaurant_id uuid, user_id uuid);
create function public.complete_restaurant_onboarding(input_restaurant_id uuid,input_profile jsonb,
  input_activation jsonb,input_publication_confirmed boolean default false,input_request_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if input_publication_confirmed is distinct from true then raise exception 'CONFIRMATION_REQUIRED'; end if;
  insert into public.restaurant_legal_profiles values(input_restaurant_id,input_profile->>'country')
    on conflict(restaurant_id) do update set country=excluded.country;
  update public.restaurants set onboarding_status='completed',operational_ready=true where id=input_restaurant_id;
  return jsonb_build_object('restaurant',jsonb_build_object('id',input_restaurant_id));
end $$;
-- Existing completed foreign business must survive the rollout unchanged.
update public.restaurants set onboarding_status='completed' where owner_id='10000000-0000-4000-8000-000000000001';
update public.branches set country='DE' where restaurant_id in(select id from public.restaurants where onboarding_status='completed');
create table public.country_test_existing as select to_jsonb(r) snapshot from public.restaurants r;
\ir ../supabase/migrations/20260911004000_country_launch_gate.sql
select public.test_assert((select count(*)=6 from public.country_launch_policy),'country six configured');
select public.test_assert((select count(*)=1 and bool_and(country_code='AT') from public.country_launch_policy where enabled),'country only AT enabled');
select public.test_assert(not exists(select 1 from public.restaurants r full join public.country_test_existing s on (s.snapshot->>'id')::uuid=r.id where to_jsonb(r) is distinct from s.snapshot),'country migration existing tenants unchanged');

set role authenticated;
set test.actor='10000000-0000-4000-8000-000000000080';
set test.platform_role='';
do $$ declare code text; begin
  foreach code in array array['DE','CH','FR','IT','ES','XX'] loop
    perform public.test_block(format('select public.start_restaurant_owner_trial(''Synthetic'',''Synthetic country test'',null,%L)',code),'42501','country registration blocked '||code);
  end loop;
end $$;
select public.test_block('select public.start_restaurant_owner_trial(''Synthetic'',''Synthetic'',null,null)','22023','country NULL fail closed');
select public.test_block('select public.start_restaurant_owner_trial(''Synthetic'',''Synthetic'',null,'''')','22023','country blank fail closed');
select public.test_block('select public.start_restaurant_owner_trial(''Synthetic'',''Synthetic'',null,''Austria'')','22023','country free text fail closed');
select public.test_block('select public.start_restaurant_owner_trial_country_internal(''Synthetic'',''Synthetic'',null)','42501','country internal RPC revoked');
select public.test_block('insert into public.restaurants(owner_id,name,slug,status) values(auth.uid(),''Synthetic'',''direct-escape'',''active'')','42501','country direct restaurant insert blocked');
select public.test_block('insert into public.organizations(owner_id,name) values(auth.uid(),''Synthetic'')','42501','country direct organization insert blocked');
select public.test_block('insert into public.country_launch_creation_context values(txid_current(),auth.uid(),''AT'',''REGISTRATION'',null)','42501','country fake private context blocked');
select public.test_block('update public.country_launch_policy set enabled=true where country_code=''DE''','42501','country browser policy DML blocked');
select public.test_block('select public.set_platform_country_launch_status(''DE'',true,''Synthetic reason'',''CONFIRMED:DE'',gen_random_uuid())','42501','country Owner control blocked');
select public.test_block('select public.get_platform_country_launch_status()','42501','country Owner admin read blocked');
set test.platform_role='admin';
select public.test_block('select public.set_platform_country_launch_status(''DE'',true,''Synthetic reason'',''CONFIRMED:DE'',gen_random_uuid())','42501','country restaurant admin control blocked');
set test.platform_role='';
select public.start_restaurant_owner_trial('Synthetic','Synthetic country test',null,'AT');
select public.start_restaurant_owner_trial('Synthetic','Synthetic country test',null,'AT');
select id as country_tenant from public.restaurants where owner_id=auth.uid() \gset
set test.country_tenant=:'country_tenant';
select public.test_assert((select count(*)=1 from public.restaurants where owner_id=auth.uid()),'country AT created exactly once');
select public.test_block('update public.branches set country=''DE'' where restaurant_id=current_setting(''test.country_tenant'')::uuid','42501','country browser address manipulation blocked');
select public.test_block('update public.restaurants set onboarding_status=''completed'' where id=current_setting(''test.country_tenant'')::uuid','42501','country direct completion blocked');
select public.test_block('select public.complete_restaurant_onboarding(current_setting(''test.country_tenant'')::uuid,''{"country":"DE"}'',''{}'',true,gen_random_uuid())','42501','country RPC legal country bypass blocked');
select public.test_block('select public.complete_restaurant_onboarding(current_setting(''test.country_tenant'')::uuid,''{}'',''{}'',true,gen_random_uuid())','22023','country missing legal country blocked');
select public.complete_restaurant_onboarding(current_setting('test.country_tenant')::uuid,'{"country":"AT"}','{}',true,gen_random_uuid());
select public.complete_restaurant_onboarding(current_setting('test.country_tenant')::uuid,'{"country":"AT"}','{}',true,gen_random_uuid());
reset role;
select public.test_assert((select count(*)=1 from public.country_launch_audit where event='COUNTRY_REGISTRATION_ALLOWED'),'country registration audit once');
select public.test_assert((select count(*)=1 from public.country_launch_audit where event='COUNTRY_ONBOARDING_ALLOWED'),'country completion audit once');
select public.test_assert((select count(*)=0 from public.country_launch_creation_context),'country no context leaked');
select public.test_assert((select b.country='AT' and s.plan_key='BASIC' from public.branches b join public.branch_subscriptions s on s.branch_id=b.id where b.restaurant_id=current_setting('test.country_tenant')::uuid),'country trial BASIC unchanged');
set role authenticated;
set test.platform_role='platform_admin';
select public.test_block('select public.set_platform_country_launch_status(''DE'',true,''Synthetic reason'',null,gen_random_uuid())','22023','country missing confirmation blocked');
select public.test_block('select public.set_platform_country_launch_status(''DE'',true,''Synthetic reason'',''CONFIRMED:AT'',gen_random_uuid())','22023','country wrong target confirmation blocked');
select public.set_platform_country_launch_status('DE',true,'Synthetic country control test','CONFIRMED:DE','20000000-0000-4000-8000-000000000080');
select public.set_platform_country_launch_status('DE',true,'Synthetic country control test','CONFIRMED:DE','20000000-0000-4000-8000-000000000080');
select public.test_block('select public.set_platform_country_launch_status(''DE'',false,''Synthetic country control test'',''CONFIRMED:DE'',''20000000-0000-4000-8000-000000000080'')','22023','country replay mismatch blocked');
select public.set_platform_country_launch_status('DE',false,'Synthetic restore country control','CONFIRMED:DE','20000000-0000-4000-8000-000000000081');
reset role;
select public.test_assert((select count(*)=2 from public.country_launch_audit where event='COUNTRY_POLICY_CHANGED'),'country policy idempotent complete audit');
select public.test_block('delete from public.country_launch_audit','42501','country audit immutable');
select public.test_assert((select count(*)=1 and bool_and(country_code='AT') from public.country_launch_policy where enabled),'country only AT remains enabled');
set role anon;
select public.test_block('select public.start_restaurant_owner_trial(''Synthetic'',''Synthetic'',null,''AT'')','42501','country anonymous registration blocked');
select public.test_block('select public.set_platform_country_launch_status(''DE'',true,''Synthetic reason'',''CONFIRMED:DE'',gen_random_uuid())','42501','country anon policy blocked');
select public.test_assert(jsonb_array_length(public.get_registration_countries())=6,'country public safe availability list');
reset role;
select count(*) as country_checks_passed from public.test_checks where label like 'country %';
