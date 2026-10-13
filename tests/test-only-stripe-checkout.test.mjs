import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildTestOnlyCheckoutForm,isRestrictedStripeTestCheckoutKey,parseTestOnlyCheckoutCompleted,parseTestOnlyCheckoutRequest,verifyStripeTestAccount,verifyTestOnlyCheckoutSession} from "../supabase/functions/_shared/testOnlyStripeCheckout.mjs";
import {signFakeWebhook,verifyRawWebhook} from "../supabase/functions/_shared/billingArchitecture.mjs";

const rid="11111111-1111-4111-8111-111111111111",qid="22222222-2222-4222-8222-222222222222";
const prepared={id:qid,restaurant_id:rid,request_id:qid,return_route:"/admin/settings/konto-testphase",environment:"TEST",livemode:false,product_code:"BASIC",amount_minor:5900,currency:"EUR",billing_interval:"MONTH",price_id:"price_testBasic123"};
const session={id:"cs_test_synthetic123",livemode:false,mode:"subscription",status:"open",payment_status:"unpaid",client_reference_id:qid,metadata:{test_only:"true",checkout_request_id:qid,restaurant_id:rid,request_id:qid,price_id:prepared.price_id},amount_total:5900,currency:"eur",line_items:{data:[{price:{id:prepared.price_id},quantity:1}]},url:"https://checkout.stripe.com/c/pay/test"};

test("request accepts only the exact tenant-bound shape",()=>{
  assert.deepEqual(parseTestOnlyCheckoutRequest({restaurant_id:rid,request_id:qid,return_route:prepared.return_route}),{restaurant_id:rid,request_id:qid,return_route:prepared.return_route});
  assert.throws(()=>parseTestOnlyCheckoutRequest({...prepared,plan_key:"PRO"}),/REQUEST_INVALID/);
});
test("session form is server-price-bound and test-only",()=>{
  const form=buildTestOnlyCheckoutForm(prepared,"https://staging-v2.bonus.wuxuaisbi.com");
  assert.equal(form.get("line_items[0][price]"),prepared.price_id);assert.equal(form.get("metadata[test_only]"),"true");
  assert.equal(form.get("automatic_tax[enabled]"),"false");
  assert.equal(form.get("expand[]"),"line_items");
});
test("checkout accepts only a dedicated restricted TEST key",()=>{
  assert.equal(isRestrictedStripeTestCheckoutKey("rk_test_synthetic"),true);
  for(const value of ["sk_test_synthetic","pk_test_synthetic","rk_live_synthetic","rk_test_","rk_test_synthetic\n","rk_test_synthetic live",""])
    assert.equal(isRestrictedStripeTestCheckoutKey(value),false);
});
test("provider session requires livemode false, exact price and tenant",()=>{
  assert.equal(verifyStripeTestAccount({object:"account",id:"acct_synthetic123"},"acct_synthetic123"),"acct_synthetic123");
  assert.throws(()=>verifyStripeTestAccount({object:"account",id:"acct_foreign123"},"acct_synthetic123"),/ACCOUNT_BINDING_INVALID/);
  assert.equal(verifyTestOnlyCheckoutSession(session,prepared,"acct_synthetic123").session_id,session.id);
  for(const bad of [{...session,livemode:true},{...session,metadata:{...session.metadata,restaurant_id:qid}},{...session,line_items:{data:[{price:{id:"price_other123"},quantity:1}]}}])
    assert.throws(()=>verifyTestOnlyCheckoutSession(bad,prepared,"acct_synthetic123"),/READBACK_INVALID/);
});
test("only signed-path checkout.session.completed material is accepted",()=>{
  const completed={...session,status:"complete",payment_status:"paid"};
  const event={id:"evt_synthetic123",type:"checkout.session.completed",livemode:false,created:1791840000,account:"acct_synthetic123",data:{object:{...completed}}};
  assert.equal(parseTestOnlyCheckoutCompleted(event,completed,"acct_synthetic123").price_id,prepared.price_id);
  assert.equal(parseTestOnlyCheckoutCompleted(Object.fromEntries(Object.entries(event).filter(([key])=>key!=="account")),completed,"acct_synthetic123").price_id,prepared.price_id);
  assert.throws(()=>parseTestOnlyCheckoutCompleted({...event,account:"acct_foreign123"},completed,"acct_synthetic123"),/EVENT_INVALID/);
  assert.throws(()=>parseTestOnlyCheckoutCompleted({...event,type:"invoice.paid"},completed,"acct_synthetic123"),/EVENT_INVALID/);
  assert.throws(()=>parseTestOnlyCheckoutCompleted({...event,livemode:true},completed,"acct_synthetic123"),/EVENT_INVALID/);
  assert.throws(()=>parseTestOnlyCheckoutCompleted(event,{...completed,line_items:{data:[{price:{id:"price_other123"},quantity:1}]}},"acct_synthetic123"),/BINDING_INVALID/);
  assert.throws(()=>parseTestOnlyCheckoutCompleted(event,{...completed,metadata:{...completed.metadata,restaurant_id:qid}},"acct_synthetic123"),/BINDING_INVALID/);
});
test("Stripe signature verification closes unsigned and changed bodies",async()=>{
  const raw=new TextEncoder().encode(JSON.stringify({id:"evt_synthetic123",type:"checkout.session.completed"}));
  const now=1791840000,secret="whsec_synthetic_local_only";
  const signature=await signFakeWebhook(raw,secret,now);
  assert.equal(await verifyRawWebhook(raw,signature,secret,now),true);
  assert.equal(await verifyRawWebhook(new TextEncoder().encode("{}"),signature,secret,now),false);
  assert.equal(await verifyRawWebhook(raw,signature,secret,now+301),false);
});
test("SQL contract stays isolated from every real product writer",()=>{
  const sql=readFileSync(new URL("../supabase/migrations/20261013154250_test_only_stripe_checkout_isolation.sql",import.meta.url),"utf8");
  for(const relation of ["basic_paid_offer_acceptances","branch_subscriptions","branch_entitlement_overrides","billing_trial_claims","manual_basic_trial_decisions"])
    assert.doesNotMatch(sql,new RegExp(`(?:insert\\s+into|update|delete\\s+from)\\s+(?:public\\.)?${relation}`,"i"));
  assert.match(sql,/event_type='checkout\.session\.completed'/);assert.doesNotMatch(sql,/invoice\.paid/i);
  assert.match(sql,/price_livemode is distinct from false/);assert.match(sql,/environment='TEST'/);
  assert.match(sql,/pg_advisory_xact_lock\(hashtextextended\('test-only-checkout-request:'/);
  assert.match(sql,/pg_advisory_xact_lock\(hashtextextended\('test-only-checkout-event:'/);
  assert.match(sql,/TEST_ONLY_CHECKOUT_EVENT_REPLAY_CONFLICT/);
  assert.match(sql,/TEST_ONLY_CHECKOUT_CANCEL_REPLAY_CONFLICT/);
  assert.match(sql,/test_only_checkout\.access_active\(req\.restaurant_id,req\.access_receipt_id\)/);
  assert.doesNotMatch(sql,/create or replace function public\.test_only_basic_access_active_internal/);
});
test("ACL and Edge boundaries are explicit",()=>{
  const config=readFileSync(new URL("../supabase/config.toml",import.meta.url),"utf8");
  assert.match(config,/\[functions\.test-only-stripe-checkout\]\nverify_jwt = true/);
  assert.match(config,/\[functions\.test-only-stripe-webhook\]\nverify_jwt = false/);
  const hook=readFileSync(new URL("../supabase/functions/test-only-stripe-webhook/index.ts",import.meta.url),"utf8");
  const checkout=readFileSync(new URL("../supabase/functions/test-only-stripe-checkout/index.ts",import.meta.url),"utf8");
  for(const source of [hook,checkout])assert.match(source,/requireProjectBinding/);
  for(const source of [hook,checkout])assert.match(source,/verifyStripeTestAccount/);
  assert.match(checkout,/requireProjectSession/);assert.match(checkout,/request\.headers\.get\("origin"\)!==binding\.app_origin/);
  assert.match(hook,/verifyRawWebhook/);assert.match(hook,/event\.type!=="checkout\.session\.completed"/);
  assert.ok(hook.indexOf("verifyRawWebhook(")<hook.indexOf("JSON.parse("));
});
