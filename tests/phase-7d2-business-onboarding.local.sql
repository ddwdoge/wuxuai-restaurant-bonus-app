\set ON_ERROR_STOP on
begin;
create temporary table d2_fixture(admin_id uuid default gen_random_uuid(), owner_id uuid default gen_random_uuid(),
  staff_id uuid default gen_random_uuid(), customer_id uuid default gen_random_uuid(), organization_id uuid default gen_random_uuid(),
  restaurant_id uuid default gen_random_uuid(), branch_id uuid default gen_random_uuid(),
  request_id uuid default gen_random_uuid(), correlation_id uuid default gen_random_uuid());
insert into d2_fixture default values;
grant select on d2_fixture to authenticated,anon,service_role;
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select user_id,'authenticated','authenticated','d2-local-'||user_id||'@example.invalid',now(),'{}','{}',now(),now()
from d2_fixture f cross join lateral unnest(array[f.admin_id,f.owner_id,f.staff_id,f.customer_id]) user_id;
insert into public.platform_admins(user_id,role,active) select admin_id,'platform_owner',true from d2_fixture;
set local session_replication_role=replica;
insert into public.organizations(id,owner_id,name) select organization_id,owner_id,'D2 SYNTHETIC' from d2_fixture;
insert into public.restaurants(id,owner_id,name,slug,organization_id,activation_status)
select restaurant_id,owner_id,'D2 SYNTHETIC','d2-'||substr(restaurant_id::text,1,12),organization_id,'pending_activation' from d2_fixture;
insert into public.branches(id,organization_id,restaurant_id,name,slug,country,address,postal_code,city)
select branch_id,organization_id,restaurant_id,'D2 SYNTHETIC','d2-'||substr(branch_id::text,1,12),
  'AT','Synthetic Road 1','1000','Synthetic City' from d2_fixture;
update public.restaurants r set primary_branch_id=f.branch_id from d2_fixture f where r.id=f.restaurant_id;
insert into public.restaurant_members(restaurant_id,organization_id,branch_id,user_id,role)
select restaurant_id,organization_id,branch_id,owner_id,'owner' from d2_fixture;
insert into public.restaurant_members(restaurant_id,organization_id,branch_id,user_id,role)
select restaurant_id,organization_id,branch_id,staff_id,'staff' from d2_fixture;
insert into public.branch_subscriptions(organization_id,branch_id,status,subscription_status,selected_plan,plan_key,payment_status)
select organization_id,branch_id,'pending_activation','pending_activation','BASIC','BASIC','not_required' from d2_fixture;
insert into public.organization_legal_profiles(organization_id,company_name,legal_form,registered_address_source,
  address_source_restaurant_id,address_source_branch_id,email,responsible_person)
select organization_id,'D2 Synthetic GmbH','GmbH','restaurant',restaurant_id,branch_id,
  'd2@example.invalid','Synthetic Representative' from d2_fixture;
insert into public.platform_test_tenant_registry(restaurant_id,restaurant_name,organization_id,owner_user_id,test_session_id,marked_by)
select restaurant_id,'D2 SYNTHETIC',organization_id,owner_id,'d2-'||substr(restaurant_id::text,1,12),admin_id from d2_fixture;
update public.country_launch_readiness set status='ready',evidence_ref='LOCAL_SYNTHETIC_ONLY',
  document_version_refs=case when check_key='required_documents' then array['LOCAL_SYNTHETIC_ONLY'] else '{}'::text[] end
where country_code='AT';
update public.country_launch_policy set enabled=true where country_code='AT';
set local session_replication_role=origin;

create function pg_temp.d2_denied(statement text) returns void language plpgsql as $f$
begin begin execute statement; exception when insufficient_privilege or invalid_parameter_value
  or unique_violation or raise_exception then return; end;
  raise exception 'D2_EXPECTED_DENIAL'; end $f$;
grant execute on function pg_temp.d2_denied(text) to authenticated,anon,service_role;

select set_config('request.jwt.claim.sub',owner_id::text,true) from d2_fixture;
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
do $f$ declare f d2_fixture%rowtype; result jsonb; action_name text; begin
  select * into f from d2_fixture;
  result:=public.submit_pending_business_verification(f.restaurant_id,'MANUAL','COMPANY_REGISTER',f.request_id,f.correlation_id);
  if result->>'status'<>'PENDING_ACTIVATION' or (result->>'idempotent')::boolean then raise exception 'D2_SUBMIT_FAIL'; end if;
  if not (public.submit_pending_business_verification(f.restaurant_id,'MANUAL','COMPANY_REGISTER',f.request_id,f.correlation_id)->>'idempotent')::boolean then
    raise exception 'D2_IDEMPOTENCY_FAIL'; end if;
  if public.get_business_verification_owner_status(f.restaurant_id)->>'status'<>'PENDING_ACTIVATION'
    or (public.get_business_verification_owner_status(f.restaurant_id)->>'pending_tenant')::boolean is distinct from true then
    raise exception 'D2_OWNER_STATUS_FAIL'; end if;
  perform pg_temp.d2_denied(format('select public.submit_pending_business_verification(%L,''MANUAL'',''OTHER'',%L,%L)',
    f.restaurant_id,f.request_id,f.correlation_id));
  perform pg_temp.d2_denied('select public.list_business_verification_queue()');
  perform pg_temp.d2_denied('update public.business_verification_cases set status=''VERIFIED''');
  foreach action_name in array array['START_REVIEW','REJECT','SUSPEND',
    'CORRECT_PROFILE','GRANT_TEST','REVOKE_TEST'] loop
    perform pg_temp.d2_denied(format('select public.manage_business_verification(%L,%L,null,
      ''SYNTHETIC_LOCAL_QA'',''SYNTHETIC LOCAL QA ONLY'',null,%L,%L,%L)',
      f.restaurant_id,action_name,gen_random_uuid(),gen_random_uuid(),
      'CONFIRMED:D2 SYNTHETIC:'||f.restaurant_id::text||':'||action_name));
  end loop;
end $f$;
reset role;

select set_config('request.jwt.claim.sub',admin_id::text,true) from d2_fixture;
set local role authenticated;
do $f$ declare f d2_fixture%rowtype; detail jsonb; action_name text; begin
  select * into f from d2_fixture;
  if jsonb_array_length(public.list_business_verification_queue())<>1 then raise exception 'D2_QUEUE_FAIL'; end if;
  detail:=public.get_business_verification_admin_detail((public.list_business_verification_queue()->0->>'case_id')::uuid);
  if not (detail->'allowed_actions' ? 'START_REVIEW') or (detail->'allowed_actions' ? 'GRANT_TEST') then
    raise exception 'D2_ACTION_MODEL_FAIL'; end if;
  foreach action_name in array array['START_REVIEW','REJECT','SUSPEND','CORRECT_PROFILE','GRANT_TEST','REVOKE_TEST'] loop
    perform pg_temp.d2_denied(format('select public.manage_business_verification(%L,%L,%s,
      ''SYNTHETIC_LOCAL_QA'',''SYNTHETIC LOCAL QA ONLY'',null,%L,%L,''WRONG'')',
      f.restaurant_id,action_name,case when action_name='START_REVIEW' then '''MANUAL''' else 'null' end,
      gen_random_uuid(),gen_random_uuid()));
  end loop;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',f.admin_id,'role','authenticated',
    'session_id',gen_random_uuid())::text,true);
  foreach action_name in array array['START_REVIEW','REJECT','SUSPEND','CORRECT_PROFILE','GRANT_TEST','REVOKE_TEST'] loop
    perform pg_temp.d2_denied(format('select public.manage_business_verification(%L,%L,%s,
      ''SYNTHETIC_LOCAL_QA'',''SYNTHETIC LOCAL QA ONLY'',null,%L,%L,%L)',
      f.restaurant_id,action_name,case when action_name='START_REVIEW' then '''MANUAL''' else 'null' end,
      gen_random_uuid(),gen_random_uuid(),
      'CONFIRMED:D2 SYNTHETIC:'||f.restaurant_id::text||':'||action_name));
  end loop;
end $f$;
reset role;

select set_config('request.jwt.claim.sub',staff_id::text,true) from d2_fixture;
set local role authenticated;
select pg_temp.d2_denied('select public.list_business_verification_queue()');
select pg_temp.d2_denied(format('select public.submit_pending_business_verification(%L,''MANUAL'',''COMPANY_REGISTER'',gen_random_uuid(),gen_random_uuid())',restaurant_id)) from d2_fixture;
select pg_temp.d2_denied(format('select public.get_business_verification_owner_status(%L)',restaurant_id)) from d2_fixture;
do $f$ declare f d2_fixture%rowtype; action_name text; begin
  select * into f from d2_fixture;
  foreach action_name in array array['START_REVIEW','REJECT','SUSPEND','CORRECT_PROFILE','GRANT_TEST','REVOKE_TEST'] loop
    perform pg_temp.d2_denied(format('select public.manage_business_verification(%L,%L,null,
      ''SYNTHETIC_LOCAL_QA'',''SYNTHETIC LOCAL QA ONLY'',null,%L,%L,%L)',
      f.restaurant_id,action_name,gen_random_uuid(),gen_random_uuid(),
      'CONFIRMED:D2 SYNTHETIC:'||f.restaurant_id::text||':'||action_name));
  end loop;
end $f$;
reset role;
select set_config('request.jwt.claim.sub',customer_id::text,true) from d2_fixture;
set local role authenticated;
do $f$ declare f d2_fixture%rowtype; action_name text; begin
  select * into f from d2_fixture;
  foreach action_name in array array['START_REVIEW','REJECT','SUSPEND','CORRECT_PROFILE','GRANT_TEST','REVOKE_TEST'] loop
    perform pg_temp.d2_denied(format('select public.manage_business_verification(%L,%L,null,
      ''SYNTHETIC_LOCAL_QA'',''SYNTHETIC LOCAL QA ONLY'',null,%L,%L,%L)',
      f.restaurant_id,action_name,gen_random_uuid(),gen_random_uuid(),
      'CONFIRMED:D2 SYNTHETIC:'||f.restaurant_id::text||':'||action_name));
  end loop;
end $f$;
reset role;
set local role anon;
select pg_temp.d2_denied('select public.list_business_verification_queue()');
select pg_temp.d2_denied(format('select public.get_business_verification_owner_status(%L)',restaurant_id)) from d2_fixture;
do $f$ declare f d2_fixture%rowtype; action_name text; begin
  select * into f from d2_fixture;
  foreach action_name in array array['START_REVIEW','REJECT','SUSPEND','CORRECT_PROFILE','GRANT_TEST','REVOKE_TEST'] loop
    perform pg_temp.d2_denied(format('select public.manage_business_verification(%L,%L,null,
      ''SYNTHETIC_LOCAL_QA'',''SYNTHETIC LOCAL QA ONLY'',null,%L,%L,%L)',
      f.restaurant_id,action_name,gen_random_uuid(),gen_random_uuid(),
      'CONFIRMED:D2 SYNTHETIC:'||f.restaurant_id::text||':'||action_name));
  end loop;
end $f$;
reset role;
set local role service_role;
do $f$ declare f d2_fixture%rowtype; action_name text; begin
  select * into f from d2_fixture;
  foreach action_name in array array['START_REVIEW','REJECT','SUSPEND','CORRECT_PROFILE','GRANT_TEST','REVOKE_TEST'] loop
    perform pg_temp.d2_denied(format('select public.manage_business_verification(%L,%L,null,
      ''SYNTHETIC_LOCAL_QA'',''SYNTHETIC LOCAL QA ONLY'',null,%L,%L,%L)',
      f.restaurant_id,action_name,gen_random_uuid(),gen_random_uuid(),
      'CONFIRMED:D2 SYNTHETIC:'||f.restaurant_id::text||':'||action_name));
  end loop;
end $f$;
reset role;
do $f$ begin
  if (select count(*) from public.business_verification_owner_submissions)<>1 then raise exception 'D2_SUBMISSION_COUNT'; end if;
  if exists(select 1 from public.branch_subscriptions s join d2_fixture f on s.branch_id=f.branch_id
    where s.trial_started_at is not null or s.trial_ends_at is not null or s.subscription_status<>'pending_activation') then
    raise exception 'D2_ACTIVATION_LEAK'; end if;
end $f$;
rollback;
select 'PHASE_7D2_LOCAL_ONBOARDING_PASS';
