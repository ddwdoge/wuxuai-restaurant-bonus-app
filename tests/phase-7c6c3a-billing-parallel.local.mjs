import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

const container = 'supabase_db_wuxuai-phase7b4d-local';
const eventId = `evt_${randomUUID().replaceAll('-', '')}`;
const subscriptionId = `sub_${randomUUID().replaceAll('-', '')}`;
const call = `begin;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select public.record_local_fake_billing_webhook('${eventId}',repeat('a',64),
  'customer.subscription.created','2026-09-24T12:00:00Z','${subscriptionId}',null,'LOCAL_FAKE_ACCOUNT',false);
commit;`;

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

const responses = await Promise.all(Array.from({ length: 24 }, () => sql(call)));
assert.equal(responses.filter((x) => x.includes('"replay": false')).length, 1);
assert.equal(responses.filter((x) => x.includes('"replay": true')).length, 23);
const count = await sql(`select count(*) from public.billing_test_webhook_inbox where event_id='${eventId}';`);
assert.equal(count.trim(), '1');
console.log('LOCAL_FAKE_WEBHOOK_PARALLEL_24_PASS; ONE_INBOX_ROW; ZERO_PRODUCT_WRITES');
