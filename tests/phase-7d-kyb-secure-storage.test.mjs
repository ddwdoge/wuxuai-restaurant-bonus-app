import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migrationPath = "supabase/migrations/20260926002000_austrian_kyb_secure_documents.sql";
const migration = read(migrationPath);

test("KYB migration follows the local AAL2 migration without rewriting history", () => {
  const migrations = readdirSync(new URL("../supabase/migrations", import.meta.url)).sort();
  const aal2 = migrations.indexOf("20260926001000_platform_admin_totp_aal2_gate.sql");
  const kyb = migrations.indexOf("20260926002000_austrian_kyb_secure_documents.sql");
  assert.ok(aal2 >= 0);
  assert.equal(kyb, aal2 + 1);
  assert.match(migration, /migration:20260926002000/);
  assert.doesNotMatch(migration, /create or replace function public\.platform_/);
});

test("KYB documents use a private bounded bucket and a finite Austrian V1 vocabulary", () => {
  assert.match(migration, /'business-verification-documents'[\s\S]*false,[\s\S]*10485760/);
  assert.match(migration, /array\['application\/pdf', 'image\/jpeg', 'image\/png'\]/);
  for (const type of [
    "GISA_EXTRACT",
    "COMPANY_REGISTER_EXTRACT",
    "TRADE_LICENSE",
    "TAX_REGISTRATION",
    "REPRESENTATIVE_ID",
    "POWER_OF_ATTORNEY",
  ]) {
    assert.match(migration, new RegExp(`'${type}'`));
  }
  assert.doesNotMatch(migration, /OTHER_DOCUMENT|application\/octet-stream/);
});

test("storage access is owner/reviewer bound and browser overwrite or delete is absent", () => {
  assert.match(migration, /business_verification_owner_internal/);
  assert.match(migration, /membership\.role = 'owner'/);
  assert.match(migration, /restaurant\.owner_id = input_actor_id/);
  assert.match(migration, /current_platform_role\(\) in \('platform_owner', 'platform_admin'\)/);
  assert.match(migration, /business_verification_storage_read_allowed_internal/);
  assert.match(migration, /document\.storage_object_name = input_object_name/);
  assert.match(migration, /document\.status = 'PENDING_UPLOAD'/);
  assert.doesNotMatch(migration, /create policy "business verification document immutable update"/);
  assert.doesNotMatch(migration, /create policy "business verification document immutable delete"/);
  assert.doesNotMatch(migration, /grant[^;]+to\s+(anon|public)/i);
});

test("document lifecycle is idempotent, audited, and never deletes evidence", () => {
  assert.match(migration, /reservation_request_id uuid not null unique/);
  assert.match(migration, /completion_request_id uuid unique/);
  assert.match(migration, /deletion_request_id uuid unique/);
  assert.match(migration, /business_verification_document_events_immutable/);
  assert.match(migration, /'UPLOAD_RESERVED', 'UPLOAD_COMPLETED', 'SUPERSEDED'/);
  assert.match(migration, /'DELETION_REQUESTED', 'DELETED'/);
  assert.match(migration, /physical_delete_pending', true/);
  assert.doesNotMatch(migration, /delete\s+from\s+(public\.)?business_verification_documents/i);
  assert.doesNotMatch(migration, /delete\s+from\s+storage\.objects/i);
});

test("pending activation and unreleased manual approval stay fail closed", () => {
  assert.match(migration, /restaurant_activation_state_internal\(restaurant_row\.id\)/);
  assert.match(migration, /BUSINESS_VERIFICATION_PENDING_REQUIRED/);
  assert.doesNotMatch(migration, /create or replace function public\.confirm_real_business_verification/);
  assert.doesNotMatch(migration, /update public\.restaurants/);
  assert.doesNotMatch(migration, /trial_started_at|entitlement|stripe/i);
});
