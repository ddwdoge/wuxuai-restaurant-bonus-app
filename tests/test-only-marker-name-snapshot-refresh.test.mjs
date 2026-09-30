import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260930001000_test_only_marker_name_snapshot_refresh.sql", import.meta.url),
  "utf8",
);

const rpc = migration.slice(migration.indexOf("create or replace function public.refresh_platform_test_tenant_marker_name_snapshot"));

test("migration 188 is additive and exposes one narrow snapshot refresh", () => {
  assert.match(migration, /^-- Migration 188:/);
  assert.doesNotMatch(migration, /\b(?:drop|truncate)\s+table\b|disable row level security/i);
  assert.match(migration, /create table if not exists public\.platform_test_tenant_marker_refresh_audit/);
  assert.match(rpc, /update public\.platform_test_tenant_registry marker\s+set restaurant_name = restaurant_record\.name/);
  assert.doesNotMatch(rpc, /update public\.(?:restaurants|organizations|restaurant_members|customers|customer_account_memberships|branch_subscriptions|commercial_pro_access_grants)/i);
  assert.doesNotMatch(rpc, /insert into public\.(?:commercial_pro_access_grants|customer_pro_in_app_notifications|branch_subscriptions)/i);
});

test("authorization reuses the live-session current-TOTP AAL2 and recent-TOTP gates", () => {
  assert.match(rpc, /current_platform_role\(\)/);
  assert.match(rpc, /role_value in \('platform_owner', 'platform_admin'\)/);
  assert.match(rpc, /require_recent_platform_auth_internal\(\)/);
  assert.match(rpc, /auth\.jwt\(\)->>'session_id'/);
  assert.match(rpc, /session_fingerprint_value := encode\(extensions\.digest/);
  assert.doesNotMatch(migration, /service[_ ]?role.{0,80}(?:grant|bypass)/i);
});

test("tenant identity, Staging and audited rename are exact fail-closed checks", () => {
  assert.match(rpc, /marker_record\.organization_id is distinct from restaurant_record\.organization_id/);
  assert.match(rpc, /marker_record\.owner_user_id is distinct from restaurant_record\.owner_id/);
  assert.match(rpc, /environment\.singleton and environment\.environment = 'STAGING'/);
  assert.match(rpc, /EXPLICIT_SYNTHETIC_TEST_TENANT_NAME_REQUIRED/);
  assert.match(rpc, /audit\.action = 'admin_restaurants_updated'/);
  assert.match(rpc, /audit\.target_table = 'restaurants'/);
  assert.match(rpc, /audit\.metadata->'old'->>'name' = marker_record\.restaurant_name/);
  assert.match(rpc, /audit\.metadata->'new'->>'name' = restaurant_record\.name/);
  assert.match(rpc, /audit\.created_at >= marker_record\.marked_at/);
});

test("expected snapshots, strong confirmation and locking prevent stale or parallel changes", () => {
  assert.match(rpc, /pg_advisory_xact_lock/);
  assert.match(rpc, /from public\.platform_test_tenant_registry[\s\S]*for update/);
  assert.match(rpc, /from public\.restaurants[\s\S]*for share/);
  assert.match(rpc, /restaurant_record\.name is distinct from input_expected_current_restaurant_name/);
  assert.match(rpc, /marker_record\.restaurant_name is distinct from input_expected_old_name_snapshot/);
  assert.match(rpc, /CONFIRMED:TEST_ONLY_NAME_SNAPSHOT_REFRESH:/);
  assert.match(rpc, /changed_rows <> 1/);
});

test("audit is append-only, privacy-safe and doubles as the idempotency receipt", () => {
  for (const field of [
    "marker_id", "tenant_id", "organization_id", "owner_user_id",
    "old_restaurant_name_snapshot", "new_restaurant_name_snapshot", "actor_id",
    "session_fingerprint", "reason_code", "policy_version", "payload_hash",
  ]) assert.match(migration, new RegExp(`\\b${field}\\b`));
  assert.match(migration, /before update or delete on public\.platform_test_tenant_marker_refresh_audit/);
  assert.match(migration, /before truncate on public\.platform_test_tenant_marker_refresh_audit/);
  assert.match(migration, /TEST_ONLY_MARKER_REFRESH_AUDIT_IMMUTABLE/);
  assert.match(rpc, /TEST_ONLY_MARKER_REFRESH_IDEMPOTENCY_CONFLICT/);
  assert.match(rpc, /'idempotent', true/);
  assert.doesNotMatch(migration, /\b(?:email|totp_code|access_token|refresh_token|session_id)\s+(?:text|jsonb)/i);
});

test("browser and generic service role have no direct marker-update or audit-table DML", () => {
  assert.match(migration, /revoke update on table public\.platform_test_tenant_registry[\s\S]*public, anon, authenticated, service_role/);
  assert.match(migration, /revoke all on table public\.platform_test_tenant_marker_refresh_audit[\s\S]*public, anon, authenticated, service_role/);
  assert.match(migration, /revoke all on function public\.refresh_platform_test_tenant_marker_name_snapshot\([\s\S]*service_role/);
  assert.match(migration, /grant execute on function public\.refresh_platform_test_tenant_marker_name_snapshot\([\s\S]*to authenticated/);
});

test("postcondition proves every marker field except the name snapshot stayed unchanged", () => {
  for (const field of ["organization_id", "owner_user_id", "test_session_id", "marked_by", "marked_at", "deleted_at"]) {
    assert.match(rpc, new RegExp(`marker\\.${field} = marker_record\\.${field}|marker\\.${field} is null`));
  }
});
