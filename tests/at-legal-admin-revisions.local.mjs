// Opt-in: synthetic local AAL2/row-lock/idempotency checks for future real
// content controls. No existing AT draft or hosted policy is reviewed.
import assert from 'node:assert/strict';
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
const claims = ({ who = id(1), aal = 'aal2', age = 0, session = id(31) } = {}) => quote(JSON.stringify({
  sub: who, role: 'authenticated', aal, session_id: session,
  amr: [{ method: 'totp', timestamp: Math.floor(Date.now() / 1000) - age }],
}));
const auth = (options) => `set role authenticated; set request.jwt.claims=${claims(options)};`;
const run = (query, options) => sql(auth(options) + query);
const result = (output) => JSON.parse(output.split('\n').at(-1));
let assertions = 0;
const equal = (actual, expected) => { assert.deepEqual(actual, expected); assertions++; };
const denied = (query, prefix = auth(), match = /AT_LEGAL_|LEGAL_BUNDLE_|RECENT_PLATFORM_TOTP_REQUIRED|permission denied/) => {
  let error;
  try { sql(prefix + query); } catch (caught) { error = caught; }
  assert.ok(error, 'unexpectedly accepted');
  assert.match(String(error.stderr ?? error.message), match);
  assertions++;
};
equal(sql('select count(*) from supabase_migrations.schema_migrations'), '195');
const originalPolicy = sql("select to_jsonb(p)::text from public.country_kyb_intake_policies p where country_code='AT'");
sql(`begin;${readFileSync(new URL('at-legal-bundle-fixture.local.sql', import.meta.url), 'utf8')}commit;`);
// The 192 race fixture intentionally dates its synthetic templates tomorrow;
// this control test instead needs the newly created version to be latest.
sql(`update public.legal_master_templates set created_at=clock_timestamp()-interval '1 day'
  where id in ('${id(16)}','${id(17)}');`);
const originalTemplates = sql("select md5(string_agg(id::text||review_status||content_template::text,'|' order by id)) from public.legal_master_templates");
const templateBefore = result(run("select public.get_platform_at_legal_template_preflight('participation_terms')"));
equal(templateBefore.found, true);
const create = (key = id(700), latestId = templateBefore.template_id, latestHash = templateBefore.content_sha256) =>
  `select public.create_platform_at_legal_template_draft(
    'participation_terms','TEST_ONLY_195','Synthetic local terms',
    '{"test_only":true}'::jsonb,'Synthetic local legal draft only',
    'TEST_ONLY_LOCAL_195','FOUNDER_DRAFT','${latestId}',${quote(latestHash)},'${key}');`;
denied(create(), 'set role anon;');
denied(create(), auth({ who: id(43) }));
denied(create(), auth({ aal: 'aal1' }));
denied(create(), auth({ age: 601 }));
denied(create(id(701), templateBefore.template_id, 'f'.repeat(64)));
const concurrent = await Promise.all(Array.from({ length: 8 }, () => parallelSql(auth() + create())));
const first = result(concurrent[0]);
equal(concurrent.map((output) => result(output).template_id), Array(8).fill(first.template_id));
equal(sql("select count(*) from public.platform_at_legal_template_evidence"), '1');
equal(result(run(create())).content_sha256, first.content_sha256);
denied(create(id(700), templateBefore.template_id, 'f'.repeat(64)),
  auth(), /AT_LEGAL_ADMIN_IDEMPOTENCY_CONFLICT/);
denied(`update public.legal_master_templates set rendered_text_template='tampered'
  where id='${first.template_id}'`, '', /AT_LEGAL_TEMPLATE_CONTENT_IMMUTABLE/);
for (const table of ['platform_at_legal_admin_receipts','platform_at_legal_template_evidence',
  'platform_at_legal_template_review_events','platform_at_legal_policy_evidence']) {
  denied(`select * from public.${table}`, 'set role anon;', /permission denied/);
  equal(sql(`select relrowsecurity from pg_class where oid='public.${table}'::regclass`), 't');
}
const review = (confirmed = true, hash = first.content_sha256, key = id(710)) =>
  `select public.review_platform_at_legal_template('${first.template_id}',
    ${quote(hash)},'DRAFT_LEGAL_REVIEW_REQUIRED','TEST_ONLY_LOCAL_REVIEW_195',
    ${confirmed},'${key}');`;
denied(review(false));
denied(review(true, 'f'.repeat(64)));
const reviewed = result(run(review()));
equal(reviewed.review_status, 'REVIEWED');
equal(result(run(review())).template_id, first.template_id);
equal(sql(`select count(*) from public.platform_at_legal_template_review_events
  where template_id='${first.template_id}'`), '1');
equal(result(run(`select public.get_platform_at_legal_admin_receipt('${id(710)}')`)).found, true);
denied(review(true, first.content_sha256, id(711)), auth(), /AT_LEGAL_TEMPLATE_REVIEW_STATE_MISMATCH/);

const privacyBefore = result(run("select public.get_platform_at_legal_template_preflight('privacy')"));
const privacyDraft = result(run(`select public.create_platform_at_legal_template_draft(
  'privacy','TEST_ONLY_195','Synthetic local privacy',
  '{"test_only":true}'::jsonb,'Synthetic local privacy draft only',
  'TEST_ONLY_LOCAL_195','COUNSEL_DRAFT','${privacyBefore.template_id}',
  '${privacyBefore.content_sha256}','${id(712)}');`));
const privacyReviewed = result(run(`select public.review_platform_at_legal_template(
  '${privacyDraft.template_id}','${privacyDraft.content_sha256}',
  'DRAFT_LEGAL_REVIEW_REQUIRED','TEST_ONLY_LOCAL_REVIEW_195',true,'${id(713)}');`));
equal(privacyReviewed.review_status, 'REVIEWED');
const artifactRows = {};
for (const [index, areaName] of ['document_catalog', 'retention'].entries()) {
  equal(result(run(`select public.get_platform_at_legal_policy_artifact_preflight('${areaName}')`)).found, false);
  const draft = result(run(`select public.create_platform_at_legal_policy_artifact_draft(
    '${areaName}','TEST_ONLY_195','{"test_only":true}'::jsonb,
    'Synthetic local ${areaName} draft only','TEST_ONLY_LOCAL_195',
    'COUNSEL_DRAFT',null,null,'${id(730 + index * 2)}');`));
  denied(`update public.platform_at_legal_policy_artifact_versions
    set rendered_text='tampered' where id='${draft.artifact_id}'`,
    '', /AT_LEGAL_POLICY_ARTIFACT_IMMUTABLE/);
  const reviewedArtifact = result(run(`select public.review_platform_at_legal_policy_artifact(
    '${draft.artifact_id}','${draft.content_sha256}',
    'DRAFT_LEGAL_REVIEW_REQUIRED','TEST_ONLY_LOCAL_REVIEW_195',
    true,'${id(731 + index * 2)}');`));
  equal(reviewedArtifact.review_status, 'REVIEWED');
  artifactRows[areaName] = reviewedArtifact;
}

const policyBefore = result(run('select public.get_platform_at_legal_policy_preflight()'));
equal(policyBefore.policy_state.real_intake_status, 'BLOCKED');
const statuses = Object.fromEntries(['legal','privacy','document_catalog','retention'].map((name) => [name, 'VERIFIED']));
const evidence = {
  legal: { version: 'TEST_ONLY_195', sha256: first.content_sha256, source_reference: 'TEST_ONLY_LOCAL_195' },
  privacy: { version: 'TEST_ONLY_195', sha256: privacyDraft.content_sha256, source_reference: 'TEST_ONLY_LOCAL_195' },
  document_catalog: { version: 'TEST_ONLY_195', sha256: artifactRows.document_catalog.content_sha256, source_reference: 'TEST_ONLY_LOCAL_195' },
  retention: { version: 'TEST_ONLY_195', sha256: artifactRows.retention.content_sha256, source_reference: 'TEST_ONLY_LOCAL_195' },
};
const policy = (key = id(720), revision = policyBefore.revision_id, state = policyBefore.policy_state,
  next = statuses) => `select public.set_platform_at_legal_policy_revision(
    ${revision},${json(state)},${json(next)},${json(evidence)},
    'TEST_ONLY_LOCAL_195','TEST_ONLY_LOCAL_APPROVAL_195',true,'${key}');`;
denied(policy(), 'set role anon;');
denied(policy(id(721), policyBefore.revision_id + 1), auth(), /AT_LEGAL_POLICY_REVISION_MISMATCH/);
denied(policy(id(722), policyBefore.revision_id, policyBefore.policy_state,
  { ...statuses, retention: 'VERIFIED_TEST_ONLY' }), auth(), /AT_LEGAL_POLICY_AREA_INVALID_RETENTION/);
const policyResult = result(run(policy()));
equal(policyResult.real_intake_status, 'BLOCKED');
equal(result(run(policy())), policyResult);
equal(sql("select real_intake_status from public.country_kyb_intake_policies where country_code='AT'"), 'BLOCKED');
equal(sql("select count(*) from public.platform_at_legal_policy_evidence"), '1');
denied(policy(id(723)), auth(), /AT_LEGAL_POLICY_EXPECTED_STATE_MISMATCH/);
equal(result(run('select public.get_platform_at_legal_policy_preflight()')).revision_id,
  policyResult.revision_id);
equal(sql("select count(*) from public.legal_bundle_publication_events"), '0');
equal(sql("select count(*) from public.customers"), '0');
equal(sql("select md5(string_agg(id::text||review_status||content_template::text,'|' order by id)) from public.legal_master_templates where id not in (select template_id from public.platform_at_legal_template_evidence)"), originalTemplates);
assert.notEqual(sql("select to_jsonb(p)::text from public.country_kyb_intake_policies p where country_code='AT'"), originalPolicy); assertions++;
console.log(JSON.stringify({ status: 'PASS', assertions, existing_drafts_unchanged: true,
  real_intake: 'BLOCKED', cloud_requests: 0, business_writes: 0 }));
