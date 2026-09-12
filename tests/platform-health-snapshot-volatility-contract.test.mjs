import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const previousMigration = readFileSync(new URL(
  "../supabase/migrations/20260911007000_platform_admin_health_center_read_model.sql",
  import.meta.url,
), "utf8");
const migration = readFileSync(new URL(
  "../supabase/migrations/20260912001000_platform_health_snapshot_volatility_contract.sql",
  import.meta.url,
), "utf8");

test("12001000 replaces only the existing Health Center function", () => {
  assert.equal((migration.match(/create or replace function/gi) ?? []).length, 1);
  assert.match(migration, /create or replace function public\.get_platform_health_center\(\)/);
  assert.doesNotMatch(migration, /create\s+(table|view|trigger)|alter\s+table|drop\s+(table|view|trigger)/i);
  assert.doesNotMatch(migration, /\binsert\s+into\b|\bupdate\s+public\.|\bdelete\s+from\b|\btruncate\b/i);
  assert.doesNotMatch(migration, /create\s+policy|drop\s+policy|row\s+level\s+security/i);
});
test("the two existing VOLATILE RPCs are not called or redefined", () => {
  assert.doesNotMatch(migration, /get_platform_operational_telemetry/);
  assert.doesNotMatch(migration, /get_platform_country_launch_status/);
  assert.match(migration, /from public\.customer_transactional_email_deliveries/);
  assert.match(migration, /from public\.audit_log/);
  assert.match(migration, /from public\.country_launch_policy/);
  assert.match(migration, /left join public\.country_launch_readiness/);
});

test("operational and country evidence share one CTE snapshot", () => {
  assert.match(migration, /with expected_job_names[\s\S]*shared_snapshot as \(/);
  assert.match(migration, /select snapshot\.operational, snapshot\.countries[\s\S]*into operational_payload, country_payload[\s\S]*from shared_snapshot snapshot/);
  assert.match(migration, /checked_at_value timestamptz := statement_timestamp\(\)/);
  assert.match(migration, /language plpgsql[\s\S]*stable[\s\S]*security definer/);
});

test("status calculations preserve the previous telemetry contracts", () => {
  for (const value of [
    "expected_jobs_missing",
    "expected_jobs_disabled",
    "latest_known_run_failed",
    "recent_failures_present",
    "no_job_run_history",
    "failed_deliveries_present",
    "deliveries_waiting",
    "no_recent_delivery_events",
    "repeated_recent_registration_failures",
    "registration_failures_present",
    "no_recent_registration_events",
  ]) assert.match(migration, new RegExp(value));
  assert.match(migration, /count\(readiness\.check_key\) = 8/);
  assert.match(migration, /cardinality\(readiness\.document_version_refs\) > 0/);
});

test("finding and KPI behavior after source acquisition remains byte-identical", () => {
  const marker = "  for restaurant_value in\n";
  const previousSuffix = previousMigration.slice(previousMigration.indexOf(marker));
  const nextSuffix = migration.slice(migration.indexOf(marker));
  assert.ok(previousSuffix.length > 1_000);
  assert.equal(nextSuffix, previousSuffix);
});

test("server role, search path and minimal transport grant remain unchanged", () => {
  assert.match(migration, /auth\.uid\(\) is null or coalesce\(public\.is_platform_admin\(\), false\) is not true/);
  assert.match(migration, /set search_path = pg_catalog, public, pg_temp/);
  assert.match(migration, /revoke execute[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute[\s\S]*to authenticated/);
  assert.doesNotMatch(migration, /service[_-]?role|auth\.jwt|user_metadata|app_metadata/i);
});
