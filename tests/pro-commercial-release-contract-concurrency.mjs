import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";

const database = process.env.WUXUAI_PRO_LOCK_LOCAL_DB;
const port = process.env.WUXUAI_PRO_LOCK_LOCAL_PORT;
const psql = "/opt/homebrew/opt/postgresql@17/bin/psql";
const actor = "73000000-0000-4000-8000-000000000090";

function query(sql, { allowFailure = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(psql, [
      "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
      "-h", "127.0.0.1", "-p", port, "-d", database,
    ], { stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    let error = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { error += chunk; });
    child.on("error", reject);
    child.on("close", (status) => {
      if (status === 0 || allowFailure) resolve({ status, output, error });
      else reject(new Error(error));
    });
    child.stdin.end(sql);
  });
}

function authenticated(statement) {
  return `
    set role authenticated;
    set test.actor='${actor}';
    set test.platform_role='platform_admin';
    select set_config('test.jwt',jsonb_build_object(
      'sub','${actor}','session_id',gen_random_uuid()::text,
      'auth_time',extract(epoch from clock_timestamp())::bigint
    )::text,false);
    ${statement}`;
}

test("country release and pilot grants serialize idempotently under concurrency", async () => {
  assert.ok(database && port, "isolated local database and port are required");
  const countryRequest = "73000000-0000-4000-8000-000000000120";
  const release = authenticated(`select public.set_platform_commercial_pro_country_release(
    'DE',true,'Synthetic parallel country release','PRO DE FREIGEBEN','${countryRequest}'
  );`);
  const releases = await Promise.all(Array.from({ length: 12 }, () => query(release)));
  assert.ok(releases.every((result) => result.status === 0));
  assert.equal((await query(`select count(*) from public.commercial_pro_access_audit
    where request_id='${countryRequest}';`)).output.trim(), "1");
  assert.equal((await query(`select release_state from public.commercial_plan_release_policy
    where country_code='DE' and plan_key='PRO';`)).output.trim(), "RELEASED");

  const grantRequest = "73000000-0000-4000-8000-000000000121";
  const grant = authenticated(`select public.set_platform_commercial_pro_access(
    '73000000-0000-4000-8000-000000000021','REAL_BUSINESS_PILOT','GRANT',
    date_trunc('minute',statement_timestamp()),
    date_trunc('minute',statement_timestamp())+interval '30 days',
    'Synthetic parallel pilot grant',
    'PRO PILOT DE Unmarked Bistro FREIGEBEN','${grantRequest}'
  );`);
  const grants = await Promise.all(Array.from({ length: 12 }, () => query(grant)));
  assert.ok(grants.every((result) => result.status === 0));
  assert.equal((await query(`select count(*) from public.commercial_pro_access_audit
    where request_id='${grantRequest}';`)).output.trim(), "1");
  assert.equal((await query(`select count(*) from public.commercial_pro_access_grants
    where request_id='${grantRequest}';`)).output.trim(), "1");
  assert.equal((await query(`select public.resolve_restaurant_entitlements_internal(
    '73000000-0000-4000-8000-000000000021')->>'plan_key';`)).output.trim(), "PRO");
});
