// Disposable local simulation of the guarded STAGING + TEST_ONLY contract.
// It never contacts a hosted project and never changes real AT policies.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

assert.equal(process.env.ALLOW_LOCAL_AT_LEGAL_TESTS, '1');
const container = 'supabase_db_wuxuai-at-legal-194-local';
const host = !process.env.DOCKER_CONTEXT && process.env.DOCKER_HOST
  ? process.env.DOCKER_HOST
  : execFileSync('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'], { encoding: 'utf8' }).trim();
assert.ok(host.startsWith('unix://'));
const ports = JSON.parse(execFileSync('docker', ['inspect', '--format', '{{json .NetworkSettings.Ports}}', container], { encoding: 'utf8' }));
assert.ok(ports['5432/tcp'].every((port) => port.HostPort === '59422'));
const args = ['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq'];
const sql = (input) => execFileSync('docker', args, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000 }).trim();
const parallelSql = (input) => new Promise((resolve, reject) => {
  const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '', error = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { error += chunk; });
  child.on('error', reject);
  child.on('close', (code) => code === 0 ? resolve(output.trim()) : reject(new Error(error)));
  child.stdin.end(input);
});
const id = (n) => `70000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const quote = (s) => `'${String(s).replaceAll("'", "''")}'`;
const json = (s) => `${quote(JSON.stringify(s))}::jsonb`;
const claims = (who = id(1)) => quote(JSON.stringify({
  sub: who, role: 'authenticated', aal: 'aal2', session_id: id(31),
  amr: [{ method: 'totp', timestamp: Math.floor(Date.now() / 1000) }],
}));
const adminPrefix = `set role authenticated; set request.jwt.claims=${claims()};`;
const admin = (query) => sql(adminPrefix + query);
const result = (output) => JSON.parse(output.split('\n').at(-1));
let assertions = 0;
const equal = (actual, expected) => { assert.deepEqual(actual, expected); assertions++; };
const denied = (query, prefix = adminPrefix, match = /AT_LEGAL_TEST_|RECENT_PLATFORM_TOTP_REQUIRED|permission denied/) => {
  let error;
  try { sql(prefix + query); } catch (caught) { error = caught; }
  assert.ok(error, 'unexpectedly accepted');
  assert.match(String(error.stderr ?? error.message), match);
  assertions++;
};
const sha = (value) => createHash('sha256').update(value, 'utf8').digest('hex');
const area = (name, version) => {
  const body = `TEST ONLY: synthetic ${name} ${version}; no legal approval or real customer data.`;
  return { version, body, sha256: sha(body), source: 'TEST_ONLY_LOCAL_CONTRACT', status: 'VERIFIED_TEST_ONLY' };
};
const manifest = (version = 'TEST_ONLY_V01') => ({
  schema_version: 1, test_only: true, restaurant_id: id(3), country: 'AT', locale: 'de-AT',
  legal: area('legal', version), privacy: area('privacy', version),
  document_catalog: area('document catalog', version), retention: area('retention', version),
});
const publish = ({ action = 'PUBLISH_TEST', data = manifest(), status = 'NOT_FOUND',
  priorHash = null, key = id(500), tenant = id(3) } = {}) =>
  `select public.set_platform_at_legal_synthetic_test_publication('${tenant}',${quote(action)},
    ${data === null ? 'null' : json(data)},${quote(status)},
    ${priorHash === null ? 'null' : quote(priorHash)},'${key}');`;
const consent = (hash, key = id(510), tenant = id(3)) =>
  `select public.record_platform_at_legal_synthetic_test_consent(
    '${tenant}','${id(600)}',${quote(hash)},'${key}');`;
const status = () => result(admin(`select public.get_platform_at_legal_synthetic_test_status('${id(3)}');`));
equal(sql('select count(*) from supabase_migrations.schema_migrations'), '195');
const realPolicyBefore = sql("select to_jsonb(p)::text from public.country_kyb_intake_policies p where country_code='AT'");
sql(`begin;${readFileSync(new URL('at-legal-bundle-fixture.local.sql', import.meta.url), 'utf8')}commit;`);
denied(publish());
sql(`update public.business_verification_environment set environment='STAGING',
  change_ref='TEST_ONLY_LOCAL_194' where singleton;
  insert into public.platform_test_tenant_registry(
    restaurant_id,restaurant_name,organization_id,owner_user_id,test_session_id,marked_by)
  values('${id(3)}','SYNTHETIC LEGAL GATE','${id(2)}','${id(1)}',
    'TEST_ONLY_LOCAL_AT_LEGAL_194','${id(1)}');`);
equal(status().status, 'NOT_FOUND');
denied(publish({ data: { ...manifest(), retention: { ...manifest().retention, status: 'VERIFIED' } } }),
  adminPrefix, /AT_LEGAL_TEST_AREA_INVALID_RETENTION/);
denied(publish({ data: { ...manifest(), restaurant_id: id(999) } }),
  adminPrefix, /AT_LEGAL_TEST_TENANT_MISMATCH/);
denied(publish(), 'set role anon;', /LEGAL_BUNDLE_ACCESS_DENIED|RECENT_PLATFORM_TOTP_REQUIRED|permission denied/);
denied(publish(), `set role authenticated; set request.jwt.claims=${claims(id(43))};`,
  /LEGAL_BUNDLE_ACCESS_DENIED|RECENT_PLATFORM_TOTP_REQUIRED/);
denied(publish({ status: 'PUBLISHED_TEST' }));
const first = result(admin(publish()));
equal(first.status, 'PUBLISHED_TEST');
equal(first.test_only, true);
equal(result(admin(publish())).idempotent, true);
equal(status().bundle_hash, first.bundle_hash);
for (const name of ['legal', 'privacy', 'document_catalog', 'retention']) {
  equal(status().areas[name].status, 'VERIFIED_TEST_ONLY');
}
equal(sql('select count(*) from public.legal_bundle_publication_events'), '0');
equal(sql(`select public.restaurant_legal_bundle_is_current('${id(3)}')`), 'f');
denied(consent('f'.repeat(64)), adminPrefix, /AT_LEGAL_TEST_BUNDLE_STALE/);
const concurrent = await Promise.all(Array.from({ length: 8 }, () =>
  parallelSql(adminPrefix + consent(first.bundle_hash))));
equal(concurrent.length, 8);
equal(concurrent.map((output) => result(output).bundle_id), Array(8).fill(first.bundle_id));
equal(concurrent.filter((output) => result(output).idempotent === false).length, 1);
equal(sql('select count(*) from public.at_legal_synthetic_test_consent_receipts'), '1');
equal(result(admin(`select public.get_platform_at_legal_synthetic_test_receipt('${id(510)}');`)).found, true);
denied(`select * from public.at_legal_synthetic_test_publications`, 'set role authenticated;');
denied(`select * from public.at_legal_synthetic_test_consent_receipts`, 'set role anon;');
denied('update public.at_legal_synthetic_test_publications set created_at=now()', '',
  /LEGAL_BUNDLE_APPEND_ONLY/);
const withdrawn = result(admin(publish({
  action: 'WITHDRAW_TEST', data: null, status: 'PUBLISHED_TEST',
  priorHash: first.bundle_hash, key: id(520),
})));
equal(withdrawn.status, 'WITHDRAWN_TEST');
denied(consent(first.bundle_hash, id(511)), adminPrefix, /AT_LEGAL_TEST_BUNDLE_STALE/);
denied(publish({ status: 'WITHDRAWN_TEST', priorHash: 'f'.repeat(64), key: id(521) }));
const second = result(admin(publish({
  data: manifest('TEST_ONLY_V02'), status: 'WITHDRAWN_TEST',
  priorHash: first.bundle_hash, key: id(522),
})));
assert.notEqual(second.bundle_hash, first.bundle_hash); assertions++;
denied(consent(first.bundle_hash, id(512)), adminPrefix, /AT_LEGAL_TEST_BUNDLE_STALE/);
equal(result(admin(consent(second.bundle_hash, id(513)))).test_only, true);
result(admin(publish({
  action: 'WITHDRAW_TEST', data: null, status: 'PUBLISHED_TEST',
  priorHash: second.bundle_hash, key: id(523),
})));
equal(status().status, 'WITHDRAWN_TEST');
equal(sql("select to_jsonb(p)::text from public.country_kyb_intake_policies p where country_code='AT'"), realPolicyBefore);
for (const table of ['customers', 'points_transactions', 'customer_rewards', 'customer_account_memberships']) {
  equal(sql(`select count(*) from public.${table}`), '0');
}
console.log(JSON.stringify({ status: 'PASS', assertions, test_only: true, real_intake: 'BLOCKED', business_writes: 0, cloud_requests: 0 }));
