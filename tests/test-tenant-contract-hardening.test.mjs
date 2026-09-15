import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260915003000_test_tenant_contract_hardening.sql", import.meta.url), "utf8");
const oldMigration = readFileSync(new URL("../supabase/migrations/20260907001000_kassa_test_tenant_cleanup_contract.sql", import.meta.url), "utf8");

test("hardening is additive and preserves applied migration bytes", () => {
  assert.match(migration, /^-- Phase 7B\.4C:/);
  assert.doesNotMatch(migration, /\b(?:drop|truncate)\s+table\b|disable row level security/i);
  assert.match(oldMigration, /staging-test-tenant-cleanup-v1/);
});

test("preflight binds immutable tenant context and returns privacy-safe inventories", () => {
  for (const field of ["organization_id","restaurant_id","location_ids","owner_auth_user_id","country_codes","stored_plan","effective_plan","registry_states","customers","foreign_customer_account_memberships","activity_summary","storage_objects","billing_summary","audit_summary","blockers"]) assert.match(migration,new RegExp(field));
  assert.match(migration,/emails_returned',false/);
  assert.match(migration,/tokens_returned',false/);
  assert.match(migration,/payment_details_returned',false/);
  assert.doesNotMatch(migration,/customer\.email|customer\.phone|stripe_customer_id'|stripe_subscription_id'/);
});

test("immutable audit and receipts block the preflight without removing evidence", () => {
  assert.match(migration,/blockers_value := blockers_value \|\| '\"IMMUTABLE_PLATFORM_AUDIT_PRESENT\"'/);
  assert.match(migration,/blockers_value := blockers_value \|\| '\"IMMUTABLE_MARK_RECEIPT_PRESENT\"'/);
  for (const blocker of ["ORGANIZATION_BINDING_MISSING","OWNER_AUTH_BINDING_MISSING","LOCATION_BINDING_NOT_EXACT","FOREIGN_CUSTOMER_ACCOUNT_MEMBERSHIP","NON_TEST_CUSTOMER_PRESENT","ACTIVE_OR_RESERVED_REDEMPTION","PAYMENT_OR_STRIPE_STATE_PRESENT","STORAGE_OBJECTS_REQUIRE_SEPARATE_CLEANUP"]) assert.match(migration,new RegExp(blocker));
  assert.match(migration,/PAYMENT_STRIPE_FREEDOM_NOT_VERIFIED/);
  assert.doesNotMatch(migration,/delete from public\.(?:platform_test_tenant_mark_requests|platform_test_tenant_cleanup_audit|platform_admin_operations|commercial_pro_access_audit)/);
});

test("new marker contract requires recent auth and request-bound idempotency", () => {
  assert.match(migration,/mark_platform_test_tenant\(uuid,text,text,text,uuid\)/);
  assert.match(migration,/require_recent_platform_auth_internal\(\)/);
  assert.match(migration,/input_idempotency_key is null/);
  assert.match(migration,/payload_hash_value := encode\(extensions\.digest/);
  assert.match(migration,/actor_id'.*target_restaurant_ref'.*operation'.*test_session_id'.*reason'.*confirmation'/s);
  assert.match(migration,/pg_advisory_xact_lock/);
  assert.match(migration,/TEST_TENANT_IDEMPOTENCY_CONFLICT/);
  assert.match(migration,/return request_record\.result \|\| jsonb_build_object\('idempotent',true\)/);
});

const receiptSchema = migration.slice(migration.indexOf("create table if not exists public.platform_test_tenant_mark_requests"), migration.indexOf("alter table public.platform_test_tenant_mark_requests"));
const preflight = migration.slice(migration.indexOf("create or replace function public.get_platform_test_tenant_cleanup_preflight"), migration.indexOf("-- The applied four-argument"));
const cleanup = oldMigration.slice(oldMigration.indexOf("create function public.cleanup_platform_test_tenant("));

test("generic cleanup discovery cannot select the retained receipt table", () => {
  assert.match(cleanup, /column_info\.column_name = 'restaurant_id'/);
  assert.doesNotMatch(receiptSchema, /\brestaurant_id\b/);
  assert.match(receiptSchema, /target_restaurant_ref uuid not null/);
  assert.match(receiptSchema, /organization_ref uuid not null/);
  assert.match(receiptSchema, /location_ref uuid not null/);
  assert.match(receiptSchema, /\(target_restaurant_ref, created_at, idempotency_key\)/);
  assert.doesNotMatch(receiptSchema, /on delete (?:cascade|set null)/i);
  assert.doesNotMatch(cleanup, /platform_test_tenant_mark_requests/);
});

test("receipt rows and table are append-only including truncate protection", () => {
  assert.match(migration, /before update or delete on public\.platform_test_tenant_mark_requests/);
  assert.match(migration, /before truncate on public\.platform_test_tenant_mark_requests/);
  assert.match(migration, /TEST_TENANT_MARK_REQUEST_IMMUTABLE/);
});

test("legacy preflight fields and flat inventory are reused without remapping", () => {
  assert.match(preflight, /legacy_value := public\.get_platform_test_tenant_cleanup_preflight_v1\(input_restaurant_id\)/);
  assert.match(preflight, /return legacy_value \|\| jsonb_build_object/);
  assert.match(preflight, /'restaurant_name',legacy_value->'restaurant_name'/);
  assert.match(preflight, /'inventory',legacy_value->'inventory'/);
  assert.match(preflight, /'eligible',jsonb_array_length\(blockers_value\)=0/);
  assert.match(preflight, /TEST_TENANT_LEGACY_CONTRACT_INVALID/);
  assert.match(preflight, /blockers_value := \(legacy_value->'blockers'\) - 'IMMUTABLE_LEGAL_EVIDENCE_PRESENT'/);
  for (const code of ['SHARED_ORGANIZATION','FOREIGN_USER_MEMBERSHIP','OWNER_HAS_FOREIGN_RESTAURANT','FOREIGN_STAFF_IDENTITY','FOREIGN_CUSTOMER_IDENTITY','FOREIGN_CUSTOMER_ACCOUNT_MEMBERSHIP','NON_TEST_CUSTOMER_PRESENT','OWNER_IS_PLATFORM_ADMIN','TEST_ONLY_MARKER_MISSING']) {
    assert.ok(oldMigration.includes(code), code);
    assert.ok(!preflight.includes(`\n  blockers_value := blockers_value - '${code}'`), `${code} remains in cleanup blockers`);
  }
});

test("first marking checks pre-request eligibility and serializes target before receipt", () => {
  const body=migration.slice(migration.indexOf('create or replace function public.mark_platform_test_tenant('));
  const ordered=['require_recent_platform_auth_internal()',"'MARK_TEST_ONLY_TENANT:'",'select * into request_record','return request_record.result','preflight_value :=','insert into public.platform_test_tenant_registry','insert into public.platform_test_tenant_cleanup_audit','insert into public.platform_test_tenant_mark_requests'];
  for(let i=1;i<ordered.length;i++) assert.ok(body.indexOf(ordered[i-1])<body.indexOf(ordered[i]),ordered[i]);
  assert.match(preflight,/marking_blockers_value := blockers_value - 'TEST_ONLY_MARKER_MISSING'/);
  assert.match(preflight,/TEST_ONLY_MARKER_ALREADY_PRESENT/);
  assert.match(body,/preflight_value->'marking_preflight'->>'eligible'/);
});

test("canonical billing is read-only, empty can pass and unknown fails closed", () => {
  assert.match(preflight,/subscription.organization_id=restaurant_record.organization_id/);
  assert.match(preflight,/or subscription.branch_id in/);
  assert.match(preflight,/when undefined_table or undefined_column or insufficient_privilege/);
  assert.match(preflight,/if not billing_verified then/);
  assert.match(preflight,/'empty_canonical_billing_state',billing_verified and stripe_states=0/);
  assert.doesNotMatch(preflight,/public\.(?:invoices|payments|stripe_customers|payouts)/);
});

test("existing UI and cleanup still consume the preserved JSON contract", () => {
  const panel=readFileSync(new URL('../src/modules/platform/PlatformKassaCompliancePanel.tsx',import.meta.url),'utf8');
  assert.match(panel,/preflight\?\.restaurant_name/);
  assert.match(panel,/Object\.entries\(preflight\.inventory\)/);
  assert.match(panel,/!preflight\.eligible/);
  assert.match(cleanup,/not coalesce\(\(preflight_value->>'eligible'\)::boolean, false\)/);
  assert.match(cleanup,/preflight_value->'inventory'/);
});

test("read and mutation entry points use the narrow platform role contract", () => {
  assert.equal((migration.match(/current_platform_role\(\) in \('platform_owner', 'platform_admin'\)/g) ?? []).length,2);
  assert.doesNotMatch(preflight,/\b(?:insert into|update public|delete from)\b/i);
});

test("old unsafe overload is inaccessible and browser DML remains absent", () => {
  assert.match(migration,/revoke execute on function public\.mark_platform_test_tenant\(uuid,text,text,text\)[\s\S]*public, anon, authenticated, service_role/);
  assert.match(migration,/grant execute on function public\.mark_platform_test_tenant\(uuid,text,text,text,uuid\) to authenticated/);
  assert.match(migration,/revoke all on table public\.platform_test_tenant_mark_requests from public, anon, authenticated/);
  assert.doesNotMatch(migration,/grant (?:insert|update|delete|all) on (?:table )?public\./i);
});

test("marking never mutates tenant business, Pro, country, storage, membership or Stripe state", () => {
  const start=migration.indexOf("create or replace function public.mark_platform_test_tenant(");
  const body=migration.slice(start);
  assert.doesNotMatch(body,/delete from|update public\.(?:customers|customer_account_memberships|points_transactions|commercial_|branch_subscriptions)|insert into public\.commercial_pro_access_grants|storage\.objects\s+(?:set|where)/i);
  assert.match(body,/insert into public\.platform_test_tenant_registry/);
  assert.match(body,/insert into public\.platform_test_tenant_cleanup_audit/);
  assert.match(body,/insert into public\.platform_test_tenant_mark_requests/);
});
