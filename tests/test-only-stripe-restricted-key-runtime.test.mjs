import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {loadEdge} from './fixtures/project-binding-edge-harness.mjs';

const ref='a'.repeat(20),url=`https://${ref}.supabase.co`,origin='https://staging.example.invalid';
const account='acct_synthetic123',checkoutKey='rk_test_checkout_synthetic',setupKey='rk_test_setup_synthetic';
const restaurant=randomUUID(),requestId=randomUUID(),checkoutId=randomUUID(),price='price_synthetic123';
const clock='clock_synthetic123',customer='cus_synthetic123',frozen=1_791_840_000;
const binding={project_ref:ref,backend_url:url,auth_issuer:`${url}/auth/v1`,app_origin:origin};
const prepared={id:checkoutId,restaurant_id:restaurant,request_id:requestId,
  return_route:'/admin/settings/konto-testphase',environment:'TEST',livemode:false,
  product_code:'BASIC',amount_minor:5900,currency:'EUR',billing_interval:'MONTH',price_id:price};
const preparation={checkout_request_id:checkoutId,provider_account_id:account,provider_test_clock_id:clock,
  provider_customer_id:customer,frozen_time:new Date(frozen*1000).toISOString(),livemode:false};
const environment=(overrides={})=>({SUPABASE_URL:url,SUPABASE_ANON_KEY:'synthetic-public',
  SUPABASE_SERVICE_ROLE_KEY:'synthetic-service',TEST_ONLY_STRIPE_CHECKOUT_ENABLED:'true',
  TEST_ONLY_STRIPE_CHECKOUT_RESTRICTED_KEY:checkoutKey,
  TEST_ONLY_STRIPE_LIFECYCLE_SETUP_RESTRICTED_KEY:setupKey,
  TEST_ONLY_STRIPE_WEBHOOK_RESTRICTED_KEY:'rk_test_webhook_synthetic',TEST_ONLY_STRIPE_ACCOUNT_ID:account,
  TEST_ONLY_STRIPE_PROJECT_REF:ref,WUXUAI_AUTH_ISSUER:binding.auth_issuer,WUXUAI_APP_ORIGIN:origin,
  DENO_DEPLOYMENT_ID:`${ref}_${randomUUID()}_1`,...overrides});
const request=()=>new Request(`${url}/functions/v1/test-only-stripe-checkout`,{method:'POST',
  headers:{origin,authorization:'Bearer synthetic.session','content-type':'application/json'},
  body:JSON.stringify({restaurant_id:restaurant,request_id:requestId,return_route:prepared.return_route})});
const session={id:'cs_test_synthetic123',livemode:false,mode:'subscription',status:'open',
  payment_status:'unpaid',client_reference_id:checkoutId,customer,
  metadata:{test_only:'true',checkout_request_id:checkoutId,restaurant_id:restaurant,
    request_id:requestId,price_id:price},amount_total:5900,currency:'eur',
  line_items:{data:[{price:{id:price},quantity:1}]},url:'https://checkout.stripe.com/c/pay/synthetic'};
const clockPayload={id:clock,object:'test_helpers.test_clock',livemode:false,frozen_time:frozen,
  name:`WUXUAI TEST ${checkoutId}`,status:'ready'};
const customerPayload={id:customer,object:'customer',livemode:false,test_clock:clock,
  metadata:{test_only:'true',checkout_request_id:checkoutId,restaurant_id:restaurant,request_id:requestId,price_id:price}};

function fixture({env={},preparationData=null,provider,rpc}={}){
  const effects=[];
  const client=()=>({rpc:async(name,args)=>{
    effects.push(name);
    if(rpc)return rpc(name,args);
    if(name==='get_server_project_binding')return {data:binding,error:null};
    if(name==='project_binding_session_matches')return {data:true,error:null};
    if(name==='prepare_test_only_stripe_checkout')return {data:prepared,error:null};
    if(name==='get_test_only_stripe_customer_preparation')return {data:preparationData,error:null};
    if(name==='bind_test_only_stripe_test_clock_customer')return {data:{status:'TEST_CLOCK_CUSTOMER_BOUND'},error:null};
    if(name==='bind_test_only_stripe_checkout_session_v2')return {data:{status:'SESSION_CREATED'},error:null};
    throw Error('UNEXPECTED_RPC');
  }});
  return {handler:loadEdge('test-only-stripe-checkout',environment(env),client,provider),effects};
}

function successfulProvider(calls=[]){
  return async(address,options={})=>{
    const authorization=options.headers?.authorization;
    calls.push({address,method:options.method??'GET',authorization,body:options.body});
    if(address==='https://api.stripe.com/v1/account')return Response.json({object:'account',id:account});
    if(address==='https://api.stripe.com/v1/test_helpers/test_clocks')return Response.json({
      ...clockPayload,frozen_time:Number(options.body.get('frozen_time')),
    });
    if(address==='https://api.stripe.com/v1/customers')return Response.json(customerPayload);
    if(address===`https://api.stripe.com/v1/test_helpers/test_clocks/${clock}`)return Response.json(clockPayload);
    if(address===`https://api.stripe.com/v1/customers/${customer}`)return Response.json(customerPayload);
    if(address==='https://api.stripe.com/v1/checkout/sessions')return Response.json(session);
    throw Error(`UNEXPECTED_PROVIDER_PATH:${address}`);
  };
}
const responseCode=async response=>(await response.json()).code;

test('browser preflight is host-bound and reaches no provider or business writer',async()=>{
  let providerCalls=0;const {handler,effects}=fixture({provider:async()=>{providerCalls++;throw Error('NETWORK_FORBIDDEN');}});
  const response=await handler(new Request(`${url}/functions/v1/test-only-stripe-checkout`,{method:'OPTIONS',
    headers:{origin,'access-control-request-method':'POST',
      'access-control-request-headers':'authorization, apikey, content-type, x-client-info'}}));
  assert.equal(response.status,204);assert.equal(providerCalls,0);assert.deepEqual(effects,['get_server_project_binding']);
  const denied=await handler(new Request(`${url}/functions/v1/test-only-stripe-checkout`,{method:'OPTIONS',
    headers:{origin:'https://foreign.invalid','access-control-request-method':'POST',
      'access-control-request-headers':'authorization'}}));
  assert.equal(denied.status,403);assert.equal(providerCalls,0);
});

test('missing, live, shared or wrong key types fail before auth, provider and request writes',async()=>{
  const cases=[
    {TEST_ONLY_STRIPE_CHECKOUT_RESTRICTED_KEY:'sk_test_forbidden'},
    {TEST_ONLY_STRIPE_LIFECYCLE_SETUP_RESTRICTED_KEY:'rk_live_forbidden'},
    {TEST_ONLY_STRIPE_LIFECYCLE_SETUP_RESTRICTED_KEY:checkoutKey},
    {TEST_ONLY_STRIPE_LIFECYCLE_SETUP_RESTRICTED_KEY:'rk_test_webhook_synthetic'},
    {TEST_ONLY_STRIPE_LIFECYCLE_SETUP_RESTRICTED_KEY:''},
  ];
  for(const env of cases){let calls=0;const {handler,effects}=fixture({env,provider:async()=>{calls++;throw Error('NETWORK_FORBIDDEN');}});
    const response=await handler(request());assert.equal(response.status,503);assert.equal(await responseCode(response),'TEST_ONLY_CHECKOUT_DISABLED');
    assert.equal(calls,0);assert.deepEqual(effects,['get_server_project_binding']);}
});

test('both restricted keys must read the exact account before request or provider writes',async()=>{
  for(const badCall of [1,2]){let calls=0;const {handler,effects}=fixture({provider:async()=>{
    calls++;return calls===badCall?Response.json({object:'account',id:'acct_foreign123'}):Response.json({object:'account',id:account});
  }});const response=await handler(request());assert.equal(response.status,409);assert.equal(await responseCode(response),'TEST_ONLY_STRIPE_ACCOUNT_BINDING_INVALID');
  assert.equal(calls,2);assert.ok(!effects.includes('prepare_test_only_stripe_checkout'));}
});

test('new request creates one idempotent clock and customer before the customer-bound session',async()=>{
  const calls=[];const {handler,effects}=fixture({provider:successfulProvider(calls)});
  const response=await handler(request());assert.equal(response.status,200);
  assert.deepEqual(calls.map(value=>[value.address,value.method]),[
    ['https://api.stripe.com/v1/account','GET'],['https://api.stripe.com/v1/account','GET'],
    ['https://api.stripe.com/v1/test_helpers/test_clocks','POST'],['https://api.stripe.com/v1/customers','POST'],
    ['https://api.stripe.com/v1/checkout/sessions','POST'],
  ]);
  assert.equal(calls[0].authorization,`Bearer ${checkoutKey}`);assert.equal(calls[1].authorization,`Bearer ${setupKey}`);
  assert.equal(calls[2].authorization,`Bearer ${setupKey}`);assert.equal(calls[3].authorization,`Bearer ${setupKey}`);
  assert.equal(calls[4].authorization,`Bearer ${checkoutKey}`);assert.equal(calls[4].body.get('customer'),customer);
  assert.deepEqual(effects.filter(name=>name.startsWith('bind_')),[
    'bind_test_only_stripe_test_clock_customer','bind_test_only_stripe_checkout_session_v2']);
});

test('replay reads the immutable clock/customer binding and creates no second provider resource',async()=>{
  const calls=[];const {handler,effects}=fixture({preparationData:preparation,provider:successfulProvider(calls)});
  const response=await handler(request());assert.equal(response.status,200);
  assert.deepEqual(calls.map(value=>[value.address,value.method]),[
    ['https://api.stripe.com/v1/account','GET'],['https://api.stripe.com/v1/account','GET'],
    [`https://api.stripe.com/v1/test_helpers/test_clocks/${clock}`,'GET'],
    [`https://api.stripe.com/v1/customers/${customer}`,'GET'],
    ['https://api.stripe.com/v1/checkout/sessions','POST'],
  ]);
  assert.ok(!effects.includes('bind_test_only_stripe_test_clock_customer'));
  assert.equal(effects.filter(name=>name==='bind_test_only_stripe_checkout_session_v2').length,1);
});

test('wrong clock, customer, provider permission or DB bind fails before session bind',async()=>{
  for(const mode of ['clock','customer','permission','bind']){
    const calls=[];const provider=async(address,options={})=>{
      calls.push(address);
      if(address==='https://api.stripe.com/v1/account')return Response.json({object:'account',id:account});
      if(address==='https://api.stripe.com/v1/test_helpers/test_clocks')return mode==='permission'
        ?Response.json({error:{type:'invalid_request_error'}},{status:403})
        :Response.json(mode==='clock'?{...clockPayload,name:'FOREIGN'}:{
          ...clockPayload,frozen_time:Number(options.body.get('frozen_time')),
        });
      if(address==='https://api.stripe.com/v1/customers')return Response.json(mode==='customer'
        ?{...customerPayload,test_clock:'clock_foreign123'}:customerPayload);
      if(address==='https://api.stripe.com/v1/checkout/sessions')return Response.json(session);
      throw Error(`UNEXPECTED:${address}:${options.method}`);
    };
    const {handler,effects}=fixture({provider,rpc:async(name)=>{
      if(name==='get_server_project_binding')return {data:binding,error:null};
      if(name==='project_binding_session_matches')return {data:true,error:null};
      if(name==='prepare_test_only_stripe_checkout')return {data:prepared,error:null};
      if(name==='get_test_only_stripe_customer_preparation')return {data:null,error:null};
      if(name==='bind_test_only_stripe_test_clock_customer')return mode==='bind'
        ?{data:null,error:{message:'private'}}:{data:{status:'TEST_CLOCK_CUSTOMER_BOUND'},error:null};
      if(name==='bind_test_only_stripe_checkout_session_v2')return {data:{status:'SESSION_CREATED'},error:null};
      throw Error('UNEXPECTED_RPC');
    }});
    const response=await handler(request());assert.notEqual(response.status,200,mode);
    assert.ok(!effects.includes('bind_test_only_stripe_checkout_session_v2'),mode);
    assert.ok(!calls.includes('https://api.stripe.com/v1/checkout/sessions'),mode);
  }
});
