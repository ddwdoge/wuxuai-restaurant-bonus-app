import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

const container = 'supabase_db_wuxuai-phase7b4d-local';
function sql(input) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres',
      '-X', '-qAt', '-v', 'ON_ERROR_STOP=1']);
    let output = '';
    let error = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { error += chunk; });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(output) : reject(new Error(error.replace(/\b[a-z]+_[A-Za-z0-9]{8,}\b/g, '[redacted]'))));
    child.stdin.end(input);
  });
}

const actor = randomUUID();
const requestId = randomUUID();
const setup = `begin;
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('${actor}','authenticated','authenticated','local-${actor}@example.invalid',now(),'{}','{}',now(),now());
set local role authenticated;
select set_config('request.jwt.claim.sub','${actor}',true);
select set_config('request.jwt.claim.role','authenticated',true);
select public.start_restaurant_owner_trial('Synthetic Parallel Owner','Local Only',null,'AT')->'restaurant'->>'id';
commit;`;
const tenant = (await sql(setup)).split('\n').map((x) => x.trim()).filter((x) => /^[0-9a-f-]{36}$/.test(x)).at(-1);
assert.ok(tenant);
const before = (await sql(`select md5(to_jsonb(s)::text) from public.branch_subscriptions s join public.branches b
  on b.id=s.branch_id where b.restaurant_id='${tenant}';`)).trim();
const call = `begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','${actor}',true);
select set_config('request.jwt.claim.role','authenticated',true);
select public.request_blocked_test_checkout('BASIC','${requestId}','/admin/settings/tarif-kapazitaet');
commit;`;
const responses = await Promise.all(Array.from({ length: 24 }, () => sql(call)));
assert.equal(new Set(responses.map((x) => x.match(/\{"status": "BLOCKED"[^\n]+/)?.[0])).size, 1);
const count = (await sql(`select count(*) from public.billing_checkout_blocked_requests
  where restaurant_id='${tenant}' and request_id='${requestId}';`)).trim();
assert.equal(count, '1');
const after = (await sql(`select md5(to_jsonb(s)::text) from public.branch_subscriptions s join public.branches b
  on b.id=s.branch_id where b.restaurant_id='${tenant}';`)).trim();
assert.equal(after, before);
console.log('LOCAL_BLOCKED_CHECKOUT_PARALLEL_24_PASS; ONE_AUDIT_ROW; ZERO_PROVIDER_ACTIONS; SUBSCRIPTION_BYTE_EQUAL');
