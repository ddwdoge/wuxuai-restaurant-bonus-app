import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260927001000_test_tenant_pending_activation_marking.sql", import.meta.url), "utf8");
const prior = readFileSync(new URL("../supabase/migrations/20260915003000_test_tenant_contract_hardening.sql", import.meta.url), "utf8");
const controlCenter = readFileSync(new URL("../src/modules/platform/PlatformRestaurantControlCenter.tsx", import.meta.url), "utf8");
const preflight = migration.slice(migration.indexOf("create or replace function public.get_platform_test_tenant_cleanup_preflight"));

test("migration is additive and keeps the historical marker contract unchanged", () => {
  assert.match(migration, /^-- Phase 7D:/);
  assert.match(prior, /test-tenant-hardening-v3/);
  assert.doesNotMatch(migration, /\b(?:delete|update|truncate)\s+(?:from\s+)?public\.(?:restaurants|branch_subscriptions|billing_trial_claims|commercial_pro_access_grants)/i);
  assert.doesNotMatch(migration, /create\s+table|alter\s+table|drop\s+(?:table|function)/i);
});

test("only one canonical neutral pending BASIC subscription qualifies for marking", () => {
  for (const clause of [
    "stripe_states=1", "pending_subscription_rows=1", "unsafe_subscription_rows=0",
    "subscription.status='pending_activation'", "subscription.subscription_status='pending_activation'",
    "subscription.plan_key='BASIC'", "subscription.selected_plan='BASIC'",
    "subscription.payment_status='not_required'", "subscription.trial_started_at is null",
    "subscription.trial_ends_at is null", "subscription.current_period_start is null",
    "subscription.current_period_end is null", "subscription.current_period_ends_at is null",
    "subscription.stripe_customer_id is null", "subscription.stripe_subscription_id is null",
    "restaurant_record.status='draft'", "restaurant_record.activation_status='pending_activation'",
  ]) assert.ok(preflight.includes(clause), clause);
  assert.match(preflight, /marking_blockers_value := marking_blockers_value - 'PAYMENT_OR_STRIPE_STATE_PRESENT'/);
});

test("paid, trial, Stripe, entitlement, PRO and billing evidence remain fail closed", () => {
  for (const source of [
    "branch_entitlement_overrides", "restaurant_capacity_addon_entitlements",
    "commercial_pro_access_grants", "billing_trial_claims",
    "billing_checkout_blocked_requests", "billing_test_webhook_inbox",
  ]) assert.match(preflight, new RegExp(source));
  for (const blocker of [
    "PAYMENT_OR_STRIPE_STATE_PRESENT", "PAID_OR_OVERRIDE_ENTITLEMENT_PRESENT",
    "PRO_ACCESS_GRANT_PRESENT", "BILLING_TRIAL_CLAIM_PRESENT",
    "BILLING_EVENT_OR_CHECKOUT_STATE_PRESENT", "PAYMENT_STRIPE_FREEDOM_NOT_VERIFIED",
  ]) assert.match(preflight, new RegExp(blocker));
  assert.match(preflight, /when undefined_table or undefined_column or insufficient_privilege/);
});

test("cleanup remains blocked by every subscription and only marking receives the narrow exception", () => {
  const paymentBlock = preflight.indexOf("blockers_value := blockers_value || '\"PAYMENT_OR_STRIPE_STATE_PRESENT\"'");
  const markingException = preflight.indexOf("marking_blockers_value := marking_blockers_value - 'PAYMENT_OR_STRIPE_STATE_PRESENT'");
  assert.ok(paymentBlock > 0 && markingException > paymentBlock);
  assert.match(preflight, /'eligible',jsonb_array_length\(blockers_value\)=0/);
  assert.match(preflight, /'eligible_for_marking',jsonb_array_length\(marking_blockers_value\)=0/);
});

test("preflight is read-only and returns no payment credentials", () => {
  assert.doesNotMatch(preflight, /\b(?:insert into|update public|delete from)\b/i);
  assert.match(preflight, /'payment_details_returned',false/);
  assert.doesNotMatch(preflight, /'stripe_customer_id'|'stripe_subscription_id'|'provider_event_reference'/);
});

test("pending tenants expose only the server-gated TEST_ONLY marker path", () => {
  assert.match(controlCenter, /const canWrite = permittedWrite && restaurant\.subscription_status !== "pending_activation"/);
  assert.match(controlCenter, /PlatformOperationsPanel canWrite=\{canWrite\}/);
  assert.match(controlCenter, /PlatformPlanEntitlementsPanel canWrite=\{canWrite\}/);
  assert.match(controlCenter, /PlatformKassaCompliancePanel canWrite=\{permittedWrite\}/);
  assert.doesNotMatch(controlCenter, /PlatformOperationsPanel canWrite=\{permittedWrite\}/);
  assert.doesNotMatch(controlCenter, /PlatformPlanEntitlementsPanel canWrite=\{permittedWrite\}/);
});
