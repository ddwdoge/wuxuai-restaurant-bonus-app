// Opt-in integration tests: only the task-owned, unlinked loopback Docker DB.
// Synthetic fixtures are disposable. No HTTP/Auth/Cloud request is performed.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const container = 'supabase_db_wuxuai-legal-bundle-192-local';
assert.equal(process.env.ALLOW_LOCAL_LEGAL_BUNDLE_TESTS, '1', 'explicit local opt-in required');
// A matching container name on a remote daemon is insufficient. Only a
// local Unix-socket Docker daemon may execute this fixture matrix.
const daemonHost = !process.env.DOCKER_CONTEXT && process.env.DOCKER_HOST
  ? process.env.DOCKER_HOST
  : execFileSync('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'], { encoding: 'utf8' }).trim();
assert.ok(daemonHost.startsWith('unix://'), 'local Unix-socket Docker daemon required');

const ports = JSON.parse(execFileSync('docker', ['inspect', '--format', '{{json .NetworkSettings.Ports}}', container], { encoding: 'utf8' }));
assert.deepEqual(ports['5432/tcp'], [{ HostIp: '0.0.0.0', HostPort: '59222' }, { HostIp: '::', HostPort: '59222' }]);
const args = ['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq'];
const sql = (input) => execFileSync('docker', args, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000 }).trim();
const parallelSql = (input) => new Promise((resolve, reject) => {
  const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
  let out = '', err = '';
  child.stdout.on('data', (chunk) => { out += chunk; });
  child.stderr.on('data', (chunk) => { err += chunk; });
  child.on('error', reject);
  child.on('close', (code) => code === 0 ? resolve(out.trim()) : reject(new Error(err)));
  child.stdin.end(input);
});
const id = (n) => `70000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const quote = (s) => `'${String(s).replaceAll("'", "''")}'`;
const json = (s) => `${quote(JSON.stringify(s))}::jsonb`;
const actor = id(1), restaurant = id(3), terms = id(10), privacy = id(18);
const claims = ({ who = actor, aal = 'aal2', age = 0, method = 'totp', session = id(31) } = {}) => ({
  sub: who, role: 'authenticated', aal, session_id: session,
  amr: [{ method, timestamp: Math.floor(Date.now() / 1000) - age }],
});
const auth = (options) => `set role authenticated; set request.jwt.claims=${quote(JSON.stringify(claims(options)))};`;
const run = (statement, options) => sql(`${auth(options)}${statement}`);
let assertions = 0;
const equal = (a, b) => { assert.deepEqual(a, b); assertions++; };
const denied = (statement, prefix = auth(), match = /LEGAL_BUNDLE_|RECENT_PLATFORM_TOTP_REQUIRED|permission denied/) => {
  let error;
  try { sql(prefix + statement); } catch (e) { error = e; }
  assert.ok(error, 'request unexpectedly accepted');
  assert.match(String(error.stderr ?? error.message), match);
  assertions++;
};
const result = (s) => JSON.parse(s.split('\n').at(-1));
const dbDefinition = () => sql(`select md5(pg_get_functiondef('public.legal_operator_publication_ready_internal(uuid,timestamptz)'::regprocedure));`);
const kybBefore = dbDefinition();
equal(sql('select count(*) from supabase_migrations.schema_migrations'), '192');
equal(sql('select count(*) from public.legal_bundle_snapshots'), '0');
const originalPolicy = sql(`select to_jsonb(p)::text from public.country_kyb_intake_policies p where country_code='AT';`);
const realTemplates = sql("select md5(string_agg(id::text||review_status||content_template::text,'|' order by id)) from public.legal_master_templates");
sql(`begin;${readFileSync(new URL('at-legal-bundle-fixture.local.sql', import.meta.url), 'utf8')}commit;`);
const manifest = () => result(sql(`select public.legal_bundle_manifest_internal('${restaurant}','${terms}','${privacy}')`));
let policy = manifest().policy;
const snapshot = ({ key = id(100), country = 'AT', locale = 'de-AT', termsId = terms, privacyId = privacy,
  termsVersion = 'LOCAL-192-1', termsHash = 'a'.repeat(64), termsStatus = 'published',
  privacyVersion = 'LOCAL-192-1', privacyHash = 'b'.repeat(64), privacyStatus = 'published', expectedPolicy = policy } = {}) =>
  `select public.create_platform_legal_bundle_snapshot('${restaurant}',${quote(country)},${quote(locale)},'${termsId}',${quote(termsVersion)},${quote(termsHash)},${quote(termsStatus)},'${privacyId}',${quote(privacyVersion)},${quote(privacyHash)},${quote(privacyStatus)},${json(expectedPolicy)},'${key}');`;
const publish = ({ bundle, hash, key = id(200), action = 'publish', status = 'READY', confirmed = true, ref = 'SYNTHETIC_LOCAL_APPROVAL_192' }) =>
  `select public.set_platform_legal_bundle_publication(${quote(bundle)},${quote(hash)},${quote(action)},${quote(status)},${confirmed},${quote(ref)},'${key}');`;
const receipt = (key, bundle) => `select public.get_platform_legal_bundle_receipt('${key}',${quote(bundle)});`;

// Independent canonical encoder and fixed test vector. Values are UTF-8
// byte-length prefixed, objects C-key sorted, arrays ordered, outer order fixed.
const encode = (v) => {
  if (Array.isArray(v)) return 'a' + v.map(encode).join('') + ';';
  if (v !== null && typeof v === 'object') return 'o' + Object.keys(v).sort((a,b) => Buffer.compare(Buffer.from(a),Buffer.from(b))).map(k => Buffer.byteLength(k) + ':' + k + encode(v[k])).join('') + ';';
  const kind = v === null ? 'n' : typeof v === 'string' ? 's' : typeof v === 'boolean' ? 'b' : 'n';
  const atom = typeof v === 'string' ? v : JSON.stringify(v);
  return kind + Buffer.byteLength(atom) + ':' + atom;
};
const canonical = (m) => 'WUXUAI_LEGAL_BUNDLE_V1' + ['schema_version','restaurant_id','country','locale','terms','privacy','policy'].map(k => encode(m[k])).join('');
const vector = { schema_version: 1, restaurant_id: id(3), country: 'AT', locale: 'de-AT', terms: { id: id(10), version: 'Ä:1', sha256: 'a'.repeat(64) }, privacy: { id: id(18), version: '1', sha256: 'b'.repeat(64) }, policy: { change_ref: 'TEST', legal_status: 'VERIFIED' } };
const vectorHash = createHash('sha256').update(canonical(vector), 'utf8').digest('hex');
equal(sql(`select encode(extensions.digest(convert_to(public.legal_bundle_canonical_manifest_v1(${json(vector)}),'UTF8'),'sha256'),'hex')`), vectorHash);
equal(vectorHash, 'f9ac101fdc634e1af78bce233d36e8da754035bfb16f47ced6e1c8bc920b78d3');
console.log('CANONICAL_VECTOR_SHA256=' + vectorHash);
const vectorClone = { ...vector, terms: { sha256: 'a'.repeat(64), version: 'Ä:1', id: id(10) } };
equal(canonical(vector), canonical(vectorClone));

// Every Browser persona and insufficient/stale MFA is denied, including reads.
for (const statement of [snapshot(), receipt(id(100), 'bundle-' + 'a'.repeat(64)), publish({ bundle: 'bundle-' + 'a'.repeat(64), hash: 'a'.repeat(64) })]) {
  denied(statement, 'set role anon;');
  for (const who of [id(40), id(41), id(42), id(43), id(44)]) denied(statement, auth({ who }));
  for (const options of [{ aal: 'aal1' }, { age: 601 }, { method: 'password' }, { session: id(999) }, { age: -120 }]) denied(statement, auth(options));
}
sql(`update auth.mfa_factors set status='unverified' where id='${id(30)}';`);
denied(snapshot());
sql(`update auth.mfa_factors set status='verified' where id='${id(30)}'; update public.platform_admins set active=false where user_id='${actor}';`);
denied(snapshot());
sql(`update public.platform_admins set active=true where user_id='${actor}';`);
sql(`update auth.sessions set not_after=now()-interval '1 minute' where id='${id(31)}';`);
denied(snapshot());
sql(`update auth.sessions set not_after=now()+interval '1 hour',factor_id=null where id='${id(31)}';`);
denied(snapshot());
sql(`update auth.sessions set factor_id='${id(30)}' where id='${id(31)}';`);

for (const options of [{ country: 'DE' }, { locale: 'de' }, { termsHash: 'f'.repeat(64) }, { termsVersion: 'wrong' }, { termsId: id(999) }, { privacyHash: 'c'.repeat(64) }, { expectedPolicy: {} }, { termsStatus: 'draft' }]) denied(snapshot(options));
for (const table of ['legal_bundle_snapshots','legal_bundle_publication_events','legal_bundle_request_receipts','legal_bundle_policy_revisions']) {
  for (const role of ['anon','authenticated','service_role']) {
    for (const op of [`select * from public.${table}`, `delete from public.${table}`, `update public.${table} set ${table === 'legal_bundle_policy_revisions' ? 'observed_at' : 'created_at'}=now()`, `insert into public.${table} default values`]) denied(op, `set role ${role};`, /permission denied/);
  }
  for (const op of [`delete from public.${table}`, `update public.${table} set ${table === 'legal_bundle_policy_revisions' ? 'observed_at' : 'created_at'}=now()`, `truncate public.${table} cascade`]) denied(op, '', /LEGAL_BUNDLE_APPEND_ONLY/);
  equal(sql(`select relrowsecurity from pg_class where oid='public.${table}'::regclass`), 't');
}

// Current open AT policies: snapshot is allowed but no approval is inferred.
const preview = result(run(`select public.get_platform_legal_bundle_preflight('${restaurant}');`));
const blocked = result(run(snapshot()));
equal(preview.bundle_id, blocked.bundle_id);
equal(preview.technical_status, 'BLOCKED');
equal(blocked.effective_status, 'BLOCKED');
equal(result(run(snapshot())), blocked);
equal(result(run(snapshot({ key: id(101) }))).bundle_id, blocked.bundle_id);
equal(sql('select count(*) from public.legal_bundle_snapshots'), '1');
denied(snapshot({ termsHash: 'f'.repeat(64) }));
denied(publish({ bundle: blocked.bundle_id, hash: blocked.bundle_sha256, status: 'BLOCKED' }));
equal(sql(`select public.restaurant_legal_bundle_is_current('${restaurant}');`), 'f');
equal(result(run(receipt(id(100), blocked.bundle_id))).receipt, blocked);
equal(result(run(receipt(id(100), 'bundle-' + 'a'.repeat(64)))).found, false);
sql(`insert into public.platform_admins(user_id,role,active) values('${id(45)}','platform_admin',true);
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at) values('${id(47)}','${id(45)}','totp','verified',now(),now());
insert into auth.sessions(id,user_id,factor_id,aal,not_after,created_at,updated_at) values('${id(48)}','${id(45)}','${id(47)}','aal2',now()+interval '1 hour',now(),now());`);
equal(result(run(receipt(id(100), blocked.bundle_id), { who: id(45), session: id(48) })).found, false);

// Synthetic policy readiness only, never existing real document approval.
sql(`update public.country_kyb_intake_policies set real_intake_status='READY',legal_status='VERIFIED',privacy_status='VERIFIED',document_catalog_status='VERIFIED',retention_status='VERIFIED',change_ref='SYNTHETIC_LOCAL_192',updated_at=clock_timestamp() where country_code='AT';`);
policy = manifest().policy;
equal(sql(`select public.legal_bundle_effective_status_internal('${blocked.bundle_id}')`), 'STALE');
sql(`update public.legal_master_templates set review_status='DRAFT_LEGAL_REVIEW_REQUIRED' where id='${id(16)}';`);
const draft = result(run(snapshot({ key: id(110) })));
equal(draft.effective_status, 'BLOCKED');
denied(publish({ bundle: draft.bundle_id, hash: draft.bundle_sha256, status: 'BLOCKED' }));
sql(`update public.legal_master_templates set review_status='REVIEWED' where id='${id(16)}';`);

for (const [index, gate] of ['real_intake_status','legal_status','privacy_status','document_catalog_status','retention_status'].entries()) {
  sql(`update public.country_kyb_intake_policies set ${gate}='BLOCKED' where country_code='AT';`);
  policy = manifest().policy;
  const gateBlocked = result(run(snapshot({ key: id(400 + index) })));
  equal(gateBlocked.effective_status, 'BLOCKED');
  denied(publish({ bundle: gateBlocked.bundle_id, hash: gateBlocked.bundle_sha256, status: 'BLOCKED', key: id(410 + index) }));
  sql(`update public.country_kyb_intake_policies set ${gate}='${gate === 'real_intake_status' ? 'READY' : 'VERIFIED'}' where country_code='AT';`);
}
policy = manifest().policy;
// Equal-key capture races also produce one actor-bound receipt.
const captureReplays = await Promise.all(Array.from({ length: 16 }, () => parallelSql(auth() + snapshot({ key: id(119) }))));
for (const out of captureReplays) equal(result(out), result(captureReplays[0]));
equal(sql(`select count(*) from public.legal_bundle_request_receipts where idempotency_key='${id(119)}'`), '1');

// 16 concurrent captures: one immutable snapshot, one receipt per key.
const captures = await Promise.all(Array.from({ length: 16 }, (_, n) => parallelSql(auth() + snapshot({ key: id(120 + n) }))));
const ready = result(captures[0]);
equal(ready.effective_status, 'READY');
for (const out of captures) equal(result(out).bundle_id, ready.bundle_id);
equal(sql(`select count(*) from public.legal_bundle_snapshots where bundle_id='${ready.bundle_id}'`), '1');
equal(sql(`select public.restaurant_legal_bundle_is_current('${restaurant}');`), 'f');

// A synthetic pre-existing KYB decision is fixture data, not a new KYB path.
sql(`insert into public.legal_operator_publication_decisions(restaurant_id,case_id,profile_revision_id,action,field_mapping_version,reason_code,redacted_reason,actor_id,aal2_verified_at,session_expires_at,auth_session_sha256,request_id,correlation_id)
values('${restaurant}','${id(6)}','${id(7)}','APPROVED','AT_V1_LEGAL_OPERATOR_V1','SYNTHETIC_MANUAL_REVIEW','Synthetic local approval fixture only','${actor}',clock_timestamp(),clock_timestamp()+interval '1 hour',repeat('c',64),'${id(80)}','${id(81)}');`);
equal(sql(`select public.legal_operator_publication_ready_internal('${restaurant}');`), 't');
equal(sql(`select public.restaurant_legal_bundle_is_current('${restaurant}');`), 'f');
for (const options of [{ hash: 'f'.repeat(64) }, { confirmed: false }, { status: 'PUBLISHED' }, { bundle: 'bundle-' + 'f'.repeat(64) }, { ref: 'person@example.invalid' }]) denied(publish({ bundle: ready.bundle_id, hash: ready.bundle_sha256, ...options }));

// Equal-key publication races return the exact same event and stored receipt.
const published = await Promise.all(Array.from({ length: 24 }, () => parallelSql(auth() + publish({ bundle: ready.bundle_id, hash: ready.bundle_sha256 }))));
const pub = result(published[0]);
equal(pub.effective_status, 'PUBLISHED');
for (const out of published) equal(result(out), pub);
equal(sql(`select count(*) from public.legal_bundle_publication_events where bundle_id='${ready.bundle_id}'`), '1');
equal(sql(`select public.restaurant_legal_bundle_is_current('${restaurant}');`), 't');
equal(result(sql(`select public.restaurant_registration_readiness('${restaurant}');`)).registration_allowed, true);
denied(publish({ bundle: ready.bundle_id, hash: ready.bundle_sha256, ref: 'CONTRADICTORY' }));
denied(publish({ bundle: ready.bundle_id, hash: ready.bundle_sha256, key: id(201), status: 'PUBLISHED' }));
equal(result(run(receipt(id(200), ready.bundle_id))).receipt, pub);
denied(publish({ bundle: ready.bundle_id, hash: ready.bundle_sha256 }), auth({ who: id(45), session: id(48) }));

// Withdrawal is append-only, repeat-safe, and closes both dynamic read gates.
const withdraw = { bundle: ready.bundle_id, hash: ready.bundle_sha256, key: id(210), action: 'withdraw', status: 'PUBLISHED', confirmed: false };
const withdrawn = result(run(publish(withdraw)));
equal(withdrawn.effective_status, 'WITHDRAWN');
equal(result(run(publish(withdraw))), withdrawn);
equal(sql(`select count(*) from public.legal_bundle_publication_events where bundle_id='${ready.bundle_id}'`), '2');
equal(sql(`select public.restaurant_legal_bundle_is_current('${restaurant}');`), 'f');
equal(result(sql(`select public.restaurant_registration_readiness('${restaurant}');`)).registration_allowed, false);

// No bypass through republishing a withdrawn snapshot after policy closure.
sql(`update public.country_kyb_intake_policies set privacy_status='BLOCKED' where country_code='AT';`);
denied(publish({ bundle: ready.bundle_id, hash: ready.bundle_sha256, key: id(220), status: 'WITHDRAWN' }));
sql(`update public.country_kyb_intake_policies set privacy_status='VERIFIED' where country_code='AT';`);
denied(publish({ bundle: ready.bundle_id, hash: ready.bundle_sha256, key: id(221), status: 'WITHDRAWN' }));

// A changed policy observation invalidates previous snapshots immediately.
sql(`update public.country_kyb_intake_policies set change_ref='SYNTHETIC_LOCAL_192_NEXT',updated_at=clock_timestamp() where country_code='AT';`);
equal(sql(`select public.legal_bundle_effective_status_internal('${ready.bundle_id}')`), 'WITHDRAWN');
equal(sql(`select public.restaurant_legal_bundle_is_current('${restaurant}');`), 'f');
policy = manifest().policy;
const next = result(run(snapshot({ key: id(230) })));
assert.notEqual(next.bundle_id, ready.bundle_id); assertions++;

// Newer documents make old references unusable (including equal timestamps).
sql(`begin; set local session_replication_role=replica;
insert into public.legal_document_versions(id,document_id,restaurant_id,version,effective_date,rendered_text,document_hash,status,master_template_id,created_at)
values('${id(300)}','${id(9)}','${restaurant}','LOCAL-192-2',current_date,'Synthetic new terms',repeat('d',64),'published','${id(16)}',clock_timestamp()+interval '1 minute');
insert into public.legal_document_version_jurisdictions(document_version_id,restaurant_id,legal_country,resolved_from) values('${id(300)}','${restaurant}','AT','primary_business_branch'); commit;`);
denied(snapshot({ key: id(301) }));
equal(sql(`select public.legal_bundle_effective_status_internal('${next.bundle_id}')`), 'STALE');
const newer = result(run(snapshot({ key: id(302), termsId: id(300), termsVersion: 'LOCAL-192-2', termsHash: 'd'.repeat(64) })));
assert.notEqual(newer.bundle_id, next.bundle_id); assertions++;

// Missing policy revision is not guessed or fabricated.
sql(`begin; delete from public.country_kyb_intake_policies where country_code='AT';` + `commit;`);
denied(snapshot({ key: id(303), termsId: id(300), termsVersion: 'LOCAL-192-2', termsHash: 'd'.repeat(64) }));
sql(`insert into public.country_kyb_intake_policies select * from jsonb_populate_record(null::public.country_kyb_intake_policies,${quote(originalPolicy)}::jsonb);`);
equal(dbDefinition(), kybBefore);
equal(sql("select md5(string_agg(id::text||review_status||content_template::text,'|' order by id)) from public.legal_master_templates where id not in ('" + id(16) + "','" + id(17) + "')"), realTemplates);
equal(sql("select count(*) from public.legal_bundle_publication_events e join public.legal_bundle_snapshots s using(bundle_id) where s.restaurant_id<>'" + restaurant + "'"), '0');
for (const table of ['customers','points_transactions','customer_rewards','customer_account_memberships']) {
  equal(sql(`select count(*) from public.${table}`), '0');
}
console.log(JSON.stringify({ status: 'PASS', assertions, snapshot_parallelism: 16, publish_parallelism: 24, real_bundle: 'BLOCKED', kyb_function: 'UNCHANGED', cloud_requests: 0, business_writes: 0 }));
