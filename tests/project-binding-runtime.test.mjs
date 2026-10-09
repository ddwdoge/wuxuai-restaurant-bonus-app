import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {requireProjectBinding} from '../supabase/functions/_shared/projectBinding.mjs';
import {loadEdge} from './fixtures/project-binding-edge-harness.mjs';
import {signFakeWebhook} from '../supabase/functions/_shared/billingArchitecture.mjs';

const ref='a'.repeat(20),url=`https://${ref}.supabase.co`,origin='https://new-staging.example.invalid';
const registry={binding_id:randomUUID(),project_ref:ref,backend_url:url,auth_issuer:`${url}/auth/v1`,app_origin:origin};
const environment=()=>({SUPABASE_URL:url,SUPABASE_ANON_KEY:'synthetic-public',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service',
  BASIC_BILLING_MODE:'staging_test_only',BASIC_BILLING_PROJECT_REF:ref,REDEMPTION_EDGE_MODE:'staging',REDEMPTION_STAGING_PROJECT_REF:ref,
  WUXUAI_AUTH_ISSUER:registry.auth_issuer,WUXUAI_APP_ORIGIN:origin,DENO_DEPLOYMENT_ID:`${ref}_${randomUUID()}_1`,
  STRIPE_TEST_SECRET_KEY:'sk_test_synthetic',STRIPE_TEST_WEBHOOK_SECRET:'whsec_synthetic'});
const names=['billing-basic-test-checkout','billing-stripe-test-webhook','redemption-confirmation'];
function clients(bound=registry,session=true){
  const effects=[];
  const createClient=()=>({auth:{getUser:async()=>({data:{user:{id:randomUUID()}},error:null})},rpc:async(name)=>{
    if(name==='get_server_project_binding')return {data:bound,error:null};
    if(name==='project_binding_session_matches')return {data:session,error:null};
    effects.push(name);return {data:null,error:{code:'42501',message:'DOWNSTREAM_GUARD'}};
  }});
  return {effects,createClient};
}
const req=(body={},requestOrigin=origin)=>new Request(`${url}/functions/v1/synthetic`,{method:'POST',
  headers:{origin:requestOrigin,authorization:'Bearer real-shaped.synthetic.session','content-type':'application/json'},body:JSON.stringify(body)});
for(const name of names){
  for(const [label,patch,bound]of [
    ['missing binding',{},null],['old issuer',{WUXUAI_AUTH_ISSUER:'https://bwhvfjuwixgwduoeqaya.supabase.co/auth/v1'},registry],
    ['foreign project',{BASIC_BILLING_PROJECT_REF:'b'.repeat(20),REDEMPTION_STAGING_PROJECT_REF:'b'.repeat(20)},registry],
    ['swapped backend',{SUPABASE_URL:`https://${'b'.repeat(20)}.supabase.co`},registry],
    ['swapped app',{WUXUAI_APP_ORIGIN:'https://foreign.example.invalid'},registry],
    ['missing deployment',{DENO_DEPLOYMENT_ID:''},registry],
    ['swapped edge',{DENO_DEPLOYMENT_ID:`${'b'.repeat(20)}_${randomUUID()}_1`},registry],
  ])test(`${name}: ${label} blocks before any effect`,async()=>{
    const c=clients(bound);let provider=0;
    const handler=loadEdge(name,{...environment(),...patch},c.createClient,async()=>{provider++;throw Error('FORBIDDEN');});
    const responses=await Promise.all(Array.from({length:4},()=>handler(req())));
    assert.ok(responses.every(r=>r.status===503));assert.equal(provider,0);assert.deepEqual(c.effects,[]);
  });
}
test('configuration alone and request parameters cannot replace DB authority',async()=>{
  await assert.rejects(requireProjectBinding({rpc:async()=>({error:{code:'42501'}})},{}));
  const c=clients(null);const handler=loadEdge(names[0],environment(),c.createClient);
  const r=await handler(req({...registry,environment:'STAGING'}));assert.equal(r.status,503);assert.deepEqual(c.effects,[]);
});
test('inconsistent backend target is rejected before the service credential is used',async()=>{
  let reads=0;
  await assert.rejects(requireProjectBinding({rpc:async()=>{reads++;return {data:registry};}},
    {projectRef:ref,backendUrl:'https://foreign.example.invalid',issuer:registry.auth_issuer,appOrigin:origin,
      deploymentId:`${ref}_${randomUUID()}_1`}));
  assert.equal(reads,0);
});
test('correct binding preserves checkout idempotency and TEST adapter path',async()=>{
  const e=environment(),id=randomUUID();let create=0,complete=0;
  const c=clients();
  const factory=()=>({...c.createClient(),rpc:async(name)=>{
    if(name==='prepare_basic_test_checkout')return {data:{checkout_request_id:id,price_id:'price_synthetic',restaurant_id:id,
      acceptance_id:id,request_id:id,correlation_id:id,status:'PREPARED',provider_session_id:null,created_at:new Date().toISOString(),idempotent:false},error:null};
    if(name==='complete_basic_test_checkout'){complete++;return {data:{},error:null};}
    return c.createClient().rpc(name);
  }});
  const handler=loadEdge(names[0],e,factory,async(address,options)=>{
    assert.equal(address,'https://api.stripe.com/v1/checkout/sessions');
    assert.ok(options.headers['idempotency-key']);create++;
    return Response.json({id:'cs_test_synthetic12345',url:'https://checkout.stripe.com/c/pay/synthetic',livemode:false,
      mode:'subscription',status:'open',client_reference_id:id,metadata:{restaurant_id:id,acceptance_id:id,request_id:id}});
  });
  const r=await handler(req({acceptance_id:id,request_id:id,return_route:'/admin/settings/konto-testphase'}));
  assert.equal(r.status,200);assert.equal(create,1);assert.equal(complete,1);
});
test('correct webhook binding still requires raw signature and TEST payload',async()=>{
  const c=clients(),env=environment();let records=0;
  const factory=()=>({...c.createClient(),rpc:async(name)=>name==='record_basic_stripe_test_event'
    ?(records++,{data:{status:'UNMATCHED'},error:null}):c.createClient().rpc(name)});
  const handler=loadEdge(names[1],env,factory);
  assert.equal((await handler(req())).status,400);assert.equal(records,0);
  const now=Math.floor(Date.now()/1000);
  const raw=new TextEncoder().encode(JSON.stringify({id:'evt_synthetic_binding123',livemode:false,type:'invoice.paid',created:now,
    data:{object:{customer:'cus_synthetic123',subscription:'sub_synthetic123',metadata:{}}}}));
  const signature=await signFakeWebhook(raw,env.STRIPE_TEST_WEBHOOK_SECRET,now);
  const r=await handler(new Request(url,{method:'POST',body:raw,headers:{'stripe-signature':signature}}));
  assert.equal(r.status,200);assert.equal(records,1);
});
test('redemption: binding cannot replace genuine session or business guards',async()=>{
  const bad=clients(registry,false),id=randomUUID();
  assert.equal((await loadEdge(names[2],environment(),bad.createClient)(req())).status,403);assert.deepEqual(bad.effects,[]);
  const good=clients();
  const r=await loadEdge(names[2],environment(),good.createClient)(req({action:'cancel',redemption_id:id,request_id:id,correlation_id:id,idempotency_key:id}));
  assert.equal(r.status,409);assert.deepEqual(good.effects,['secure_redemption_edge_mutate']);
});
