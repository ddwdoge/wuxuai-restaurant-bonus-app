import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { basicTestCheckoutNextAction, runBasicTestCheckout } from '../supabase/functions/_shared/billingArchitecture.mjs';

const migration = readFileSync(new URL('../supabase/migrations/20261007123213_basic_test_checkout_retry_lock.sql', import.meta.url), 'utf8');
const edge = readFileSync(new URL('../supabase/functions/billing-basic-test-checkout/index.ts', import.meta.url), 'utf8');
const service = readFileSync(new URL('../src/modules/billing/basicBillingService.ts', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../src/modules/billing/BasicPaidOfferPanel.tsx', import.meta.url), 'utf8');
const id = (last) => `d34282af-eed4-4c65-a87a-b241257599${last}`;
const now = Date.parse('2026-10-07T12:00:00.000Z');

function fixture(acceptanceId = id('15'), requestId = id('16'), restaurantId = id('17')) {
  return {
    checkout_request_id: id(acceptanceId === id('15') ? '19' : '20'),
    acceptance_id: acceptanceId, request_id: requestId, restaurant_id: restaurantId,
    provider_session_id: null, status: 'PREPARED', created_at: new Date(now - 1000).toISOString(),
  };
}

function fakeFlow() {
  const rows = new Map();
  const sessions = new Map();
  let createCalls = 0;
  let retrieveCalls = 0;
  let completionFails = false;
  let providerFails = false;
  let responseLost = false;
  function prepare(input, ownerRestaurant = input.restaurant_id) {
    if (ownerRestaurant !== input.restaurant_id) throw new Error('BASIC_TEST_CHECKOUT_OWNER_REQUIRED');
    const existing = rows.get(input.acceptance_id);
    if (existing) {
      if (existing.restaurant_id !== input.restaurant_id) throw new Error('TENANT_CONFLICT');
      return { ...existing };
    }
    rows.set(input.acceptance_id, { ...input });
    return { ...input };
  }
  const actions = {
    async create(prepared) {
      createCalls += 1;
      if (providerFails) throw new Error('BASIC_TEST_PROVIDER_ERROR');
      const key = `${prepared.restaurant_id}:${prepared.request_id}`;
      if (!sessions.has(key)) sessions.set(key, {
        id: `cs_test_SYNTHETIC${sessions.size + 1}`, livemode: false,
        mode: 'subscription', status: 'open',
        client_reference_id: prepared.checkout_request_id,
        metadata: { restaurant_id: prepared.restaurant_id,
          acceptance_id: prepared.acceptance_id, request_id: prepared.request_id },
        url: `https://checkout.stripe.com/c/pay/cs_test_SYNTHETIC${sessions.size + 1}`,
      });
      if (responseLost) throw new Error('NETWORK_RESPONSE_LOST');
      return sessions.get(key);
    },
    async retrieve(sessionId) {
      retrieveCalls += 1;
      return [...sessions.values()].find((session) => session.id === sessionId);
    },
    async complete(checkoutRequestId, sessionId) {
      if (completionFails) throw new Error('BASIC_TEST_CHECKOUT_RECORD_FAILED');
      const row = [...rows.values()].find((candidate) => candidate.checkout_request_id === checkoutRequestId);
      if (!row) throw new Error('ROW_NOT_FOUND');
      if (row.provider_session_id && row.provider_session_id !== sessionId) throw new Error('SESSION_CONFLICT');
      row.provider_session_id = sessionId;
      row.status = 'SESSION_CREATED';
    },
  };
  return { prepare, actions, rows, sessions,
    get createCalls() { return createCalls; }, get retrieveCalls() { return retrieveCalls; },
    set completionFails(value) { completionFails = value; },
    set providerFails(value) { providerFails = value; },
    set responseLost(value) { responseLost = value; } };
}

test('parallel clicks, reload and repeated retry reuse one canonical acceptance/session', async () => {
  const flow = fakeFlow();
  const first = fixture();
  const inputs = Array.from({ length: 6 }, (_, index) => flow.prepare({ ...first,
    request_id: id(String(16 + index)) }));
  assert.equal(new Set(inputs.map((value) => value.request_id)).size, 1);
  const results = await Promise.all(inputs.map((value) => runBasicTestCheckout(value, flow.actions, now)));
  assert.equal(new Set(results).size, 1);
  assert.equal(flow.sessions.size, 1);
  const reloaded = flow.prepare({ ...first, request_id: id('29') });
  assert.equal(await runBasicTestCheckout(reloaded, flow.actions, now), results[0]);
  assert.equal(await runBasicTestCheckout(flow.prepare(reloaded), flow.actions, now), results[0]);
  assert.equal(flow.retrieveCalls, 2);
  assert.equal(flow.sessions.size, 1);
});

test('lost provider response and failed completion retain the original operation', async () => {
  const flow = fakeFlow();
  const first = flow.prepare(fixture());
  flow.responseLost = true;
  await assert.rejects(runBasicTestCheckout(first, flow.actions, now), /NETWORK_RESPONSE_LOST/);
  flow.responseLost = false;
  flow.completionFails = true;
  await assert.rejects(runBasicTestCheckout(flow.prepare(first), flow.actions, now), /RECORD_FAILED/);
  flow.completionFails = false;
  const result = await runBasicTestCheckout(flow.prepare(first), flow.actions, now);
  assert.match(result, /^https:\/\/checkout\.stripe\.com\//);
  assert.equal(flow.sessions.size, 1);
  assert.equal(await runBasicTestCheckout(flow.prepare(first), flow.actions, now), result);
});

test('provider errors and stale ambiguous outcomes never start a different session', async () => {
  const flow = fakeFlow();
  const first = flow.prepare(fixture());
  flow.providerFails = true;
  await assert.rejects(runBasicTestCheckout(first, flow.actions, now), /PROVIDER_ERROR/);
  assert.equal(flow.sessions.size, 0);
  flow.providerFails = false;
  await runBasicTestCheckout(flow.prepare(first), flow.actions, now);
  assert.equal(flow.sessions.size, 1);
  const stale = { ...fixture(id('21'), id('22')), created_at: new Date(now - 23 * 60 * 60 * 1000).toISOString() };
  assert.throws(() => basicTestCheckoutNextAction(stale, now), /OUTCOME_UNCLEAR/);
  await assert.rejects(runBasicTestCheckout(stale, flow.actions, now), /OUTCOME_UNCLEAR/);
  assert.equal(flow.sessions.size, 1);
});

test('foreign owner, tenant and mismatching provider readback fail closed; new acceptance is distinct', async () => {
  const flow = fakeFlow();
  const first = flow.prepare(fixture());
  assert.throws(() => flow.prepare(fixture(), id('25')), /OWNER_REQUIRED/);
  assert.throws(() => flow.prepare({ ...fixture(), restaurant_id: id('25') }), /TENANT_CONFLICT/);
  await runBasicTestCheckout(first, flow.actions, now);
  const existing = flow.prepare(first);
  const originalRetrieve = flow.actions.retrieve;
  flow.actions.retrieve = async (sessionId) => ({ ...await originalRetrieve(sessionId),
    metadata: { restaurant_id: id('25'), acceptance_id: first.acceptance_id,
      request_id: first.request_id } });
  await assert.rejects(runBasicTestCheckout(existing, flow.actions, now), /READBACK_INVALID/);
  flow.actions.retrieve = originalRetrieve;
  await runBasicTestCheckout(flow.prepare(fixture(id('21'), id('22'))), flow.actions, now);
  assert.equal(flow.sessions.size, 2);
});

test('SQL and Edge keep server-side gates, unique acceptance and canonical request identity', () => {
  assert.match(migration, /unique index basic_test_checkout_one_per_acceptance/);
  assert.match(migration, /where acceptance_id=a\.id/);
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\('basic-test-checkout-acceptance:/);
  assert.match(migration, /basic_paid_activation_readiness_internal/);
  assert.match(migration, /grant execute on function public\.prepare_basic_test_checkout\(uuid,uuid,text\) to authenticated/);
  assert.doesNotMatch(migration, /grant (?:select|insert|update|delete) on public\.basic_test_checkout_requests to authenticated/i);
  assert.match(edge, /checkoutIdempotencyKey\(prepared\.restaurant_id, prepared\.request_id\)/);
  assert.match(edge, /metadata\[request_id\]": prepared\.request_id/);
  assert.match(edge, /runBasicTestCheckout\(prepared/);
  assert.match(service, /loadBasicOwnerContractSnapshot\(restaurantId\)/);
  assert.match(panel, /inFlight\.current/);
});
