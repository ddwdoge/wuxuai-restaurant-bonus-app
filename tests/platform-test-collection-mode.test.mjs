import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20261001002000_platform_admin_test_collection_mode.sql", import.meta.url),
  "utf8",
);
const rpc = migration.slice(migration.indexOf("create or replace function public.set_platform_test_collection_mode"));
const ownerRpc = readFileSync(
  new URL("../supabase/migrations/20260731001000_restaurant_controlled_points_collection.sql", import.meta.url),
  "utf8",
);

test("migration 190 is additive and keeps the existing owner settings RPC untouched", () => {
  assert.match(migration, /^-- Migration 190:/);
  assert.doesNotMatch(migration, /create or replace function public\.update_points_collection_settings/i);
  assert.doesNotMatch(migration, /\b(?:drop|truncate)\s+table\b|disable row level security/i);
  assert.match(ownerRpc, /create or replace function public\.update_points_collection_settings/);
  assert.match(rpc, /update public\.loyalty_settings settings\s+set points_collection_mode = input_target_mode/);
  const updateClause = rpc.match(/update public\.loyalty_settings settings([\s\S]*?)get diagnostics changed_rows/)?.[1] ?? "";
  assert.match(updateClause, /^\s*set points_collection_mode = input_target_mode\s+where/);
  assert.doesNotMatch(updateClause.split(/\bwhere\b/i)[0], /points_collection_max_amount_cents|amount_per_point|stamps_required|active/i);
});

test("the canonical live-session, verified-factor, AAL2 and recent-TOTP helpers are reused", () => {
  assert.match(rpc, /current_platform_role\(\)/);
  assert.match(rpc, /role_value in \('platform_owner', 'platform_admin'\)/);
  assert.match(rpc, /require_recent_platform_auth_internal\(\)/);
  assert.match(rpc, /auth\.jwt\(\)->>'session_id'/);
  assert.doesNotMatch(migration, /service[_ ]?role.{0,80}(?:grant|bypass)/i);
});

test("only the exact two-way temporary TEST_ONLY transition is accepted", () => {
  assert.match(rpc, /input_expected_current_mode = 'restaurant_controlled_only' and input_target_mode = 'both'/);
  assert.match(rpc, /input_expected_current_mode = 'both' and input_target_mode = 'restaurant_controlled_only'/);
  assert.match(rpc, /input_action_code is distinct from 'TEST_ONLY_PRO_REWARD_FLOW'/);
  assert.match(rpc, /PLATFORM_TEST_COLLECTION_MODE_TRANSITION_INVALID/);
  assert.doesNotMatch(rpc, /input_target_mode\s*=\s*'customer_initiated_only'/);
});

test("the tenant binding is exact, active, synthetic and Staging-only", () => {
  assert.match(rpc, /from public\.platform_test_tenant_registry[\s\S]*for share/);
  assert.match(rpc, /marker_record\.organization_id is distinct from restaurant_record\.organization_id/);
  assert.match(rpc, /marker_record\.owner_user_id is distinct from restaurant_record\.owner_id/);
  assert.match(rpc, /marker_record\.restaurant_name is distinct from restaurant_record\.name/);
  assert.match(rpc, /environment\.singleton and environment\.environment = 'STAGING'/);
  assert.match(rpc, /EXPLICIT_SYNTHETIC_TEST_TENANT_NAME_REQUIRED/);
});

test("row locks, expected mode and full-row postcondition preserve every other setting", () => {
  assert.match(rpc, /from public\.loyalty_settings settings[\s\S]*for update/);
  assert.match(rpc, /points_collection_mode is distinct from input_expected_current_mode/);
  assert.match(rpc, /to_jsonb\(settings_record\) - 'points_collection_mode'/);
  assert.match(rpc, /to_jsonb\(settings_after\) - 'points_collection_mode'/);
  assert.match(rpc, /after_without_mode is distinct from before_without_mode/);
  assert.match(rpc, /changed_rows <> 1/);
});

test("append-only audit is the idempotency receipt and contains no credentials", () => {
  assert.match(migration, /create table if not exists public\.platform_test_collection_mode_audit/);
  for (const field of [
    "idempotency_key", "actor_id", "actor_role", "tenant_id", "organization_id",
    "loyalty_settings_id", "previous_mode", "new_mode", "action_code", "status",
    "policy_version", "payload_hash", "session_fingerprint", "created_at",
  ]) assert.match(migration, new RegExp(`\\b${field}\\b`));
  assert.match(migration, /before update or delete on public\.platform_test_collection_mode_audit/);
  assert.match(migration, /before truncate on public\.platform_test_collection_mode_audit/);
  assert.match(rpc, /PLATFORM_TEST_COLLECTION_MODE_IDEMPOTENCY_CONFLICT/);
  assert.match(rpc, /prior_audit\.result \|\| jsonb_build_object\('idempotent', true\)/);
  assert.doesNotMatch(migration, /\b(?:email|totp_code|access_token|refresh_token|session_id)\s+(?:text|jsonb)/i);
});

test("ACL exposes only the guarded RPC to authenticated callers", () => {
  assert.match(migration, /revoke all on table public\.platform_test_collection_mode_audit[\s\S]*public, anon, authenticated, service_role/);
  assert.match(migration, /revoke all on function public\.set_platform_test_collection_mode\([\s\S]*service_role/);
  assert.match(migration, /grant execute on function public\.set_platform_test_collection_mode\([\s\S]*to authenticated/);
  assert.match(rpc, /security definer/);
  assert.match(rpc, /set search_path = pg_catalog, public, extensions, pg_temp/);
  assert.doesNotMatch(rpc, /execute\s+format|execute\s+input_/i);
});
