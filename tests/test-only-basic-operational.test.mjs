import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL(
  "../supabase/migrations/20261011225244_test_only_basic_operational_access.sql",
  import.meta.url,
), "utf8");
const service = await readFile(new URL(
  "../src/modules/verification/testOnlyBasicAccessService.ts",
  import.meta.url,
), "utf8");
const panel = await readFile(new URL(
  "../src/modules/verification/PlatformTestOnlyBasicAccessPanel.tsx",
  import.meta.url,
), "utf8");
const page = await readFile(new URL(
  "../src/modules/verification/PlatformBusinessVerificationPage.tsx",
  import.meta.url,
), "utf8");

test("TEST_ONLY BASIC requires the completed bound readiness and joined-customer chain", () => {
  assert.match(migration, /project_bootstrap\.require_runtime_binding\(true\)/);
  assert.match(migration, /action is distinct from 'TRIAL_READINESS_TEST'/);
  assert.match(migration, /synthetic_chain_complete' is distinct from 'true'/);
  assert.match(migration, /customer_test_only_join_receipts/);
  assert.match(migration, /receipt\.test_session_id = marker\.test_session_id/);
  assert.match(migration, /readiness_snapshot_sha256/);
  assert.match(migration, /customer_join_receipt_id/);
});

test("grant and revoke are short, immutable, auditable and replay-safe", () => {
  assert.match(migration, /expires_at_value < starts_at_value \+ interval '15 minutes'/);
  assert.match(migration, /expires_at_value > starts_at_value \+ interval '4 hours'/);
  assert.match(migration, /input_action not in \('GRANT', 'REVOKE'\)/);
  assert.match(migration, /TEST_ONLY_BASIC_REPLAY_CONFLICT/);
  assert.match(migration, /TEST_ONLY_BASIC_STALE/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /test_only_basic_access_receipts_immutable/);
  assert.match(migration, /test_only_basic_access_audit_immutable/);
  assert.match(migration, /require_legal_bundle_admin_internal\(\)/);
  assert.match(migration, /session_sha256/);
});

test("real activation, trial, entitlement, notification and catalog gates remain closed", () => {
  assert.doesNotMatch(migration, /activate_v1_manual_basic_trial\s*\(/);
  for (const table of [
    "manual_basic_trial_decisions", "billing_trial_claims", "commercial_pro_access_grants",
    "basic_test_checkout_requests", "legal_operator_publication_decisions",
  ]) {
    assert.doesNotMatch(migration, new RegExp(`(?:insert\\s+into|update|delete\\s+from)\\s+public\\.${table}\\b`, "i"));
  }
  assert.match(migration, /'real_activation', false/);
  assert.match(migration, /'real_trial', false/);
  assert.match(migration, /'real_entitlement', false/);
  assert.match(migration, /'offer_notifications', false/);
  assert.match(migration, /'reward_notifications', false/);
  assert.match(migration, /'catalog_access', false/);
  assert.doesNotMatch(migration, /create or replace function public\.resolve_restaurant_effective_entitlement/);
});

test("only explicit BASIC operations receive a transaction-scoped tenant and actor capability", () => {
  assert.match(migration, /'OFFER_WRITE', 'CUSTOMER_POINTS_QR', 'POINTS_PREVIEW',[\s\S]*'POINTS_CONFIRM', 'DAILY_PIN'/);
  assert.match(migration, /set_config\('wuxuai\.test_only_basic_restaurant_id'/);
  assert.match(migration, /set_config\('wuxuai\.test_only_basic_action'/);
  assert.match(migration, /set_config\('wuxuai\.test_only_basic_actor_id'/);
  assert.match(migration, /scoped_actor = auth\.uid\(\)::text/);
  assert.match(migration, /public\.is_restaurant_admin\(input_restaurant_id\)/);
  assert.match(migration, /public\.is_restaurant_member\(input_restaurant_id\)/);
  assert.match(migration, /public\.test_only_basic_customer_authorized_internal\(input_restaurant_id\)/);
});

test("BASIC offer and points writers stay bounded and synthetic notifications stay off", () => {
  assert.match(migration, /capacity_limit:=5/);
  assert.match(migration, /and public\.test_only_basic_customer_authorized_internal\(r\.id\)/);
  assert.match(migration, /customer\.is_test_customer=true/);
  assert.match(migration, /TEST_ONLY_BASIC_REFERRAL_OUT_OF_SCOPE/);
  assert.match(migration, /'welcome_gift_unlocked',false/);
  assert.match(migration, /restaurant_entitlement_enabled\(input_restaurant_id,'offer_notifications'\)/);
  assert.doesNotMatch(migration, /apply_successful_points_effects_v1\s*\(/);
});

test("tables are RLS-closed and only guarded RPCs are granted", () => {
  assert.match(migration, /alter table public\.test_only_basic_access_receipts enable row level security/);
  assert.match(migration, /revoke all on public\.test_only_basic_access_receipts,[\s\S]*service_role/);
  assert.match(migration, /grant execute on function public\.get_platform_test_only_basic_access\(uuid\) to authenticated/);
  assert.match(migration, /grant execute on function public\.decide_platform_test_only_basic_access\([\s\S]*?\) to authenticated/);
  assert.doesNotMatch(migration, /grant\s+(?:select|insert|update|delete)\s+on/i);
});

test("Platform UI requires inline TOTP, fresh server readback and exact confirmation", () => {
  assert.match(page, /PlatformTestOnlyBasicAccessPanel/);
  assert.match(panel, /prepareTestOnlyKybReauthentication/);
  assert.match(panel, /confirmTestOnlyKybReauthentication/);
  assert.match(panel, /const fresh = await readTestOnlyBasicAccess\(restaurantId\)/);
  assert.match(panel, /TEST_ONLY BASIC \$\{action\} \$\{restaurantId\}/);
  assert.match(panel, /30 Minuten/);
  assert.match(panel, /4 Stunden/);
  assert.match(panel, /sofort widerrufen/);
  assert.match(service, /fresh\.snapshot_sha256 !== input\.expectedState\.snapshot_sha256/);
  assert.match(service, /fresh\.previous_receipt_id !== input\.expectedState\.previous_receipt_id/);
  assert.match(service, /fresh\.next_action !== input\.action/);
});
