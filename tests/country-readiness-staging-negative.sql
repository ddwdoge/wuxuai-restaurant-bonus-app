-- STAGING ONLY: read-only country assertions and rejected writes. Rollback only.
begin;
create temporary table country_readiness_checks(label text primary key);
create temporary table country_readiness_before as
  select country_code,to_jsonb(p) as state from public.country_launch_policy p;
create temporary table country_readiness_audit_before as select count(*) as n from public.country_launch_audit;
grant all on country_readiness_checks to authenticated,anon;
create function pg_temp.country_assert(ok boolean,label text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'COUNTRY TEST FAILED: %',label; end if;
  insert into country_readiness_checks values(label);
end $$;
create function pg_temp.country_block(statement text,label text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when insufficient_privilege then
    perform pg_temp.country_assert(true,label); return;
  end;
  raise exception 'COUNTRY TEST UNEXPECTED SUCCESS: %',label;
end $$;
-- Existing platform identity only for permission checks; no Auth or tenant changes.
do $$ declare actor uuid; begin
  select user_id into actor from public.platform_admins where active and role in ('platform_owner','platform_admin') limit 1;
  if actor is null then raise exception 'PLATFORM_TEST_IDENTITY_UNAVAILABLE'; end if;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
end $$;
set local role authenticated;
select pg_temp.country_assert(jsonb_array_length(public.get_platform_country_launch_status()->'countries')=6,'platform_read');
do $$ declare code text; begin
  foreach code in array array['AT','DE','CH','FR','IT','ES'] loop
    perform pg_temp.country_block(format('select public.set_platform_country_launch_status(%L,true,''Readiness negative test only'',%L,gen_random_uuid())',code,'CONFIRMED:'||code),'rpc_incomplete_'||code);
  end loop;
end $$;
select pg_temp.country_block('update public.country_launch_policy set enabled=true where country_code=''DE''','platform_direct_policy_blocked');
select pg_temp.country_block('update public.country_launch_readiness set status=''ready'' where country_code=''DE''','platform_direct_readiness_blocked');
select pg_temp.country_block('insert into public.country_launch_audit(actor_role,event,country_code,request_id,reason,after_state) values(''platform_admin'',''COUNTRY_POLICY_CHANGED'',''DE'',gen_random_uuid(),''fake success'',''{}'')','platform_direct_audit_blocked');
reset role;
-- Canonical non-platform role classes must not gain access; reuse existing users
-- only when present, otherwise still prove non-platform denial with an unknown ID.
do $$ declare label text; actor uuid; begin
  foreach label in array array['owner','admin','staff','customer'] loop
    if label in ('owner','admin','staff') then
      select m.user_id into actor from public.restaurant_members m where m.role=label
        and not exists(select 1 from public.platform_admins p where p.user_id=m.user_id and p.active) limit 1;
    else
      select a.auth_user_id into actor from public.customer_accounts a
        where not exists(select 1 from public.platform_admins p where p.user_id=a.auth_user_id and p.active) limit 1;
    end if;
    actor:=coalesce(actor,gen_random_uuid());
    perform set_config('request.jwt.claim.sub',actor::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
    perform pg_temp.country_block('select public.get_platform_country_launch_status()',label||'_read_blocked');
    perform pg_temp.country_block('select public.set_platform_country_launch_status(''DE'',true,''Readiness negative test only'',''CONFIRMED:DE'',gen_random_uuid())',label||'_write_blocked');
  end loop;
end $$;
set local role anon;
select pg_temp.country_block('select public.get_platform_country_launch_status()','anon_read_blocked');
select pg_temp.country_block('select public.set_platform_country_launch_status(''DE'',true,''Readiness negative test only'',''CONFIRMED:DE'',gen_random_uuid())','anon_write_blocked');
reset role;
select pg_temp.country_assert(not exists(select 1 from public.country_launch_policy p join country_readiness_before b using(country_code) where to_jsonb(p)<>b.state),'country_state_unchanged');
select pg_temp.country_assert((select count(*)=(select n from country_readiness_audit_before) from public.country_launch_audit),'no_false_success_audit');
select pg_temp.country_assert((select count(*)=1 and bool_and(country_code='AT') from public.country_launch_policy where enabled),'only_AT_enabled');
select pg_temp.country_assert((select count(*)=48 and bool_and(status='not_configured') from public.country_launch_readiness),'no_fake_readiness');
select pg_temp.country_assert((select bool_and(relrowsecurity) from pg_class where oid in('public.country_launch_policy'::regclass,'public.country_launch_readiness'::regclass,'public.country_launch_audit'::regclass)),'rls_enabled');
select pg_temp.country_assert(not exists(select 1 from information_schema.role_table_grants where grantee in ('anon','authenticated','PUBLIC') and table_schema='public' and table_name in ('country_launch_policy','country_launch_readiness','country_launch_audit')),'browser_table_grants_absent');
select pg_temp.country_assert((select onboarding_status='draft' from public.restaurants where id='f03f7d57-f225-4f23-a732-3adc15525bbd'),'isolated_onboarding_still_draft');
select pg_temp.country_assert(public.require_launch_country('AT')='AT','technical_AT_guard_preserved');
do $$ declare code text; begin
  foreach code in array array['DE','CH','FR','IT','ES','XX'] loop
    perform pg_temp.country_block(format('select public.require_launch_country(%L)',code),'registration_guard_'||code);
  end loop;
end $$;
select count(*) as checks_passed from country_readiness_checks;
rollback;
