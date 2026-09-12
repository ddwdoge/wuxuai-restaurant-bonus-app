import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260911007000_platform_admin_health_center_read_model.sql", import.meta.url), "utf8");

test("07000 creates exactly one read-only Health Center RPC", () => {
  assert.equal((migration.match(/create or replace function/gi) ?? []).length, 1);
  assert.match(migration, /create or replace function public\.get_platform_health_center\(\)/);
  assert.match(migration, /language plpgsql[\s\S]*stable[\s\S]*security definer/);
  assert.match(migration, /set search_path = pg_catalog, public, pg_temp/);
  assert.doesNotMatch(migration, /create\s+(table|view|trigger)|alter\s+table|drop\s+(table|view|trigger)/i);
  assert.doesNotMatch(migration, /\binsert\s+into\b|\bupdate\s+public\.|\bdelete\s+from\b|\btruncate\b/i);
  assert.doesNotMatch(migration, /create\s+policy|drop\s+policy|row\s+level\s+security/i);
});

test("RPC blocks every non-Platform identity server-side and exposes a minimal grant", () => {
  assert.match(migration, /auth\.uid\(\) is null or coalesce\(public\.is_platform_admin\(\), false\) is not true/);
  assert.match(migration, /errcode = '42501'/);
  assert.match(migration, /revoke execute[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute[\s\S]*to authenticated/);
  assert.doesNotMatch(migration, /service[_-]?role|auth\.jwt|user_metadata|app_metadata/i);
});

test("snapshot composes existing authoritative evidence in one stable call", () => {
  for (const source of [
    "get_platform_restaurants",
    "get_platform_operational_telemetry",
    "get_platform_country_launch_status",
    "get_platform_restaurant_control_center",
    "get_platform_restaurant_legal_i18n_status",
    "get_restaurant_entitlements",
  ]) assert.match(migration, new RegExp(`public\\.${source}\\(`));
  assert.match(migration, /checked_at_value timestamptz := statement_timestamp\(\)/);
  assert.match(migration, /'claim', 'snapshot_at_request_time'/);
  assert.match(migration, /'automatic_refresh', false/);
  assert.match(migration, /'first_seen_status', 'unavailable'/);
});

test("KPI totals are calculated from the exact returned finding snapshot", () => {
  for (const [field, severity] of [["critical", "P0"], ["errors", "P1"], ["warnings", "P2"], ["notices", "P3"]]) {
    assert.match(migration, new RegExp(`'${field}', \\(select count\\(\\*\\) from jsonb_array_elements\\(findings_value\\) item where item->>'severity' = '${severity}'\\)`));
  }
  assert.match(migration, /'findings', findings_value/);
  assert.match(migration, /'restaurant_targets', targets_value/);
});

test("response avoids direct identity, credential and diagnostic-secret fields", () => {
  assert.doesNotMatch(migration, /owner_email|customer_email|phone|auth_user|access_token|refresh_token|token_hash|pin_hash|password|provider_message_id|stacktrace|stack_trace/i);
  assert.match(migration, /jsonb_strip_nulls/);
  assert.match(migration, /'restaurant_name'/);
  assert.match(migration, /'location_id'/);
});

test("findings are evidence-based and never auto-repair", () => {
  for (const type of [
    "ONBOARDING_INCOMPLETE", "ACTIVE_LOCATION_MISSING", "SUBSCRIPTION_MISSING",
    "LEGAL_JURISDICTION_UNAVAILABLE", "PLAN_OVERRIDE_INVALID",
    "BASIC_OFFER_LIMIT_EXCEEDED", "DAILY_PIN_UNAVAILABLE", "QR_FLOW_UNAVAILABLE",
    "COUNTRY_LIVE_WITHOUT_READINESS",
  ]) assert.match(migration, new RegExp(type));
  assert.match(migration, /'type', 'SYSTEM_' \|\| upper\(system_key\)/);
  assert.match(migration, /key in \('cron', 'email', 'registration'\)/);
  assert.doesNotMatch(migration, /auto_?repair|fix_all|activate_country|set_platform_restaurant_plan_override/i);
});
