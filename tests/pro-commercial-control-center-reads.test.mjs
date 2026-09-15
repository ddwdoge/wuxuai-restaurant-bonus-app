import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260915002000_pro_commercial_control_center_reads.sql", import.meta.url),
  "utf8",
);

const rpcNames = [
  "get_platform_pro_country_status",
  "get_platform_pro_entitlements",
  "search_platform_pro_real_businesses",
  "get_platform_pro_test_only_businesses",
  "get_platform_pro_commercial_audit",
];

test("control-center migration is additive and read-only", () => {
  assert.match(migration, /^-- Phase 7B\.3A:/);
  assert.doesNotMatch(migration, /\b(?:insert|update|delete|truncate)\s+(?:into\s+|from\s+)?public\./i);
  assert.doesNotMatch(migration, /\b(?:alter|drop)\s+table\b/i);
  assert.doesNotMatch(migration, /set_platform_commercial_pro_(?:country_release|access)\s*\(/i);
  assert.doesNotMatch(migration, /stripe_customer_id|stripe_subscription_id|email|phone|password|token|hash/i);
});

test("every public read RPC is role checked, fixed-path and read stable", () => {
  for (const name of rpcNames) {
    const start = migration.indexOf(`create or replace function public.${name}`);
    assert.ok(start >= 0, `${name} exists`);
    const next = migration.indexOf("create or replace function public.", start + 30);
    const body = migration.slice(start, next < 0 ? migration.length : next);
    assert.match(body, /security definer/i);
    assert.match(body, /set search_path = pg_catalog, public, pg_temp/i);
    assert.match(body, /stable/i);
    assert.match(body, /platform_pro_control_center_reader_internal\(\)/i);
  }
  assert.match(migration, /current_platform_role\(\) in \('platform_owner', 'platform_admin'\)/);
});

test("RPC grants expose only authenticated entry points", () => {
  for (const name of rpcNames) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${name}\\([\\s\\S]*?from public, anon, authenticated, service_role`, "i"));
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}\\([\\s\\S]*?to authenticated`, "i"));
  }
  assert.match(migration, /revoke all on function public\.platform_pro_control_center_reader_internal\(\)[\s\S]*service_role/);
  assert.doesNotMatch(migration, /grant execute[\s\S]*to (?:anon|public|service_role)/i);
});

test("country status includes audit provenance readiness and typed active counts", () => {
  for (const field of [
    "country_code", "release_state", "effective_from", "last_changed_at",
    "last_actor_id", "last_actor_role", "last_reason", "readiness",
    "active_paid_count", "active_trial_count", "active_pilot_count",
    "active_test_only_count", "active_entitlement_count",
  ]) assert.match(migration, new RegExp(field));
  assert.match(migration, /COUNTRY_PRO_RELEASED', 'COUNTRY_PRO_LOCKED/);
});

test("entitlement inventory classifies every lifecycle and paginates deterministically", () => {
  for (const state of ["active", "expired", "revoked", "scheduled"]) {
    assert.match(migration, new RegExp(`'${state}'`));
  }
  for (const type of ["paid", "trial", "pilot", "test_only"]) {
    assert.match(migration, new RegExp(`'${type}'`));
  }
  assert.match(migration, /least\(greatest\(coalesce\(input_limit, 50\), 1\), 100\)/);
  assert.match(migration, /order by expires_at desc nulls last, grant_type, grant_id/);
  assert.match(migration, /strpos\(lower\(row_value\.organization_name\), search_value\)/);
});

test("real and TEST_ONLY searches use exact authoritative marker separation", () => {
  assert.match(migration, /where not exists \(select 1 from public\.platform_test_tenant_registry marker/);
  assert.match(migration, /from public\.platform_test_tenant_registry marker/);
  assert.match(migration, /marker\.organization_id = restaurant\.organization_id/);
  assert.match(migration, /marker\.restaurant_name = restaurant\.name/);
  assert.match(migration, /marker\.owner_user_id = restaurant\.owner_id/);
  assert.match(migration, /marker\.deleted_at is null/);
  assert.doesNotMatch(migration, /(?:name|slug).{0,30}(?:test_only|test tenant)/i);
});

test("commercial audit reads only immutable commercial audit history", () => {
  const start = migration.indexOf("create or replace function public.get_platform_pro_commercial_audit");
  const auditBody = migration.slice(start, migration.indexOf("revoke all on function", start));
  assert.match(auditBody, /from public\.commercial_pro_access_audit audit/);
  assert.doesNotMatch(auditBody, /from public\.audit_log/);
  for (const field of ["before_state", "after_state", "actor_id", "actor_role", "reason", "idempotency_reference", "result"]) {
    assert.match(auditBody, new RegExp(field));
  }
});
