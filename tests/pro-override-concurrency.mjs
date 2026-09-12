// LOCAL ONLY. A disposable clone of the synthetic local fixture, never a remote DB.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';

const bin = '/opt/homebrew/opt/postgresql@17/bin/';
const database = `pro_phase1c_concurrency_${process.pid}`;
const args = ['-h', '127.0.0.1', '-p', '55432'];
const env = { PATH: process.env.PATH, HOME: process.env.HOME, PGCONNECT_TIMEOUT: '5' };
function admin(tool, extra) {
  const result = spawnSync(bin + tool, [...args, ...extra], { env, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Local ${tool} failed`);
}
function query(sql, { allowFailure = false, onLocked } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin + 'psql', [...args, '-X', '-qAt', '-d', database, '-v', 'ON_ERROR_STOP=1'], { env });
    let output = '', error = '', notified = false;
    child.stdout.on('data', chunk => {
      output += chunk;
      if (!notified && output.includes('LOCK_HELD')) { notified = true; onLocked?.(); }
    });
    child.stderr.on('data', chunk => { error += chunk; });
    child.on('error', reject);
    child.on('close', status => status === 0 || allowFailure ? resolve({ status, output, error }) : reject(new Error('Local SQL failed: ' + error)));
    child.stdin.end(sql);
  });
}
const tenant = '20000000-0000-4000-8000-000000000002';
const branch = '20000000-0000-4000-8000-000000000003';
const actor = '20000000-0000-4000-8000-000000000001';
const expiry = new Date(Date.now() + 86400000).toISOString();
const key = n => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const activate = n => `public.set_platform_restaurant_plan_override('${tenant}','PRO','${expiry}','Concurrent isolated test','CONFIRMED','${key(n)}',null)`;
const end = (id, n) => `public.end_platform_restaurant_plan_override('${tenant}','${id}','Concurrent isolated end','CONFIRMED','${key(n)}')`;
admin('createdb', ['--template=postgres', database]);
try {
  await query(`
    create or replace function auth.uid() returns uuid language sql stable as $$select '${actor}'::uuid$$;
    create or replace function public.current_platform_role() returns text language sql stable as $$select 'platform_admin'::text$$;
    insert into auth.users(id) values ('${actor}');
    insert into public.restaurants(id) values ('${tenant}');
    insert into public.branches(id,restaurant_id) values ('${branch}','${tenant}');
    update public.restaurants set primary_branch_id='${branch}' where id='${tenant}';
    insert into public.branch_subscriptions(branch_id,plan_key,trial_started_at,trial_ends_at)
      values ('${branch}','BASIC',now()-interval '1 day',now()+interval '1 month');
  `);
  const grants = await Promise.all([query(`select ${activate(21)}->>'idempotent';`), query(`select ${activate(21)}->>'idempotent';`)]);
  assert.deepEqual(grants.map(r => r.output.trim()).sort(), ['false', 'true']);
  assert.equal((await query(`select count(*) from public.platform_admin_operations where tenant_id='${tenant}';`)).output.trim(), '1');
  console.log('PASS: simultaneous identical activations produce one audit operation');
  const previous = (await query(`select public.resolve_restaurant_entitlements_internal('${tenant}')#>>'{override,id}';`)).output.trim();

  let release;
  const locked = new Promise(resolve => { release = resolve; });
  const replacement = query(`begin; select ${activate(22)}->>'success'; select 'LOCK_HELD'; select pg_sleep(0.6); commit;`, { onLocked: release });
  // Wait for a real transaction holding the tenant lock before the competing end.
  await Promise.race([locked, replacement.then(() => { throw new Error('No lock evidence'); })]);
  const staleEnd = query(`select ${end(previous, 23)};`, { allowFailure: true });
  const [, rejected] = await Promise.all([replacement, staleEnd]);
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.error, /OVERRIDE_CHANGED_REFRESH_REQUIRED/);
  assert.equal((await query(`select public.resolve_restaurant_entitlements_internal('${tenant}')->>'plan_key';`)).output.trim(), 'PRO');
  console.log('PASS: queued stale termination cannot remove a replacement grant');

  const current = (await query(`select public.resolve_restaurant_entitlements_internal('${tenant}')#>>'{override,id}';`)).output.trim();
  const ended = await Promise.all([query(`select ${end(current, 24)}->>'idempotent';`), query(`select ${end(current, 24)}->>'idempotent';`)]);
  assert.deepEqual(ended.map(r => r.output.trim()).sort(), ['false', 'true']);
  assert.equal((await query(`select count(*) from public.platform_admin_operations where tenant_id='${tenant}' and action_type='PLAN_OVERRIDE_ENDED';`)).output.trim(), '1');
  assert.equal((await query(`select public.resolve_restaurant_entitlements_internal('${tenant}')->>'plan_key';`)).output.trim(), 'BASIC');
  console.log('PASS: concurrent identical terminations create one audit and restore BASIC');
} finally {
  admin('dropdb', [database]);
  console.log('Disposable local test database removed');
}
