import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20261011164421_test_only_kyb_review_contract.sql");
const page = read("src/modules/verification/PlatformBusinessVerificationPage.tsx");
const panel = read("src/modules/verification/PlatformTestOnlyKybReviewPanel.tsx");
const service = read("src/modules/verification/testOnlyKybReviewService.ts");

test("existing Platform business verification embeds one visibly separate synthetic review panel", () => {
  assert.match(page, /PlatformTestOnlyKybReviewPanel/);
  assert.match(page, /<h3>Reale Betriebsprüfung<\/h3>/);
  assert.match(panel, /Synthetischer Prüfpfad/);
  assert.match(panel, /TEST_ONLY-KYB-Prüfung/);
  assert.match(panel, /Keine reale Freigabe/);
  assert.match(panel, /verifiziert kein reales Unternehmen/);
});

test("admin sees revision and every exact document identity before a decision is enabled", () => {
  assert.match(panel, /Materialrevision/);
  assert.match(panel, /Snapshot-SHA-256/);
  assert.match(panel, /Dokument-ID/);
  assert.match(panel, /SHA-256/);
  assert.match(panel, /GISA-Auszug/);
  assert.match(panel, /Gewerbeberechtigung/);
  assert.match(panel, /Fassung \{document\.version\}/);
  assert.match(panel, /confirmation !== phrase/);
  assert.match(panel, /acknowledged/);
});

test("UI sends only the byte- and revision-bound synthetic RPC payload", () => {
  assert.match(service, /\.rpc\("get_platform_test_only_kyb_review"/);
  assert.match(service, /\.rpc\("decide_platform_test_only_kyb_review"/);
  for (const field of [
    "input_expected_material_revision",
    "input_expected_snapshot_sha256",
    "input_expected_previous_receipt_id",
    "input_documents",
    "input_request_id",
  ]) assert.match(service, new RegExp(field));
  assert.match(service, /getAuthenticatorAssuranceLevel/);
  assert.match(service, /currentLevel !== "aal2"/);
  assert.match(service, /hasTotpAuthenticationMethod/);
});

test("an explicit AAL2 step-up is required before the decision UI is offered", () => {
  assert.match(panel, /TOTP erneut bestätigen/);
  assert.match(panel, /recentReadbackPassed \? <div className="platform-test-only-decision">/);
  assert.match(panel, /readTestOnlyKybReview\(restaurantId\)/);
  assert.match(service, /challengeAndVerify/);
  assert.match(service, /expectedIdentityId/);
  assert.match(service, /before\.data\.user\?\.id !== input\.expectedIdentityId/);
  assert.match(service, /afterUser\.data\.user\?\.id !== input\.expectedIdentityId/);
  assert.match(panel, /Abbrechen/);
  assert.match(panel, /falsch oder abgelaufen/);
});

test("same reviewer and stale material fail closed without changing real gates", () => {
  assert.match(panel, /sameReviewerBlocked/);
  assert.match(panel, /andere Platform-Identität|zweite berechtigte Platform-Identität/);
  assert.match(panel, /Dokumente oder Materialrevision haben sich geändert/);
  assert.match(service, /TEST_ONLY_KYB_REVIEW_SECOND_PERSON_REQUIRED/);
  assert.match(service, /TEST_ONLY_KYB_REVIEW_STALE/);
  assert.doesNotMatch(`${panel}\n${service}`, /confirm_real_business_verification|manage_business_verification|resolve_business_verification_readiness_internal|decide_platform_operator_review/);
  assert.doesNotMatch(`${panel}\n${service}`, /trial_started_at|stripe_customer_id|commercial_pro_access_grants|customer_transactional_email_deliveries/);
});

test("the four-file SQL contract remains the sole authority for writes and immutable audit", () => {
  assert.match(migration, /test_only_kyb_review_receipts_immutable/);
  assert.match(migration, /test_only_kyb_review_audit_immutable/);
  assert.match(migration, /previous\.actor_id = auth\.uid\(\)/);
  assert.match(migration, /snapshot_value->'documents' is distinct from input_documents/);
  assert.match(migration, /snapshot_value->>'material_revision'/);
});
