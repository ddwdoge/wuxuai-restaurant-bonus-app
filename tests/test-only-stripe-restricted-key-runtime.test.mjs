import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {loadEdge} from './fixtures/project-binding-edge-harness.mjs';

const ref='a'.repeat(20),url=`https://${ref}.supabase.co`,origin='https://staging.example.invalid';
const account='acct_synthetic123';
const restaurant=randomUUID(),requestId=randomUUID(),checkoutId=randomUUID(),price='price_synthetic123';
const binding={project_ref:ref,backend_url:url,auth_issuer:`${url}/auth/v1`,app_origin:origin};
const prepared={id:checkoutId,restaurant_id:restaurant,request_id:requestId,
  return_route:'/admin/settings/konto-testphase',environment:'TEST',livemode:false,
  product_code:'BASIC',amount_minor:5900,currency:'EUR',billing_interval:'MONTH',price_id:price};
const environment=(key='rk_test_synthetic')=>({SUPABASE_URL:url,SUPABASE_ANON_KEY:'synthetic-public',
  SUPABASE_SERVICE_ROLE_KEY:'synthetic-service',TEST_ONLY_STRIPE_CHECKOUT_ENABLED:'true',
  TEST_ONLY_STRIPE_CHECKOUT_RESTRICTED_KEY:key,TEST_ONLY_STRIPE_ACCOUNT_ID:account,
  TEST_ONLY_STRIPE_PROJECT_REF:ref,WUXUAI_AUTH_ISSUER:binding.auth_issuer,WUXUAI_APP_ORIGIN:origin,
  DENO_DEPLOYMENT_ID:`${ref}_${randomUUID()}_1`});
const request=()=>new Request(`${url}/functions/v1/test-only-stripe-checkout`,{method:'POST',
  headers:{origin,authorization:'Bearer synthetic.session','content-type':'application/json'},
  body:JSON.stringify({restaurant_id:restaurant,request_id:requestId,return_route:prepared.return_route})});
const session={id:'cs_test_synthetic123',livemode:false,mode:'subscription',status:'open',
  payment_status:'unpaid',client_reference_id:checkoutId,
  metadata:{test_only:'true',checkout_request_id:checkoutId,restaurant_id:restaurant,
    request_id:requestId,price_id:price},amount_total:5900,currency:'eur',
  line_items:{data:[{price:{id:price},quantity:1}]},url:'https://checkout.stripe.com/c/pay/synthetic'};

function fixture(key,provider){
  const effects=[];
  const client=()=>({rpc:async(name)=>{
    effects.push(name);
    if(name==='get_server_project_binding')return {data:binding,error:null};
    if(name==='project_binding_session_matches')return {data:true,error:null};
    if(name==='prepare_test_only_stripe_checkout')return {data:prepared,error:null};
    if(name==='bind_test_only_stripe_checkout_session')return {data:null,error:null};
    throw Error('UNEXPECTED_RPC');
  }});
  return {handler:loadEdge('test-only-stripe-checkout',environment(key),client,provider),effects};
}

test('restricted TEST key: account readback then one expanded session create and bind',async()=>{
  const calls=[];
  const {handler,effects}=fixture('rk_test_synthetic',async(address,options={})=>{
    calls.push({address,method:options.method??'GET'});
    assert.equal(options.headers.authorization,'Bearer rk_test_synthetic');
    if(address==='https://api.stripe.com/v1/account')return Response.json({object:'account',id:account});
    assert.equal(address,'https://api.stripe.com/v1/checkout/sessions');
    assert.equal(options.method,'POST');
    assert.equal(options.body.get('expand[]'),'line_items');
    assert.equal(options.body.get('line_items[0][price]'),price);
    return Response.json(session);
  });
  const result=await handler(request());
  assert.equal(result.status,200);
  assert.deepEqual(calls.map(({method})=>method),['GET','POST']);
  assert.equal(effects.filter(name=>name==='bind_test_only_stripe_checkout_session').length,1);
});

test('wrong account fails before session creation or binding',async()=>{
  let creates=0;
  const {handler,effects}=fixture('rk_test_synthetic',async()=>{
    creates++;
    return Response.json({object:'account',id:'acct_foreign123'});
  });
  assert.equal((await handler(request())).status,409);
  assert.equal(creates,1);
  assert.ok(!effects.includes('prepare_test_only_stripe_checkout'));
  assert.ok(!effects.includes('bind_test_only_stripe_checkout_session'));
});

test('wrong key types fail before project or provider access',async()=>{
  for(const key of ['sk_test_synthetic','rk_live_synthetic','pk_test_synthetic','rk_test_','']){
    let calls=0;
    const {handler,effects}=fixture(key,async()=>{calls++;throw Error('NETWORK_FORBIDDEN');});
    assert.equal((await handler(request())).status,503);
    assert.equal(calls,0);
    assert.deepEqual(effects,[]);
  }
});

test('missing Account Read permission fails before session creation',async()=>{
  let calls=0;
  const {handler,effects}=fixture('rk_test_synthetic',async()=>{
    calls++;
    return Response.json({error:{type:'invalid_request_error'}},{status:403});
  });
  assert.equal((await handler(request())).status,409);
  assert.equal(calls,1);
  assert.ok(!effects.includes('prepare_test_only_stripe_checkout'));
  assert.ok(!effects.includes('bind_test_only_stripe_checkout_session'));
});

test('read-only key without Checkout Sessions Write fails closed',async()=>{
  let calls=0;
  const {handler,effects}=fixture('rk_test_synthetic',async(address)=>{
    calls++;
    return address.endsWith('/account')
      ?Response.json({object:'account',id:account})
      :Response.json({error:{type:'invalid_request_error'}},{status:403});
  });
  assert.equal((await handler(request())).status,409);
  assert.equal(calls,2);
  assert.ok(!effects.includes('bind_test_only_stripe_checkout_session'));
});
