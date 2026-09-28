import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseBasicTestCheckoutRequest, sanitizeStripeTestEvent, signFakeWebhook, verifyRawWebhook,
} from '../supabase/functions/_shared/billingArchitecture.mjs';

const migration = readFileSync(new URL('../supabase/migrations/20260927005000_basic_post_trial_and_stripe_test.sql', import.meta.url), 'utf8');
const followup = readFileSync(new URL('../supabase/migrations/20260928001000_basic_preexpiry_acceptance_and_reactivation.sql', import.meta.url), 'utf8');
const checkout = readFileSync(new URL('../supabase/functions/billing-basic-test-checkout/index.ts', import.meta.url), 'utf8');
const webhook = readFileSync(new URL('../supabase/functions/billing-stripe-test-webhook/index.ts', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../src/modules/billing/BasicPaidOfferPanel.tsx', import.meta.url), 'utf8');
const service = readFileSync(new URL('../src/modules/billing/basicBillingService.ts', import.meta.url), 'utf8');

const ids = {
  acceptance_id: 'd34282af-eed4-4c65-a87a-b24125759915',
  request_id: 'd34282af-eed4-4c65-a87a-b24125759916',
  restaurant_id: 'd34282af-eed4-4c65-a87a-b24125759917',
  correlation_id: 'd34282af-eed4-4c65-a87a-b24125759918',
};

test('BASIC checkout request is exact and has no client authority fields', () => {
  const request = { acceptance_id: ids.acceptance_id, request_id: ids.request_id,
    return_route: '/admin/settings/konto-testphase' };
  assert.deepEqual(parseBasicTestCheckoutRequest(request), request);
  for (const field of ['restaurant_id', 'plan_key', 'price_id', 'amount', 'currency', 'trial_end']) {
    assert.throws(() => parseBasicTestCheckoutRequest({ ...request, [field]: 'forged' }), /FIELDS_INVALID/);
  }
});

test('Stripe TEST event sanitizer rejects live and exposes only lifecycle fields', () => {
  const event = { id: 'evt_SYNTHETIC123456', livemode: false, type: 'invoice.paid', created: 1_800_000_000,
    data: { object: { customer: 'cus_SYNTHETIC123456', subscription: 'sub_SYNTHETIC123456',
      period_start: 1_800_000_000, period_end: 1_802_678_400,
      metadata: { restaurant_id: ids.restaurant_id, acceptance_id: ids.acceptance_id,
        request_id: ids.request_id, correlation_id: ids.correlation_id },
      customer_email: 'must-not-leak@example.invalid', payment_method: 'must-not-leak' } } };
  const result = sanitizeStripeTestEvent(event);
  assert.equal(result.provider_subscription_id, 'sub_SYNTHETIC123456');
  assert.equal(result.restaurant_id, ids.restaurant_id);
  assert.equal(Object.hasOwn(result, 'customer_email'), false);
  assert.equal(Object.hasOwn(result, 'payment_method'), false);
  assert.throws(() => sanitizeStripeTestEvent({ ...event, livemode: true }), /EVENT_INVALID/);
  assert.throws(() => sanitizeStripeTestEvent({ ...event, type: 'customer.created' }), /EVENT_INVALID/);
});

test('raw-body Stripe signature remains mandatory before database RPC', async () => {
  const raw = new TextEncoder().encode('{"id":"evt_SYNTHETIC123456"}');
  const now = 1_800_000_000;
  const signature = await signFakeWebhook(raw, 'whsec_synthetic_local_only', now);
  assert.equal(await verifyRawWebhook(raw, signature, 'whsec_synthetic_local_only', now), true);
  assert.equal(await verifyRawWebhook(new TextEncoder().encode('{}'), signature, 'whsec_synthetic_local_only', now), false);
  assert.ok(webhook.indexOf('verifyRawWebhook(') < webhook.indexOf('service.rpc('));
});

test('contract is BASIC TEST only and never auto-converts the trial', () => {
  assert.match(migration, /accept_basic_paid_offer/);
  assert.match(migration, /d\.ends_at>statement_timestamp\(\)/);
  assert.match(migration, /platform_test_tenant_registry/);
  assert.match(migration, /input_livemode is distinct from false/);
  assert.match(migration, /REDEMPTION_ONLY_60_CALENDAR_DAYS/);
  assert.match(migration, /forfeiture_authorized boolean not null default false/);
  assert.match(migration, /deletion_authorized boolean not null default false/);
  assert.doesNotMatch(migration, /product_code='PRO'/);
  assert.doesNotMatch(migration, /delete from public\.(?:points_transactions|customer_rewards|customers)/i);
  assert.match(checkout, /sk_test_/);
  assert.doesNotMatch(checkout, /sk_live_/);
  assert.match(checkout, /automatic_tax\[enabled\].*false/);
  assert.match(panel, /Kostenpflichtiges BASIC-Angebot ausdrücklich annehmen/);
  assert.match(service, /BASIC KOSTENPFLICHTIG BESTELLEN/);
});

test('trial and 60-day redemption windows use inclusive start and exclusive end', () => {
  assert.match(migration, /starts_at<=statement_timestamp\(\)/);
  assert.match(migration, /ends_at>statement_timestamp\(\)/);
  assert.match(migration, /ends_at=starts_at\+interval '60 days'/);
  assert.match(migration, /forfeiture_authorized boolean not null default false/);
  assert.match(migration, /deletion_authorized boolean not null default false/);
  assert.doesNotMatch(migration, /delete from public\.(?:points_transactions|customer_rewards)/i);
});

test('final-seven-day decision cannot start checkout before trial end', () => {
  assert.match(followup, /d\.ends_at-statement_timestamp\(\)>interval '7 days'/);
  assert.match(followup, /checkout_allowed:=d\.ends_at<=statement_timestamp\(\)/);
  assert.match(followup, /BASIC_TEST_CHECKOUT_TRIAL_ACTIVE/);
  assert.match(panel, /Der Checkout wird erst nach dem Ende der Testphase freigeschaltet/);
});

test('reactivation is a separate explicit contract, not reuse of the cancelled acceptance', () => {
  assert.match(followup, /accept_basic_paid_reactivation/);
  assert.match(followup, /BASIC ERNEUT KOSTENPFLICHTIG BESTELLEN/);
  assert.match(followup, /acceptance_kind in \('INITIAL','REACTIVATION'\)/);
  assert.match(followup, /prior_provider_subscription_id/);
  assert.match(followup, /subscription_status<>'cancelled'/);
  assert.match(service, /BASIC ERNEUT KOSTENPFLICHTIG BESTELLEN/);
  assert.match(panel, /Die Reaktivierung ist ein neuer, ausdrücklich angenommener Vertrag/);
});

test('webhook state changes are allowlisted and replay protected', () => {
  assert.match(migration, /BASIC_TEST_WEBHOOK_HASH_CONFLICT/);
  assert.match(migration, /OLDER_THAN_PROCESSED_EVENT/);
  assert.match(migration, /PAYMENT_CONFIRMED/);
  assert.match(migration, /PAYMENT_FAILED/);
  assert.match(migration, /CANCELLED/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /enable row level security/g);
});
