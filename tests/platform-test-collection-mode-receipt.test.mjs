import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20261001003000_platform_admin_test_collection_mode_receipt.sql", import.meta.url), "utf8");
const rpc = migration.slice(migration.indexOf("create or replace function public.get_platform_test_collection_mode_receipt"));

test("receipt RPC is one actor-bound read for one known Migration-190 request", () => {
  assert.match(rpc, /input_tenant_id uuid,[\s\S]*input_idempotency_key uuid,[\s\S]*input_expected_previous_mode text,[\s\S]*input_expected_new_mode text/);
  assert.match(rpc, /audit\.idempotency_key = input_idempotency_key/);
  assert.match(rpc, /audit\.tenant_id = input_tenant_id/);
  assert.match(rpc, /audit\.actor_id = actor_id_value/);
  assert.match(rpc, /audit\.action_code = 'TEST_ONLY_PRO_REWARD_FLOW'/);
  assert.doesNotMatch(rpc, /input_(?:from|to|limit|offset|actor)/i);
  assert.doesNotMatch(rpc, /order by|jsonb_agg|array_agg/i);
});

test("receipt RPC reuses Platform AAL2, verified TOTP and recent proof boundaries", () => {
  assert.match(rpc, /public\.current_platform_role\(\)/);
  assert.match(rpc, /role_value in \('platform_owner', 'platform_admin'\)/);
  assert.match(rpc, /perform public\.require_recent_platform_auth_internal\(\)/);
  assert.match(rpc, /ACTIVE_TEST_ONLY_MARKER_REQUIRED/);
  assert.match(rpc, /TEST_ONLY_MARKER_IDENTITY_MISMATCH/);
  assert.match(rpc, /TEST_ONLY_OWNER_OR_ORGANIZATION_INVALID/);
  assert.match(rpc, /PLATFORM_TEST_COLLECTION_MODE_STAGING_REQUIRED/);
  assert.match(rpc, /EXPLICIT_SYNTHETIC_TEST_TENANT_NAME_REQUIRED/);
});

test("minimal response excludes idempotency, actor, session and internal audit data", () => {
  for (const field of [
    "found", "receipt_id", "tenant_id", "action_code", "previous_mode",
    "new_mode", "committed_at", "status", "current_collection_mode",
  ]) assert.match(rpc, new RegExp(`'${field}'`));
  assert.doesNotMatch(rpc, /'idempotency_key'|'actor_id'|'actor_role'|'organization_id'|'loyalty_settings_id'|'payload_hash'|'session_fingerprint'|'result'/);
  assert.doesNotMatch(rpc, /email|access_token|refresh_token|totp_code|user_agent|ip_address/i);
});

test("unknown and foreign receipts reveal only found=false and current mode", () => {
  const notFound = rpc.slice(rpc.indexOf("if receipt_record.id is null"), rpc.indexOf("if receipt_record.previous_mode"));
  const notFoundPayload = notFound.slice(notFound.indexOf("return jsonb_build_object"));
  assert.match(notFound, /'found', false/);
  assert.match(notFound, /'tenant_id', restaurant_record\.id/);
  assert.match(notFound, /'current_collection_mode', settings_record\.points_collection_mode/);
  assert.doesNotMatch(notFoundPayload, /receipt_record\.(?:actor_id|created_at|previous_mode|new_mode)/);
  assert.match(rpc, /PLATFORM_TEST_COLLECTION_MODE_RECEIPT_PAYLOAD_CONFLICT/);
});

test("ACL preserves direct audit-table denial and exposes only the guarded receipt RPC", () => {
  assert.match(rpc, /security definer/);
  assert.match(rpc, /set search_path = pg_catalog, public, pg_temp/);
  assert.match(migration, /revoke all on function public\.get_platform_test_collection_mode_receipt\([\s\S]*public, anon, authenticated, service_role/);
  assert.match(migration, /grant execute on function public\.get_platform_test_collection_mode_receipt\([\s\S]*to authenticated/);
  assert.doesNotMatch(migration, /grant\s+select|alter table public\.platform_test_collection_mode_audit|create policy/i);
  assert.doesNotMatch(rpc, /\binsert\b|\bupdate\b|\bdelete\b|\btruncate\b|execute\s+format/i);
});
