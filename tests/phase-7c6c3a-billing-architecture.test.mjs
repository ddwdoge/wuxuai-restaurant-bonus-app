import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  addCalendarMonthUtc, checkoutIdempotencyKey, createFakeStripeAdapter, orchestrateBlockedCheckout, parseCheckoutRequest,
  parseTechnicalEvent, sha256Hex, signFakeWebhook, verifyRawWebhook,
} from '../supabase/functions/_shared/billingArchitecture.mjs';

const migration = readFileSync(new URL('../supabase/migrations/20260924002000_checkout_webhook_architecture_blocked.sql', import.meta.url), 'utf8');
const checkoutEndpoint = readFileSync(new URL('../supabase/functions/billing-checkout-architecture/index.ts', import.meta.url), 'utf8');
const webhookEndpoint = readFileSync(new URL('../supabase/functions/billing-local-fake-webhook/index.ts', import.meta.url), 'utf8');
const request = { plan_key: 'BASIC', request_id: 'd34282af-eed4-4c65-a87a-b24125759915', return_route: '/admin/settings/tarif-kapazitaet' };

test('browser checkout schema is exact and excludes authority fields', () => {
  assert.deepEqual(parseCheckoutRequest(request), request);
  for (const field of ['restaurant_id', 'price_id', 'amount', 'currency', 'trial_end', 'entitlement', 'tax_status']) {
    assert.throws(() => parseCheckoutRequest({ ...request, [field]: 'forged' }), /FIELDS_INVALID/);
  }
  assert.throws(() => parseCheckoutRequest({ ...request, plan_key: 'OFFER_CAPACITY' }), /PLAN_INVALID/);
  assert.throws(() => parseCheckoutRequest({ ...request, return_route: 'https://evil.invalid/' }), /RETURN_ROUTE_INVALID/);
  assert.throws(() => parseCheckoutRequest({ ...request, request_id: 'not-uuid' }), /REQUEST_ID_INVALID/);
});

test('business orchestrator returns only blocked decisions and calls provider zero times', async () => {
  const adapter = createFakeStripeAdapter();
  let resolverCalls = 0;
  const resolve = async () => {
    resolverCalls += 1;
    return { data: { status: 'BLOCKED', blocker_code: 'KYB_NOT_VERIFIED', blockers: ['KYB_NOT_VERIFIED'] }, error: null };
  };
  const answers = await Promise.all(Array.from({ length: 24 }, () => orchestrateBlockedCheckout(request, resolve)));
  assert.equal(answers.length, 24);
  assert.equal(resolverCalls, 24);
  assert.equal(adapter.callCount, 0);
  assert.equal(adapter.acceptedCount, 0);
  await assert.rejects(orchestrateBlockedCheckout(request, async () => ({ data: { status: 'ACTIVE' } })), /UNSAFE_DECISION/);
  await assert.rejects(orchestrateBlockedCheckout(request, async () => ({ error: { code: '42501' } })), /CHECKOUT_OWNER_REQUIRED/);
  await assert.rejects(orchestrateBlockedCheckout(request, async () => ({ error: { code: '23505' } })), /CHECKOUT_REQUEST_PAYLOAD_CONFLICT/);
  assert.equal(adapter.callCount, 0);
});

test('trial helper is pure, UTC-bound and clamps month ends', () => {
  const cases = [
    ['2025-01-31T12:34:56.000Z', '2025-02-28T12:34:56.000Z'],
    ['2024-01-31T12:34:56.000Z', '2024-02-29T12:34:56.000Z'],
    ['2024-02-29T00:00:00.000Z', '2024-03-29T00:00:00.000Z'],
    ['2025-08-31T23:59:59.000Z', '2025-09-30T23:59:59.000Z'],
    ['2025-03-30T01:30:00+01:00', '2025-04-30T00:30:00.000Z'],
  ];
  for (const [start, expected] of cases) assert.equal(addCalendarMonthUtc(start), expected);
  assert.throws(() => addCalendarMonthUtc('not-a-date'), /TRIAL_TIME_INVALID/);
});

test('fake adapter has one accepted action per key, retries, conflict and timeout contracts', async () => {
  const adapter = createFakeStripeAdapter();
  const key = await checkoutIdempotencyKey('d34282af-eed4-4c65-a87a-b24125759916', request.request_id);
  assert.equal(key, await checkoutIdempotencyKey('d34282af-eed4-4c65-a87a-b24125759916', request.request_id));
  assert.notEqual(key, await checkoutIdempotencyKey('d34282af-eed4-4c65-a87a-b24125759917', request.request_id));
  const input = { idempotencyKey: key, priceId: 'price_test_local', planKey: 'BASIC', returnRoute: request.return_route };
  const results = await Promise.all(Array.from({ length: 24 }, () => adapter.createCheckout(input)));
  assert.equal(new Set(results.map((x) => x.sessionId)).size, 1);
  assert.equal(adapter.acceptedCount, 1);
  assert.equal(adapter.callCount, 24);
  assert.deepEqual(await adapter.createCheckout(input), results[0]);
  await assert.rejects(adapter.createCheckout({ ...input, planKey: 'PRO' }), /PAYLOAD_CONFLICT/);
  await assert.rejects(adapter.createCheckout({ ...input, idempotencyKey: 'before' }, 'timeout_before'), /TIMEOUT_BEFORE/);
  assert.equal(adapter.acceptedCount, 1);
  await assert.rejects(adapter.createCheckout({ ...input, idempotencyKey: 'after' }, 'timeout_after'), /TIMEOUT_AFTER/);
  const retry = await adapter.createCheckout({ ...input, idempotencyKey: 'after' });
  assert.ok(retry.sessionId.startsWith('cs_test_'));
  assert.equal(adapter.acceptedCount, 2);
  await assert.rejects(adapter.createCheckout({ ...input, idempotencyKey: 'error' }, 'error'), /FAKE_ERROR/);
});

test('raw-body signature is mandatory and tampering/stale signatures fail before DB', async () => {
  const body = new TextEncoder().encode('{"id":"evt_12345678"}');
  const timestamp = 1_700_000_000;
  const header = await signFakeWebhook(body, 'local-only-test-secret', timestamp);
  assert.equal(await verifyRawWebhook(body, header, 'local-only-test-secret', timestamp), true);
  assert.equal(await verifyRawWebhook(body, null, 'local-only-test-secret', timestamp), false);
  assert.equal(await verifyRawWebhook(new TextEncoder().encode('{"id":"evt_87654321"}'), header, 'local-only-test-secret', timestamp), false);
  assert.equal(await verifyRawWebhook(body, header, 'other-local-secret', timestamp), false);
  assert.equal(await verifyRawWebhook(body, header, 'local-only-test-secret', timestamp + 301), false);
  assert.match(await sha256Hex(body), /^[0-9a-f]{64}$/);
  assert.ok(webhookEndpoint.indexOf('verifyRawWebhook(') < webhookEndpoint.indexOf('client.rpc('));
});

test('technical event parsing rejects LIVE/account mismatch and preserves narrow fields', () => {
  const event = { id: 'evt_12345678', livemode: false, account: 'LOCAL_FAKE_ACCOUNT',
    type: 'customer.subscription.updated', created: 1_700_000_000,
    data: { object: { id: 'sub_12345678', metadata: { restaurant_id: request.request_id }, payment_method: 'not-stored' } } };
  const parsed = parseTechnicalEvent(event, 'LOCAL_FAKE_ACCOUNT');
  assert.equal(parsed.provider_subscription_id, 'sub_12345678');
  assert.equal(parsed.tenant_ref, request.request_id);
  assert.equal(Object.hasOwn(parsed, 'payment_method'), false);
  assert.throws(() => parseTechnicalEvent({ ...event, livemode: true }, 'LOCAL_FAKE_ACCOUNT'), /ENVIRONMENT_INVALID/);
  assert.throws(() => parseTechnicalEvent({ ...event, account: 'acct_other' }, 'LOCAL_FAKE_ACCOUNT'), /ENVIRONMENT_INVALID/);
  assert.equal(parseTechnicalEvent({ ...event, type: 'unknown.event' }, 'LOCAL_FAKE_ACCOUNT').known_event, false);
});

test('SQL records only technical blocked decisions and no product activation', () => {
  assert.match(migration, /create table public\.billing_checkout_blocked_requests/);
  assert.match(migration, /create table public\.billing_test_webhook_inbox/);
  assert.match(migration, /primary key \(restaurant_id, request_id\)/);
  assert.match(migration, /event_id text primary key/);
  assert.match(migration, /WEBHOOK_EVENT_HASH_CONFLICT/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /STALE_EVENT/);
  assert.match(migration, /ORDER_AMBIGUOUS/);
  assert.match(migration, /ACTIVATION_BLOCKED/);
  assert.match(migration, /KYB_NOT_VERIFIED/);
  assert.match(migration, /COUNTRY_NOT_RELEASED/);
  assert.match(migration, /SELLER_NOT_VERIFIED/);
  assert.match(migration, /TAX_NOT_READY/);
  assert.match(migration, /COMMERCIAL_ACTIVATION_DISABLED/);
  assert.match(migration, /blockers:=array_append\(blockers,'ARCHITECTURE_ONLY'\)/);
  assert.match(migration, /grant execute on function public\.request_blocked_test_checkout\(text,uuid,text\) to authenticated/);
  assert.match(migration, /to service_role/);
  assert.match(migration, /enable row level security/g);
  assert.doesNotMatch(migration, /(?:insert into|update|delete from) public\.(?:branch_subscriptions|billing_trial_claims|restaurants|commercial_pro_access_grants|restaurant_capacity_addon_entitlements)\b/i);
  assert.doesNotMatch(checkoutEndpoint, /createFakeStripeAdapter|createCheckout\(/);
  assert.match(checkoutEndpoint, /request_blocked_test_checkout/);
  assert.match(checkoutEndpoint, /local_only/);
  assert.match(checkoutEndpoint, /respond\(403, "CHECKOUT_OWNER_REQUIRED"\)/);
  assert.ok(checkoutEndpoint.indexOf('local_only') < checkoutEndpoint.indexOf('createClient(url'));
  assert.match(webhookEndpoint, /local_only/);
  assert.ok(webhookEndpoint.indexOf('local_only') < webhookEndpoint.indexOf('createClient(url'));
  assert.doesNotMatch(webhookEndpoint, /branch_subscriptions|trial_started_at|entitlement/);
});
