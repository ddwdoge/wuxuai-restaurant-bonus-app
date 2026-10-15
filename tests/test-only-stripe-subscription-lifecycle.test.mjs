import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {parseTestOnlySubscriptionEvent} from "../supabase/functions/_shared/testOnlyStripeCheckout.mjs";

const account="acct_synthetic123",restaurant=randomUUID(),checkoutRequest=randomUUID(),requestId=randomUUID();
const customer="cus_synthetic123",subscription="sub_synthetic123",price="price_synthetic123";
const metadata={test_only:"true",checkout_request_id:checkoutRequest,restaurant_id:restaurant,request_id:requestId,price_id:price};
const now=1_791_850_000;
const invoice=(type="invoice.paid")=>({id:`evt_${type.replaceAll(".","_")}_12345678`,type,livemode:false,created:now,account,
  data:{object:{id:`in_${type.replaceAll(".","_")}_12345678`,livemode:false,customer,currency:"eur",
    status:type==="invoice.paid"?"paid":"open",amount_paid:type==="invoice.paid"?5900:0,amount_due:5900,
    period_start:now,period_end:now+2_592_000,parent:{type:"subscription_details",subscription_details:{subscription,metadata}},
    lines:{data:[{quantity:1,price:{id:price},period:{start:now,end:now+2_592_000}}]}}}});
const subscriptionEvent=(type="customer.subscription.updated",status="active")=>({id:`evt_${type.replaceAll(".","_")}_12345678`,type,
  livemode:false,created:now,account,data:{object:{id:subscription,livemode:false,customer,status,cancel_at_period_end:false,
    current_period_start:now,current_period_end:now+2_592_000,metadata,
    items:{data:[{quantity:1,price:{id:price,unit_amount:5900,currency:"eur"}}]}}}});

test("signed invoice renewal and payment failure material stays exactly tenant/price bound",()=>{
  const paid=parseTestOnlySubscriptionEvent(invoice(),account);
  assert.equal(paid.event_type,"invoice.paid");assert.equal(paid.provider_subscription_id,subscription);
  assert.equal(paid.checkout_request_id,checkoutRequest);assert.equal(paid.amount_minor,5900);
  const failed=parseTestOnlySubscriptionEvent(invoice("invoice.payment_failed"),account);
  assert.equal(failed.provider_status,"open");assert.equal(failed.currency,"EUR");
});

test("subscription update and deletion preserve cancellation semantics without real writes",()=>{
  const update=subscriptionEvent();update.data.object.cancel_at_period_end=true;
  assert.equal(parseTestOnlySubscriptionEvent(update,account).cancel_at_period_end,true);
  const deleted=subscriptionEvent("customer.subscription.deleted","canceled");
  assert.equal(parseTestOnlySubscriptionEvent(deleted,account).provider_status,"canceled");
});

test("LIVE, foreign account, price, malformed metadata and refunds fail closed",()=>{
  const cases=[];
  const live=invoice();live.livemode=true;cases.push(live);
  const foreign=invoice();foreign.account="acct_foreign123";cases.push(foreign);
  const wrongPrice=invoice();wrongPrice.data.object.lines.data[0].price.id="price_foreign123";cases.push(wrongPrice);
  const missing=invoice();delete missing.data.object.parent.subscription_details.metadata.request_id;cases.push(missing);
  cases.push({...invoice(),type:"charge.refunded"});
  for(const value of cases)assert.throws(()=>parseTestOnlySubscriptionEvent(value,account),/TEST_ONLY_SUBSCRIPTION_/);
});

test("migration is isolated, append-only, concurrent and leaves every real writer untouched",()=>{
  const sql=readFileSync(new URL("../supabase/migrations/20261015170349_test_only_stripe_subscription_lifecycle.sql",import.meta.url),"utf8");
  for(const relation of ["branch_subscriptions","basic_paid_offer_acceptances","branch_entitlement_overrides","billing_trial_claims",
    "manual_basic_trial_decisions","restaurants","transactional_email_outbox","customer_offer_email_outbox"])
    assert.doesNotMatch(sql,new RegExp(`(?:insert\\s+into|update|delete\\s+from)\\s+(?:public\\.)?${relation}`,"i"));
  assert.match(sql,/test-only-subscription-event:/);assert.match(sql,/test-only-subscription:/);
  assert.match(sql,/TEST_ONLY_SUBSCRIPTION_EVENT_REPLAY_CONFLICT/);
  assert.match(sql,/old\.synthetic_state='CANCELLED_TEST'/);
  assert.match(sql,/subscription_events enable row level security/);
  assert.match(sql,/grant execute on function public\.record_test_only_stripe_subscription_event[\s\S]*to service_role/);
  assert.doesNotMatch(sql,/grant execute on function public\.record_test_only_stripe_subscription_event[\s\S]*to (?:anon|authenticated)/);
  assert.doesNotMatch(sql,/cron\.schedule|pg_cron|http_post|net\.http|https?:\/\/api\.stripe\.com/i);
});

test("lifecycle Edge endpoint is signature-only and independently disabled by default",()=>{
  const config=readFileSync(new URL("../supabase/config.toml",import.meta.url),"utf8");
  const source=readFileSync(new URL("../supabase/functions/test-only-stripe-lifecycle-webhook/index.ts",import.meta.url),"utf8");
  assert.match(config,/\[functions\.test-only-stripe-lifecycle-webhook\]\nverify_jwt = false/);
  assert.match(source,/TEST_ONLY_STRIPE_LIFECYCLE_ENABLED/);
  assert.match(source,/verifyRawWebhook/);assert.ok(source.indexOf("verifyRawWebhook(")<source.indexOf("JSON.parse("));
  assert.match(source,/requireProjectBinding/);assert.match(source,/record_test_only_stripe_subscription_event/);
  assert.doesNotMatch(source,/record_basic_stripe_test_event|branch_subscriptions|entitlement/i);
});
