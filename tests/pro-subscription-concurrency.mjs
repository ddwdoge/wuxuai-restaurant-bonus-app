// LOCAL ONLY: run after pro-subscription-write-lock.sql in the disposable database.
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

const psql = "/opt/homebrew/opt/postgresql@17/bin/psql";
const args = ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", "55432", "-d", "wuxuai_subscription_lock_local"];
function query(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn(psql, args, { stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    let errors = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { errors += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(output.trim()) : reject(new Error(errors)));
    child.stdin.end(sql);
  });
}
const actor = "10000000-0000-4000-8000-000000000005";
const statement = `begin;
set local role authenticated;
set local test.actor='${actor}';
select public.start_restaurant_owner_trial('Parallel synthetic Owner','WUXUAI TEST ONLY concurrency')->'restaurant'->>'id';
select pg_sleep(0.15);
commit;`;
const results = await Promise.all([query(statement), query(statement), query(statement)]);
assert.equal(new Set(results).size, 1, "all three concurrent registrations resolve the same tenant");
const counts = await query(`select count(distinct r.id)||','||count(distinct b.id)||','||count(distinct s.id)
from public.restaurants r join public.branches b on b.restaurant_id=r.id
join public.branch_subscriptions s on s.branch_id=b.id where r.owner_id='${actor}';`);
assert.equal(counts, "1,1,1");
console.log("Onboarding concurrency: 2/2 PASS (three simultaneous requests; one tenant/branch/subscription)");
