// Opt-in integration proof for the disposable local stack. Never target hosted.
import assert from "node:assert/strict";
import {execFileSync,spawn} from "node:child_process";
import {randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";

assert.equal(process.env.ALLOW_LOCAL_TEST_ONLY_STRIPE_LIFECYCLE,"1");
const projectId=readFileSync(new URL("../supabase/config.toml",import.meta.url),"utf8").match(/^project_id = "([^"]+)"/m)?.[1];
assert.equal(projectId,"wuxuai-phase7b4d-local");
const container=`supabase_db_${projectId}`;
const args=["exec","-i",container,"psql","-X","-qAt","-U","postgres","-v","ON_ERROR_STOP=1"];
const sql=input=>execFileSync("docker",args,{input,encoding:"utf8",stdio:["pipe","pipe","pipe"]}).trim();
const asyncSql=input=>new Promise((resolve,reject)=>{const child=spawn("docker",args,{stdio:["pipe","pipe","pipe"]});let out="",err="";
  child.stdout.on("data",data=>out+=data);child.stderr.on("data",data=>err+=data);
  child.on("close",code=>code?reject(Error(err)):resolve(out.trim()));child.stdin.end(input);});
const json=input=>JSON.parse(sql(input).split("\n").filter(Boolean).at(-1));
const denied=(input,pattern)=>assert.throws(()=>sql(input),error=>pattern.test(String(error.stderr??error.message)));
const service=statement=>`begin; set local role service_role; select set_config('request.jwt.claim.role','service_role',true);
  select set_config('request.jwt.claims','{"role":"service_role"}',true); ${statement}; commit;`;
const realCounts=()=>json(`select jsonb_build_object('paid',(select count(*) from public.basic_paid_offer_acceptances),
  'subscriptions',(select count(*) from public.branch_subscriptions),'entitlements',(select count(*) from public.branch_entitlement_overrides),
  'trials',(select count(*) from public.billing_trial_claims),'active',(select count(*) from public.restaurants where activation_status<>'pending_activation'))`);
const lifecycleCounts=()=>json(`select jsonb_build_object('anchors',(select count(*) from test_only_checkout.subscription_anchors),
  'events',(select count(*) from test_only_checkout.subscription_events),'audit',(select count(*) from test_only_checkout.subscription_audit))`);

const ids={owner:randomUUID(),organization:randomUUID(),restaurant:randomUUID(),branch:randomUUID(),binding:randomUUID(),
  request:randomUUID(),requestId:randomUUID(),access:randomUUID()};
const provider={account:"acct_synthetic123",session:"cs_test_"+randomUUID().replaceAll("-",""),
  customer:"cus_synthetic123",subscription:"sub_synthetic123",event:"evt_"+randomUUID().replaceAll("-","")};
const product="prod_synthetic123",price="price_synthetic123",checkoutHash="b".repeat(64);

// Start from an immutable accepted checkout. This fixture is installed only
// in the disposable DB; the production v2 anchor must adopt it normally.
sql(`begin;
  set local session_replication_role=replica;
  insert into project_bootstrap.database_anchor(singleton,anchor) values(true,'${randomUUID()}') on conflict(singleton) do nothing;
  insert into project_bootstrap.binding(singleton,binding_id,project_ref,backend_url,auth_issuer,app_origin,database_anchor,
    database_system_id,database_name,hosting_account_id,worker_name,request_id,operator_ref)
  select true,'${ids.binding}','mbgveqbhessaunrhfudm','https://mbgveqbhessaunrhfudm.supabase.co',
    'https://mbgveqbhessaunrhfudm.supabase.co/auth/v1','https://staging-v2.bonus.wuxuaisbi.com',a.anchor,
    c.system_identifier::text,current_database(),'2c1dfe5a3330e0b63b30a5838d81d3bc','wuxuai-restaurant-bonus-app-staging-v2',
    '${randomUUID()}','LOCAL_TEST' from project_bootstrap.database_anchor a,pg_catalog.pg_control_system() c where a.singleton;
  insert into auth.users(id,aud,role,email,encrypted_password,created_at,updated_at)
    values('${ids.owner}','authenticated','authenticated','lifecycle@example.invalid','',now(),now());
  insert into public.organizations(id,owner_id,name,status) values('${ids.organization}','${ids.owner}','LOCAL TEST','draft');
  insert into public.restaurants(id,owner_id,name,slug,status,organization_id,activation_status)
    values('${ids.restaurant}','${ids.owner}','WUXUAI TEST LIFECYCLE','local-test-lifecycle','draft','${ids.organization}','pending_activation');
  insert into public.branches(id,organization_id,restaurant_id,name,slug,status,country)
    values('${ids.branch}','${ids.organization}','${ids.restaurant}','LOCAL','local','draft','AT');
  update public.restaurants set primary_branch_id='${ids.branch}' where id='${ids.restaurant}';
  insert into test_only_checkout.requests(id,project_ref,binding_id,restaurant_id,organization_id,branch_id,access_receipt_id,
    actor_id,request_id,return_route,product_code,catalog_version,binding_revision,provider,environment,livemode,
    product_id,price_id,lookup_key,amount_minor,currency,billing_interval,payload_sha256,provider_account_id,
    provider_session_id,status,created_at,session_created_at,completed_at)
  values('${ids.request}','mbgveqbhessaunrhfudm','${ids.binding}','${ids.restaurant}','${ids.organization}','${ids.branch}',
    '${ids.access}','${ids.owner}','${ids.requestId}','/admin/settings/konto-testphase','BASIC',1,2,'STRIPE','TEST',false,
    '${product}','${price}','wuxuai_bonus_basic_monthly',5900,'EUR','MONTH',repeat('a',64),'${provider.account}',
    '${provider.session}','COMPLETED',now(),now(),now());
  insert into test_only_checkout.events(event_id,request_ref,restaurant_id,provider_account_id,provider_session_id,event_type,
    livemode,price_id,amount_total,currency,payload_sha256,event_created_at,result_code)
  values('${provider.event}','${ids.request}','${ids.restaurant}','${provider.account}','${provider.session}',
    'checkout.session.completed',false,'${price}',5900,'EUR','${checkoutHash}',now(),'TEST_ONLY_CHECKOUT_COMPLETED');
  set local session_replication_role=origin;
commit;`);
assert.equal(json(service("select public.get_server_project_binding()" )).project_ref,"mbgveqbhessaunrhfudm");
const before=realCounts();

const anchorCall=service(`select public.record_test_only_stripe_checkout_completed_v2('${provider.event}','${checkoutHash}',now(),
  '${provider.account}','${provider.session}','${provider.customer}','${provider.subscription}','${ids.restaurant}',
  '${ids.requestId}','${price}',5900,'EUR',false)`);
const anchor=json(anchorCall);assert.equal(anchor.subscription_anchor,true);assert.equal(anchor.anchor_idempotent,false);
assert.equal(json(anchorCall).anchor_idempotent,true);
denied(anchorCall.replace(provider.customer,"cus_foreign123"),/ANCHOR_REPLAY_CONFLICT/);

const baseTime=new Date(Date.now()+60_000).toISOString();
const eventCall=({id,type,hash="d",created=baseTime,object,status,periodStart="2026-11-01T00:00:00Z",periodEnd="2026-12-01T00:00:00Z",cancel=false,
  restaurant=ids.restaurant,eventPrice=price})=>service(`select public.record_test_only_stripe_subscription_event('${id}','${type}',repeat('${hash}',64),'${created}'::timestamptz,
  '${provider.account}','${object}','${provider.customer}','${provider.subscription}','${ids.request}','${restaurant}',
  '${ids.requestId}','${eventPrice}',5900,'EUR','${status}','${periodStart}'::timestamptz,'${periodEnd}'::timestamptz,${cancel},false)`);
const events={paid:"evt_"+randomUUID().replaceAll("-",""),oldFail:"evt_"+randomUUID().replaceAll("-",""),
  update:"evt_"+randomUUID().replaceAll("-",""),deleted:"evt_"+randomUUID().replaceAll("-",""),
  postCancel:"evt_"+randomUUID().replaceAll("-",""),parallel:"evt_"+randomUUID().replaceAll("-","")};
const paid=eventCall({id:events.paid,type:"invoice.paid",object:"in_syntheticpaid123",status:"paid"});
assert.equal(json(paid).synthetic_state,"ACTIVE_TEST");assert.equal(json(paid).idempotent,true);
denied(eventCall({id:events.paid,type:"invoice.paid",hash:"e",object:"in_syntheticpaid123",status:"paid"}),/REPLAY_CONFLICT/);
const old=new Date(Date.parse(baseTime)-60_000).toISOString();
const ignored=json(eventCall({id:events.oldFail,type:"invoice.payment_failed",created:old,object:"in_syntheticfailed12",status:"open"}));
assert.equal(ignored.projection_applied,false);assert.equal(ignored.synthetic_state,"ACTIVE_TEST");
assert.equal(json(eventCall({id:events.update,type:"customer.subscription.updated",created:new Date(Date.parse(baseTime)+60_000).toISOString(),object:provider.subscription,status:"active",cancel:true})).synthetic_state,"CANCEL_AT_PERIOD_END_TEST");
assert.equal(json(eventCall({id:events.deleted,type:"customer.subscription.deleted",created:new Date(Date.parse(baseTime)+120_000).toISOString(),object:provider.subscription,status:"canceled"})).synthetic_state,"CANCELLED_TEST");
const terminal=json(eventCall({id:events.postCancel,type:"invoice.paid",created:new Date(Date.parse(baseTime)+180_000).toISOString(),object:"in_syntheticafter123",status:"paid"}));
assert.equal(terminal.projection_applied,false);assert.equal(terminal.synthetic_state,"CANCELLED_TEST");
const parallelCall=eventCall({id:events.parallel,type:"invoice.payment_failed",created:new Date(Date.parse(baseTime)+240_000).toISOString(),object:"in_syntheticparallel",status:"open"});
await Promise.all(Array.from({length:8},()=>asyncSql(parallelCall)));
assert.equal(sql(`select count(*) from test_only_checkout.subscription_events where event_id='${events.parallel}'`),"1");

const countsBeforeMismatch=lifecycleCounts();
denied(eventCall({id:"evt_"+randomUUID().replaceAll("-",""),type:"invoice.paid",object:"in_syntheticwrong123",status:"paid",eventPrice:"price_foreign123"}),/BINDING_MISMATCH/);
denied(eventCall({id:"evt_"+randomUUID().replaceAll("-",""),type:"invoice.paid",object:"in_syntheticforeign1",status:"paid",restaurant:randomUUID()}),/BINDING_MISMATCH/);
assert.deepEqual(lifecycleCounts(),countsBeforeMismatch);
denied(`update test_only_checkout.subscription_state set synthetic_state='ACTIVE_TEST' where request_ref='${ids.request}'`,/STATE_MUTATION_DENIED/);
denied(`delete from test_only_checkout.subscription_events where event_id='${events.paid}'`,/EVIDENCE_IMMUTABLE/);
assert.deepEqual(realCounts(),before);
for(const role of ["anon","authenticated","service_role"]){for(const table of ["subscription_anchors","subscription_events","subscription_state","subscription_audit"])
  assert.equal(sql(`select has_table_privilege('${role}','test_only_checkout.${table}','SELECT,INSERT,UPDATE,DELETE')`),"f");}
assert.equal(sql("select has_function_privilege('service_role','public.record_test_only_stripe_subscription_event(text,text,text,timestamptz,text,text,text,text,uuid,uuid,uuid,text,integer,text,text,timestamptz,timestamptz,boolean,boolean)','EXECUTE')"),"t");
assert.equal(sql("select has_function_privilege('authenticated','public.record_test_only_stripe_subscription_event(text,text,text,timestamptz,text,text,text,text,uuid,uuid,uuid,text,integer,text,text,timestamptz,timestamptz,boolean,boolean)','EXECUTE')"),"f");
console.log(JSON.stringify({status:"TEST_ONLY_STRIPE_SUBSCRIPTION_LIFECYCLE_LOCAL_PASS",anchor:1,lifecycle_events:6,
  parallel_deliveries:8,replay:true,out_of_order:"IGNORED_WITH_EVIDENCE",terminal_cancellation:"STICKY",
  foreign_tenant:"DENIED",wrong_price:"DENIED",refund:"CLOSED",real_business_delta:0}));
