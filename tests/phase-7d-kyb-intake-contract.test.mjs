import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260927002000_country_kyb_intake_contract.sql", import.meta.url), "utf8");
const onboarding = readFileSync(new URL("../src/modules/admin/pages/RestaurantOnboarding.tsx", import.meta.url), "utf8");
const ownerPage = readFileSync(new URL("../src/modules/verification/OwnerBusinessVerificationPage.tsx", import.meta.url), "utf8");
const service = readFileSync(new URL("../src/modules/verification/businessVerificationService.ts", import.meta.url), "utf8");

test("KYB intake is separate from commercial launch readiness and remains synthetic-only", () => {
  assert.match(migration, /create table if not exists public\.country_kyb_intake_policies/);
  assert.match(migration, /real_intake_status[^;]+BLOCKED/s);
  assert.match(migration, /runtime_environment='STAGING'/);
  assert.match(migration, /test_only_intake_status='READY'/);
  assert.match(migration, /platform_test_tenant_registry/);
  assert.match(migration, /PENDING_ACTIVATION/);
  assert.match(migration, /commercial_activation_allowed',false/);
  assert.match(migration, /business_verification_document_intake_guard/);
  assert.doesNotMatch(migration, /update public\.country_launch_(policy|readiness)/);
  assert.doesNotMatch(migration, /(trial_started_at|stripe_customer_id|entitlement).*=/i);
});

test("owner onboarding captures the Austrian matching data once and the KYB page only summarizes it", () => {
  for (const marker of ["legalGisaNumber", "legalAuthorizedRepresentativeRole", "legalOwnerIsAuthorizedRepresentative", "legalCommercialRegisterApplicable"]) {
    assert.match(onboarding, new RegExp(marker));
  }
  assert.match(onboarding, /GISA-Zahl/);
  assert.match(onboarding, /saveOwnerKybIntakeProfile/);
  assert.match(ownerPage, /readOwnerKybIntakeSummary/);
  assert.match(ownerPage, /Ergänze vor der Einreichung/);
  assert.doesNotMatch(ownerPage, /id="business-register-type"/);
  assert.match(service, /submit_pending_business_verification_intake/);
});

test("browser roles cannot write policy tables and the intake RPCs are least privilege", () => {
  assert.match(migration, /revoke all on public\.country_kyb_intake_policies from public, anon, authenticated, service_role/);
  assert.match(migration, /revoke all on function public\.resolve_country_kyb_intake_internal\(uuid\) from public,anon,authenticated,service_role/);
  assert.match(migration, /grant execute on function public\.save_owner_kyb_intake_profile\(uuid,jsonb\) to authenticated/);
  assert.match(migration, /restaurant_row\.owner_id is distinct from actor/);
  assert.match(migration, /m\.role='owner'/);
});
