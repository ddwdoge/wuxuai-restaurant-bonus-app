import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {loadEdge} from './fixtures/project-binding-edge-harness.mjs';
import {signFakeWebhook} from '../supabase/functions/_shared/billingArchitecture.mjs';

const ref='b'.repeat(20),url=`https://${ref}.supabase.co`,origin='https://staging.example.invalid';
const account='acct_synthetic123',restaurant=randomUUID(),checkoutId=randomUUID(),requestId=randomUUID(),price='price_synthetic123';
const binding={project_ref:ref,backend_url:url,auth_issuer:`${url}/auth/v1`,app_origin:origin};
const session={id:'cs_test_synthetic123',livemode:false,mode:'subscription',status:'complete',payment_status:'paid',
  client_reference_id:checkoutId,metadata:{test_only:'true',checkout_request_id:checkoutId,restaurant_id:restaurant,request_id:requestId,price_id:price},
  customer:'cus_synthetic123',subscription:'sub_synthetic123',
  amount_total:5900,currency:'eur',line_items:{data:[{price:{id:price},quantity:1}]}};
const event=()=>({id:'evt_synthetic123',type:'checkout.session.completed',livemode:false,
  created:Math.floor(Date.now()/1000),account,data:{object:session}});
const env=(readKey='rk_test_webhook_synthetic')=>({SUPABASE_URL:url,['SUPABASE_'+'SERVICE_ROLE_KEY']:'synthetic-service',
  TEST_ONLY_STRIPE_CHECKOUT_ENABLED:'true',TEST_ONLY_STRIPE_WEBHOOK_RESTRICTED_KEY:readKey,
  TEST_ONLY_STRIPE_CHECKOUT_RESTRICTED_KEY:'rk_test_checkout_synthetic',
  TEST_ONLY_STRIPE_WEBHOOK_SECRET:'whsec_synthetic_local_only',TEST_ONLY_STRIPE_ACCOUNT_ID:account,
  TEST_ONLY_STRIPE_PROJECT_REF:ref,WUXUAI_AUTH_ISSUER:binding.auth_issuer,WUXUAI_APP_ORIGIN:origin,
  DENO_DEPLOYMENT_ID:`${ref}_${randomUUID()}_1`});

async function signedRequest(payload=event(),signature=true){
  const raw=new TextEncoder().encode(JSON.stringify(payload));
  const headers={'stripe-signature':signature?await signFakeWebhook(raw,'whsec_synthetic_local_only',Math.floor(Date.now()/1000)):'t=1,v1=invalid'};
  return new Request(`${url}/functions/v1/test-only-stripe-webhook`,{method:'POST',headers,body:raw});
}
function fixture(readKey='rk_test_webhook_synthetic',provider){
  const effects=[];
  const client=()=>({rpc:async(name)=>{
    effects.push(name);
    if(name==='get_server_project_binding')return {data:binding,error:null};
    if(name==='record_test_only_stripe_checkout_completed_v2')return {data:{status:'TEST_ONLY_CHECKOUT_COMPLETED'},error:null};
    throw Error('UNEXPECTED_RPC');
  }});
  return {handler:loadEdge('test-only-stripe-webhook',env(readKey),client,provider),effects};
}

test('separate webhook Read key verifies signed TEST event and reads account/session before isolated record',async()=>{
  const calls=[];
  const {handler,effects}=fixture('rk_test_webhook_synthetic',async(address,options={})=>{
    calls.push(address);
    assert.equal(options.headers.authorization,'Bearer rk_test_webhook_synthetic');
    if(address.endsWith('/account'))return Response.json({object:'account',id:account});
    assert.match(address,/\/checkout\/sessions\/cs_test_synthetic123\?expand\[\]=line_items\.data\.price$/);
    return Response.json(session);
  });
  const result=await handler(await signedRequest());
  assert.equal(result.status,200);
  assert.equal(calls.length,2);
  assert.equal(effects.filter(x=>x==='record_test_only_stripe_checkout_completed_v2').length,1);
});

test('webhook rejects wrong key type or reused checkout key before provider access',async()=>{
  for(const key of ['sk_test_synthetic','rk_live_synthetic','rk_test_','', 'rk_test_checkout_synthetic']){
    let calls=0;
    const {handler,effects}=fixture(key,async()=>{calls++;throw Error('NETWORK_FORBIDDEN');});
    assert.equal((await handler(await signedRequest())).status,503);
    assert.equal(calls,0);
    assert.deepEqual(effects,[]);
  }
});

test('invalid signature and invalid session id never reach provider',async()=>{
  let calls=0;
  const {handler,effects}=fixture('rk_test_webhook_synthetic',async()=>{calls++;throw Error('NETWORK_FORBIDDEN');});
  assert.equal((await handler(await signedRequest(event(),false))).status,400);
  const bad=event();bad.data.object={...session,id:'cs_live_invalid'};
  assert.equal((await handler(await signedRequest(bad))).status,400);
  assert.equal(calls,0);
  assert.ok(!effects.includes('record_test_only_stripe_checkout_completed_v2'));
});

test('missing Account Read, foreign account or missing Sessions Read fail before isolated record',async()=>{
  for(const mode of ['account_denied','foreign_account','session_denied']){
    const {handler,effects}=fixture('rk_test_webhook_synthetic',async(address)=>{
      if(address.endsWith('/account'))return mode==='account_denied'
        ?Response.json({error:'forbidden'},{status:403})
        :Response.json({object:'account',id:mode==='foreign_account'?'acct_foreign123':account});
      return Response.json({error:'forbidden'},{status:403});
    });
    assert.equal((await handler(await signedRequest())).status,409);
    assert.ok(!effects.includes('record_test_only_stripe_checkout_completed_v2'));
  }
});

test('provider price or tenant mismatch fails before isolated event write',async()=>{
  for(const changed of [
    {...session,line_items:{data:[{price:{id:'price_foreign123'},quantity:1}]}},
    {...session,metadata:{...session.metadata,restaurant_id:randomUUID()}},
  ]){
    const {handler,effects}=fixture('rk_test_webhook_synthetic',async(address)=>address.endsWith('/account')
      ?Response.json({object:'account',id:account}):Response.json(changed));
    assert.equal((await handler(await signedRequest())).status,409);
    assert.ok(!effects.includes('record_test_only_stripe_checkout_completed_v2'));
  }
});
