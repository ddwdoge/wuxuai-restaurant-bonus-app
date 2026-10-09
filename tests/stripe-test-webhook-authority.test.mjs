import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { signFakeWebhook } from '../supabase/functions/_shared/billingArchitecture.mjs';
import { loadEdge } from './fixtures/project-binding-edge-harness.mjs';

const sql = readFileSync(new URL('../supabase/migrations/20261007145233_basic_test_webhook_authoritative_binding.sql', import.meta.url), 'utf8');
test('binding uses local Owner, tenant, branch, acceptance, subscription and TEST authority', () => {
  for (const predicate of ["r.owner_id=a.actor_id", "c.actor_id=a.actor_id", "c.subscription_id=a.subscription_id",
    "s.branch_id=b.id", "s.organization_id=a.organization_id", "c.environment='TEST'", "c.livemode=false",
    'input_provider_subscription_id=s.stripe_subscription_id', 'input_provider_customer_id=s.stripe_customer_id',
    'input_provider_subscription_id=c.provider_subscription_id', 'input_provider_customer_id=c.provider_customer_id']) {
    assert.ok(sql.includes(predicate), predicate);
  }
  assert.equal((sql.match(/create or replace function/g) ?? []).length, 1);
  assert.doesNotMatch(sql, /disable trigger|session_replication_role|create or replace function public\.guard_/i);
});
test('recurring metadata may be absent but supplied request and correlation must match', () => {
  assert.ok(sql.includes('(input_request_id is null or input_request_id=c.request_id)'));
  assert.ok(sql.includes('(input_correlation_id is null or input_correlation_id=a.correlation_id)'));
  assert.ok(sql.includes("provider_bound and c.status='COMPLETED'"));
  assert.ok(sql.includes("s.subscription_status='active' and s.status='active' and s.payment_status='paid'"));
  assert.ok(sql.includes("input_provider_session_id=c.provider_session_id"));
  assert.ok(sql.includes('input_period_end>=s.current_period_end'));
});
test('existing readiness, replay, append-only receipt and service-only rights remain', () => {
  assert.ok(sql.includes("public.basic_paid_activation_readiness_internal(a.id,'TEST',c.price_id,false)"));
  assert.ok(sql.includes("raise exception 'BASIC_TEST_WEBHOOK_HASH_CONFLICT'"));
  assert.ok(sql.includes("event.event_created_at>input_event_created_at"));
  assert.ok(sql.includes("event.result_code<>'CHECKOUT_BOUND'"));
  assert.match(sql, /revoke all on function[^;]+from public,anon,authenticated,service_role;/);
  assert.match(sql, /grant execute on function[^;]+to service_role;/);
  assert.doesNotMatch(sql, /update public\.basic_stripe_test_event_inbox/);
});
test('actual signed handler returns retryable 503 for pending provider binding (RPC response stub)', async () => {
  let calls = 0;
  const secret = 'whsec_' + randomBytes(32).toString('hex');
  const ref='a'.repeat(20), url=`https://${ref}.supabase.co`, origin='https://new-staging.example.invalid';
  const handler=loadEdge('billing-stripe-test-webhook', { SUPABASE_URL: url,
      SUPABASE_SERVICE_ROLE_KEY: 'local-unusable-placeholder', STRIPE_TEST_WEBHOOK_SECRET: secret,
      BASIC_BILLING_MODE: 'staging_test_only', BASIC_BILLING_PROJECT_REF: ref,
      WUXUAI_AUTH_ISSUER:`${url}/auth/v1`,WUXUAI_APP_ORIGIN:origin,DENO_DEPLOYMENT_ID:`${ref}_${randomUUID()}_1`,
    }, () => ({ rpc: async name => {
      if(name==='get_server_project_binding')return {data:{project_ref:ref,backend_url:url,auth_issuer:`${url}/auth/v1`,app_origin:origin},error:null};
      assert.equal(name, 'record_basic_stripe_test_event'); calls++;
      return { data: { status: 'UNMATCHED', result_code: 'BASIC_TEST_PROVIDER_BINDING_PENDING' }, error: null };
    } }));
  const now = Math.floor(Date.now() / 1000);
  const raw = new TextEncoder().encode(JSON.stringify({ id: 'evt_LOCAL_PENDING01', type: 'invoice.paid', livemode: false,
    created: now, data: { object: { customer: 'cus_LOCAL_PENDING01', subscription: 'sub_LOCAL_PENDING01', metadata: {} } } }));
  for (let i = 0; i < 2; i++) {
    const signature = await signFakeWebhook(raw, secret, now);
    const response = await handler(new Request('https://local.invalid/webhook', { method: 'POST', body: raw,
      headers: { 'stripe-signature': signature } }));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'BASIC_TEST_PROVIDER_BINDING_PENDING');
  }
  assert.equal(calls, 2);
});
