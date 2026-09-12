\set ON_ERROR_STOP on
do $$ begin
  if current_database()<>'wuxuai_subscription_lock_local' then raise exception 'LOCAL TEST DATABASE REQUIRED'; end if;
end $$;
\ir ../supabase/migrations/20260911005000_country_launch_readiness.sql
begin;
select public.test_assert((select count(*)=48 from public.country_launch_readiness),'readiness eight per country');
select public.test_assert((select count(*)=1 and bool_and(country_code='AT') from public.country_launch_policy where enabled),'readiness initial only AT');
select public.test_assert((select bool_and(market_status='prepared') from public.country_launch_policy),'readiness no fake live');
select public.test_assert((select bool_and(currency_code=case when country_code='CH' then 'CHF' else 'EUR' end) from public.country_launch_policy),'readiness currencies');
set local role authenticated;
set local test.actor='10000000-0000-4000-8000-000000000080';
set local test.platform_role='platform_admin';
select public.test_block('select public.set_platform_country_launch_status(''DE'',true,''Synthetic readiness proof'',''CONFIRMED:DE'',gen_random_uuid())','42501','readiness RPC incomplete blocked');
select public.test_block('update public.country_launch_policy set enabled=true where country_code=''DE''','42501','readiness browser policy blocked');
select public.test_block('update public.country_launch_readiness set status=''ready'' where country_code=''DE''','42501','readiness browser evidence blocked');
reset role;
select public.test_block('update public.country_launch_policy set market_status=''live'' where country_code=''DE''','42501','readiness direct privileged live blocked');
select public.test_assert((select not enabled and market_status='prepared' from public.country_launch_policy where country_code='DE'),'readiness negative state unchanged');
-- Synthetic evidence is local and rolled back; never real legal clearance.
update public.country_launch_readiness set status='ready',evidence_ref='LOCAL SYNTHETIC ONLY',
  document_version_refs=case when check_key='required_documents' then array['LOCAL-TEST-v1'] else '{}' end where country_code='DE';
do $$ declare k text; begin
  foreach k in array array['legal','privacy','tax','billing','stripe','translation','technical_smoke','required_documents'] loop
    update public.country_launch_readiness set status='open' where country_code='DE' and check_key=k;
    perform public.test_block('select public.set_platform_country_launch_status(''DE'',true,''Synthetic readiness proof'',''CONFIRMED:DE'',gen_random_uuid())','42501','readiness missing '||k);
    update public.country_launch_readiness set status='ready' where country_code='DE' and check_key=k;
  end loop;
end $$;
update public.country_launch_readiness set valid_until=now()-interval '1 second' where country_code='DE' and check_key='legal';
select public.test_block('select public.set_platform_country_launch_status(''DE'',true,''Synthetic readiness proof'',''CONFIRMED:DE'',gen_random_uuid())','42501','readiness expired blocked');
update public.country_launch_readiness set valid_until=null where country_code='DE';
set local role authenticated;
select public.set_platform_country_launch_status('DE',true,'Synthetic local readiness proof','CONFIRMED:DE','20000000-0000-4000-8000-000000000092');
select public.set_platform_country_launch_status('DE',true,'Synthetic local readiness proof','CONFIRMED:DE','20000000-0000-4000-8000-000000000092');
reset role;
select public.test_assert((select enabled and market_status='live' and activated_at is not null from public.country_launch_policy where country_code='DE'),'readiness local positive');
select public.test_assert((select count(*)=1 from public.country_launch_audit where request_id='20000000-0000-4000-8000-000000000092'),'readiness local idempotent audit');
select public.test_block('delete from public.country_launch_audit where request_id=''20000000-0000-4000-8000-000000000092''','42501','readiness audit immutable');
set local role authenticated;
select public.set_platform_country_launch_status('DE',false,'Synthetic local pause proof','CONFIRMED:DE','20000000-0000-4000-8000-000000000093');
reset role;
select public.test_assert((select not enabled and market_status='paused' from public.country_launch_policy where country_code='DE'),'readiness local pause');
select count(*) as readiness_checks_passed from public.test_checks where label like 'readiness %';
rollback;
