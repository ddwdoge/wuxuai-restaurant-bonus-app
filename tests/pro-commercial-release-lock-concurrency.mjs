import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";

const database = process.env.WUXUAI_PRO_LOCK_LOCAL_DB;
const port = process.env.WUXUAI_PRO_LOCK_LOCAL_PORT;
const psql = "/opt/homebrew/opt/postgresql@17/bin/psql";

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

test("parallel Platform Admin requests cannot race the closed commercial lock", async () => {
  assert.ok(database && port, "isolated local database and port are required");
  const statement = `
    set role authenticated;
    set test.actor='71000000-0000-4000-8000-000000000099';
    set test.platform_role='platform_admin';
    select public.set_platform_restaurant_plan_override(
      '71000000-0000-4000-8000-000000000001','PRO',now()+interval '1 month',
      'Synthetic parallel lock test','CONFIRMED',gen_random_uuid(),null
    );`;
  const results = await Promise.all(
    Array.from({ length: 12 }, () => query(statement, { allowFailure: true })),
  );
  assert.ok(results.every((result) => result.status !== 0));
  assert.ok(results.every((result) => result.error.includes("PRO_COMMERCIAL_RELEASE_LOCKED")));

  const effective = await query(`
    reset role;
    select public.resolve_restaurant_entitlements_internal(
      '71000000-0000-4000-8000-000000000001'
    )->>'plan_key';`);
  assert.equal(effective.output.trim(), "BASIC");

  const writes = await query(`select count(*) from public.platform_admin_operations;`);
  assert.equal(writes.output.trim(), "0");
});
