import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {loadEdge} from "./fixtures/project-binding-edge-harness.mjs";
import {signFakeWebhook} from "../supabase/functions/_shared/billingArchitecture.mjs";

const ref="c".repeat(20),url=`https://${ref}.supabase.co`,origin="https://staging.example.invalid";
const account="acct_synthetic123",restaurant=randomUUID(),checkoutRequest=randomUUID(),requestId=randomUUID();
const customer="cus_synthetic123",subscription="sub_synthetic123",subscriptionItem="si_synthetic123",price="price_synthetic123",secret="whsec_synthetic_lifecycle";
const binding={project_ref:ref,backend_url:url,auth_issuer:`${url}/auth/v1`,app_origin:origin};
const event=()=>{const now=Math.floor(Date.now()/1000);return {id:"evt_invoice_paid_12345678",type:"invoice.paid",livemode:false,
  created:now,account,data:{object:{id:"in_invoice_paid_12345678",livemode:false,customer,status:"paid",amount_paid:5900,
    amount_due:5900,currency:"eur",period_start:now,period_end:now,
    parent:{type:"subscription_details",subscription_details:{subscription,metadata:{test_only:"true",checkout_request_id:checkoutRequest,
      restaurant_id:restaurant,request_id:requestId,price_id:price}}},
    lines:{has_more:false,data:[{quantity:1,pricing:{type:"price_details",price_details:{price,product:"prod_synthetic123"}},
      parent:{type:"subscription_item_details",subscription_item_details:{subscription,subscription_item:subscriptionItem,proration:false}},
      period:{start:now,end:now+2_592_000}}]}}}}};
const subscriptionUpdate=()=>{const now=Math.floor(Date.now()/1000);return {id:"evt_subscription_updated_12345678",
  type:"customer.subscription.updated",livemode:false,created:now,account,data:{object:{id:subscription,object:"subscription",
    livemode:false,customer,status:"active",cancel_at_period_end:false,
    metadata:{test_only:"true",checkout_request_id:checkoutRequest,restaurant_id:restaurant,request_id:requestId,price_id:price},
    items:{has_more:false,data:[{id:subscriptionItem,object:"subscription_item",subscription,quantity:1,
      current_period_start:now,current_period_end:now+2_592_000,
      price:{id:price,product:"prod_synthetic123",unit_amount:5900,currency:"eur"},
      plan:{id:price,product:"prod_synthetic123",currency:"eur"}}]}}}}};
const env=(enabled="true",readKey="rk_test_webhook_synthetic")=>({SUPABASE_URL:url,["SUPABASE_"+"SERVICE_ROLE_KEY"]:"synthetic-service",
  TEST_ONLY_STRIPE_LIFECYCLE_ENABLED:enabled,TEST_ONLY_STRIPE_WEBHOOK_RESTRICTED_KEY:readKey,
  TEST_ONLY_STRIPE_LIFECYCLE_WEBHOOK_SECRET:secret,TEST_ONLY_STRIPE_ACCOUNT_ID:account,
  TEST_ONLY_STRIPE_PROJECT_REF:ref,WUXUAI_AUTH_ISSUER:binding.auth_issuer,WUXUAI_APP_ORIGIN:origin,
  DENO_DEPLOYMENT_ID:`${ref}_${randomUUID()}_1`});

async function request(payload=event(),valid=true){
  const raw=new TextEncoder().encode(JSON.stringify(payload));
  const signature=await signFakeWebhook(raw,secret,Math.floor(Date.now()/1000));
  return new Request(`${url}/functions/v1/test-only-stripe-lifecycle-webhook`,{method:"POST",
    headers:{"stripe-signature":valid?signature:"t=1,v1=invalid"},body:raw});
}
function fixture(environment=env(),provider=async()=>Response.json({object:"account",id:account})){
  const effects=[];
  const client=()=>({rpc:async(name,args)=>{effects.push({name,args});
    if(name==="get_server_project_binding")return {data:binding,error:null};
    if(name==="record_test_only_stripe_subscription_event")return {data:{status:"TEST_ONLY_SUBSCRIPTION_EVENT_RECORDED"},error:null};
    throw Error("UNEXPECTED_RPC");}});
  return {handler:loadEdge("test-only-stripe-lifecycle-webhook",environment,client,provider),effects};
}

test("valid signed event reaches only the isolated lifecycle RPC",async()=>{
  const calls=[];const {handler,effects}=fixture(env(),async(address,options)=>{calls.push(address);
    assert.equal(options.headers.authorization,"Bearer rk_test_webhook_synthetic");return Response.json({object:"account",id:account});});
  const response=await handler(await request());assert.equal(response.status,200);assert.equal(calls.length,1);
  assert.deepEqual(effects.map(value=>value.name),["get_server_project_binding","record_test_only_stripe_subscription_event"]);
  assert.equal(effects[1].args.input_livemode,false);assert.equal(effects[1].args.input_price_id,price);
});

test("2026-08-26 subscription update forwards only its bound item period to the isolated RPC",async()=>{
  const {handler,effects}=fixture();const payload=subscriptionUpdate();
  const response=await handler(await request(payload));assert.equal(response.status,200);
  assert.deepEqual(effects.map(value=>value.name),["get_server_project_binding","record_test_only_stripe_subscription_event"]);
  const args=effects[1].args;
  assert.equal(args.input_provider_subscription_id,subscription);assert.equal(args.input_price_id,price);
  assert.equal(args.input_period_start,new Date(payload.data.object.items.data[0].current_period_start*1000).toISOString());
  assert.equal(args.input_period_end,new Date(payload.data.object.items.data[0].current_period_end*1000).toISOString());
});

test("disabled gate, bad key and bad signature stop before provider and DB writer",async()=>{
  for(const environment of [env("false"),env("true","sk_test_forbidden")]){
    let calls=0;const {handler,effects}=fixture(environment,async()=>{calls++;throw Error("NETWORK_FORBIDDEN");});
    assert.equal((await handler(await request())).status,503);assert.equal(calls,0);assert.deepEqual(effects,[]);
  }
  let calls=0;const {handler,effects}=fixture(env(),async()=>{calls++;throw Error("NETWORK_FORBIDDEN");});
  assert.equal((await handler(await request(event(),false))).status,400);assert.equal(calls,0);assert.deepEqual(effects.map(x=>x.name),["get_server_project_binding"]);
});

test("foreign account, refund and changed price never reach the isolated writer",async()=>{
  for(const mode of ["foreign","refund","price"]){
    const provider=mode==="foreign"?async()=>Response.json({object:"account",id:"acct_foreign123"}):undefined;
    const {handler,effects}=fixture(env(),provider);const payload=event();
    if(mode==="refund")payload.type="charge.refunded";
    if(mode==="price")payload.data.object.lines.data[0].pricing.price_details.price="price_foreign123";
    assert.equal((await handler(await request(payload))).status,409);
    assert.ok(!effects.some(value=>value.name==="record_test_only_stripe_subscription_event"));
  }
});
