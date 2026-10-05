// Opt-in only: disposable, unlinked loopback PostgreSQL; all fixtures synthetic.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

assert.equal(process.env.ALLOW_LOCAL_AT_LEGAL_TESTS, '1');
const container = 'supabase_db_wuxuai-at-legal-194-local';
const host = !process.env.DOCKER_CONTEXT && process.env.DOCKER_HOST
  ? process.env.DOCKER_HOST
  : execFileSync('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'], { encoding: 'utf8' }).trim();
assert.ok(host.startsWith('unix://'), 'local Unix-socket Docker daemon required');
const ports = JSON.parse(execFileSync('docker', ['inspect', '--format', '{{json .NetworkSettings.Ports}}', container], { encoding: 'utf8' }));
assert.ok(ports['5432/tcp'].every((port) => port.HostPort === '59422'));
const sql = (input) => execFileSync('docker', ['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq'], {
  input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000,
}).trim();
const parallelSql = (input) => new Promise((resolve, reject) => {
  const child = spawn('docker', ['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let output = '', error = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { error += chunk; });
  child.on('error', reject);
  child.on('close', (code) => code === 0 ? resolve(output.trim()) : reject(new Error(error)));
  child.stdin.end(input);
});
const id = (n) => `70000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const quote = (s) => `'${String(s).replaceAll("'", "''")}'`;
const claims = (who = id(1)) => quote(JSON.stringify({
  sub: who, role: 'authenticated', aal: 'aal2', session_id: id(31),
  amr: [{ method: 'totp', timestamp: Math.floor(Date.now() / 1000) }],
}));
const admin = (query) => sql(`set role authenticated; set request.jwt.claims=${claims()}; ${query}`);
const anon = (query) => sql(`set role anon; ${query}`);
const result = (output) => JSON.parse(output.split('\n').at(-1));
let assertions = 0;
const equal = (actual, expected) => { assert.deepEqual(actual, expected); assertions++; };
const denied = (query, prefix = 'set role anon;', match = /CUSTOMER_LEGAL_|LEGAL_BUNDLE_|permission denied/) => {
  let error;
  try { sql(prefix + query); } catch (caught) { error = caught; }
  assert.ok(error, 'unexpectedly accepted');
  assert.match(String(error.stderr ?? error.message), match);
  assertions++;
};

equal(sql('select count(*) from supabase_migrations.schema_migrations'), '195');
equal(sql("select has_table_privilege('authenticated','public.customer_at_legal_consent_receipts','INSERT')"), 'f');
equal(sql("select has_function_privilege('anon','public.require_current_at_legal_bundle_internal(uuid,text)','EXECUTE')"), 'f');
sql(`begin;${readFileSync(new URL('at-legal-bundle-fixture.local.sql', import.meta.url), 'utf8')}commit;`);
equal(anon("select public.get_public_at_legal_bundle_identity('synthetic-legal-gate')"), '');
sql(`update public.country_kyb_intake_policies set real_intake_status='READY',
  legal_status='VERIFIED',privacy_status='VERIFIED',document_catalog_status='VERIFIED',
  retention_status='VERIFIED',change_ref='SYNTHETIC_LOCAL_194',updated_at=clock_timestamp()
  where country_code='AT';`);
sql(`insert into public.legal_operator_publication_decisions(
  restaurant_id,case_id,profile_revision_id,action,field_mapping_version,reason_code,
  redacted_reason,actor_id,aal2_verified_at,session_expires_at,auth_session_sha256,
  request_id,correlation_id)
  values('${id(3)}','${id(6)}','${id(7)}','APPROVED','AT_V1_LEGAL_OPERATOR_V1',
  'SYNTHETIC_MANUAL_REVIEW','Synthetic local approval fixture only','${id(1)}',
  clock_timestamp(),clock_timestamp()+interval '1 hour',repeat('c',64),'${id(80)}','${id(81)}');`);
const preflight = result(admin(`select public.get_platform_legal_bundle_preflight('${id(3)}');`));
equal(preflight.technical_status, 'READY');
const candidate = result(admin(`select public.get_platform_at_legal_bundle_control('${id(3)}');`)).candidate;
const snapshot = result(admin(`select public.create_platform_legal_bundle_snapshot(
  '${id(3)}','AT','de-AT','${candidate.terms.id}',${quote(candidate.terms.version)},
  ${quote(candidate.terms.sha256)},${quote(candidate.terms.status)},'${candidate.privacy.id}',
  ${quote(candidate.privacy.version)},${quote(candidate.privacy.sha256)},
  ${quote(candidate.privacy.status)},${quote(JSON.stringify(candidate.policy_revision))}::jsonb,'${id(100)}');`));
equal(snapshot.effective_status, 'READY');
const published = result(admin(`select public.set_platform_legal_bundle_publication(
  '${snapshot.bundle_id}','${snapshot.bundle_sha256}','publish','READY',true,
  'SYNTHETIC_LOCAL_194','${id(101)}');`));
equal(published.effective_status, 'PUBLISHED');
const identity = result(anon("select public.get_public_at_legal_bundle_identity('synthetic-legal-gate')"));
equal(identity.bundle_id, snapshot.bundle_id);
equal(identity.terms.id, id(10));
equal(identity.privacy.id, id(18));

// The local fixture deliberately crosses the production country lock only
// inside this disposable stack. No Staging or Production policy is modified.
sql(`begin; set local session_replication_role=replica;
  update public.restaurants set activation_status=null where id='${id(3)}';
  update public.branch_subscriptions set status='active',subscription_status='active'
    where branch_id='${id(4)}';
  insert into public.customers(
    id,restaurant_id,organization_id,branch_id,name,phone,normalized_phone,customer_code,
    is_test_customer,test_session_id)
    values('${id(60)}','${id(3)}','${id(2)}','${id(4)}','Synthetic Customer',
    '+430000000060','+430000000060','SYNTHETIC194',true,'LOCAL_AT_LEGAL_194');
  insert into public.customer_qr_tokens(restaurant_id,customer_id,organization_id,branch_id,token_hash)
    values('${id(3)}','${id(60)}','${id(2)}','${id(4)}',
      public.hash_public_token('synthetic-local-legal-token-194'));
  commit;`);
const accept = (bundle = snapshot.bundle_id, request = id(110)) =>
  `select public.accept_current_at_legal_documents('synthetic-legal-gate',
    'synthetic-local-legal-token-194',${quote(bundle)},'${request}');`;
denied(accept('bundle-' + 'f'.repeat(64)));
const accepted = result(anon(accept()));
equal(accepted.legal_receipt.bundle_id, snapshot.bundle_id);
equal(accepted.legal_receipt.idempotent, false);
equal(result(anon(accept())).legal_receipt.idempotent, true);
equal(sql(`select count(*) from public.customer_at_legal_consent_receipts
  where restaurant_id='${id(3)}'`), '1');
equal(sql(`select count(*) from public.customer_legal_acceptances
  where customer_id='${id(60)}' and at_legal_bundle_id='${snapshot.bundle_id}'`), '2');
const concurrent = await Promise.all(Array.from({ length: 8 }, () =>
  parallelSql(`set role anon; ${accept(snapshot.bundle_id, id(113))}`)));
equal(concurrent.length, 8);
equal(concurrent.map((output) => result(output).legal_receipt.request_id), Array(8).fill(id(113)));
equal(concurrent.filter((output) => result(output).legal_receipt.idempotent === false).length, 1);
equal(sql(`select count(*) from public.customer_at_legal_consent_receipts
  where request_id='${id(113)}'`), '1');
denied("select public.accept_current_legal_documents('synthetic-legal-gate','synthetic-local-legal-token-194','legal_center')");
denied(`select * from public.customer_at_legal_consent_receipts`);
denied(`update public.customer_at_legal_consent_receipts set accepted_at=now()`, '', /LEGAL_BUNDLE_APPEND_ONLY/);
denied(`select public.require_current_at_legal_bundle_internal('${id(999)}','${snapshot.bundle_id}')`,
  '', /CUSTOMER_LEGAL_BUNDLE_MISMATCH/);
denied(`insert into public.customer_account_memberships(account_id,restaurant_id,customer_id)
  values('${id(46)}','${id(3)}','${id(60)}')`,
  '', /CUSTOMER_LEGAL_BUNDLE_REQUIRED/);
// A later draft makes the previously published snapshot stale. It cannot be
// accepted merely because the old document pointer still exists.
sql(`begin; set local session_replication_role=replica;
  insert into public.legal_document_versions(
    id,document_id,restaurant_id,version,effective_date,rendered_text,
    document_hash,status,master_template_id,created_at)
  values('${id(300)}','${id(9)}','${id(3)}','TEST_ONLY_LOCAL_194_2',
    current_date,'Synthetic future terms',repeat('d',64),'draft','${id(16)}',
    clock_timestamp()+interval '1 minute');
  insert into public.legal_document_version_jurisdictions(
    document_version_id,restaurant_id,legal_country,resolved_from)
  values('${id(300)}','${id(3)}','AT','primary_business_branch');
  commit;`);
equal(sql(`select public.legal_bundle_effective_status_internal('${snapshot.bundle_id}')`), 'STALE');
equal(anon("select public.get_public_at_legal_bundle_identity('synthetic-legal-gate')"), '');
denied(accept(snapshot.bundle_id, id(112)), 'set role anon;', /CUSTOMER_LEGAL_BUNDLE_STALE/);
const withdrawn = result(admin(`select public.set_platform_legal_bundle_publication(
  '${snapshot.bundle_id}','${snapshot.bundle_sha256}','withdraw','STALE',false,
  'SYNTHETIC_LOCAL_194','${id(120)}');`));
equal(withdrawn.effective_status, 'WITHDRAWN');
equal(anon("select public.get_public_at_legal_bundle_identity('synthetic-legal-gate')"), '');
denied(accept(snapshot.bundle_id, id(111)));
equal(sql(`select count(*) from public.customer_at_legal_consent_receipts
  where restaurant_id='${id(3)}'`), '2');
console.log(JSON.stringify({ status: 'PASS', assertions, synthetic_only: true, staging_writes: 0 }));
