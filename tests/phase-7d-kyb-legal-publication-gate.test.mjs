import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260927003000_manual_kyb_legal_publication_gate.sql", import.meta.url), "utf8");
const legalPage = readFileSync(new URL("../src/modules/legal/LegalCenterPage.tsx", import.meta.url), "utf8");
const matrix = readFileSync(new URL("../docs/V1_AT_KYB_LEGAL_FIELD_DOCUMENT_MATRIX.md", import.meta.url), "utf8");

test("public operator data requires an explicit immutable verified-profile decision", () => {
  assert.match(migration, /legal_operator_publication_decisions/);
  assert.match(migration, /action in \('APPROVED','REVOKED'\)/);
  assert.match(migration, /business_verified_profile_revisions/);
  assert.match(migration, /rev\.status='VERIFIED'/);
  assert.match(migration, /c\.status='VERIFIED' and c\.test_only=false/);
  assert.match(migration, /pa\.role in \('platform_owner','platform_admin'\)/);
  assert.match(migration, /aal2_verified_at>=d\.created_at-interval '5 minutes'/);
  assert.match(migration, /auth_session_sha256/);
  assert.match(migration, /legal_operator_publication_decisions_immutable/);
  assert.match(migration, /LEGAL_OPERATOR_MANUAL_APPROVAL_REQUIRED/);
  assert.doesNotMatch(migration, /grant (insert|update|delete).*legal_operator_publication_decisions/i);
});

test("legal and privacy decisions remain fail-closed and completeness cannot activate", () => {
  for (const gate of ["real_intake_status='READY'", "legal_status='VERIFIED'", "privacy_status='VERIFIED'", "document_catalog_status='VERIFIED'", "retention_status='VERIFIED'"]) {
    assert.match(migration, new RegExp(gate));
  }
  assert.match(migration, /restaurant_registration_readiness/);
  assert.match(migration, /operator_profile_manually_approved/);
  assert.doesNotMatch(migration, /(trial_started_at|stripe_customer_id|entitlement|country_launch).*:=|update public\.(subscriptions|country_launch)/i);
});

test("public response suppresses unapproved operator data and never joins private KYB evidence", () => {
  assert.match(migration, /'imprint',case when legal_ready_value/);
  assert.match(migration, /else '\{\}'::jsonb end/);
  assert.match(migration, /'program_operator',null/);
  assert.doesNotMatch(migration, /from public\.business_verification_documents/);
  assert.doesNotMatch(migration, /business_verification_evidence_metadata|storage\.objects|signed_url/i);
});

test("customer legal UI separates platform, operator and end user", () => {
  assert.match(legalPage, />Plattformanbieter</);
  assert.match(legalPage, />Betreiber</);
  assert.match(legalPage, />Endnutzer</);
  assert.match(matrix, /ANWALTLICHE PRÜFUNG OFFEN/);
  assert.match(matrix, /keine allgemeine Ausweiskopierpflicht/i);
});
