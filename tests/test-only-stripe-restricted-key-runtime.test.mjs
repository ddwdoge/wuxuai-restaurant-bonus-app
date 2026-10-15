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

const code=async response=>(await response.json()).code;

function denialFixture({env={},provider=async()=>{throw Error('NETWORK_FORBIDDEN');},rpc}={}){
  const effects=[];
  const client=()=>({rpc:async(name,args)=>{
    effects.push(name);
    if(rpc)return rpc(name,args);
    if(name==='get_server_project_binding')return {data:binding,error:null};
    if(name==='project_binding_session_matches')return {data:true,error:null};
    if(name==='prepare_test_only_stripe_checkout')return {data:prepared,error:null};
    if(name==='bind_test_only_stripe_checkout_session')return {data:null,error:null};
    throw Error('UNEXPECTED_RPC');
  }});
  return {handler:loadEdge('test-only-stripe-checkout',{...environment(),...env},client,provider),effects};
}

test('browser preflight is host-bound and reaches no provider or business writer',async()=>{
  let providerCalls=0;
  const {handler,effects}=denialFixture({provider:async()=>{providerCalls++;throw Error('NETWORK_FORBIDDEN');}});
  const response=await handler(new Request(`${url}/functions/v1/test-only-stripe-checkout`,{
    method:'OPTIONS',headers:{origin,'access-control-request-method':'POST',
      'access-control-request-headers':'authorization, apikey, content-type, x-client-info'},
  }));
  assert.equal(response.status,204);
  assert.equal(response.headers.get('access-control-allow-origin'),origin);
  assert.equal(response.headers.get('access-control-allow-methods'),'POST, OPTIONS');
  assert.equal(providerCalls,0);
  assert.deepEqual(effects,['get_server_project_binding']);

  for(const [badOrigin,badMethod,badHeaders] of [
    ['https://foreign.example.invalid','POST','authorization'],
    [origin,'DELETE','authorization'],
    [origin,'POST','authorization, x-forbidden-header'],
  ]){
    const denied=await handler(new Request(`${url}/functions/v1/test-only-stripe-checkout`,{
      method:'OPTIONS',headers:{origin:badOrigin,'access-control-request-method':badMethod,
        'access-control-request-headers':badHeaders},
    }));
    assert.equal(denied.status,403);
    assert.equal(await code(denied),'CORS_PREFLIGHT_BLOCKED');
    assert.equal(denied.headers.get('access-control-allow-origin'),null);
  }
  assert.equal(providerCalls,0);
});

test('every pre-prepare denial returns a fixed code without provider session or request write',async()=>{
  const cases=[
    {
      expected:'PROJECT_BINDING_REQUIRED',status:503,
      env:{DENO_DEPLOYMENT_ID:`${'b'.repeat(20)}_${randomUUID()}_1`},
      makeRequest:request,
    },
    {
      expected:'TEST_ONLY_CHECKOUT_ORIGIN_DENIED',status:403,
      makeRequest:()=>new Request(`${url}/functions/v1/test-only-stripe-checkout`,{method:'POST',
        headers:{origin:'https://foreign.example.invalid',authorization:'Bearer synthetic.session',
          'content-type':'application/json'},body:JSON.stringify({restaurant_id:restaurant,request_id:requestId,return_route:prepared.return_route})}),
    },
    {
      expected:'TEST_ONLY_CHECKOUT_DISABLED',status:503,env:{TEST_ONLY_STRIPE_CHECKOUT_ENABLED:'false'},
      makeRequest:request,
    },
    {
      expected:'AUTH_REQUIRED',status:401,
      makeRequest:()=>new Request(`${url}/functions/v1/test-only-stripe-checkout`,{method:'POST',
        headers:{origin,'content-type':'application/json'},body:JSON.stringify({restaurant_id:restaurant,request_id:requestId,return_route:prepared.return_route})}),
    },
    {
      expected:'TEST_ONLY_CHECKOUT_REQUEST_INVALID',status:400,
      makeRequest:()=>new Request(`${url}/functions/v1/test-only-stripe-checkout`,{method:'POST',
        headers:{origin,authorization:'Bearer synthetic.session','content-type':'application/json'},body:'{}'}),
    },
  ];
  for(const item of cases){
    let providerCalls=0;
    const fixture=denialFixture({env:item.env,provider:async()=>{providerCalls++;throw Error('NETWORK_FORBIDDEN');}});
    const response=await fixture.handler(item.makeRequest());
    assert.equal(response.status,item.status,item.expected);
    assert.equal(await code(response),item.expected);
    assert.equal(providerCalls,0,item.expected);
    assert.ok(!fixture.effects.includes('prepare_test_only_stripe_checkout'),item.expected);
  }

  {
    const fixture=denialFixture({rpc:async name=>name==='get_server_project_binding'
      ?{data:binding,error:null}:{data:false,error:null}});
    const response=await fixture.handler(request());
    assert.equal(response.status,403);
    assert.equal(await code(response),'PROJECT_SESSION_REQUIRED');
    assert.ok(!fixture.effects.includes('prepare_test_only_stripe_checkout'));
  }

  for(const [provider,expected,status] of [
    [async()=>Response.json({error:{type:'invalid_request_error'}},{status:403}),
      'TEST_ONLY_STRIPE_ACCOUNT_READBACK_FAILED',503],
    [async()=>Response.json({object:'account',id:'acct_foreign123'}),
      'TEST_ONLY_STRIPE_ACCOUNT_BINDING_INVALID',409],
    [async()=>{throw Error('private network detail');},
      'TEST_ONLY_STRIPE_ACCOUNT_READBACK_FAILED',503],
  ]){
    const fixture=denialFixture({provider});
    const response=await fixture.handler(request());
    assert.equal(response.status,status,expected);
    assert.equal(await code(response),expected);
    assert.ok(!fixture.effects.includes('prepare_test_only_stripe_checkout'));
  }
});

test('prepare denials are whitelisted and unknown database text is sanitized',async()=>{
  for(const [message,postgresCode,expected,status] of [
    ['TEST_ONLY_CHECKOUT_OWNER_REQUIRED','42501','TEST_ONLY_CHECKOUT_OWNER_REQUIRED',403],
    ['TEST_ONLY_CHECKOUT_ACCESS_DENIED','42501','TEST_ONLY_CHECKOUT_ACCESS_DENIED',403],
    ['TEST_ONLY_CHECKOUT_REPLAY_CONFLICT','23505','TEST_ONLY_CHECKOUT_REPLAY_CONFLICT',409],
    ['relation private_internal missing','XX000','TEST_ONLY_CHECKOUT_PREPARE_FAILED',409],
    ['sk_test_must_never_surface','XX000','TEST_ONLY_CHECKOUT_PREPARE_FAILED',409],
  ]){
    const fixture=denialFixture({
      provider:async()=>Response.json({object:'account',id:account}),
      rpc:async name=>{
        if(name==='get_server_project_binding')return {data:binding,error:null};
        if(name==='project_binding_session_matches')return {data:true,error:null};
        if(name==='prepare_test_only_stripe_checkout')return {data:null,error:{message,code:postgresCode}};
        throw Error('UNEXPECTED_RPC');
      },
    });
    const response=await fixture.handler(request());
    const bodyText=await response.clone().text();
    assert.equal(response.status,status,message);
    assert.equal(await code(response),expected);
    assert.doesNotMatch(bodyText,/private_internal|sk_test_/);
    assert.equal(fixture.effects.filter(value=>value==='prepare_test_only_stripe_checkout').length,1);
    assert.ok(!fixture.effects.includes('bind_test_only_stripe_checkout_session'));
  }
});

test('unexpected client and bind failures collapse to fixed safe codes',async()=>{
  {
    let calls=0;
    const handler=loadEdge('test-only-stripe-checkout',environment(),()=>{
      calls++;
      throw Error('private constructor detail');
    });
    const response=await handler(request());
    const bodyText=await response.clone().text();
    assert.equal(response.status,503);
    assert.equal(await code(response),'PROJECT_BINDING_REQUIRED');
    assert.equal(calls,1);
    assert.doesNotMatch(bodyText,/private constructor detail/);
  }

  {
    const fixture=denialFixture({
      provider:async address=>address.endsWith('/account')
        ?Response.json({object:'account',id:account})
        :Response.json(session),
      rpc:async name=>{
        if(name==='get_server_project_binding')return {data:binding,error:null};
        if(name==='project_binding_session_matches')return {data:true,error:null};
        if(name==='prepare_test_only_stripe_checkout')return {data:prepared,error:null};
        if(name==='bind_test_only_stripe_checkout_session')throw Error('private bind detail');
        throw Error('UNEXPECTED_RPC');
      },
    });
    const response=await fixture.handler(request());
    const bodyText=await response.clone().text();
    assert.equal(response.status,409);
    assert.equal(await code(response),'TEST_ONLY_CHECKOUT_BIND_FAILED');
    assert.doesNotMatch(bodyText,/private bind detail/);
  }
});

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
    assert.deepEqual(effects,['get_server_project_binding']);
  }
});

test('missing Account Read permission fails before session creation',async()=>{
  let calls=0;
  const {handler,effects}=fixture('rk_test_synthetic',async()=>{
    calls++;
    return Response.json({error:{type:'invalid_request_error'}},{status:403});
  });
  assert.equal((await handler(request())).status,503);
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
  assert.equal((await handler(request())).status,502);
  assert.equal(calls,2);
  assert.ok(!effects.includes('bind_test_only_stripe_checkout_session'));
});
