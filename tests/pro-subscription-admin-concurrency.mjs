// LOCAL ONLY: after pro-subscription-admin-request.sql.
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const args = ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', '55432', '-d', 'wuxuai_subscription_lock_local'];
function query(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn('/opt/homebrew/opt/postgresql@17/bin/psql', args, { stdio: ['pipe','pipe','pipe'] });
    let output = '', errors = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { errors += chunk; });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(output.trim()) : reject(new Error(errors)));
    child.stdin.end(sql);
  });
}
const target = await query("select id from public.restaurants where owner_id='10000000-0000-4000-8000-000000000002'");
assert.match(target, /^[a-f0-9-]{36}$/);
const before = await query(`select extract(epoch from trial_ends_at) from public.branch_subscriptions s join public.branches b on b.id=s.branch_id where b.restaurant_id='${target}'`);
const statement = `begin; set local role authenticated;
set local test.actor='10000000-0000-4000-8000-000000000004';
set local test.platform_role='platform_admin';
select public.update_platform_restaurant_subscription_confirmed('${target}',null,null,null,2,
'Synthetic concurrency request','CONFIRMED','20000000-0000-4000-8000-000000000003');
select pg_sleep(0.1); commit;`;
const results = await Promise.all([query(statement),query(statement),query(statement)]);
assert.equal(new Set(results).size,1);
const after = await query(`select extract(epoch from trial_ends_at) from public.branch_subscriptions s join public.branches b on b.id=s.branch_id where b.restaurant_id='${target}'`);
assert.equal(Number(after)-Number(before),2*86400);
assert.equal(await query("select count(*) from public.platform_admin_operations where idempotency_key='20000000-0000-4000-8000-000000000003'"),'1');
console.log('Subscription concurrency: 3/3 PASS; three retries, one extension and audit');
