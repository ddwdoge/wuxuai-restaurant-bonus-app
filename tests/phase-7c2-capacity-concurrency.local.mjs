// Explicit opt-in local concurrency test; never invoked by npm test.
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { loadVerifiedLocalSupabaseTestTarget } from "./helpers/local-supabase-test-guard.mjs";

const run = promisify(execFile);
const root = new URL("../", import.meta.url);
const target = loadVerifiedLocalSupabaseTestTarget({ rootUrl: root });
const psql = "/opt/homebrew/opt/postgresql@17/bin/psql";
const args = [
  "-X", "-h", target.host, "-p", target.port, "-U", target.username,
  "-d", target.database, "-v", "ON_ERROR_STOP=1", "-Atq",
];
const env = { ...process.env, PGPASSWORD: target.password };
const sql = (statement) => execFileSync(psql, [...args, "-c", statement], {
  env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30_000,
}).trim();

const fingerprintQuery = `select jsonb_build_object(
  'plans',(select count(*) from commercial_capacity_plan_versions),
  'addons',(select count(*) from commercial_capacity_addon_versions),
  'entitlements',(select count(*) from restaurant_capacity_addon_entitlements),
  'restaurants',(select count(*) from restaurants),
  'customers',(select count(*) from customers),
  'offers',(select count(*) from restaurant_offers),
  'points',(select count(*) from points_transactions),
  'journal',(select count(*) from redemption_activity_journal)
)`;
const before = sql(fingerprintQuery);
const query = "select public.resolve_restaurant_capacity_internal('7c2fffff-ffff-4fff-8fff-ffffffffffff','2026-09-21 12:00+00')";
const results = await Promise.allSettled(Array.from({ length: 24 }, () =>
  run(psql, [...args, "-c", query], { env, timeout: 30_000, maxBuffer: 1024 * 1024 })
));

assert.equal(results.filter((result) => result.status === "rejected").length, 24);
for (const result of results) {
  assert.equal(result.status, "rejected");
  assert.match(String(result.reason.stderr), /RESTAURANT_NOT_FOUND/);
  assert.doesNotMatch(String(result.reason.stderr), /deadlock|timeout|serialization|lock/i);
}
assert.equal(sql(fingerprintQuery), before, "parallel read attempts must write nothing");
console.log("PHASE_7C2_PARALLEL_RESOLVER_PASS: 24 deterministic fail-closed reads; 0 writes");
