// Fresh, disposable, unlinked local stack only. Real Auth and Owner RPC,
// unchanged triggers and gates. Positive activated-PRO setup is NOT claimed.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
assert.ok(process.env.PRO_NOTIFICATION_WORKDIR,'An explicit disposable local stack is required');
const workdir=realpathSync(process.env.PRO_NOTIFICATION_WORKDIR);
const tempRoots=[tmpdir(),'/tmp'].filter(existsSync).map(p=>realpathSync(p));
assert.ok(tempRoots.some(p=>/^wuxuai-inbox-mail-[\w-]+$/.test(relative(p,workdir))),'Stack must be a dedicated temporary directory');
assert.ok(!existsSync(resolve(workdir,'supabase/.temp/project-ref')),'Linked projects are forbidden');
const config=readFileSync(resolve(workdir,'supabase/config.toml'),'utf8');
const projectId=config.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
assert.match(projectId??'',/^wuxuai-inbox-mail-[\w-]+$/);
const apiPort=config.match(/^\[api\]\s*\n(?:[^\[]*?\n)?port\s*=\s*(\d+)/m)?.[1];
assert.ok(apiPort,'Local API port must be explicit');
const status=JSON.parse(execFileSync(resolve(root,'node_modules/.bin/supabase'),['status','--workdir',workdir,'-o','json'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}));
assert.match(status.API_URL,/^http:\/\/127\.0\.0\.1:\d+$/);
assert.equal(new URL(status.API_URL).port,apiPort,'Auth and DB must belong to the same local stack');
const container='supabase_db_'+projectId;
const docker=process.env.DOCKER_BIN||'docker';
const sql=s=>execFileSync(docker,['exec','-i',container,'psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:s,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const parallelSql=s=>new Promise((resolve,reject)=>{
 const child=spawn(docker,['exec','-i',container,'psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{stdio:['pipe','pipe','ignore']});
 let out='';child.stdout.on('data',b=>{out+=b;});child.on('error',reject);child.on('close',code=>code===0?resolve(out.trim()):reject(new Error('local SQL failed (details suppressed)')));child.stdin.end(s);
});
async function call(path,key,body,method='POST'){
 const r=await fetch(status.API_URL+path,{method,headers:{apikey:status.ANON_KEY,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 return {status:r.status,body:await r.json()};
}
const rpc=(name,key,input)=>call('/rest/v1/rpc/'+name,key,input);
const checks=[];const ok=(value,label)=>{assert.ok(value,label);checks.push(label);};
const users=[];
for(const label of ['owner-a','owner-b','customer']){
 const email=`${label}-${randomUUID()}@example.invalid`,password=randomUUID()+randomUUID();
 const signup=await call('/auth/v1/signup',status.ANON_KEY,{email,password});
 ok(signup.status===200&&signup.body.access_token,'local confirmed Auth '+label);
 users.push({id:signup.body.user.id,key:signup.body.access_token});
}
const tenants=[];
for(const owner of users.slice(0,2)){
 const r=await rpc('start_restaurant_owner_trial',owner.key,{input_owner_name:'SYNTHETIC LOCAL',input_restaurant_name:'SYNTHETIC LOCAL '+randomUUID(),input_phone:null,input_country:'AT'});
 ok(r.status===200&&r.body.restaurant?.id,'real Owner RPC registration with active triggers');tenants.push(r.body.restaurant);
 ok(r.body.subscription.status==='pending_activation'&&!r.body.subscription.trial_started_at,'registration grants no trial');
}
ok(sql("show session_replication_role")==='origin','triggers remain active');
const snapshot=()=>sql(`select md5(coalesce(jsonb_agg(to_jsonb(r) order by id)::text,'')) from public.restaurants r; select count(*) from public.customer_pro_in_app_notifications;select count(*) from public.customer_transactional_email_deliveries;select count(*) from public.points_transactions;select count(*) from public.customer_rewards;`);
const before=snapshot();
for(const table of ['customer_pro_in_app_notifications','customer_transactional_email_deliveries','customer_offer_email_consents']){
 ok(sql(`select relrowsecurity from pg_class where oid='public.${table}'::regclass`)==='t',table+' RLS enabled');
 for(const role of ['anon','authenticated'])for(const privilege of ['SELECT','INSERT','UPDATE','DELETE'])
  ok(sql(`select has_table_privilege('${role}','public.${table}','${privilege}')`)==='f',table+' '+role+' '+privilege+' denied');
}
const serviceOnly=['reserve_customer_transactional_emails(integer)','authorize_customer_transactional_email_delivery(uuid)','complete_customer_transactional_email(uuid,boolean,text,text)'];
const internal=['enqueue_customer_transactional_email(uuid,uuid,text,text,uuid,uuid,jsonb,timestamptz)','customer_transactional_email_dispatch_block_reason(uuid)','pro_in_app_test_scope_allowed_internal(uuid,uuid)'];
for(const signature of [...serviceOnly,...internal]){
 for(const role of ['anon','authenticated'])ok(sql(`select has_function_privilege('${role}','public.${signature}','EXECUTE')`)==='f',signature+' '+role+' execute denied');
 ok(sql(`select has_function_privilege('service_role','public.${signature}','EXECUTE')`)===(serviceOnly.includes(signature)?'t':'f'),signature+' service ACL');
 ok(sql(`select pg_get_userbyid(proowner)='postgres' and prosecdef and proconfig::text like '%search_path=%' from pg_proc where oid='public.${signature}'::regprocedure`)==='t',signature+' owner/definer/search_path');
}
for(const [i,tenant] of tenants.entries()){
 ok(sql(`select public.restaurant_entitlement_enabled('${tenant.id}','offer_notifications') or public.restaurant_entitlement_enabled('${tenant.id}','reward_notifications')`)==='f','pending tenant has no PRO effects');
 for(const user of [users[i],users[1-i],users[2],{key:status.ANON_KEY}]){
  const inbox=await rpc('get_customer_pro_in_app_inbox',user.key,{input_restaurant_slug:tenant.slug,input_customer_token:'synthetic-invalid-not-secret'});
  ok(inbox.status>=400,'unbound/foreign/anon Inbox denied');
  const mark=await rpc('mark_customer_pro_in_app_notification_read',user.key,{input_restaurant_slug:tenant.slug,input_customer_token:'synthetic-invalid-not-secret',input_notification_id:randomUUID()});
  ok(mark.status>=400,'unbound/foreign/anon mark denied');
  const dispatch=await rpc('authorize_customer_transactional_email_delivery',user.key,{input_delivery_id:randomUUID()});
  ok(dispatch.status>=400,'browser dispatcher invocation denied');
 }
 for(const event of ['OFFER_PUBLISHED','POINT_REWARD_AVAILABLE']){
  const results=await Promise.all(Array.from({length:6},()=>parallelSql(`select public.enqueue_customer_transactional_email('${tenant.id}','${users[2].id}','${event}','synthetic-replay')`)));
  ok(results.every(r=>r==='f'),'missing binding / no PRO '+event+' no queue');
 }
}
// Actual service RPC, no row exists and no provider can be invoked.
const missing=await rpc('authorize_customer_transactional_email_delivery',status.SERVICE_ROLE_KEY,{input_delivery_id:randomUUID()});
ok(missing.status===200&&missing.body[0]?.authorized===false&&missing.body[0]?.reason_code==='DELIVERY_NOT_FOUND','missing delivery fail closed');
ok(snapshot()===before,'tenant and notification/business fingerprint unchanged');
console.log(JSON.stringify({status:'PASS',checks:checks.length,labels:checks,positiveProFlow:'NOT_PROVEN: pending activation; no fixture guard override',externalMessages:0}));
// Data belongs exclusively to the disposable stack; stop --no-backup after run.
