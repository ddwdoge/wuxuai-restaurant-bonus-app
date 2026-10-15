import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {parseTestOnlySubscriptionEvent} from "../supabase/functions/_shared/testOnlyStripeCheckout.mjs";

const account="acct_synthetic123",restaurant=randomUUID(),checkoutRequest=randomUUID(),requestId=randomUUID();
const customer="cus_synthetic123",subscription="sub_synthetic123",subscriptionItem="si_synthetic123",price="price_synthetic123";
const metadata={test_only:"true",checkout_request_id:checkoutRequest,restaurant_id:restaurant,request_id:requestId,price_id:price};
const now=1_791_850_000;
const invoice=(type="invoice.paid")=>({id:`evt_${type.replaceAll(".","_")}_12345678`,type,livemode:false,created:now,account,
  data:{object:{id:`in_${type.replaceAll(".","_")}_12345678`,livemode:false,customer,currency:"eur",
    status:type==="invoice.paid"?"paid":"open",amount_paid:type==="invoice.paid"?5900:0,amount_due:5900,
    period_start:now,period_end:now,parent:{type:"subscription_details",subscription_details:{subscription,metadata}},
    lines:{has_more:false,data:[{quantity:1,pricing:{type:"price_details",price_details:{price,product:"prod_synthetic123"}},
      parent:{type:"subscription_item_details",subscription_item_details:{subscription,subscription_item:subscriptionItem,proration:false}},
      period:{start:now,end:now+2_592_000}}]}}}});
const subscriptionEvent=(type="customer.subscription.updated",status="active")=>({id:`evt_${type.replaceAll(".","_")}_12345678`,type,
  livemode:false,created:now,account,data:{object:{id:subscription,livemode:false,customer,status,cancel_at_period_end:false,
    metadata,items:{has_more:false,data:[{id:subscriptionItem,object:"subscription_item",subscription,quantity:1,
      current_period_start:now,current_period_end:now+2_592_000,
      price:{id:price,product:"prod_synthetic123",unit_amount:5900,currency:"eur"},
      plan:{id:price,product:"prod_synthetic123",currency:"eur"}}]}}}});

test("sanitized hosted initial invoice uses the uniquely bound position when header timestamps are identical",()=>{
  const paid=parseTestOnlySubscriptionEvent(invoice(),account);
  assert.equal(paid.event_type,"invoice.paid");assert.equal(paid.provider_subscription_id,subscription);
  assert.equal(paid.checkout_request_id,checkoutRequest);assert.equal(paid.amount_minor,5900);
  assert.equal(paid.period_start,new Date(now*1000).toISOString());
  assert.equal(paid.period_end,new Date((now+2_592_000)*1000).toISOString());
  const invalidHeader=invoice();invalidHeader.data.object.period_start=-1;invalidHeader.data.object.period_end=0;
  assert.equal(parseTestOnlySubscriptionEvent(invalidHeader,account).period_end,paid.period_end);
});

test("sanitized 2026-08-26 renewal invoice uses its bound line period when the invoice header covers the prior cycle",()=>{
  const fixture=JSON.parse(readFileSync(new URL("./fixtures/stripe-invoice-paid-renewal-2026-08-26.sanitized.json",import.meta.url),"utf8"));
  const parsed=parseTestOnlySubscriptionEvent(fixture,"acct_synthetic123");
  assert.equal(parsed.provider_subscription_id,"sub_synthetic123");
  assert.equal(parsed.price_id,"price_synthetic123");
  assert.equal(parsed.period_start,"2026-11-15T19:13:48.000Z");
  assert.equal(parsed.period_end,"2026-12-15T19:13:48.000Z");
});

test("renewal and payment failure stay exactly subscription, position and price bound",()=>{
  const renewal=invoice();renewal.data.object.period_start=now;renewal.data.object.period_end=now+2_592_000;
  assert.equal(parseTestOnlySubscriptionEvent(renewal,account).price_id,price);
  const failed=parseTestOnlySubscriptionEvent(invoice("invoice.payment_failed"),account);
  assert.equal(failed.provider_status,"open");assert.equal(failed.currency,"EUR");
});

test("missing and invalid line intervals fail closed while invoice headers never replace the line period",()=>{
  const missing=invoice();delete missing.data.object.lines.data[0].period;
  assert.throws(()=>parseTestOnlySubscriptionEvent(missing,account),/TEST_ONLY_SUBSCRIPTION_PERIOD_INVALID/);
  const invalid=invoice();invalid.data.object.lines.data[0].period.end=now;
  assert.throws(()=>parseTestOnlySubscriptionEvent(invalid,account),/TEST_ONLY_SUBSCRIPTION_PERIOD_INVALID/);
  const differentHeader=invoice();differentHeader.data.object.period_start=now-2_592_000;differentHeader.data.object.period_end=now;
  const parsed=parseTestOnlySubscriptionEvent(differentHeader,account);
  assert.equal(parsed.period_start,new Date(now*1000).toISOString());
  assert.equal(parsed.period_end,new Date((now+2_592_000)*1000).toISOString());
});

test("multiple, contradictory or incomplete subscription positions fail closed",()=>{
  const uniqueAmongSeveral=invoice();uniqueAmongSeveral.data.object.lines.data.unshift({quantity:1,
    pricing:{type:"price_details",price_details:{price:"price_adjustment123",product:"prod_synthetic123"}},
    parent:{type:"invoice_item_details",invoice_item_details:{}},period:{start:now,end:now+2_592_000}});
  assert.equal(parseTestOnlySubscriptionEvent(uniqueAmongSeveral,account).price_id,price);
  const duplicate=invoice();duplicate.data.object.lines.data.push(structuredClone(duplicate.data.object.lines.data[0]));
  assert.throws(()=>parseTestOnlySubscriptionEvent(duplicate,account),/TEST_ONLY_SUBSCRIPTION_PRICE_INVALID/);
  const conflicting=invoice();const second=structuredClone(conflicting.data.object.lines.data[0]);
  second.parent.subscription_item_details.subscription_item="si_otheritem123";
  second.pricing.price_details.price="price_foreign123";conflicting.data.object.lines.data.push(second);
  assert.throws(()=>parseTestOnlySubscriptionEvent(conflicting,account),/TEST_ONLY_SUBSCRIPTION_PRICE_INVALID/);
  const missingItem=invoice();delete missingItem.data.object.lines.data[0].parent.subscription_item_details.subscription_item;
  assert.throws(()=>parseTestOnlySubscriptionEvent(missingItem,account),/TEST_ONLY_SUBSCRIPTION_BINDING_INVALID/);
  const foreignOnly=invoice();foreignOnly.data.object.lines.data[0].parent.subscription_item_details.subscription="sub_foreign123";
  assert.throws(()=>parseTestOnlySubscriptionEvent(foreignOnly,account),/TEST_ONLY_SUBSCRIPTION_BINDING_INVALID/);
});

test("sanitized renewal stays fail-closed for ambiguous, foreign, wrong-price and invalid positions",()=>{
  const fixture=()=>JSON.parse(readFileSync(new URL("./fixtures/stripe-invoice-paid-renewal-2026-08-26.sanitized.json",import.meta.url),"utf8"));
  const ambiguous=fixture();ambiguous.data.object.lines.data.push(structuredClone(ambiguous.data.object.lines.data[0]));
  assert.throws(()=>parseTestOnlySubscriptionEvent(ambiguous,account),/TEST_ONLY_SUBSCRIPTION_PRICE_INVALID/);
  const foreign=fixture();foreign.data.object.lines.data[0].parent.subscription_item_details.subscription="sub_foreign123";
  assert.throws(()=>parseTestOnlySubscriptionEvent(foreign,account),/TEST_ONLY_SUBSCRIPTION_BINDING_INVALID/);
  const wrongPrice=fixture();wrongPrice.data.object.lines.data[0].pricing.price_details.price="price_foreign123";
  assert.throws(()=>parseTestOnlySubscriptionEvent(wrongPrice,account),/TEST_ONLY_SUBSCRIPTION_PRICE_INVALID/);
  const invalid=fixture();invalid.data.object.lines.data[0].period.end=invalid.data.object.lines.data[0].period.start;
  assert.throws(()=>parseTestOnlySubscriptionEvent(invalid,account),/TEST_ONLY_SUBSCRIPTION_PERIOD_INVALID/);
});

test("subscription update and deletion preserve cancellation semantics without real writes",()=>{
  const update=subscriptionEvent();update.data.object.cancel_at_period_end=true;
  assert.equal(parseTestOnlySubscriptionEvent(update,account).cancel_at_period_end,true);
  const deleted=subscriptionEvent("customer.subscription.deleted","canceled");
  assert.equal(parseTestOnlySubscriptionEvent(deleted,account).provider_status,"canceled");
});

test("sanitized 2026-08-26 subscription event derives the period from its uniquely bound item",()=>{
  const fixture=JSON.parse(readFileSync(new URL("./fixtures/stripe-customer-subscription-updated-2026-08-26.sanitized.json",import.meta.url),"utf8"));
  const parsed=parseTestOnlySubscriptionEvent(fixture,"acct_synthetic123");
  assert.equal(parsed.provider_subscription_id,"sub_synthetic123");
  assert.equal(parsed.price_id,"price_synthetic123");
  assert.equal(parsed.period_start,"2026-11-15T19:13:48.000Z");
  assert.equal(parsed.period_end,"2026-12-15T19:13:48.000Z");
});

test("subscription item period binding remains fail-closed for missing, ambiguous and contradictory data",()=>{
  const missing=subscriptionEvent();delete missing.data.object.items.data[0].current_period_start;
  assert.throws(()=>parseTestOnlySubscriptionEvent(missing,account),/TEST_ONLY_SUBSCRIPTION_PERIOD_INVALID/);
  const multiple=subscriptionEvent();multiple.data.object.items.data.push(structuredClone(multiple.data.object.items.data[0]));
  assert.throws(()=>parseTestOnlySubscriptionEvent(multiple,account),/TEST_ONLY_SUBSCRIPTION_PRICE_INVALID/);
  const foreignSubscription=subscriptionEvent();foreignSubscription.data.object.items.data[0].subscription="sub_foreign123";
  assert.throws(()=>parseTestOnlySubscriptionEvent(foreignSubscription,account),/TEST_ONLY_SUBSCRIPTION_BINDING_INVALID/);
  const foreignPrice=subscriptionEvent();foreignPrice.data.object.items.data[0].price.id="price_foreign123";
  assert.throws(()=>parseTestOnlySubscriptionEvent(foreignPrice,account),/TEST_ONLY_SUBSCRIPTION_PRICE_INVALID/);
  const conflictingPlan=subscriptionEvent();conflictingPlan.data.object.items.data[0].plan.id="price_foreign123";
  assert.throws(()=>parseTestOnlySubscriptionEvent(conflictingPlan,account),/TEST_ONLY_SUBSCRIPTION_PRICE_INVALID/);
  const conflictingHeader=subscriptionEvent();conflictingHeader.data.object.current_period_start=now+1;
  conflictingHeader.data.object.current_period_end=now+2_592_001;
  assert.throws(()=>parseTestOnlySubscriptionEvent(conflictingHeader,account),/TEST_ONLY_SUBSCRIPTION_PERIOD_CONFLICT/);
});

test("LIVE, foreign account, price, malformed metadata and refunds fail closed",()=>{
  const cases=[];
  const live=invoice();live.livemode=true;cases.push(live);
  const foreign=invoice();foreign.account="acct_foreign123";cases.push(foreign);
  const wrongPrice=invoice();wrongPrice.data.object.lines.data[0].pricing.price_details.price="price_foreign123";cases.push(wrongPrice);
  const wrongSubscription=invoice();wrongSubscription.data.object.lines.data[0].parent.subscription_item_details.subscription="sub_foreign123";cases.push(wrongSubscription);
  const missing=invoice();delete missing.data.object.parent.subscription_details.metadata.request_id;cases.push(missing);
  cases.push({...invoice(),type:"charge.refunded"});
  for(const value of cases)assert.throws(()=>parseTestOnlySubscriptionEvent(value,account),/TEST_ONLY_SUBSCRIPTION_/);
});

test("migration is isolated, append-only, concurrent and leaves every real writer untouched",()=>{
  const sql=readFileSync(new URL("../supabase/migrations/20261015170349_test_only_stripe_subscription_lifecycle.sql",import.meta.url),"utf8");
  const guard=readFileSync(new URL("../supabase/migrations/20261015203155_test_only_subscription_item_period_projection_guard.sql",import.meta.url),"utf8");
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
  assert.match(guard,/paid_period_applied/);assert.match(guard,/input_event_type='invoice\.paid'/);
  assert.doesNotMatch(guard,/insert\s+into\s+public\.|update\s+public\.|delete\s+from\s+public\./i);
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
