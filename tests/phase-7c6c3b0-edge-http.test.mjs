import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { once } from 'node:events';
import vm from 'node:vm';
import ts from 'typescript';
import * as architecture from '../supabase/functions/_shared/billingArchitecture.mjs';

const project = 'bwhvfjuwixgwduoeqaya';
const route = '/admin/settings/tarif-kapazitaet';
const requestId = 'd34282af-eed4-4c65-a87a-b24125759915';
const correlationId = 'd34282af-eed4-4c65-a87a-b24125759916';
const eventId = 'evt_wuxuai_staging_12345678';
const signingSecret = 'local-synthetic-signing-secret-32-bytes';
const marker = 'local-synthetic-marker-secret-32-bytes';
const checkout = { plan_key: 'BASIC', request_id: requestId, return_route: route };
const stagingOrigin = 'https://staging-app.bonus.wuxuaisbi.com';
const localOrigin = 'http://127.0.0.1:56126';

function loadHandler(file, env, state) {
  let handler;
  const source = readFileSync(new URL(`../supabase/functions/${file}/index.ts`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022 } }).outputText;
  const fakeClient = (url, key) => ({ rpc: async (name, input) => {
    state.rpcCalls.push(name);
    assert.ok(url === env.SUPABASE_URL);
    if (name === 'billing_staging_negative_readiness') {
      assert.equal(key, env.SUPABASE_SERVICE_ROLE_KEY);
      return { data: state.ready, error: null };
    }
    if (name === 'request_blocked_test_checkout') {
      assert.equal(key, env.SUPABASE_ANON_KEY);
      assert.equal(input.input_plan_key, 'BASIC');
      return { data: { status: 'BLOCKED', blocker_code: 'KYB_NOT_VERIFIED',
        blockers: ['KYB_NOT_VERIFIED', 'COUNTRY_NOT_RELEASED', 'SELLER_NOT_VERIFIED',
          'TAX_NOT_READY', 'COMMERCIAL_ACTIVATION_DISABLED', 'ARCHITECTURE_ONLY'] }, error: null };
    }
    if (name === 'record_local_fake_billing_webhook') {
      assert.equal(key, env.SUPABASE_SERVICE_ROLE_KEY);
      const prior = state.inbox.get(input.input_event_id);
      if (prior && prior !== input.input_payload_sha256) return { data: null, error: { code: '23505' } };
      state.inbox.set(input.input_event_id, input.input_payload_sha256);
      return { data: { status: 'ACTIVATION_BLOCKED', replay: Boolean(prior) }, error: null };
    }
    throw new Error(`unexpected RPC ${name}`);
  } });
  const context = { exports: {}, require(name) {
    if (name.includes('supabase-js')) return { createClient: fakeClient };
    if (name.includes('billingArchitecture')) return architecture;
    throw new Error(`unexpected import ${name}`);
  }, Deno: { env: { get: (key) => env[key], toObject: () => ({ ...env }) },
    serve: (value) => { handler = value; } }, Request, Response, URL, TextDecoder, Uint8Array,
    crypto: globalThis.crypto, Date, Object, Number, JSON, Error, Math, console };
  vm.runInNewContext(compiled, context, { filename: file });
  return handler;
}

async function withHttp(handler, action) {
  const server = createServer(async (incoming, outgoing) => {
    const chunks = [];
    for await (const chunk of incoming) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const response = await handler(new Request('http://127.0.0.1/test', {
      method: incoming.method, headers: incoming.headers,
      ...(['GET', 'HEAD'].includes(incoming.method) ? {} : { body }),
    }));
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { await action(`http://127.0.0.1:${server.address().port}/test`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

const stagingEnv = {
  SUPABASE_URL: `https://${project}.supabase.co`,
  SUPABASE_ANON_KEY: 'local-anon-fixture', SUPABASE_SERVICE_ROLE_KEY: 'local-service-fixture',
  BILLING_ARCHITECTURE_MODE: 'staging_negative_only', BILLING_STAGING_PROJECT_REF: project,
  BILLING_ENVIRONMENT: 'STAGING', BILLING_STAGING_SYNTHETIC_WEBHOOK_SECRET: signingSecret,
  BILLING_STAGING_ALLOWED_ORIGIN: stagingOrigin,
  BILLING_STAGING_SYNTHETIC_MARKER: marker, BILLING_STAGING_SYNTHETIC_EVENT_ID: eventId,
  BILLING_STAGING_SYNTHETIC_REQUEST_ID: requestId,
  BILLING_STAGING_SYNTHETIC_CORRELATION_ID: correlationId,
};
const localEnv = { SUPABASE_URL: 'http://127.0.0.1:56121', SUPABASE_ANON_KEY: 'local-anon-fixture',
  SUPABASE_SERVICE_ROLE_KEY: 'local-service-fixture', BILLING_ARCHITECTURE_MODE: 'local_only',
  BILLING_LOCAL_ALLOWED_ORIGIN: localOrigin,
  BILLING_LOCAL_FAKE_WEBHOOK_SECRET: signingSecret };

test('checkout CORS preflight is exact, early, write-free and limited to browser headers', async () => {
  for (const [env, allowedOrigin] of [[localEnv, localOrigin], [stagingEnv, stagingOrigin]]) {
    const state = { ready: true, rpcCalls: [], inbox: new Map() };
    await withHttp(loadHandler('billing-checkout-architecture', env, state), async (url) => {
      const preflight = (origin, method = 'POST', headers = 'authorization, apikey, content-type, x-client-info') =>
        fetch(url, { method: 'OPTIONS', headers: {
          ...(origin === undefined ? {} : { origin }), 'access-control-request-method': method,
          'access-control-request-headers': headers,
        } });
      const allowed = await preflight(allowedOrigin);
      assert.equal(allowed.status, 204);
      assert.equal(await allowed.text(), '');
      assert.equal(allowed.headers.get('access-control-allow-origin'), allowedOrigin);
      assert.equal(allowed.headers.get('vary'), 'Origin');
      assert.equal(allowed.headers.get('access-control-allow-methods'), 'POST, OPTIONS');
      assert.equal(allowed.headers.get('access-control-allow-credentials'), null);
      for (const origin of ['https://foreign.example', `${allowedOrigin}.evil.example`,
        `${allowedOrigin}-extra`, 'null', undefined]) {
        const blocked = await preflight(origin);
        assert.equal(blocked.status, 403);
        assert.equal(blocked.headers.get('access-control-allow-origin'), null);
      }
      for (const [method, headers] of [['DELETE', 'authorization'], ['POST', 'x-unapproved']]) {
        const blocked = await preflight(allowedOrigin, method, headers);
        assert.equal(blocked.status, 403);
        assert.equal(blocked.headers.get('access-control-allow-origin'), null);
      }
      assert.equal((await fetch(url, { method: 'GET', headers: { origin: allowedOrigin } })).status, 405);
      assert.deepEqual(state.rpcCalls, []);
      const unauthorized = await fetch(url, { method: 'POST', headers: { origin: allowedOrigin },
        body: JSON.stringify(checkout) });
      assert.equal(unauthorized.status, 401);
      assert.equal(unauthorized.headers.get('access-control-allow-origin'), allowedOrigin);
      const malformed = await fetch(url, { method: 'POST', headers: {
        origin: allowedOrigin, authorization: 'Bearer local-owner-token' }, body: '{}' });
      assert.equal(malformed.status, 400);
      assert.equal(malformed.headers.get('access-control-allow-origin'), allowedOrigin);
      assert.deepEqual(state.rpcCalls, []);
      const denied = await fetch(url, { method: 'POST', headers: {
        origin: allowedOrigin, authorization: 'Bearer local-owner-token' }, body: JSON.stringify(checkout) });
      assert.equal(denied.status, 403);
      assert.equal(denied.headers.get('access-control-allow-origin'), allowedOrigin);
      assert.equal(denied.headers.get('access-control-allow-credentials'), null);
    });
  }
  const invalid = { ...stagingEnv, BILLING_STAGING_ALLOWED_ORIGIN: 'https://foreign.example' };
  const state = { ready: true, rpcCalls: [], inbox: new Map() };
  await withHttp(loadHandler('billing-checkout-architecture', invalid, state), async (url) => {
    const response = await fetch(url, { method: 'OPTIONS', headers: { origin: stagingOrigin,
      'access-control-request-method': 'POST' } });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  });
  assert.deepEqual(state.rpcCalls, []);
});

test('physical local HTTP checkout: local and simulated Staging stay blocked; identity failures write nothing', async () => {
  for (const env of [localEnv, stagingEnv]) {
    const state = { ready: true, rpcCalls: [], inbox: new Map() };
    const handler = loadHandler('billing-checkout-architecture', env, state);
    await withHttp(handler, async (url) => {
      const unauthorized = await fetch(url, { method: 'POST', body: JSON.stringify(checkout) });
      assert.equal(unauthorized.status, 401);
      if (env === stagingEnv) {
        const forgedMode = await fetch(url, { method: 'POST',
          headers: { authorization: 'Bearer local-owner-token' },
          body: JSON.stringify({ ...checkout, mode: 'local_only' }) });
        assert.equal(forgedMode.status, 400);
      }
      const answers = await Promise.all(Array.from({ length: 24 }, () => fetch(url, { method: 'POST',
        headers: { authorization: 'Bearer local-owner-token' }, body: JSON.stringify(checkout) })));
      assert.ok(answers.every((answer) => answer.status === 403));
      assert.ok((await answers[0].json()).details.blockers.includes('ARCHITECTURE_ONLY'));
      assert.equal(state.rpcCalls.filter((name) => name === 'request_blocked_test_checkout').length, 24);
    });
    assert.equal(state.inbox.size, 0);
  }
  for (const invalid of [
    { BILLING_STAGING_PROJECT_REF: 'production-project' },
    { BILLING_STAGING_PROJECT_REF: undefined },
    { SUPABASE_URL: 'https://production.example.invalid' },
    { SUPABASE_URL: 'https://other-project.supabase.co' },
    { BILLING_ENVIRONMENT: 'LIVE' },
    { BILLING_ARCHITECTURE_MODE: undefined },
    { BILLING_ARCHITECTURE_MODE: 'unknown' },
    { STRIPE_SECRET_KEY: 'sk_live_synthetic-not-real' },
  ]) {
    const state = { ready: true, rpcCalls: [], inbox: new Map() };
    const handler = loadHandler('billing-checkout-architecture', { ...stagingEnv, ...invalid }, state);
    await withHttp(handler, async (url) => {
      const response = await fetch(url, { method: 'POST', headers: { authorization: 'Bearer local-owner-token' },
        body: JSON.stringify({ ...checkout, mode: 'local_only' }) });
      assert.equal(response.status, 503);
    });
    assert.deepEqual(state.rpcCalls, []);
  }
  const blockedState = { ready: false, rpcCalls: [], inbox: new Map() };
  await withHttp(loadHandler('billing-checkout-architecture', stagingEnv, blockedState), async (url) => {
    const response = await fetch(url, { method: 'POST', headers: { authorization: 'Bearer local-owner-token' },
      body: JSON.stringify(checkout) });
    assert.equal(response.status, 503);
  });
  assert.deepEqual(blockedState.rpcCalls, ['billing_staging_negative_readiness']);
});

test('physical local HTTP webhook: only signed, marked, exact synthetic event reaches technical inbox', async () => {
  const state = { ready: true, rpcCalls: [], inbox: new Map() };
  const handler = loadHandler('billing-local-fake-webhook', stagingEnv, state);
  const event = { id: eventId, environment: 'STAGING', synthetic_test: true,
    request_id: requestId, correlation_id: correlationId, account: 'LOCAL_FAKE_ACCOUNT',
    livemode: false, type: 'checkout.session.completed', created: 1_700_000_000,
    data: { object: {} } };
  const send = async (url, value, options = {}) => {
    const body = options.body ?? JSON.stringify(value);
    const signature = options.signature ?? await architecture.signFakeWebhook(new TextEncoder().encode(body),
      signingSecret, Math.floor(Date.now() / 1000));
    return fetch(url, { method: 'POST', headers: { 'stripe-signature': signature,
      'x-wuxuai-synthetic-marker': options.marker ?? marker }, body });
  };
  await withHttp(handler, async (url) => {
    const missing = await fetch(url, { method: 'POST', body: JSON.stringify(event) });
    assert.equal(missing.status, 400);
    assert.equal(state.inbox.size, 0);
    assert.equal((await send(url, event, { signature: 't=1,v1=0' })).status, 400);
    assert.equal((await send(url, event, { marker: 'wrong' })).status, 403);
    for (const changed of [{ ...event, livemode: true }, { ...event, synthetic_test: false },
      { ...event, request_id: correlationId }, { ...event, correlation_id: requestId },
      { ...event, id: 'evt_real_12345678' }, { ...event, data: { object: { id: 'sub_real_12345678' } } }]) {
      assert.notEqual((await send(url, changed)).status, 200);
    }
    assert.equal(state.inbox.size, 0);
    const first = await send(url, event);
    assert.equal(first.status, 200);
    assert.equal((await first.json()).code, 'ACTIVATION_BLOCKED');
    assert.equal((await send(url, event)).status, 200);
    assert.equal(state.inbox.size, 1);
    assert.equal((await send(url, { ...event, created: event.created + 1 })).status, 409);
    assert.equal(state.inbox.size, 1);
    const body = JSON.stringify(event);
    const signature = await architecture.signFakeWebhook(new TextEncoder().encode(body),
      signingSecret, Math.floor(Date.now() / 1000));
    assert.equal((await send(url, event, { body: `${body} `, signature })).status, 400);
  });
  const removed = { ...stagingEnv, BILLING_STAGING_SYNTHETIC_WEBHOOK_SECRET: undefined };
  const disabledState = { ready: true, rpcCalls: [], inbox: new Map() };
  const disabled = loadHandler('billing-local-fake-webhook', removed, disabledState);
  await withHttp(disabled, async (url) => assert.equal((await send(url, event)).status, 503));
  assert.deepEqual(disabledState.rpcCalls, []);
  const localState = { ready: true, rpcCalls: [], inbox: new Map() };
  const localHandler = loadHandler('billing-local-fake-webhook', localEnv, localState);
  const localEvent = { id: 'evt_12345678', account: 'LOCAL_FAKE_ACCOUNT', livemode: false,
    type: 'checkout.session.completed', created: 1_700_000_000, data: { object: {} } };
  await withHttp(localHandler, async (url) => assert.equal((await send(url, localEvent)).status, 200));
  assert.equal(localState.inbox.size, 1);
});
