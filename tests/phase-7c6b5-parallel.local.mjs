import {execFile,execFileSync} from 'node:child_process';
import {promisify} from 'node:util';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const args=['exec','-i','supabase_db_wuxuai-phase7b4d-local','psql','-U','postgres','-d','postgres','-X','-qAt','-v','ON_ERROR_STOP=1'];
const sql=input=>{try{return execFileSync('docker',args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();}catch(error){throw new Error(String(error.stderr).split('\n').filter(l=>/^(ERROR|CONTEXT)/.test(l)).join('\n'));}};
assert.equal(sql('select count(*) from supabase_migrations.schema_migrations'),'165');
const prefix='7c65c000';const actor=prefix+'-0000-4000-8000-000000000002',tenant=prefix+'-0000-4000-8000-000000000011';
let fixture=readFileSync(new URL('./phase-7c5-owner-capacity-contract.local.sql',import.meta.url),'utf8').split('set local role authenticated;')[0]
 .replaceAll('7c500000',prefix).replaceAll('phase-7c5-local','phase-7c6b5-parallel').replaceAll('phase7c5-','phase7c6b5-parallel-');
const claim=`select set_config('request.jwt.claim.sub','${actor}',true);select set_config('request.jwt.claims',jsonb_build_object('sub','${actor}','role','authenticated','session_id',gen_random_uuid(),'auth_time',extract(epoch from now()))::text,true);`;
const call=days=>`public.update_platform_restaurant_subscription_confirmed('${tenant}',${days?'null':"'active'"},null,null,${days??'null'},'Synthetic concurrent test','CONFIRMED',gen_random_uuid())`;
try{
 sql(fixture+`update public.branch_subscriptions set status='paused',subscription_status='paused' where id='${prefix}-0000-4000-8000-000000000013';
insert into public.platform_admins(user_id,role,active) values('${actor}','platform_owner',true);commit;`);
 const before=sql(`select md5(row_to_json(s)::text) from public.branch_subscriptions s where branch_id='${prefix}-0000-4000-8000-000000000012'`);
 const run=promisify(execFile);
 const auditBefore=sql('select count(*) from public.audit_log');
 sql(`create function public.phase7c6b5_test_no_insert() returns trigger language plpgsql as $$begin raise exception 'UNEXPECTED_SUBSCRIPTION_INSERT';end $$;
 create trigger zz_test_existing_no_insert before insert on public.branch_subscriptions for each statement execute function public.phase7c6b5_test_no_insert();`);
 try {
  const lookups=await Promise.all(Array.from({length:24},()=>run('docker',[...args,'-c',`begin;set local lock_timeout='10s';set local statement_timeout='20s';select public.ensure_restaurant_branch('${tenant}');commit;`],{encoding:'utf8'})));
  assert.ok(lookups.every(r=>r.stdout.trim()===prefix+'-0000-4000-8000-000000000012'));
  assert.equal(sql('select count(*) from public.audit_log'),auditBefore);
  assert.equal(sql(`select count(*) from public.branch_subscriptions where branch_id='${prefix}-0000-4000-8000-000000000012'`),'1');
  assert.equal(sql(`select md5(row_to_json(s)::text) from public.branch_subscriptions s where branch_id='${prefix}-0000-4000-8000-000000000012'`),before);
  console.log('EXISTING_HELPER_24_PARALLEL_PASS; NO_INSERT_ATTEMPT; NO_AUDIT_WRITE; ALL_SUBSCRIPTION_FIELDS_IDENTICAL');
 } finally {
  sql('drop trigger zz_test_existing_no_insert on public.branch_subscriptions; drop function public.phase7c6b5_test_no_insert();');
 }
 const results=await Promise.all(Array.from({length:24},async()=>{try{await run('docker',[...args,'-c',`begin;${claim}set local role authenticated;select ${call()};rollback;`],{encoding:'utf8'});return true;}catch(e){assert.match(String(e.stderr),/BILLING_PROVIDER_ACTIVATION_REQUIRED/);return false;}}));
 assert.equal(results.filter(Boolean).length,0);
 assert.equal(sql(`select md5(row_to_json(s)::text) from public.branch_subscriptions s where branch_id='${prefix}-0000-4000-8000-000000000012'`),before);
 sql(`begin;${claim}
do $$declare api text; signature text;begin
 foreach api in array array['anon','authenticated','service_role'] loop
  if has_table_privilege(api,'public.billing_legacy_eligibility','INSERT,UPDATE,DELETE,TRUNCATE') or has_table_privilege(api,'public.billing_admin_write_context','INSERT,UPDATE,DELETE,TRUNCATE') then raise exception 'ACL_LEAK';end if;
 end loop;
 if exists(select 1 from pg_proc where proname in ('get_platform_billing_readiness','guard_billing_activation_write','billing_admin_actions_internal') and not coalesce(proconfig@>array['search_path=pg_catalog, public, pg_temp'],false)) then raise exception 'SEARCH_PATH';end if;
 if exists(select 1 from public.billing_legacy_eligibility where restaurant_id='${tenant}') then raise exception 'FUTURE_LEGACY_ADMISSION';end if;
end $$;
rollback;`);
 console.log('PARALLEL_ACTIVATION_24_REQUESTS_0_SUCCESSES; SUBSCRIPTION_FINGERPRINT_IDENTICAL; PRIVATE_ACLS_AND_SEARCH_PATH_PASS; FUTURE_LEGACY_EXCLUDED');
}finally{
 sql(`begin;set local session_replication_role=replica;
delete from public.platform_admins where user_id='${actor}';
delete from public.branch_subscriptions where branch_id='${prefix}-0000-4000-8000-000000000012';
delete from public.restaurant_members where restaurant_id='${tenant}';
delete from public.branches where restaurant_id='${tenant}';delete from public.restaurants where id='${tenant}';
delete from public.organizations where id='${prefix}-0000-4000-8000-000000000010';
delete from auth.users where id in ('${actor}','${prefix}-0000-4000-8000-000000000001');commit;`);
 console.log('PARALLEL_SYNTHETIC_FIXTURES_REMOVED');
}
