import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260907001000_kassa_test_tenant_cleanup_contract.sql", import.meta.url),
  "utf8",
);
const legalCleanupFix = readFileSync(
  new URL("../supabase/migrations/20260908004000_kassa_test_tenant_legal_cleanup_fix.sql", import.meta.url),
  "utf8",
);
const foreignCustomerCleanup = readFileSync(
  new URL("../supabase/migrations/20260908005000_kassa_foreign_test_customer_cleanup.sql", import.meta.url),
  "utf8",
);
const foreignCustomerPreflightLockFix = readFileSync(
  new URL("../supabase/migrations/20260908006000_kassa_foreign_cleanup_preflight_lock_fix.sql", import.meta.url),
  "utf8",
);
const legalProfileDependencyFix = readFileSync(
  new URL("../supabase/migrations/20260908008000_kassa_test_tenant_legal_profile_dependency_fix.sql", import.meta.url),
  "utf8",
);
const panel = readFileSync(new URL("../src/modules/platform/PlatformKassaCompliancePanel.tsx", import.meta.url), "utf8");
const operationsPanel = readFileSync(new URL("../src/modules/platform/PlatformOperationsPanel.tsx", import.meta.url), "utf8");
const service = readFileSync(new URL("../src/modules/platform/platformAdminService.ts", import.meta.url), "utf8");

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

test("onboarding legal evidence is removable only inside the exact TEST-ONLY cleanup context", () => {
  assert.match(legalCleanupFix, /rename to get_platform_test_tenant_cleanup_preflight_v1/);
  assert.match(legalCleanupFix, /- 'IMMUTABLE_LEGAL_EVIDENCE_PRESENT'/);
  assert.match(legalCleanupFix, /staging-test-tenant-cleanup-v2/);
  assert.match(
    legalCleanupFix,
    /tg_op = 'DELETE'[\s\S]*test_tenant_cleanup_context_allows\(old\.restaurant_id\)[\s\S]*return old/,
  );
  assert.match(legalCleanupFix, /create or replace function public\.prevent_legal_version_mutation\(\)/);
  assert.match(legalCleanupFix, /create or replace function public\.prevent_legal_document_jurisdiction_mutation\(\)/);
  assert.doesNotMatch(legalCleanupFix, /disable trigger|disable row level security|\btruncate\b/i);
  assert.doesNotMatch(legalCleanupFix, /grant (?:all|delete|update|insert) on (?:table )?public\./i);
});

test("organization legal cleanup resolves its restaurant profile dependency only in the exact cleanup context", () => {
  assert.match(legalProfileDependencyFix, /before delete on public\.organization_legal_profiles/);
  assert.match(legalProfileDependencyFix, /test_tenant_cleanup_context_allows\(cleanup_restaurant_id\)/);
  assert.match(
    legalProfileDependencyFix,
    /delete from public\.restaurant_legal_profiles[\s\S]*restaurant_id = cleanup_restaurant_id[\s\S]*operator_profile_id = old\.id/,
  );
  assert.doesNotMatch(legalProfileDependencyFix, /truncate|disable trigger|disable row level security|service_role/i);
  assert.doesNotMatch(legalProfileDependencyFix, /grant execute|grant (?:all|delete|update|insert)/i);
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

test("Platform Admin UI uses only the server-side marked-tenant cleanup contract", () => {
  assert.match(service, /get_platform_test_tenant_cleanup_preflight/);
  assert.match(service, /mark_platform_test_tenant/);
  assert.match(service, /cleanup_platform_test_tenant/);
  assert.doesNotMatch(service, /\.from\(["'](?:restaurants|platform_test_tenant_registry)/);
  assert.match(panel, /CONFIRMED:\$\{restaurantName\}:\$\{restaurantId\}/);
  assert.match(panel, /reason\.trim\(\)\.length < 20/);
  assert.match(panel, /preflight\.eligible/);
  assert.match(panel, /Als TEST-ONLY markieren/);
  assert.match(panel, /Test-Tenant vollständig bereinigen/);
  assert.doesNotMatch(panel, /service_role|truncate|delete from/i);
});

test("isolated customer uses the existing canonical Platform Admin test marker", () => {
  assert.match(service, /set_platform_customer_test_mode/);
  assert.match(service, /input_is_test_customer: true/);
  assert.match(operationsPanel, /markPlatformCustomerTestMode/);
  assert.match(operationsPanel, /kassa-v3-20260908/);
  assert.match(operationsPanel, /Als Testgast markieren/);
  assert.doesNotMatch(operationsPanel, /\.from\(["']customers/);
});

test("foreign customer cleanup preflight reports exact local and preserved foreign scope", () => {
  assert.match(foreignCustomerCleanup, /get_platform_foreign_test_customer_cleanup_preflight/);
  for (const key of [
    "auth_user_id", "customer_account_id", "customer_id", "local_membership_id",
    "local_point_transactions", "local_point_balance", "local_visits_events",
    "local_rewards", "local_gifts", "local_redemptions", "local_notifications",
    "foreign_restaurant_memberships", "foreign_point_transactions", "foreign_data_to_be_changed",
  ]) assert.match(foreignCustomerCleanup, new RegExp(`'${key}'`));
  assert.match(foreignCustomerCleanup, /CROSS_TENANT_CUSTOMER_REFERENCE_PRESENT/);
  assert.match(foreignCustomerCleanup, /EXACTLY_ONE_LOCAL_POINT_TRANSACTION_REQUIRED/);
  assert.match(foreignCustomerCleanup, /LOCAL_REDEMPTION_HISTORY_PRESENT/);
});

test("foreign cleanup preserves global identity and validates strong entity-bound confirmation", () => {
  assert.match(foreignCustomerCleanup, /create function public\.cleanup_platform_foreign_test_customer_relation/);
  assert.match(foreignCustomerCleanup, /not public\.is_platform_admin\(\)/);
  assert.match(foreignCustomerCleanup, /TEST_ONLY_MARKER_REQUIRED/);
  assert.match(foreignCustomerCleanup, /FOREIGN_TEST_CUSTOMER_CLEANUP_REASON_REQUIRED/);
  assert.match(foreignCustomerCleanup, /FOREIGN_TEST_CUSTOMER_STRONG_CONFIRMATION_REQUIRED/);
  assert.match(foreignCustomerCleanup, /FOREIGN_CUSTOMER_DATA_CHANGED/);
  assert.match(foreignCustomerCleanup, /GLOBAL_CUSTOMER_IDENTITY_CHANGED/);
  assert.doesNotMatch(foreignCustomerCleanup, /delete from (?:public\.)?customer_accounts/i);
  assert.doesNotMatch(foreignCustomerCleanup, /delete from auth\.users/i);
  assert.doesNotMatch(foreignCustomerCleanup, /truncate|disable trigger|disable row level security|service_role/i);
});

test("foreign cleanup uses explicit tenant-local deletes and retained immutable audit", () => {
  assert.match(foreignCustomerCleanup, /FOREIGN_CUSTOMER_RELATION_REMOVED/);
  assert.match(foreignCustomerCleanup, /platform_test_tenant_cleanup_audit/);
  assert.match(foreignCustomerCleanup, /delete from public\.customer_account_memberships[\s\S]*restaurant_id = input_restaurant_id[\s\S]*customer_id = input_customer_id[\s\S]*account_id = input_account_id/);
  assert.match(foreignCustomerCleanup, /delete from public\.points_transactions where restaurant_id = input_restaurant_id and customer_id = input_customer_id/);
  assert.match(foreignCustomerCleanup, /delete from public\.customers where id = input_customer_id and restaurant_id = input_restaurant_id/);
});

test("Platform Admin exposes only the protected foreign test-customer cleanup RPC", () => {
  assert.match(service, /get_platform_foreign_test_customer_cleanup_preflight/);
  assert.match(service, /cleanup_platform_foreign_test_customer_relation/);
  assert.match(panel, /platform-foreign-test-customer-cleanup/);
  assert.match(panel, /Nur fremde Test-Zuordnung entfernen/);
  assert.match(panel, /foreignCustomerConfirmation/);
  assert.doesNotMatch(panel, /service_role|delete from|truncate/i);
});

test("cleanup preflights remain visible when the general Kassa diagnosis is unavailable", () => {
  assert.doesNotMatch(panel, /Promise\.all\(\[/);
  assert.match(panel, /loadPlatformKassaComplianceStatus\(restaurantId\)[\s\S]*\.catch\(\(\) => setError\(true\)\)/);
  assert.match(panel, /loadPlatformTestTenantCleanupPreflight\(restaurantId\)[\s\S]*\.then\(setPreflight\)/);
  assert.match(panel, /loadPlatformForeignTestCustomerCleanupPreflight\(restaurantId\)[\s\S]*\.then\(setForeignCustomerPreflight\)/);
  assert.match(panel, /platform-foreign-test-customer-preflight-error/);
  assert.match(panel, /typedError\?\.code/);
  assert.match(panel, /typedError\?\.message/);
});

test("foreign cleanup preflight may take its declared narrow share lock", () => {
  assert.match(foreignCustomerCleanup, /for share/);
  assert.match(
    foreignCustomerPreflightLockFix,
    /alter function public\.get_platform_foreign_test_customer_cleanup_preflight\(uuid\)[\s\S]*volatile/,
  );
  assert.doesNotMatch(foreignCustomerPreflightLockFix, /delete|update|insert|grant|revoke|truncate/i);
});
