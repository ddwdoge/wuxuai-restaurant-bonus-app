import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../supabase/migrations/20260927004000_v1_manual_basic_trial_activation.sql", import.meta.url);
const migration = await readFile(migrationUrl, "utf8");

test("manual BASIC trial has no coded cohort cap and accepts only one or three calendar months", () => {
  assert.match(migration, /calendar_months smallint not null check \(calendar_months in \(1,3\)\)/);
  assert.match(migration, /make_interval\(months=>calendar_months\)/);
  assert.doesNotMatch(migration, /slot_number|PILOT_COHORT_FULL|between 1 and 10/i);
});

test("activation is AAL2 Platform-Admin-only and preserves all existing readiness gates", () => {
  assert.match(migration, /require_recent_platform_auth_internal\(\)/);
  assert.match(migration, /platform_totp_aal2_verified_internal\(\)/);
  assert.match(migration, /country_launch_readiness_snapshot/);
  assert.match(migration, /legal_operator_publication_ready_internal/);
  assert.match(migration, /KASSA_ACKNOWLEDGEMENT_REQUIRED/);
});

test("trial uses canonical subscription and cannot bind or charge Stripe", () => {
  assert.match(migration, /update public\.branch_subscriptions set status='trialing'/);
  assert.match(migration, /payment_status='not_required'/);
  assert.match(migration, /stripe_customer_id is null and new\.stripe_subscription_id is null/);
  assert.doesNotMatch(migration, /apply_stripe|STRIPE_TEST_PILOT|checkout\.session\.completed/);
});

test("registration, KYB and TEST_ONLY cannot start a trial", () => {
  assert.match(migration, /activate_v1_manual_basic_trial/);
  assert.match(migration, /MANUAL_TRIAL_PENDING_BASELINE_REQUIRED/);
  assert.doesNotMatch(migration, /test_only/i);
  assert.equal((migration.match(/trial_started_at=started/g) ?? []).length, 1);
});

test("expiry is fail-closed without automatic payment or extension", () => {
  assert.match(migration, /TRIAL_ENDED_PAYMENT_ACCEPTANCE_REQUIRED/);
  assert.match(migration, /'automatic_charge',false/);
  assert.match(migration, /'automatic_extension',false/);
  assert.match(migration, /LEGAL_DECISION_OPEN_60_DAY_REDEMPTION/);
  assert.match(migration, /paid_followup_acceptance_required/);
});

test("decision evidence is immutable and idempotent", () => {
  assert.match(migration, /MANUAL_TRIAL_DECISION_IMMUTABLE/);
  assert.match(migration, /request_id uuid not null unique/);
  assert.match(migration, /MANUAL_TRIAL_ALREADY_DECIDED/);
  assert.match(migration, /jsonb_build_object\('idempotent',true\)/);
});
