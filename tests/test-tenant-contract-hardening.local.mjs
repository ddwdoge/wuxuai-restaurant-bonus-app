// Explicit opt-in local PostgreSQL integration matrix; never invoked by npm test.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run=promisify(execFile);
const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const port=process.env.WUXUAI_7B4C_LOCAL_PORT;
const db=process.env.WUXUAI_7B4C_LOCAL_DB;
assert.match(port??'',/^55\d{3}$/);
assert.match(db??'',/^wuxuai_7b4c_[a-z_]+$/);
const psql='/opt/homebrew/opt/postgresql@17/bin/psql';
const args=['-X','-h','127.0.0.1','-p',port,'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-Atq'];
const sql=s=>execFileSync(psql,args,{input:s,encoding:'utf8',timeout:30000,stdio:['pipe','pipe','pipe']}).trim();
assert.equal(sql("select host(inet_server_addr())||'|'||current_database()"),`127.0.0.1|${db}`);
assert.equal(sql("select count(*) from pg_tables where schemaname='public'"),'0','fresh task-only database required');
const migration=read('supabase/migrations/20260915003000_test_tenant_contract_hardening.sql');
const old=read('supabase/migrations/20260907001000_kassa_test_tenant_cleanup_contract.sql');
const registry=old.match(/create table public.platform_test_tenant_registry \([\s\S]*?\n\);/)[0];
let base=read('tests/pro-commercial-release-lock-base.sql');
base=base.replace(/create table public.platform_test_tenant_registry \([\s\S]*?\n\);/,()=>registry);
sql(base);
sql(read('tests/test-tenant-contract-hardening-fixture.sql'));
sql(read('supabase/migrations/20260824003000_platform_admin_foundation_hardening.sql'));
sql(old.replace(registry,''));
sql(read('supabase/migrations/20260908004000_kassa_test_tenant_legal_cleanup_fix.sql'));
sql(read('supabase/migrations/20260915001000_pro_commercial_release_lock.sql'));
sql(read('supabase/migrations/20260915002000_pro_commercial_control_center_reads.sql'));
const id=n=>`7b4c0000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor=id(900);
sql(`insert into auth.users values('${actor}'); insert into platform_admins values('${actor}','platform_admin',true); select fixture_tenant(1); select fixture_tenant(2);`);
const auth=(who=actor, age=0)=>`set role authenticated; set test.actor='${who}'; select set_config('test.jwt',jsonb_build_object('sub','${who}','session_id','synthetic-session','auth_time',extract(epoch from clock_timestamp())-${age})::text,false);`;
const pre=n=>`select get_platform_test_tenant_cleanup_preflight('${id(n)}')`;
const result=(s,prefix=auth())=>JSON.parse(sql(prefix+s).split('\n').at(-1));
const before=result(pre(1));
const cleanupBefore=sql("select md5(pg_get_functiondef('cleanup_platform_test_tenant(uuid,text,text)'::regprocedure))");
// Upgrade has pre-existing business rows; fresh has an empty canonical billing source.
if(db.endsWith('_upgrade')) sql(`insert into points_transactions(restaurant_id) values('${id(1)}'); insert into audit_log(restaurant_id,action) values('${id(1)}','synthetic_visit');`);
const legacy=result(pre(1));
const snapshot=()=>sql("select jsonb_build_object('restaurants',(select jsonb_agg(t) from restaurants t),'points',(select jsonb_agg(t) from points_transactions t),'audits',(select jsonb_agg(t) from audit_log t))");
const prior=snapshot();
sql(migration);
assert.equal(snapshot(),prior,'migration preserves existing rows');
const after=result(pre(1));
assert.deepEqual(after.inventory,legacy.inventory);
for(const key of Object.keys(legacy)) assert.ok(Object.hasOwn(after,key),`legacy field ${key}`);
assert.equal(after.restaurant_name,before.restaurant_name);
assert.equal(after.eligible,false);
assert.deepEqual(after.blockers,['TEST_ONLY_MARKER_MISSING']);
assert.equal(after.marking_preflight.eligible,true);
assert.equal(after.billing_summary.empty_canonical_billing_state,true);
assert.equal(after.context.stored_plan,'BASIC');
assert.equal(cleanupBefore,sql("select md5(pg_get_functiondef('cleanup_platform_test_tenant(uuid,text,text)'::regprocedure))"));
sql(migration);
assert.deepEqual(result(pre(1)),after,'repeat migration');
let assertions=8;
function pass(label){assertions++; console.log(`PASS ${label}`);}
const mark=(n,key=1000+n,reason='Synthetic authorized local test')=>`select mark_platform_test_tenant('${id(n)}','local-test-${n}','${reason}','CONFIRMED:WUXUAI TEST ${n}:${id(n)}','${id(key)}')`;
function denied(statement,prefix=auth(),pattern=/42501|denied|DENIED|BLOCKED|permission|CONFLICT|RECENT_PLATFORM_AUTH_REQUIRED/i){
  try{sql(prefix+statement);assert.fail('expected denial');}catch(e){assert.match(String(e.stderr??e.message),pattern);}
}
function blocker(label,setup,code=label){
  const value=result(`begin; reset role; ${setup}; ${auth()} ${pre(1)}; rollback;`);
  assert.ok(value.blockers.includes(code),`${label}: ${JSON.stringify(value.blockers)}`);
  assert.equal(value.eligible,false);assert.equal(value.marking_preflight.eligible,false);
  pass(label);
}
const r=id(1), other=id(2);
assert.deepEqual(result(pre(1),'begin read only;'+auth()),after);pass('preflight succeeds in enforced read-only transaction');
blocker('SHARED_ORGANIZATION',`update restaurants set organization_id='${r}' where id='${other}'`);
blocker('FOREIGN_USER_MEMBERSHIP',`insert into restaurant_members values('${other}','${r}','staff')`);
blocker('OWNER_HAS_FOREIGN_RESTAURANT',`update restaurants set owner_id='${r}' where id='${other}'`);
blocker('FOREIGN_STAFF_IDENTITY',`insert into staff_members(restaurant_id,auth_user_id) values('${r}','${r}'),('${other}','${r}')`);
blocker('FOREIGN_CUSTOMER_IDENTITY',`insert into customers(restaurant_id,auth_user_id,is_test_customer) values('${r}','${r}',true),('${other}','${r}',true)`);
blocker('FOREIGN_CUSTOMER_ACCOUNT_MEMBERSHIP',`insert into customer_account_memberships(restaurant_id,account_id) values('${r}','${r}'),('${other}','${r}')`);
blocker('NON_TEST_CUSTOMER_PRESENT',`insert into customers(restaurant_id,is_test_customer) values('${r}',false)`);
blocker('unknown customer classification',`insert into customers(restaurant_id,is_test_customer) values('${r}',null)`,'NON_TEST_CUSTOMER_PRESENT');
blocker('STORAGE_OBJECTS_REQUIRE_SEPARATE_CLEANUP',`insert into storage.objects(bucket_id,name) values('private','${r}/synthetic.jpg')`);
blocker('IMMUTABLE_PLATFORM_AUDIT_PRESENT',`insert into platform_admin_operations(tenant_id) values('${r}')`);
blocker('OWNER_IS_PLATFORM_ADMIN',`insert into platform_admins values('${r}','platform_admin',true)`);
blocker('ORGANIZATION_BINDING_MISSING',`update organizations set owner_id='${other}' where id='${r}'`);
blocker('OWNER_AUTH_BINDING_MISSING',`delete from restaurant_members where restaurant_id='${r}'`);
blocker('LOCATION_BINDING_NOT_EXACT',`update restaurants set primary_branch_id='${other}' where id='${r}'`);
for(const table of ['points_redemption_presentations','gift_redemption_presentations','kassa_redemption_workflows']) {
  blocker(`active ${table}`,`insert into ${table}(restaurant_id,status) values('${r}','${table.startsWith('kassa')?'OPEN':'REDEMPTION_STARTED'}')`,'ACTIVE_OR_RESERVED_REDEMPTION');
}
for(const status of ['paid','pending','failed','manual','not_required',null]) {
  blocker(`subscription ${status}`,`insert into branch_subscriptions(organization_id,branch_id,payment_status) values('${r}','${r}',${status===null?'null':`'${status}'`})`,'PAYMENT_OR_STRIPE_STATE_PRESENT');
}
blocker('organization-only subscription',`insert into branch_subscriptions(organization_id,branch_id) values('${r}','${other}')`,'PAYMENT_OR_STRIPE_STATE_PRESENT');
blocker('stripe reference',`insert into branch_subscriptions(organization_id,branch_id,stripe_customer_id,stripe_subscription_id) values('${r}','${r}','synthetic_customer_reference','synthetic_subscription_reference')`,'PAYMENT_OR_STRIPE_STATE_PRESENT');
blocker('unknown billing schema',`alter table branch_subscriptions rename column stripe_customer_id to unavailable_customer_ref`,'PAYMENT_STRIPE_FREEDOM_NOT_VERIFIED');
blocker('missing owner auth',`delete from auth.users where id='${r}'`,'OWNER_AUTH_BINDING_MISSING');
blocker('cross-organization location',`update branches set organization_id='${other}' where id='${r}'`,'LOCATION_BINDING_NOT_EXACT');
blocker('unknown country',`update branches set country=null where id='${r}'`,'LOCATION_BINDING_NOT_EXACT');
const history=`insert into platform_test_tenant_cleanup_audit(restaurant_id,restaurant_name,organization_id,owner_user_id,test_session_id,platform_admin_user_id,reason,inventory,result) values('${r}','WUXUAI TEST 1','${r}','${r}','synthetic-history','${actor}','Synthetic history evidence','{}','MARKED')`;
blocker('IMMUTABLE_TENANT_AUDIT_PRESENT',history);
const marked=result(`begin; reset role; insert into platform_test_tenant_registry(restaurant_id,restaurant_name,organization_id,owner_user_id,test_session_id,marked_by) values('${r}','WUXUAI TEST 1','${r}','${r}','historical-marker','${actor}'); ${auth()} ${pre(1)}; rollback;`);
assert.equal(marked.marking_preflight.eligible,false);assert.ok(marked.marking_preflight.blockers.includes('TEST_ONLY_MARKER_ALREADY_PRESENT'));pass('existing marker prevents new first marking');
const combo=result(`begin; reset role; insert into customers(restaurant_id,is_test_customer) values('${r}',false); insert into storage.objects(bucket_id,name) values('private','${r}/x'); ${auth()} ${pre(1)}; rollback;`);
assert.ok(combo.blockers.includes('NON_TEST_CUSTOMER_PRESENT')&&combo.blockers.includes('STORAGE_OBJECTS_REQUIRE_SEPARATE_CLEANUP'));pass('combined blockers');
// Actual role table, not a caller-controlled role label.
sql(`insert into auth.users values('${id(901)}'),('${id(902)}'); insert into staff_members(restaurant_id,auth_user_id) values('${other}','${id(901)}'); insert into customers(restaurant_id,auth_user_id,is_test_customer) values('${other}','${id(902)}',true);`);
for(const [label,who] of [['owner',other],['staff',id(901)],['customer',id(902)]]) {denied(pre(1),auth(who));denied(mark(1),auth(who));pass(`${label} cross-tenant denied`);}
denied(pre(1),"set role anon;",/permission denied/i);denied(mark(1),"set role anon;",/permission denied/i);pass('anonymous denied');
for(const age of [601,3600]) denied(mark(1),auth(actor,age));
denied(mark(1),`set role authenticated; set test.actor='${actor}'; set test.jwt='{}';`);
denied(mark(1),auth(other)+`set test.actor='${actor}';`);
pass('missing expired or mismatched recent auth');
for(const role of ['support','billing_admin','viewer']) {
  denied(pre(1),`begin; update platform_admins set role='${role}' where user_id='${actor}'; ${auth()}`);
  pass(`${role} denied despite platform membership`);
}
denied(pre(1),`begin; update platform_admins set active=false where user_id='${actor}'; ${auth()}`);pass('inactive platform admin denied');
assert.equal(result(pre(1),`begin; update platform_admins set role='platform_owner' where user_id='${actor}'; ${auth()}`).eligible_for_marking,true);pass('platform owner read allowed');
denied(mark(1).replace('CONFIRMED:WUXUAI TEST 1:', 'WRONG:'),auth(),/STRONG_CONFIRMATION_REQUIRED/);pass('exact confirmation enforced');
denied(`select mark_platform_test_tenant('${r}','local-test-1','Synthetic reason','CONFIRMED:WUXUAI TEST 1:${r}')`);
denied('insert into platform_test_tenant_mark_requests default values');
pass('old overload and direct DML denied');
const first=result(mark(1));assert.equal(first.marked,true);assert.equal(first.idempotent,false);pass('positive first marking');
const firstReceipt=JSON.parse(sql(`select to_jsonb(t) from platform_test_tenant_mark_requests t where target_restaurant_ref='${r}'`));
assert.equal(firstReceipt.actor_id,actor);assert.equal(firstReceipt.target_restaurant_ref,r);assert.equal(firstReceipt.organization_ref,r);assert.equal(firstReceipt.location_ref,r);assert.equal(firstReceipt.operation,'MARK_TEST_ONLY_TENANT');assert.match(firstReceipt.payload_hash,/^[a-f0-9]{64}$/);assert.ok(firstReceipt.cleanup_audit_id&&firstReceipt.created_at);pass('receipt identity snapshots');
assert.equal(result(mark(1)).idempotent,true);pass('identical replay');
denied(mark(1,1001,'Different synthetic payload'),auth(),/IDEMPOTENCY_CONFLICT/);pass('payload conflict');
denied(mark(2,1001),auth(),/IDEMPOTENCY_CONFLICT/);pass('same key different tenant denied');
const cleanup=result(pre(1));assert.equal(cleanup.eligible,false);assert.ok(cleanup.blockers.includes('IMMUTABLE_MARK_RECEIPT_PRESENT'));assert.ok(cleanup.blockers.includes('IMMUTABLE_TENANT_AUDIT_PRESENT'));pass('receipt and audit block cleanup');
const receiptSnapshot=sql('select jsonb_agg(t) from platform_test_tenant_mark_requests t');
const auditSnapshot=sql('select jsonb_agg(t) from platform_test_tenant_cleanup_audit t');
denied(`select cleanup_platform_test_tenant('${r}','Synthetic cleanup must be denied','CONFIRMED:WUXUAI TEST 1:${r}')`);
for(const table of ['platform_test_tenant_mark_requests','platform_test_tenant_cleanup_audit']) {
  for(const statement of [`delete from ${table}`,`truncate ${table} cascade`,`update ${table} set ${table.endsWith('requests')?'operation=operation':'reason=reason'}`]) denied(statement,'',/IMMUTABLE/);
}
assert.equal(sql('select jsonb_agg(t) from platform_test_tenant_mark_requests t'),receiptSnapshot);
assert.equal(sql('select jsonb_agg(t) from platform_test_tenant_cleanup_audit t'),auditSnapshot);pass('cleanup no write and immutable receipt/audit');
assert.equal(sql("select count(*) from information_schema.columns where table_schema='public' and table_name='platform_test_tenant_mark_requests' and column_name='restaurant_id'"),'0');pass('generic cleanup discovery excludes receipt');
// A late receipt failure must roll back the registry and audit too.
sql('select fixture_tenant(3); select fixture_tenant(4); select fixture_tenant(5);');
sql("create function fixture_reject_receipt() returns trigger language plpgsql as $$begin raise exception 'SYNTHETIC_RECEIPT_FAILURE'; end$$; create trigger fixture_reject_receipt before insert on platform_test_tenant_mark_requests for each row when(new.target_restaurant_ref='7b4c0000-0000-4000-8000-000000000005') execute function fixture_reject_receipt();");
denied(mark(5),auth(),/SYNTHETIC_RECEIPT_FAILURE/);
assert.equal(sql(`select count(*) from platform_test_tenant_registry where restaurant_id='${id(5)}'`),'0');
assert.equal(sql(`select count(*) from platform_test_tenant_cleanup_audit where restaurant_id='${id(5)}'`),'0');pass('late failure atomic rollback');
const asyncSQL=async s=>{
  try{return await run(psql,[...args,'-c',s],{timeout:30000,maxBuffer:1024*1024});}
  catch(e){throw Object.assign(new Error(e.stderr??'local psql failure'),{stderr:e.stderr});}
};
const same=await Promise.all(Array.from({length:12},()=>asyncSQL(auth()+mark(3))));
assert.equal(same.map(x=>JSON.parse(x.stdout.trim().split('\n').at(-1))).filter(x=>!x.idempotent).length,1);
pass('12 identical requests exactly one first result');
const distinct=await Promise.allSettled(Array.from({length:12},(_,i)=>asyncSQL(auth()+mark(4,2000+i))));
assert.equal(distinct.filter(x=>x.status==='fulfilled').length,1);
for(const rejected of distinct.filter(x=>x.status==='rejected')) assert.match(rejected.reason.stderr,/TEST_TENANT_PREFLIGHT_BLOCKED/);
for(const n of [1,3,4]) for(const [table,col] of [['platform_test_tenant_mark_requests','target_restaurant_ref'],['platform_test_tenant_cleanup_audit','restaurant_id'],['platform_test_tenant_registry','restaurant_id']]) assert.equal(sql(`select count(*) from ${table} where ${col}='${id(n)}'`),'1');
pass('12 different requests same tenant exactly one write/receipt/audit');
const preserved=sql('select jsonb_agg(t order by idempotency_key) from platform_test_tenant_mark_requests t');
await Promise.all([asyncSQL(migration),asyncSQL(migration)]);
assert.equal(sql('select jsonb_agg(t order by idempotency_key) from platform_test_tenant_mark_requests t'),preserved);pass('parallel repeat migration preserves receipts');
assert.equal(sql("select release_state from commercial_plan_release_policy where country_code='AT' and plan_key='PRO'"),'LOCKED');
assert.equal(sql('select count(*) from commercial_pro_access_grants'),'0');pass('AT locked no pro grants');
sql(read('tests/test-tenant-receipt-cleanup-compatibility.sql'));
console.log(`LOCAL SQL MATRIX PASS: ${assertions} groups; ${db}; scoped synthetic dependency schema, not full historical replay`);
