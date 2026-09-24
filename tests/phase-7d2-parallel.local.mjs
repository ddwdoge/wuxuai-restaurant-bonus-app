import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';

// Local synthetic parallelity test. Caller must reset the task-owned local DB afterward.
const container='supabase_db_wuxuai-phase7d2-local';
const q=value=>`'${String(value).replaceAll("'","''")}'`;
const run=input=>new Promise((resolve,reject)=>{
  const child=spawn('docker',['exec','-i',container,'psql','-U','postgres','-d','postgres','-X','-qAt','-v','ON_ERROR_STOP=1'],
    {stdio:['pipe','pipe','pipe']});let output='',error='';
  child.stdout.on('data',part=>output+=part);
  child.stderr.on('data',part=>error+=part);
  child.on('error',reject);
  child.on('close',code=>code===0?resolve(output.trim()):reject(Error(error.includes('TRANSITION_BLOCKED')?'TRANSITION_BLOCKED':'LOCAL_SQL_FAILURE')));
  child.stdin.end(input);
});
const admin=randomUUID(),owner=randomUUID(),org=randomUUID(),restaurant=randomUUID(),branch=randomUUID();
const name='D2 SYNTHETIC PARALLEL';
await run(`begin;
  insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values(${q(admin)},'authenticated','authenticated',${q(`d2-admin-${admin}@example.invalid`)},now(),'{}','{}',now(),now()),
    (${q(owner)},'authenticated','authenticated',${q(`d2-owner-${owner}@example.invalid`)},now(),'{}','{}',now(),now());
  insert into public.platform_admins(user_id,role,active) values(${q(admin)},'platform_owner',true);
  set local session_replication_role=replica;
  insert into public.organizations(id,owner_id,name) values(${q(org)},${q(owner)},${q(name)});
  insert into public.restaurants(id,owner_id,name,slug,organization_id,activation_status)
    values(${q(restaurant)},${q(owner)},${q(name)},${q('d2-'+restaurant.slice(0,12))},${q(org)},'pending_activation');
  insert into public.branches(id,organization_id,restaurant_id,name,slug,country,address,postal_code,city)
    values(${q(branch)},${q(org)},${q(restaurant)},${q(name)},${q('d2-'+branch.slice(0,12))},'AT','Synthetic Road 1','1000','Synthetic City');
  update public.restaurants set primary_branch_id=${q(branch)} where id=${q(restaurant)};
  insert into public.restaurant_members(restaurant_id,organization_id,branch_id,user_id,role)
    values(${q(restaurant)},${q(org)},${q(branch)},${q(owner)},'owner');
  insert into public.branch_subscriptions(organization_id,branch_id,status,subscription_status,selected_plan,plan_key,payment_status)
    values(${q(org)},${q(branch)},'pending_activation','pending_activation','BASIC','BASIC','not_required');
  insert into public.organization_legal_profiles(organization_id,company_name,legal_form,registered_address_source,
    address_source_restaurant_id,address_source_branch_id,email,responsible_person)
    values(${q(org)},'D2 Synthetic GmbH','GmbH','restaurant',${q(restaurant)},${q(branch)},'d2@example.invalid','Synthetic Representative');
  insert into public.platform_test_tenant_registry(restaurant_id,restaurant_name,organization_id,owner_user_id,test_session_id,marked_by)
    values(${q(restaurant)},${q(name)},${q(org)},${q(owner)},${q('d2-'+restaurant.slice(0,12))},${q(admin)});
  update public.country_launch_readiness set status='ready',evidence_ref='LOCAL_SYNTHETIC_ONLY',
    document_version_refs=case when check_key='required_documents' then array['LOCAL_SYNTHETIC_ONLY'] else '{}'::text[] end
    where country_code='AT';
  update public.country_launch_policy set enabled=true where country_code='AT';
  update public.business_verification_environment set environment='STAGING',change_ref='LOCAL_SYNTHETIC_ONLY' where singleton;
  commit;`);
const claims=(actor)=>`do $claims$ begin
  perform set_config('request.jwt.claim.sub',${q(actor)},true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',${q(actor)},'role','authenticated',
    'session_id',${q(randomUUID())},'auth_time',extract(epoch from clock_timestamp()))::text,true);
  end $claims$;set local role authenticated;`;
const submitRequest=randomUUID(),submitCorrelation=randomUUID();
const submit=()=>`begin;${claims(owner)}select public.submit_pending_business_verification(${q(restaurant)},'MANUAL',
  'COMPANY_REGISTER',${q(submitRequest)},${q(submitCorrelation)});commit;`;
const profile=JSON.stringify({legal_name:'D2 Synthetic GmbH',legal_form:'GmbH',business_street:'Synthetic Road 2',
  business_postal_code:'1000',business_city:'Synthetic City',business_country:'AT'});
const actionCall=(action,request,correlation)=>`begin;${claims(admin)}
  select public.manage_business_verification(${q(restaurant)},${q(action)},${action==='START_REVIEW'?"'MANUAL'":'null'},
  'SYNTHETIC_LOCAL_QA','SYNTHETIC LOCAL QA ONLY',${action==='CORRECT_PROFILE'?`${q(profile)}::jsonb`:'null'},
  ${q(request)},${q(correlation)},${q(`CONFIRMED:${name}:${restaurant}:${action}`)});commit;`;
async function twentyFour(label,call,expectedField){
  const rows=await Promise.all(Array.from({length:24},()=>run(call())));
  const answers=rows.map(row=>JSON.parse(row.split('\n').find(line=>line.startsWith('{'))));
  assert.equal(answers.filter(answer=>answer.idempotent===false).length,1,`${label}: first effect`);
  assert.equal(answers.filter(answer=>answer.idempotent===true).length,23,`${label}: replays`);
  if(expectedField)assert.ok(answers.every(answer=>answer[expectedField]===true),`${label}: expected field`);
}
await twentyFour('OWNER_SUBMISSION',submit);
for(const action of ['START_REVIEW','REJECT','START_REVIEW','CORRECT_PROFILE','GRANT_TEST','REVOKE_TEST']){
  const request=randomUUID(),correlation=randomUUID();
  await twentyFour(action,()=>actionCall(action,request,correlation));
}
await run(`begin;set local session_replication_role=replica;
  update public.business_verification_cases set status='VERIFIED',decided_at=now(),expires_at=now()+interval '1 day'
    where restaurant_id=${q(restaurant)};commit;`);
const suspendRequest=randomUUID(),suspendCorrelation=randomUUID();
await twentyFour('SUSPEND',()=>actionCall('SUSPEND',suspendRequest,suspendCorrelation));
assert.equal((await run(`select count(*) from public.business_verification_owner_submissions where restaurant_id=${q(restaurant)}`)).trim(),'1');
assert.equal((await run(`select count(*) from public.business_verification_decisions where restaurant_id=${q(restaurant)}`)).trim(),'7');
assert.equal((await run(`select subscription_status from public.branch_subscriptions where branch_id=${q(branch)}`)).trim(),'pending_activation');
console.log('PHASE_7D2_PARALLEL_PASS owner + six admin actions, 24 identical requests each; local reset required');
