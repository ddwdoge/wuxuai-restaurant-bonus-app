// Opt-in integration proof for the disposable local stack. Never target hosted.
import assert from "node:assert/strict";
import {execFileSync,spawn} from "node:child_process";
import {randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";

assert.equal(process.env.ALLOW_LOCAL_TEST_ONLY_STRIPE,"1");
const projectId=readFileSync(new URL("../supabase/config.toml",import.meta.url),"utf8").match(/^project_id = "([^"]+)"/m)?.[1];
assert.equal(projectId,"wuxuai-phase7b4d-local");
const container=`supabase_db_${projectId}`;
const args=["exec","-i",container,"psql","-X","-qAt","-U","postgres","-v","ON_ERROR_STOP=1"];
const sql=input=>execFileSync("docker",args,{input,encoding:"utf8",stdio:["pipe","pipe","pipe"]}).trim();
const asyncSql=input=>new Promise((resolve,reject)=>{const child=spawn("docker",args,{stdio:["pipe","pipe","pipe"]});let out="",err="";child.stdout.on("data",data=>out+=data);child.stderr.on("data",data=>err+=data);child.on("close",code=>code?reject(Error(err)):resolve(out.trim()));child.stdin.end(input);});
const q=value=>`'${String(value).replaceAll("'","''")}'`;
const json=input=>JSON.parse(sql(input).split("\n").filter(Boolean).at(-1));
const denied=(input,pattern)=>assert.throws(()=>sql(input),error=>pattern.test(String(error.stderr??error.message)));

const fixture=json(`select jsonb_build_object('restaurant',r.id,'owner',r.owner_id,'organization',r.organization_id,
  'branch',r.primary_branch_id,'session',(select id from auth.sessions where user_id=r.owner_id limit 1),
  'issuer',(select auth_issuer from project_bootstrap.binding where singleton),
  'grant',(select id from public.test_only_basic_access_receipts x where x.restaurant_id=r.id and x.action='GRANT' order by created_at desc limit 1),
  'foreign_restaurant',(select id from public.restaurants where id<>r.id order by created_at limit 1))
  from public.restaurants r where exists(select 1 from public.test_only_basic_access_receipts x where x.restaurant_id=r.id) limit 1`);
assert.ok(fixture.restaurant&&fixture.session&&fixture.grant&&fixture.foreign_restaurant);
const claims=JSON.stringify({sub:fixture.owner,role:"authenticated",session_id:fixture.session,iss:fixture.issuer});
const owner=statement=>`begin; set local role authenticated; select set_config('request.jwt.claims',${q(claims)},true); ${statement}; commit;`;
const service=statement=>`begin; set local role service_role; select set_config('request.jwt.claim.role','service_role',true); select set_config('request.jwt.claims','{"role":"service_role"}',true); ${statement}; commit;`;
const realCounts=()=>json(`select jsonb_build_object('paid_acceptances',(select count(*) from public.basic_paid_offer_acceptances),
 'subscriptions',(select count(*) from public.branch_subscriptions),'entitlements',(select count(*) from public.branch_entitlement_overrides),
 'trial_claims',(select count(*) from public.billing_trial_claims),'activation',(select count(*) from public.restaurants where activation_status<>'pending_activation'))`);

const before=realCounts(),grantId=randomUUID();
sql(`insert into public.test_only_basic_access_receipts(id,restaurant_id,organization_id,branch_id,action,actor_id,request_id,
 previous_receipt_id,readiness_receipt_id,readiness_snapshot_sha256,customer_join_receipt_id,starts_at,expires_at,reason,
 decision_payload,auth_evidence,result,receipt_sha256,created_at)
 select ${q(grantId)},restaurant_id,organization_id,branch_id,'GRANT',actor_id,${q(randomUUID())},id,readiness_receipt_id,
 readiness_snapshot_sha256,customer_join_receipt_id,clock_timestamp(),clock_timestamp()+interval '30 minutes',
 'Synthetic local Stripe checkout isolation proof',decision_payload,auth_evidence,result,repeat('a',64),clock_timestamp()
 from public.test_only_basic_access_receipts where id=${q(fixture.grant)};`);

const requestId=randomUUID();
const prepared=json(owner(`select public.prepare_test_only_stripe_checkout(${q(fixture.restaurant)},${q(requestId)},'/admin/settings/konto-testphase')`));
assert.equal(prepared.status,"PREPARED");assert.equal(prepared.livemode,false);assert.equal(prepared.amount_minor,5900);
assert.equal(json(owner(`select public.prepare_test_only_stripe_checkout(${q(fixture.restaurant)},${q(requestId)},'/admin/settings/konto-testphase')`)).idempotent,true);
denied(owner(`select public.prepare_test_only_stripe_checkout(${q(fixture.foreign_restaurant)},${q(randomUUID())},'/admin/settings/konto-testphase')`),/TEST_ONLY_CHECKOUT_ACCESS_DENIED/);

const sessionId="cs_test_"+randomUUID().replaceAll("-","");const account="acct_synthetic123";
const testClock="clock_"+randomUUID().replaceAll("-","");const customer="cus_"+randomUUID().replaceAll("-","");
const frozen=new Date().toISOString();
const preparationCall=service(`select public.bind_test_only_stripe_test_clock_customer(${q(prepared.id)},${q(account)},
  ${q(testClock)},${q(customer)},${q(frozen)}::timestamptz,false)`);
assert.equal(json(preparationCall).status,"TEST_CLOCK_CUSTOMER_BOUND");
assert.equal(json(preparationCall).idempotent,true);
const parallelPreparations=await Promise.all(Array.from({length:8},()=>asyncSql(preparationCall)));
assert.equal(parallelPreparations.length,8);
assert.equal(sql(`select count(*) from test_only_checkout.customer_preparations where request_ref=${q(prepared.id)}`),"1");
denied(service(`select public.bind_test_only_stripe_test_clock_customer(${q(prepared.id)},${q(account)},
  'clock_foreign123',${q(customer)},${q(frozen)}::timestamptz,false)`),/TEST_ONLY_TEST_CUSTOMER_REPLAY_CONFLICT/);
denied(service(`select public.bind_test_only_stripe_checkout_session(${q(prepared.id)},${q(account)},${q(sessionId)},${q(prepared.price_id)},true)`),/TEST_ONLY_CHECKOUT_SERVICE_REQUIRED/);
denied(service(`select public.bind_test_only_stripe_checkout_session_v2(${q(prepared.id)},${q(account)},${q(sessionId)},
  ${q(testClock)},'cus_foreign123',${q(prepared.price_id)},false)`),/TEST_ONLY_TEST_CUSTOMER_BINDING_MISMATCH/);
assert.equal(json(service(`select public.bind_test_only_stripe_checkout_session_v2(${q(prepared.id)},${q(account)},${q(sessionId)},
  ${q(testClock)},${q(customer)},${q(prepared.price_id)},false)`)).status,"SESSION_CREATED");
assert.equal(json(service(`select public.bind_test_only_stripe_checkout_session_v2(${q(prepared.id)},${q(account)},${q(sessionId)},
  ${q(testClock)},${q(customer)},${q(prepared.price_id)},false)`)).idempotent,true);
denied(service(`select public.record_test_only_stripe_checkout_completed('evt_badprice123',repeat('b',64),now(),${q(account)},${q(sessionId)},${q(fixture.restaurant)},${q(requestId)},'price_wrong123',5900,'EUR',false)`),/TEST_ONLY_CHECKOUT_EVENT_BINDING_MISMATCH/);

const eventId="evt_"+randomUUID().replaceAll("-","");
const call=service(`select public.record_test_only_stripe_checkout_completed(${q(eventId)},repeat('c',64),now(),${q(account)},${q(sessionId)},${q(fixture.restaurant)},${q(requestId)},${q(prepared.price_id)},5900,'EUR',false)`);
const parallel=await Promise.all(Array.from({length:8},()=>asyncSql(call)));
assert.equal(parallel.length,8);assert.equal(sql(`select count(*) from test_only_checkout.events where event_id=${q(eventId)}`),"1");
assert.equal(sql(`select count(*) from test_only_checkout.audit where request_ref=${q(prepared.id)}`),"4");
assert.equal(json(service(`select public.record_test_only_stripe_checkout_completed(${q(eventId)},repeat('c',64),now(),${q(account)},${q(sessionId)},${q(fixture.restaurant)},${q(requestId)},${q(prepared.price_id)},5900,'EUR',false)`)).idempotent,true);
denied(service(`select public.record_test_only_stripe_checkout_completed(${q(eventId)},repeat('d',64),now(),${q(account)},${q(sessionId)},${q(fixture.restaurant)},${q(requestId)},${q(prepared.price_id)},5900,'EUR',false)`),/TEST_ONLY_CHECKOUT_EVENT_REPLAY_CONFLICT/);

const cancelPrepared=json(owner(`select public.prepare_test_only_stripe_checkout(${q(fixture.restaurant)},${q(randomUUID())},'/admin/settings/konto-testphase')`));
const cancelRequest=randomUUID();
assert.equal(json(owner(`select public.cancel_test_only_stripe_checkout(${q(cancelPrepared.id)},${q(cancelRequest)})`)).status,"CANCELLED");
assert.equal(json(owner(`select public.cancel_test_only_stripe_checkout(${q(cancelPrepared.id)},${q(cancelRequest)})`)).idempotent,true);
denied(owner(`select public.cancel_test_only_stripe_checkout(${q(cancelPrepared.id)},${q(randomUUID())})`),/TEST_ONLY_CHECKOUT_CANCEL_REPLAY_CONFLICT/);
denied(service(`select public.bind_test_only_stripe_checkout_session(${q(cancelPrepared.id)},${q(account)},'cs_test_cancelled123',${q(cancelPrepared.price_id)},false)`),/TEST_ONLY_CHECKOUT_SESSION_CONFLICT/);

assert.deepEqual(realCounts(),before);
for(const role of ["anon","authenticated","service_role"]){for(const table of ["test_only_checkout.requests","test_only_checkout.events","test_only_checkout.audit","test_only_checkout.customer_preparations"])
  assert.equal(sql(`select has_table_privilege(${q(role)},${q(table)},'SELECT,INSERT,UPDATE,DELETE')`),"f");}
assert.equal(sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='test_only_checkout' and c.relkind='r' and not c.relrowsecurity"),"0");
console.log(JSON.stringify({status:"TEST_ONLY_STRIPE_CHECKOUT_LOCAL_PASS",test_clock_customer_binding:1,
  parallel_preparation_replays:8,session_creation:1,cancellation:1,event:1,parallel_deliveries:8,replay:true,
  foreign_tenant:"DENIED",invoice_paid:"CLOSED_AT_EDGE_AND_DB_SIGNATURE",real_business_delta:0}));
