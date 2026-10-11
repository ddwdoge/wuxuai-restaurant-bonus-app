import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createTestOnlyActivationTrialReauthContinuation,
  matchesTestOnlyActivationTrialReauthContinuation,
} from "../src/modules/verification/testOnlyActivationTrialReauthContinuation.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const page = read("src/modules/verification/PlatformBusinessVerificationPage.tsx");
const panel = read("src/modules/verification/PlatformTestOnlyActivationTrialReadinessPanel.tsx");
const service = read("src/modules/verification/testOnlyActivationTrialReadinessService.ts");
const migration = read("supabase/migrations/20261011213000_test_only_activation_trial_readiness.sql");

test("Platform business verification embeds a visibly separate TEST_ONLY readiness panel", () => {
  assert.match(page, /PlatformTestOnlyActivationTrialReadinessPanel/);
  assert.match(page, /PlatformTestOnlyKybReviewPanel/);
  assert.match(page, /<h3>Reale Betriebsprüfung<\/h3>/);
  assert.match(panel, /TEST_ONLY Aktivierungs- und Trial-Bereitschaft/);
  assert.match(panel, /Keine reale Aktivierung/);
  assert.match(panel, /startet keinen Trial/);
});

test("the panel exposes every server-read project, tenant, KYB, legal and closed-state proof", () => {
  for (const label of [
    "Materialrevision", "Readiness-Snapshot-SHA-256", "Vorheriges Receipt",
    "Projekt / Issuer / Origin", "Tenant-Bindung", "KYB-Receipt", "KYB-Snapshot-SHA-256",
    "Dokument-ID", "SHA-256", "GISA-Auszug", "Gewerbeberechtigung", "Plattform-Publikation",
    "Plattform-Version", "Plattform-SHA-256", "Betriebs-Publikation", "Betriebs-Bundle",
    "Bundle-SHA-256", "Reales AT-Intake / Katalog",
  ]) assert.match(panel, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(service, /project_ref !== "mbgveqbhessaunrhfudm"/);
  assert.match(service, /auth_issuer !== "https:\/\/mbgveqbhessaunrhfudm\.supabase\.co\/auth\/v1"/);
  assert.match(service, /app_origin !== "https:\/\/staging-v2\.bonus\.wuxuaisbi\.com"/);
});

test("every decision performs a fresh read RPC and rejects changed evidence before write", () => {
  assert.match(service, /readTestOnlyActivationTrialReadiness\(input\.expectedState\.snapshot\.restaurant_id\)/);
  assert.match(service, /fresh\.next_action !== input\.action/);
  assert.match(service, /fresh\.snapshot_sha256 !== input\.expectedState\.snapshot_sha256/);
  assert.match(service, /fresh\.previous_receipt_id !== input\.expectedState\.previous_receipt_id/);
  assert.ok(
    service.indexOf("readTestOnlyActivationTrialReadiness(input.expectedState.snapshot.restaurant_id)")
      < service.indexOf('client().rpc("decide_platform_test_only_activation_trial"'),
  );
  assert.match(panel, /const fresh = await readTestOnlyActivationTrialReadiness\(restaurantId\)/);
  assert.match(panel, /setState\(fresh\)/);
});

test("activation and trial readiness are two distinct steps with a new TOTP gate for step two", () => {
  assert.match(panel, /Schritt 1: Synthetische Aktivierungsbereitschaft/);
  assert.match(panel, /Schritt 2: Synthetische Trial-Bereitschaft/);
  assert.match(panel, /setRecentReadbackPassed\(false\)/);
  assert.match(panel, /Schritt 2 bleibt bis zu einer neueren TOTP-Bestätigung geschlossen/);
  assert.match(migration, /totp_at_value <= previous_totp_at/);
  assert.match(migration, /TEST_ONLY_ACTIVATION_TRIAL_NEW_TOTP_REQUIRED/);
  assert.match(panel, /confirmation !== phrase/);
  assert.match(panel, /acknowledged/);
});

test("inline TOTP reauthentication fails closed on cancel, expiry and identity changes", () => {
  assert.match(panel, /prepareTestOnlyKybReauthentication/);
  assert.match(panel, /confirmTestOnlyKybReauthentication/);
  assert.match(panel, /Abbrechen/);
  assert.match(panel, /falsch oder abgelaufen/);
  assert.match(panel, /Identität hat sich während der Bestätigung geändert/);
  assert.match(panel, /setRecentReadbackPassed\(false\)/);

  const continuation = createTestOnlyActivationTrialReauthContinuation({
    restaurantId: "restaurant-a", identityId: "identity-a", now: 1_000,
  });
  assert.equal(matchesTestOnlyActivationTrialReauthContinuation(continuation, {
    restaurantId: "restaurant-a", identityId: "identity-a", now: 120_999,
  }), true);
  assert.equal(matchesTestOnlyActivationTrialReauthContinuation(continuation, {
    restaurantId: "restaurant-a", identityId: "identity-a", now: 121_001,
  }), false);
  assert.equal(matchesTestOnlyActivationTrialReauthContinuation(continuation, {
    restaurantId: "restaurant-a", identityId: "identity-b", now: 1_001,
  }), false);
});

test("replay and parallel calls remain server-serialized and idempotent", () => {
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\([\s\S]*test-only-activation-trial-request/);
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\([\s\S]*test-only-activation-trial:/);
  assert.match(migration, /TEST_ONLY_ACTIVATION_TRIAL_REPLAY_CONFLICT/);
  assert.match(migration, /'idempotent', true/);
  assert.match(panel, /request\.current\.key !== requestKey/);
});

test("the UI has no real activation, trial, billing, PRO, mail or catalog writer", () => {
  const candidate = `${panel}\n${service}`;
  for (const forbidden of [
    "activate_v1_manual_basic_trial", "start_restaurant_owner_trial", "billing_trial_claims",
    "commercial_pro_access_grants", "basic_test_checkout_requests",
    "customer_offer_email_deliveries", "restaurant_menu_access_internal",
    "manage_business_verification", "decide_platform_operator_review",
  ]) assert.doesNotMatch(candidate, new RegExp(forbidden));
  assert.match(service, /real_activation !== false/);
  assert.match(service, /real_trial !== false/);
  assert.match(service, /catalog_access !== false/);
});
