import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {loadEdge} from './fixtures/project-binding-edge-harness.mjs';
import {signFakeWebhook} from '../supabase/functions/_shared/billingArchitecture.mjs';

export const targetNames=['platform_test_join_permit_active_internal','require_platform_test_only_join_scope_internal',
  'get_customer_test_only_join_status','require_active_operator_test_legal_customer_internal',
  'prepare_basic_test_checkout','complete_basic_test_checkout','record_basic_stripe_test_event','secure_redemption_edge_mutate'];
export function functionSnapshot(s,jsonSql){
  return jsonSql(s,`select jsonb_object_agg(proname,jsonb_build_object('source',prosrc,'owner',proowner,'acl',proacl::text))
    from pg_proc where pronamespace='public'::regnamespace and proname in (${targetNames.map(n=>`'${n}'`).join(',')});`);
}
export function checkUpgrade(before,after){
  for(const name of targetNames){
    assert.equal(after[name].owner,before[name].owner);assert.equal(after[name].acl,before[name].acl);
    let expected=before[name].source;
    if(name===targetNames[0])expected=expected.replace("auth.jwt()->>'iss'='https://bwhvfjuwixgwduoeqaya.supabase.co/auth/v1'",'public.project_binding_session_matches()');
    else if(targetNames.slice(1,4).includes(name))expected=expected.replace("auth.jwt()->>'iss' is distinct from 'https://bwhvfjuwixgwduoeqaya.supabase.co/auth/v1'",'not public.project_binding_session_matches()');
    else expected=expected.replace('\nbegin\n',`\nbegin\n  perform project_bootstrap.require_runtime_binding(${name==='prepare_basic_test_checkout'});\n`);
    assert.equal(after[name].source,expected,`exact source/ACL parity: ${name}`);
  }
}
const tables=['customer_account_memberships','customer_test_only_join_receipts','platform_customer_terms_receipts',
  'active_operator_test_legal_consents','basic_test_checkout_requests','branch_subscriptions',
  'basic_stripe_test_event_inbox','secure_redemption_requests','points_transactions','customer_rewards',
  'customer_transactional_email_deliveries'];
const counts=(s,jsonSql)=>jsonSql(s,`select jsonb_build_object(${tables.map(t=>`'${t}',(select count(*) from public.${t})`).join(',')});`);
const webhookBody=()=>({input_event_id:`evt_binding_${randomUUID().replaceAll('-','')}`,input_payload_sha256:'a'.repeat(64),
  input_event_type:'invoice.paid',input_event_created_at:new Date().toISOString(),input_provider_session_id:null,
  input_provider_customer_id:'cus_synthetic123',input_provider_subscription_id:'sub_synthetic123',input_restaurant_id:null,
  input_acceptance_id:null,input_provider_status:null,input_period_start:null,input_period_end:null,
  input_request_id:null,input_correlation_id:null,input_livemode:false});

export async function exerciseRuntime(s,jsonSql,bound){
  let checks=0,providerCalls=0;
  const service=createClient(s.status.API_URL,s.status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const user=createClient(s.status.API_URL,s.status.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false},
    global:{headers:{Authorization:`Bearer ${s.auth.access_token}`}}});
  const before=counts(s,jsonSql),id=randomUUID();
  const denied=async(client,name,args,code)=>{
    const prior=counts(s,jsonSql),result=await client.rpc(name,args);
    assert.ok(result.error,`must deny ${name}`);if(code)assert.equal(result.error.message,code);
    assert.deepEqual(counts(s,jsonSql),prior);checks++;
  };
  await denied(user,'prepare_basic_test_checkout',{input_acceptance_id:id,input_request_id:id,input_return_route:'/admin/settings/konto-testphase'},
    bound?'BASIC_TEST_CHECKOUT_OWNER_REQUIRED':'PROJECT_BINDING_REQUIRED');
  await denied(service,'complete_basic_test_checkout',{input_checkout_request_id:id,input_provider_session_id:'cs_test_synthetic123'},
    bound?'BASIC_TEST_CHECKOUT_NOT_FOUND':'PROJECT_BINDING_REQUIRED');
  await denied(service,'secure_redemption_edge_mutate',{input_actor_user_id:s.claims.sub,
    input_payload:{action:'start',restaurant_slug:'no-such-tenant',source_type:'points',entitlement_id:id,request_id:id,correlation_id:id,idempotency_key:id}},
    bound?'REDEMPTION_NOT_AVAILABLE':'PROJECT_BINDING_REQUIRED');
  if(!bound)await denied(service,'record_basic_stripe_test_event',webhookBody(),'PROJECT_BINDING_REQUIRED');
  await denied(user,'join_customer_account_test_only_at_legal',{input_restaurant_slug:'no-such-tenant',input_branch_id:id,
    input_terms_accepted:true,input_privacy_acknowledged:true,input_bundle_id:'synthetic',input_bundle_hash:'a'.repeat(64),input_request_id:id},'TEST_ONLY_JOIN_SCOPE_DENIED');
  for(const name of ['get_customer_test_only_merchant_bundle','get_customer_active_operator_test_legal']){
    const result=await user.rpc(name,{input_restaurant_slug:'no-such-tenant',input_branch_id:id});
    assert.equal(result.data?.status,'UNAVAILABLE');checks++;
  }
  for(const name of ['get_server_project_binding','get_project_bootstrap_anchor'])await denied(user,name,{});
  for(const name of ['complete_basic_test_checkout','record_basic_stripe_test_event','secure_redemption_edge_mutate']){
    const args=name==='complete_basic_test_checkout'?{input_checkout_request_id:id,input_provider_session_id:'cs_test_synthetic123'}:
      name==='record_basic_stripe_test_event'?webhookBody():{input_actor_user_id:s.claims.sub,input_payload:{}};
    await denied(user,name,args);
  }
  const env={SUPABASE_URL:s.e.backend_url,SUPABASE_ANON_KEY:'runtime-public-adapter',SUPABASE_SERVICE_ROLE_KEY:'runtime-service-adapter',
    BASIC_BILLING_MODE:'staging_test_only',BASIC_BILLING_PROJECT_REF:s.ref,REDEMPTION_EDGE_MODE:'staging',REDEMPTION_STAGING_PROJECT_REF:s.ref,
    WUXUAI_AUTH_ISSUER:s.issuer,WUXUAI_APP_ORIGIN:s.e.app_origin,DENO_DEPLOYMENT_ID:`${s.ref}_${randomUUID()}_1`,
    STRIPE_TEST_SECRET_KEY:'sk_test_non_sending',STRIPE_TEST_WEBHOOK_SECRET:'whsec_non_sending'};
  // Transport substitution only: real local Auth/REST/DB, synthetic deployment
  // metadata. No external provider, and no DB/business RPC is stubbed here.
  const factory=(_url,key,options)=>key==='runtime-service-adapter'?service:
    options?.global?.headers?.Authorization?user:createClient(s.status.API_URL,s.status.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const request=(body={})=>new Request(`${s.e.backend_url}/functions/v1/synthetic`,{method:'POST',body:JSON.stringify(body),
    headers:{origin:s.e.app_origin,authorization:`Bearer ${s.auth.access_token}`,'content-type':'application/json'}});
  for(const name of ['billing-basic-test-checkout','billing-stripe-test-webhook','redemption-confirmation']){
    for(const patch of [{WUXUAI_AUTH_ISSUER:'https://bwhvfjuwixgwduoeqaya.supabase.co/auth/v1'},
      {BASIC_BILLING_PROJECT_REF:'c'.repeat(20),REDEMPTION_STAGING_PROJECT_REF:'c'.repeat(20)},
      {WUXUAI_APP_ORIGIN:'https://swapped.example.invalid'},
      {SUPABASE_URL:`https://${'c'.repeat(20)}.supabase.co`},
      {DENO_DEPLOYMENT_ID:`${'c'.repeat(20)}_${randomUUID()}_1`},
      ...(!bound?[{}]:[])]){
      const prior=counts(s,jsonSql),handler=loadEdge(name,{...env,...patch},factory,async()=>{providerCalls++;throw Error('PROVIDER_FORBIDDEN');});
      const replies=await Promise.all(Array.from({length:3},()=>handler(request())));
      assert.ok(replies.every(r=>r.status===503));assert.deepEqual(counts(s,jsonSql),prior);checks++;
    }
  }
  assert.deepEqual(counts(s,jsonSql),before);assert.equal(providerCalls,0);
  if(bound){
    const checkout=loadEdge('billing-basic-test-checkout',env,factory,async()=>{providerCalls++;throw Error('PROVIDER_FORBIDDEN');});
    const result=await checkout(request({acceptance_id:id,request_id:id,return_route:'/admin/settings/konto-testphase'}));
    assert.equal(result.status,403);assert.equal((await result.json()).code,'BASIC_TEST_CHECKOUT_OWNER_REQUIRED');checks++;
    const redemption=loadEdge('redemption-confirmation',env,factory);
    assert.equal((await redemption(request({action:'start',restaurant_slug:'no-such-tenant',source_type:'points',entitlement_id:id,
      request_id:id,correlation_id:id,idempotency_key:id}))).status,409);checks++;
    assert.deepEqual(counts(s,jsonSql),before);
    const hook=loadEdge('billing-stripe-test-webhook',env,factory);
    const now=Math.floor(Date.now()/1000),raw=new TextEncoder().encode(JSON.stringify({id:`evt_binding_${randomUUID().replaceAll('-','')}`,
      livemode:false,type:'invoice.paid',created:now,data:{object:{customer:'cus_synthetic123',subscription:'sub_synthetic123',metadata:{}}}}));
    const signature=await signFakeWebhook(raw,env.STRIPE_TEST_WEBHOOK_SECRET,now);
    const responses=await Promise.all(Array.from({length:3},()=>hook(new Request(s.e.backend_url,{method:'POST',body:raw,headers:{'stripe-signature':signature}}))));
    assert.ok(responses.every(r=>r.status===200));
    for(const response of responses)assert.equal((await response.json()).details.status,'UNMATCHED');
    const after=counts(s,jsonSql);assert.equal(after.basic_stripe_test_event_inbox,before.basic_stripe_test_event_inbox+1);
    assert.deepEqual({...after,basic_stripe_test_event_inbox:before.basic_stripe_test_event_inbox},before);checks++;
  }
  assert.equal(providerCalls,0);
  console.log(JSON.stringify({phase:'runtime_binding',bound,checks,before,after:counts(s,jsonSql),providerCalls,
    edgeRuntime:'NODE_HANDLER_REAL_LOCAL_RPC_SYNTHETIC_DEPLOYMENT'}));
}
