import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260907001000_kassa_test_tenant_cleanup_contract.sql", import.meta.url),
  "utf8",
);

test("cleanup is restricted to explicitly marked isolated test tenants", () => {
  assert.match(migration, /platform_test_tenant_registry/);
  assert.match(migration, /TEST_ONLY_MARKER_REQUIRED/);
  assert.match(migration, /NON_TEST_CUSTOMER_PRESENT/);
  assert.match(migration, /SHARED_ORGANIZATION/);
  assert.match(migration, /FOREIGN_USER_MEMBERSHIP/);
  assert.match(migration, /OWNER_HAS_FOREIGN_RESTAURANT/);
  assert.match(migration, /FOREIGN_STAFF_IDENTITY/);
  assert.match(migration, /FOREIGN_CUSTOMER_IDENTITY/);
  assert.match(migration, /FOREIGN_CUSTOMER_ACCOUNT_MEMBERSHIP/);
  assert.match(migration, /OWNER_IS_PLATFORM_ADMIN/);
  assert.match(migration, /IMMUTABLE_LEGAL_EVIDENCE_PRESENT/);
  assert.match(migration, /IMMUTABLE_PLATFORM_AUDIT_PRESENT/);
});

test("cleanup requires Platform Admin, reason and entity-bound confirmation", () => {
  assert.ok((migration.match(/not public\.is_platform_admin\(\)/g) ?? []).length >= 3);
  assert.match(migration, /TEST_TENANT_CLEANUP_REASON_REQUIRED/);
  assert.match(migration, /'CONFIRMED:' \|\| marker_record\.restaurant_name \|\| ':' \|\| marker_record\.restaurant_id::text/);
});

test("cleanup is atomic and does not expose a generic delete contract", () => {
  assert.match(migration, /create function public\.cleanup_platform_test_tenant/);
  assert.doesNotMatch(migration, /truncate/i);
  assert.doesNotMatch(migration, /disable trigger/i);
  assert.doesNotMatch(migration, /service_role/i);
  assert.doesNotMatch(migration, /grant delete/i);
});

test("immutable evidence is bypassed only inside the marked cleanup context", () => {
  assert.match(migration, /test_tenant_cleanup_context_allows\(old\.restaurant_id\)/);
  assert.match(migration, /platform_test_tenant_cleanup_audit/);
  assert.match(migration, /TEST_TENANT_CLEANUP_AUDIT_IMMUTABLE/);
  assert.match(migration, /tg_op = 'DELETE' and public\.test_tenant_cleanup_context_allows\(old\.restaurant_id\)/);
  assert.doesNotMatch(migration, /create or replace function public\.prevent_legal_version_mutation/);
  assert.doesNotMatch(migration, /create or replace function public\.protect_platform_admin_operations_audit/);
});

test("preflight inventories the required Kassa and tenant-owned data", () => {
  for (const key of [
    "organization", "restaurant", "branches", "owners", "staff", "customers",
    "memberships", "points", "qr_tokens", "pin_attempts", "rewards", "redemptions",
    "kassa_acknowledgements", "kassa_open", "kassa_recorded", "kassa_owner_reviewed",
    "offers", "mail_queue", "notification_state", "audit", "legal_consent", "storage",
  ]) {
    assert.match(migration, new RegExp(`'${key}'`));
  }
});

test("browser roles receive no direct table access", () => {
  assert.match(migration, /revoke all on public\.platform_test_tenant_registry from public, anon, authenticated/);
  assert.match(migration, /revoke all on public\.platform_test_tenant_cleanup_audit from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.cleanup_platform_test_tenant\(uuid,text,text\) to authenticated/);
  assert.match(migration, /revoke all on function public\.block_kassa_acknowledgement_mutation\(\) from public, anon, authenticated/);
});
