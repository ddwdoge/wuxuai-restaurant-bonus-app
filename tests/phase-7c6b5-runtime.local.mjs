import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const migration=read('supabase/migrations/20260923001000_platform_admin_billing_readiness_reads.sql').replace(/^begin;|^commit;/gm,'');
const fixture=read('tests/phase-7c5-owner-capacity-contract.local.sql').split('set local role authenticated;')[0].replace(/^begin;/m,'');
const sql=input=>{try{return execFileSync('docker',['exec','-i','supabase_db_wuxuai-phase7b4d-local','psql','-U','postgres','-d','postgres','-X','-qAt','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:8*1024*1024});}catch(error){throw new Error(String(error.stderr).split('\n').filter(l=>/^(ERROR|CONTEXT)/.test(l)).join('\n'));}};
assert.equal(sql('select count(*) from supabase_migrations.schema_migrations').trim(),'164');
let setup='begin;\n';
for(let i=1;i<=6;i++)setup+=fixture.replaceAll('7c500000',`7c65000${i}`).replaceAll('phase-7c5-local',`phase-7c6b5-${i}`).replaceAll('phase7c5-',`phase7c6b5-${i}-`);
setup+=`set local session_replication_role=replica;
update public.branch_subscriptions set status='trialing',subscription_status='trialing',trial_started_at=now()-interval '20 days',trial_ends_at=now()+interval '10 days'
where id::text like '7c65000%' and id<>'7c650001-0000-4000-8000-000000000013';
update public.branch_subscriptions set trial_ends_at=null where id='7c650003-0000-4000-8000-000000000013';
update public.branch_subscriptions set trial_started_at=null where id='7c650004-0000-4000-8000-000000000013';
update public.branch_subscriptions set trial_ends_at=now()-interval '1 day' where id='7c650005-0000-4000-8000-000000000013';
update public.restaurants set activation_status='pending_activation' where id='7c650006-0000-4000-8000-000000000011';
update public.branch_subscriptions set status='pending_activation',subscription_status='pending_activation',selected_plan='BASIC',trial_started_at=null,trial_ends_at=null,payment_status='not_required',current_period_end=null
where id='7c650006-0000-4000-8000-000000000013';
set local session_replication_role=origin;
insert into public.platform_admins(user_id,role,active) values('7c650001-0000-4000-8000-000000000002','platform_owner',true);
create temporary table baseline_tables as select tablename from pg_tables where schemaname='public';
create function pg_temp.fingerprint() returns jsonb language plpgsql as $$ declare t record; h text; v jsonb:='{}'; begin
for t in select tablename from baseline_tables order by tablename loop
 execute format('select md5(coalesce(string_agg(to_jsonb(r)::text,chr(10) order by to_jsonb(r)::text),'''')) from public.%I r',t.tablename) into h;
 v:=v||jsonb_build_object(t.tablename,h); end loop; return v; end $$;
create temporary table baseline as select pg_temp.fingerprint() fingerprint;
create function pg_temp.check_true(v boolean,label text) returns void language plpgsql as $$ begin
if v is distinct from true then raise exception 'ASSERT: %',label; end if; end $$;
create function pg_temp.denied(q text) returns void language plpgsql as $$ begin
begin execute q; exception when insufficient_privilege then return; end;
raise exception 'EXPECTED_DENIAL: %',q; end $$;
`;
const invariant=`select pg_temp.check_true(pg_temp.fingerprint()=(select fingerprint from baseline),'existing data unchanged');`;
const claims=`select set_config('request.jwt.claim.sub','7c650001-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','7c650001-0000-4000-8000-000000000002','role','authenticated','session_id',gen_random_uuid(),'auth_time',extract(epoch from now()))::text,true);`;
const call=(tenant,action='null',days='null',key="gen_random_uuid()")=>`public.update_platform_restaurant_subscription_confirmed('${tenant}',${action},null,null,${days},'Synthetic local regression','CONFIRMED',${key})`;
let checks=`
create function pg_temp.reject_subscription_insert() returns trigger language plpgsql as $$
begin raise exception 'UNEXPECTED_SUBSCRIPTION_INSERT'; end $$;
create trigger zz_test_existing_no_insert before insert on public.branch_subscriptions
for each statement execute function pg_temp.reject_subscription_insert();
select pg_temp.check_true(public.ensure_restaurant_branch('7c650001-0000-4000-8000-000000000011')='7c650001-0000-4000-8000-000000000012','existing branch return');
select public.ensure_restaurant_branch(id) from public.restaurants where id::text like '7c65000%';
select public.ensure_restaurant_branch(id) from public.restaurants where id::text like '7c65000%';
${invariant}
drop trigger zz_test_existing_no_insert on public.branch_subscriptions;
-- Synthetic subtransactions remove a fixture subscription, then must fail
-- closed. Catching the denial rolls the deletion back as well.
do $$begin
 begin
  delete from public.branch_subscriptions where id='7c650001-0000-4000-8000-000000000013';
  perform public.ensure_restaurant_branch('7c650001-0000-4000-8000-000000000011');
  raise exception 'UNAUTHORIZED_NEW_SUBSCRIPTION';
 exception when insufficient_privilege then
  if sqlerrm<>'BILLING_PROVIDER_ACTIVATION_REQUIRED' then raise; end if;
 end;
end $$;
${invariant}
`+claims+`set local role authenticated;
select pg_temp.check_true(public.get_platform_billing_readiness()=public.get_platform_billing_readiness(),'read deterministic');
select pg_temp.check_true(public.get_platform_billing_readiness()->>'live_billing'='BLOCKED','live blocked');
reset role;
${invariant}
`;
for(let i=1;i<=6;i++){
 const tenant=`7c65000${i}-0000-4000-8000-000000000011`;
 for(const action of ["'active'","'trialing'"])checks+=`select pg_temp.denied($q$select ${call(tenant,action)}$q$);\n`;
 if(i!==2)checks+=`select pg_temp.denied($q$select ${call(tenant,'null','14')}$q$);\n`;
}
checks+=`set local role authenticated;
select ${call('7c650002-0000-4000-8000-000000000011','null','14',"'7c650000-0000-4000-8000-000000000099'")};
select ${call('7c650002-0000-4000-8000-000000000011','null','14',"'7c650000-0000-4000-8000-000000000099'")};
reset role;
select pg_temp.check_true((select trial_ends_at=now()+interval '24 days' from public.branch_subscriptions where id='7c650002-0000-4000-8000-000000000013'),'extension exactly once');
select pg_temp.check_true(not exists(select 1 from public.billing_admin_write_context),'context cleaned');
select pg_temp.denied($q$update public.branch_subscriptions set trial_ends_at=trial_ends_at+interval '1 day' where id='7c650002-0000-4000-8000-000000000013'$q$);
select pg_temp.denied($q$update public.branch_subscriptions set payment_status='paid' where id='7c650001-0000-4000-8000-000000000013'$q$);
select pg_temp.denied('delete from public.billing_legacy_eligibility');
select pg_temp.denied('truncate public.billing_legacy_seal');
set local role authenticated;
select ${call('7c650001-0000-4000-8000-000000000011',"'paused'")};
select pg_temp.denied($q$select ${call('7c650001-0000-4000-8000-000000000011',"'active'")}$q$);
reset role;
set local role service_role;
select pg_temp.denied($q$update public.branch_subscriptions set status='active',subscription_status='active' where id='7c650001-0000-4000-8000-000000000013'$q$);
select pg_temp.denied('select public.get_platform_billing_readiness()');
reset role;
select set_config('request.jwt.claim.sub','7c650001-0000-4000-8000-000000000001',true);
set local role authenticated;
select pg_temp.denied('select public.get_platform_billing_readiness()');
reset role;set local role anon;
select pg_temp.denied('select public.get_platform_billing_readiness()');
reset role;
`;
const regressions=['phase-7c6b2-pending-registration.local.sql','phase-7c6b2-role-security.local.sql','phase-7c6b2-legacy-active.local.sql']
 .map(name=>read('tests/'+name).replace(/^begin;/gm,'savepoint regression;').replace(/^rollback;/gm,'rollback to savepoint regression;')).join('\n');
const output=sql(setup+migration+invariant+migration+invariant+migration+invariant+regressions+invariant+checks+'rollback; select \'BILLING_READINESS_RUNTIME_PASS\';');
assert.ok(output.includes('BILLING_READINESS_RUNTIME_PASS'));
console.log('UPGRADE_164_165_AND_REPEAT_1_2_PASS; EXISTING_TABLE_FINGERPRINTS_IDENTICAL; TRIAL_AND_ACTIVATION_GUARDS_PASS; ROLE_AND_DML_PASS; IDEMPOTENT_EXTENSION_PASS; FIXTURES_ROLLED_BACK');
