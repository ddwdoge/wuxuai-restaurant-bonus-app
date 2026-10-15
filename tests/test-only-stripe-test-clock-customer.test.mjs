import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const migration=readFileSync(new URL("../supabase/migrations/20261015174851_test_only_stripe_test_clock_customer_binding.sql",import.meta.url),"utf8");
const edge=readFileSync(new URL("../supabase/functions/test-only-stripe-checkout/index.ts",import.meta.url),"utf8");

test("checkout creates an isolated Test Clock customer before a customer-bound session",()=>{
  const accountRead=edge.indexOf("setupAccountReadback");
  const prepare=edge.indexOf('prepare_test_only_stripe_checkout');
  const clock=edge.indexOf('https://api.stripe.com/v1/test_helpers/test_clocks');
  const customer=edge.indexOf('https://api.stripe.com/v1/customers');
  const bind=edge.indexOf('bind_test_only_stripe_test_clock_customer');
  const session=edge.indexOf('https://api.stripe.com/v1/checkout/sessions');
  assert.ok(accountRead>0&&accountRead<prepare&&prepare<clock&&clock<customer&&customer<bind&&bind<session);
  assert.match(edge,/TEST_ONLY_STRIPE_LIFECYCLE_SETUP_RESTRICTED_KEY/);
  assert.match(edge,/checkoutKey === setupKey/);
  assert.match(edge,/webhookReadKey && webhookReadKey === setupKey/);
  assert.match(edge,/buildTestOnlyCheckoutForm\(prepared, binding\.app_origin, providerCustomerId\)/);
  assert.match(edge,/bind_test_only_stripe_checkout_session_v2/);
});

test("provider resources and database evidence are replay- and concurrency-bound",()=>{
  assert.match(edge,/idempotency-key": `wuxuai-test-clock-\$\{prepared\.id\}`/);
  assert.match(edge,/idempotency-key": `wuxuai-test-customer-\$\{prepared\.id\}`/);
  assert.match(migration,/pg_advisory_xact_lock\(hashtextextended\('test-only-test-customer:'/);
  assert.match(migration,/TEST_ONLY_TEST_CUSTOMER_REPLAY_CONFLICT/);
  assert.match(migration,/provider_test_clock_id text not null unique/);
  assert.match(migration,/provider_customer_id text not null unique/);
  assert.match(migration,/test_only_checkout_customer_preparations_immutable/);
});

test("ACL, RLS and anchor binding fail closed without opening real billing",()=>{
  assert.match(migration,/customer_preparations enable row level security/);
  assert.match(migration,/revoke all on test_only_checkout\.customer_preparations from public,anon,authenticated,service_role/);
  assert.match(migration,/grant execute on function public\.bind_test_only_stripe_test_clock_customer[\s\S]*to service_role/);
  assert.match(migration,/grant execute on function public\.bind_test_only_stripe_checkout_session_v2[\s\S]*to service_role/);
  assert.match(migration,/TEST_ONLY_SUBSCRIPTION_TEST_CLOCK_CUSTOMER_REQUIRED/);
  for(const relation of ["branch_subscriptions","basic_paid_offer_acceptances","branch_entitlement_overrides",
    "billing_trial_claims","manual_basic_trial_decisions","restaurants"])
    assert.doesNotMatch(migration,new RegExp(`(?:insert\\s+into|update|delete\\s+from)\\s+(?:public\\.)?${relation}`,"i"));
  assert.doesNotMatch(migration,/cron\.schedule|pg_cron|http_post|net\.http|https?:\/\/api\.stripe\.com/i);
});

test("migration itself creates no grant, provider object, session or lifecycle event",()=>{
  assert.doesNotMatch(migration,/insert\s+into\s+public\.test_only_basic_access_receipts/i);
  assert.doesNotMatch(migration,/insert\s+into\s+test_only_checkout\.(?:requests|events|subscription_anchors|subscription_events)/i);
  assert.doesNotMatch(migration,/TEST_ONLY_STRIPE_CHECKOUT_ENABLED\s*=\s*true/i);
  assert.doesNotMatch(migration,/TEST_ONLY_STRIPE_LIFECYCLE_ENABLED\s*=\s*true/i);
});
