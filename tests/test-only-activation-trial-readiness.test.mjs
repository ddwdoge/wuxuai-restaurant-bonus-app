import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL(
  "../supabase/migrations/20261011213000_test_only_activation_trial_readiness.sql",
  import.meta.url,
), "utf8");

test("candidate is bound to the exact staging-v2 project and closed AT intake", () => {
  assert.match(migration, /project_bootstrap\.require_runtime_binding\(true\)/);
  assert.match(migration, /project_ref' = 'mbgveqbhessaunrhfudm'/);
  assert.match(migration, /auth_issuer' = 'https:\/\/mbgveqbhessaunrhfudm\.supabase\.co\/auth\/v1'/);
  assert.match(migration, /app_origin' = 'https:\/\/staging-v2\.bonus\.wuxuaisbi\.com'/);
  assert.match(migration, /environment[^\n]+='STAGING'|environment[^\n]+ = 'STAGING'/);
  assert.match(migration, /policy\.real_intake_status = 'BLOCKED'/);
});

test("candidate consumes only current synthetic KYB and TEST_ONLY legal evidence", () => {
  assert.match(migration, /test_only_kyb_review_current_internal\(r\.id, statement_timestamp\(\)\)/);
  assert.match(migration, /kyb\.action = 'APPROVE_TEST'/);
  assert.match(migration, /platform_terms\.action = 'PUBLISH_TEST'/);
  assert.match(migration, /platform_terms\.version ~ '\^TEST_ONLY_/);
  assert.match(migration, /merchant_legal\.action = 'PUBLISH_TEST'/);
  assert.match(migration, /merchant_legal\.manifest->>'test_only' = 'true'/);
  assert.match(migration, /'real_kyb_verified', false/);
  assert.match(migration, /'real_legal_ready', false/);
});

test("candidate is append-only, RLS-closed and grants only guarded RPC execution", () => {
  assert.match(migration, /alter table public\.test_only_activation_trial_receipts enable row level security/);
  assert.match(migration, /revoke all on public\.test_only_activation_trial_receipts,[\s\S]*service_role/);
  assert.match(migration, /test_only_activation_trial_receipts_immutable/);
  assert.match(migration, /test_only_activation_trial_audit_immutable/);
  assert.match(migration, /grant execute on function public\.get_platform_test_only_activation_trial\(uuid\) to authenticated/);
  assert.match(migration, /grant execute on function public\.decide_platform_test_only_activation_trial\([\s\S]*?\) to authenticated/);
  assert.doesNotMatch(migration, /grant\s+(?:select|insert|update|delete)\s+on/i);
});

test("each decision requires a fresh protected admin session and the trial step requires newer TOTP", () => {
  assert.match(migration, /require_legal_bundle_admin_internal\(\)/);
  assert.match(migration, /input_action not in \('ACTIVATION_READINESS_TEST', 'TRIAL_READINESS_TEST'\)/);
  assert.match(migration, /totp_at_value <= previous_totp_at/);
  assert.match(migration, /TEST_ONLY_ACTIVATION_TRIAL_NEW_TOTP_REQUIRED/);
  assert.match(migration, /previous\.snapshot_sha256 is distinct from snapshot_sha256_value/);
  assert.match(migration, /TEST_ONLY_ACTIVATION_TRIAL_REPLAY_CONFLICT/);
  assert.match(migration, /TEST_ONLY_ACTIVATION_TRIAL_STALE/);
});

test("candidate never mutates real activation, trial, billing, PRO, mail, legal or catalog state", () => {
  for (const table of [
    "restaurants", "branches", "branch_subscriptions", "business_verification_cases",
    "legal_operator_publication_decisions", "manual_basic_trial_decisions", "billing_trial_claims",
    "commercial_pro_access_grants", "basic_test_checkout_requests", "customer_offer_email_deliveries",
  ]) {
    assert.doesNotMatch(migration, new RegExp(`(?:insert\\s+into|update|delete\\s+from)\\s+public\\.${table}\\b`, "i"));
  }
  assert.doesNotMatch(migration, /storage\.(?:objects|buckets)\s+(?:set|values)/i);
  assert.match(migration, /not public\.restaurant_menu_access_internal/);
  assert.match(migration, /file_size_limit[^\n]+ = 1/);
  assert.match(migration, /'real_activation', false/);
  assert.match(migration, /'real_trial', false/);
});

test("sequence is synthetic activation readiness followed by synthetic trial readiness", () => {
  assert.match(migration, /previous\.id is null then 'ACTIVATION_READINESS_TEST'/);
  assert.match(migration, /previous\.action = 'ACTIVATION_READINESS_TEST' then 'TRIAL_READINESS_TEST'/);
  assert.match(migration, /action = 'ACTIVATION_READINESS_TEST' and previous_receipt_id is null/);
  assert.match(migration, /action = 'TRIAL_READINESS_TEST' and previous_receipt_id is not null/);
});
