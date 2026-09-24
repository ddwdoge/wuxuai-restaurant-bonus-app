import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const checkout = readFileSync(new URL('../supabase/functions/billing-checkout-architecture/index.ts', import.meta.url), 'utf8');
const webhook = readFileSync(new URL('../supabase/functions/billing-local-fake-webhook/index.ts', import.meta.url), 'utf8');
const readiness = readFileSync(new URL('../supabase/migrations/20260924003000_staging_negative_billing_readiness.sql', import.meta.url), 'utf8');

test('both endpoints preserve local_only and gate the exact Staging identity before client creation', () => {
  for (const source of [checkout, webhook]) {
    assert.match(source, /mode === "local_only"/);
    assert.match(source, /mode === "staging_negative_only"/);
    assert.match(source, /BILLING_STAGING_PROJECT_REF/);
    assert.match(source, /bwhvfjuwixgwduoeqaya/);
    assert.match(source, /https:\/\/bwhvfjuwixgwduoeqaya\.supabase\.co/);
    assert.match(source, /BILLING_ENVIRONMENT"\) === "STAGING"/);
    assert.match(source, /sk\[_-\]\?live/);
    assert.ok(source.indexOf('BILLING_ARCHITECTURE_NOT_ENABLED') < source.indexOf('createClient(url'));
    assert.match(source, /billing_staging_negative_readiness/);
    assert.doesNotMatch(source, /createCheckout\(|createFakeStripeAdapter|stripe\.com\/v1/);
  }
});

test('staging checkout reaches only the existing blocked RPC and never a provider', () => {
  assert.match(checkout, /request_blocked_test_checkout/);
  assert.match(checkout, /orchestrateBlockedCheckout/);
  assert.match(checkout, /respond\(403, decision\.blocker_code/);
  assert.match(checkout, /CHECKOUT_OWNER_REQUIRED/);
  assert.doesNotMatch(checkout, /price_id: parsed|amount: parsed|customer|sessionId/);
});

test('staging webhook needs independent signing secret, marker and exact synthetic IDs', () => {
  assert.match(webhook, /BILLING_STAGING_SYNTHETIC_WEBHOOK_SECRET/);
  assert.match(webhook, /BILLING_STAGING_SYNTHETIC_MARKER/);
  assert.match(webhook, /BILLING_STAGING_SYNTHETIC_EVENT_ID/);
  assert.match(webhook, /BILLING_STAGING_SYNTHETIC_REQUEST_ID/);
  assert.match(webhook, /BILLING_STAGING_SYNTHETIC_CORRELATION_ID/);
  assert.match(webhook, /input\.environment !== "STAGING"/);
  assert.match(webhook, /input\.synthetic_test !== true/);
  assert.match(webhook, /evt_wuxuai_staging_/);
  assert.ok(webhook.indexOf('verifyRawWebhook(') < webhook.indexOf('JSON.parse('));
  assert.ok(webhook.indexOf('verifyRawWebhook(') < webhook.indexOf('client.rpc("record_local_fake_billing_webhook"'));
  assert.match(webhook, /if \(\(!local && !staging\) \|\| !serviceKey \|\| !fakeSecret/);
  assert.doesNotMatch(webhook, /branch_subscriptions|trial_started_at|entitlement|createCheckout\(/);
});

test('new server-side readiness contract is read-only, service-only and fail-closed', () => {
  assert.match(readiness, /auth\.role\(\) is distinct from 'service_role'/);
  assert.match(readiness, /set search_path=pg_catalog,public,pg_temp/);
  assert.match(readiness, /readiness is distinct from 'PLANNED'/);
  assert.match(readiness, /readiness_status is distinct from 'PENDING_CONFIGURATION'/);
  assert.match(readiness, /automatic_tax_enabled is distinct from false/);
  assert.match(readiness, /environment='LIVE'/);
  assert.match(readiness, /binding_status='UNBOUND'/);
  assert.match(readiness, /grant execute on function public\.billing_staging_negative_readiness\(\) to service_role/);
  assert.doesNotMatch(readiness, /\b(?:insert|update|delete|truncate)\b/i);
});
