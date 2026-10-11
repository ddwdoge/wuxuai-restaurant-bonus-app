import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const env = { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1", DO_NOT_TRACK: "1" };
const status = JSON.parse(execFileSync("npx", ["--no-install", "supabase", "status", "--output", "json"], {
  encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env,
}));
assert.equal(status.API_URL, "http://127.0.0.1:56121");
const projectId = readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8")
  .match(/^project_id = "([^"]+)"/m)?.[1];
assert.equal(projectId, "wuxuai-phase7b4d-local");
const container = `supabase_db_${projectId}`;
const psqlArgs = ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1"];
const sql = (input) => execFileSync("docker", psqlArgs, {
  input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
}).trim();
const asyncSql = (input) => new Promise((resolve, reject) => {
  const child = spawn("docker", psqlArgs, { stdio: ["pipe", "pipe", "pipe"] });
  let output = "";
  let error = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { error += chunk; });
  child.once("error", reject);
  child.once("close", (code) => code === 0 ? resolve(output.trim()) : reject(new Error(error.trim())));
  child.stdin.end(input);
});
const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
const json = (input) => JSON.parse(sql(input).split("\n").at(-1));
const denied = (input, pattern) => {
  assert.throws(() => sql(input), (error) => pattern.test(String(error.stderr ?? error.message)));
};

const projectRef = "mbgveqbhessaunrhfudm";
const issuer = `https://${projectRef}.supabase.co/auth/v1`;
const origin = "https://staging-v2.bonus.wuxuaisbi.com";
const actor1 = randomUUID();
const actor2 = randomUUID();
const owner = randomUUID();
const factor1 = randomUUID();
const factor2 = randomUUID();
const ownerFactor = randomUUID();
const session1 = randomUUID();
const session2 = randomUUID();
const ownerSession = randomUUID();

const jwt = ({ who = actor1, session = session1, aal = "aal2", method = "totp", age = 0, jwtIssuer = issuer } = {}) => JSON.stringify({
  sub: who,
  role: "authenticated",
  session_id: session,
  iss: jwtIssuer,
  aal,
  amr: [{ method, timestamp: Math.floor(Date.now() / 1000) - age }],
}).replaceAll("'", "''");
const auth = (options = {}) => `set local role authenticated;
select set_config('request.jwt.claims','${jwt(options)}',true);`;

const makeTenant = (label) => ({
  owner,
  organization: randomUUID(),
  restaurant: randomUUID(),
  branch: randomUUID(),
  caseId: randomUUID(),
  subscription: randomUUID(),
  gisa: randomUUID(),
  trade: randomUUID(),
  label,
  name: `WUXUAI TEST ${label.toUpperCase()}`,
  gisaHash: "a".repeat(63) + label.slice(-1).replace(/[^0-9a-f]/i, "a").toLowerCase(),
  tradeHash: "b".repeat(63) + label.slice(-1).replace(/[^0-9a-f]/i, "b").toLowerCase(),
});
const primary = makeTenant("PRIMARY1");
const parallel = makeTenant("PARALLEL2");
const race = makeTenant("RACE3");
const rollback = makeTenant("ROLLBACK4");

const anchor = json("select public.get_project_bootstrap_anchor();");
const bindingRequest = randomUUID();
const bindingInput = {
  project_ref: projectRef,
  backend_url: `https://${projectRef}.supabase.co`,
  auth_issuer: issuer,
  app_origin: origin,
  database_anchor: anchor.anchor,
  database_system_id: anchor.system_id,
  database_name: anchor.database_name,
  hosting_account_id: "2c1dfe5a3330e0b63b30a5838d81d3bc",
  worker_name: "wuxuai-restaurant-bonus-app-staging-v2",
  request_id: bindingRequest,
  operator_ref: "synthetic-local-test-only-kyb",
  environment: "STAGING",
};
const binding = json(`select project_bootstrap.install(${q(JSON.stringify(bindingInput))}::jsonb,${q("c".repeat(64))});`);
const setupRequest = randomUUID();
json(`select project_bootstrap.activate_bound_staging_environment(
  ${q(setupRequest)}::uuid,${q(binding.binding_id)}::uuid,${q(projectRef)},${q(issuer)},${q(origin)},
  'synthetic-local-test-only-kyb',${q("d".repeat(64))},
  ${q(`CONFIRMED:BOUND_STAGING_SETUP:${binding.binding_id}:${setupRequest}`)}
);`);

const tenantFixture = (tenant) => `
insert into public.organizations(id,owner_id,name,status)
values('${tenant.organization}','${owner}',${q(tenant.name)},'draft');
insert into public.restaurants(id,owner_id,name,slug,status,organization_id,activation_status)
values('${tenant.restaurant}','${owner}',${q(tenant.name)},${q(`test-${tenant.restaurant.slice(0, 12)}`)},'draft','${tenant.organization}','pending_activation');
insert into public.branches(id,organization_id,restaurant_id,name,slug,status,address,postal_code,city,country)
values('${tenant.branch}','${tenant.organization}','${tenant.restaurant}',${q(tenant.name)},${q(`test-${tenant.branch.slice(0, 12)}`)},'draft','Synthetic Test Street 1','1000','Synthetic City','AT');
update public.restaurants set primary_branch_id='${tenant.branch}' where id='${tenant.restaurant}';
insert into public.restaurant_members(restaurant_id,organization_id,branch_id,user_id,role)
values('${tenant.restaurant}','${tenant.organization}','${tenant.branch}','${owner}','owner');
insert into public.branch_subscriptions(id,organization_id,branch_id,status,plan_key,subscription_status,payment_status,selected_plan)
values('${tenant.subscription}','${tenant.organization}','${tenant.branch}','pending_activation','BASIC','pending_activation','not_required','BASIC');
insert into public.platform_test_tenant_registry(restaurant_id,restaurant_name,organization_id,owner_user_id,test_session_id,marked_by)
values('${tenant.restaurant}',${q(tenant.name)},'${tenant.organization}','${owner}',${q(`test-only-kyb-${tenant.restaurant}`)},'${actor1}');
insert into public.business_verification_cases(id,restaurant_id,country_code,verification_method,status,test_only,created_by)
values('${tenant.caseId}','${tenant.restaurant}','AT','MANUAL','PENDING_ACTIVATION',true,'${owner}');
insert into public.business_verification_documents(
  id,case_id,restaurant_id,organization_id,document_type,version,storage_object_name,mime_type,
  byte_size,content_sha256,status,reservation_request_id,completion_request_id,correlation_id,
  completion_correlation_id,uploaded_by,uploaded_at
) values
('${tenant.gisa}','${tenant.caseId}','${tenant.restaurant}','${tenant.organization}','GISA_EXTRACT',3,
 '${tenant.restaurant}/${tenant.caseId}/${tenant.gisa}/document.pdf','application/pdf',2925,${q(tenant.gisaHash)},'UPLOADED',
 '${randomUUID()}','${randomUUID()}','${randomUUID()}','${randomUUID()}','${owner}',clock_timestamp()),
('${tenant.trade}','${tenant.caseId}','${tenant.restaurant}','${tenant.organization}','TRADE_LICENSE',3,
 '${tenant.restaurant}/${tenant.caseId}/${tenant.trade}/document.pdf','application/pdf',2935,${q(tenant.tradeHash)},'UPLOADED',
 '${randomUUID()}','${randomUUID()}','${randomUUID()}','${randomUUID()}','${owner}',clock_timestamp());
insert into public.operator_material_revisions(restaurant_id,revision,source_table,source_id,operation,actor_id)
values('${tenant.restaurant}',1,'business_verification_documents','${tenant.trade}','SYNTHETIC_FIXTURE','${owner}');`;

sql(`begin;
insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
values
 (null,'${actor1}','authenticated','authenticated','reviewer-one@example.invalid',clock_timestamp(),'{}','{}',clock_timestamp(),clock_timestamp(),false,false),
 (null,'${actor2}','authenticated','authenticated','reviewer-two@example.invalid',clock_timestamp(),'{}','{}',clock_timestamp(),clock_timestamp(),false,false),
 (null,'${owner}','authenticated','authenticated','synthetic-owner@example.invalid',clock_timestamp(),'{}','{}',clock_timestamp(),clock_timestamp(),false,false);
insert into public.platform_admins(user_id,role,active) values
 ('${actor1}','platform_owner',true),('${actor2}','platform_admin',true);
insert into auth.mfa_factors(id,user_id,friendly_name,factor_type,status,created_at,updated_at) values
 ('${factor1}','${actor1}','Synthetic reviewer one','totp','verified',clock_timestamp(),clock_timestamp()),
 ('${factor2}','${actor2}','Synthetic reviewer two','totp','verified',clock_timestamp(),clock_timestamp()),
 ('${ownerFactor}','${owner}','Synthetic owner factor','totp','verified',clock_timestamp(),clock_timestamp());
insert into auth.sessions(id,user_id,created_at,updated_at,factor_id,aal,not_after) values
 ('${session1}','${actor1}',clock_timestamp(),clock_timestamp(),'${factor1}','aal2',clock_timestamp()+interval '1 hour'),
 ('${session2}','${actor2}',clock_timestamp(),clock_timestamp(),'${factor2}','aal2',clock_timestamp()+interval '1 hour'),
 ('${ownerSession}','${owner}',clock_timestamp(),clock_timestamp(),'${ownerFactor}','aal2',clock_timestamp()+interval '1 hour');
set local session_replication_role=replica;
${tenantFixture(primary)}
${tenantFixture(parallel)}
${tenantFixture(race)}
${tenantFixture(rollback)}
commit;`);

const read = (tenant, options = {}) => json(`begin; ${auth(options)}
select public.get_platform_test_only_kyb_review('${tenant.restaurant}'); commit;`);
const decide = ({
  tenant = primary,
  actor = actor1,
  session = session1,
  action = "FIRST_REVIEW",
  state = read(tenant, { who: actor, session }),
  request = randomUUID(),
  previous = state.previous_receipt_id,
  documents = state.documents,
  revision = state.material_revision,
  hash = state.snapshot_sha256,
  organization = tenant.organization,
  branch = tenant.branch,
  reference = `TEST_ONLY_LOCAL_${action}`,
  confirmation = `TEST_ONLY KYB ${action} ${tenant.name}`,
  options = {},
} = {}) => ({
  request,
  sql: `begin; ${auth({ who: actor, session, ...options })}
select public.decide_platform_test_only_kyb_review(
  '${tenant.restaurant}','${organization}','${branch}',${q(action)},${revision},${q(hash)},
  ${previous ? `${q(previous)}::uuid` : "null"},${q(JSON.stringify(documents))}::jsonb,${q(reference)},true,
  ${q(confirmation)},'${request}'
); commit;`,
});

const realDefinitionsBefore = sql(`select md5(pg_get_functiondef('public.resolve_business_verification_readiness_internal(uuid,text,timestamptz)'::regprocedure))||'|'||md5(pg_get_functiondef('public.decide_platform_operator_review(uuid,uuid,uuid,text,text,text,uuid,text,jsonb,boolean,text,uuid)'::regprocedure));`);
const sideEffects = (tenant) => json(`select jsonb_build_object(
  'case_status',(select status from public.business_verification_cases where restaurant_id='${tenant.restaurant}'),
  'case_decided_at',(select decided_at from public.business_verification_cases where restaurant_id='${tenant.restaurant}'),
  'verified_profiles',(select count(*) from public.business_verified_profile_revisions p join public.business_verification_cases c on c.id=p.case_id where c.restaurant_id='${tenant.restaurant}' and p.status='VERIFIED'),
  'trial_claims',(select count(*) from public.billing_trial_claims where restaurant_id='${tenant.restaurant}'),
  'pro_grants',(select count(*) from public.commercial_pro_access_grants where restaurant_id='${tenant.restaurant}'),
  'checkout',(select count(*) from public.basic_test_checkout_requests where restaurant_id='${tenant.restaurant}'),
  'transactional_mail',(select count(*) from public.customer_transactional_email_deliveries where restaurant_id='${tenant.restaurant}'),
  'offer_mail',(select count(*) from public.customer_offer_email_confirmation_outbox outbox
    join public.customer_offer_email_consents consent on consent.id=outbox.consent_id
    where consent.restaurant_id='${tenant.restaurant}'),
  'subscription',(select jsonb_build_object('status',status,'subscription_status',subscription_status,'trial_started_at',trial_started_at,'trial_ends_at',trial_ends_at,'stripe_customer_id',stripe_customer_id,'stripe_subscription_id',stripe_subscription_id) from public.branch_subscriptions where branch_id='${tenant.branch}'),
  'real_intake',(select real_intake_status from public.country_kyb_intake_policies where country_code='AT'),
  'catalog_access',public.restaurant_menu_access_internal('${tenant.restaurant}','${tenant.branch}')
);`);
const primarySideEffectsBefore = sideEffects(primary);

// Role, project, session and freshness denials also protect the read path.
denied(`begin; set local role anon; select public.get_platform_test_only_kyb_review('${primary.restaurant}'); rollback;`, /permission denied|LEGAL_BUNDLE_ACCESS_DENIED|PROJECT_BINDING_REQUIRED/i);
denied(`begin; ${auth({ aal: "aal1" })} select public.get_platform_test_only_kyb_review('${primary.restaurant}'); rollback;`, /RECENT_PLATFORM_TOTP_REQUIRED|LEGAL_BUNDLE_ACCESS_DENIED/i);
denied(`begin; ${auth({ age: 601 })} select public.get_platform_test_only_kyb_review('${primary.restaurant}'); rollback;`, /RECENT_PLATFORM_TOTP_REQUIRED/i);
denied(`begin; ${auth({ jwtIssuer: "https://wrong.example.invalid/auth/v1" })} select public.get_platform_test_only_kyb_review('${primary.restaurant}'); rollback;`, /PROJECT_BINDING_REQUIRED/i);
denied(`begin; ${auth({ who: owner, session: ownerSession })} select public.get_platform_test_only_kyb_review('${primary.restaurant}'); rollback;`, /LEGAL_BUNDLE_ACCESS_DENIED/i);

for (const role of ["anon", "authenticated", "service_role"]) {
  assert.equal(sql(`select has_table_privilege('${role}','public.test_only_kyb_review_receipts','SELECT');`), "f");
  assert.equal(sql(`select has_table_privilege('${role}','public.test_only_kyb_review_audit','INSERT');`), "f");
  assert.equal(sql(`select has_function_privilege('${role}','public.test_only_kyb_review_snapshot_internal(uuid)','EXECUTE');`), "f");
}
assert.equal(sql("select relrowsecurity from pg_class where oid='public.test_only_kyb_review_receipts'::regclass;"), "t");
assert.equal(sql("select relrowsecurity from pg_class where oid='public.test_only_kyb_review_audit'::regclass;"), "t");

const primaryInitial = read(primary);
assert.equal(primaryInitial.synthetic_test_only, true);
assert.equal(primaryInitial.real_kyb_verified, false);
assert.equal(primaryInitial.synthetic_review_complete, false);
assert.equal(primaryInitial.documents.length, 2);
assert.deepEqual(primaryInitial.documents.map((item) => [item.type, item.version, item.sha256]), [
  ["GISA_EXTRACT", 3, primary.gisaHash],
  ["TRADE_LICENSE", 3, primary.tradeHash],
]);

// Wrong tenant bindings and changed bytes never produce a receipt.
denied(decide({ organization: parallel.organization }).sql, /TEST_ONLY_KYB_REVIEW_BINDING_INVALID/i);
const wrongDocuments = structuredClone(primaryInitial.documents);
wrongDocuments[0].sha256 = "f".repeat(64);
denied(decide({ documents: wrongDocuments }).sql, /TEST_ONLY_KYB_REVIEW_STALE/i);
assert.equal(sql(`select count(*) from public.test_only_kyb_review_receipts where restaurant_id='${primary.restaurant}';`), "0");

// Equal-key concurrency creates exactly one receipt and deterministic replays.
const firstRequest = randomUUID();
const firstCall = decide({ request: firstRequest, state: primaryInitial });
const firstParallel = await Promise.all(Array.from({ length: 8 }, () => asyncSql(firstCall.sql)));
const firstResults = firstParallel.map((output) => JSON.parse(output.split("\n").filter((line) => line.startsWith("{")).at(-1)));
assert.equal(firstResults.filter((result) => result.idempotent === false).length, 1);
assert.equal(firstResults.filter((result) => result.idempotent === true).length, 7);
assert.equal(new Set(firstResults.map((result) => result.receipt_id)).size, 1);
const firstReceipt = firstResults[0].receipt_id;
assert.equal(sql(`select count(*) from public.test_only_kyb_review_audit where receipt_id='${firstReceipt}';`), "1");

// A replay is actor- and payload-bound, even after the workflow has advanced.
assert.equal(json(firstCall.sql).idempotent, true);
denied(decide({ actor: actor2, session: session2, request: firstRequest, state: primaryInitial }).sql, /TEST_ONLY_KYB_REVIEW_REPLAY_CONFLICT/i);
denied(firstCall.sql.replace("TEST_ONLY_LOCAL_FIRST_REVIEW", "TEST_ONLY_CHANGED_FIRST_REVIEW"), /TEST_ONLY_KYB_REVIEW_REPLAY_CONFLICT/i);

const afterFirst = read(primary);
assert.equal(afterFirst.previous_receipt_id, firstReceipt);
assert.equal(afterFirst.previous_action, "FIRST_REVIEW");
assert.equal(afterFirst.same_reviewer, true);
denied(decide({ action: "APPROVE_TEST", state: afterFirst }).sql, /TEST_ONLY_KYB_REVIEW_SECOND_PERSON_REQUIRED/i);

// A source-document replacement between decisions makes the first receipt stale.
const replacement = randomUUID();
sql(`begin;
update public.business_verification_documents set status='SUPERSEDED',superseded_at=clock_timestamp()
where id='${primary.gisa}';
insert into public.business_verification_documents(
 id,case_id,restaurant_id,organization_id,document_type,version,replaces_document_id,storage_object_name,mime_type,
 byte_size,content_sha256,status,reservation_request_id,completion_request_id,correlation_id,completion_correlation_id,uploaded_by,uploaded_at
) values('${replacement}','${primary.caseId}','${primary.restaurant}','${primary.organization}','GISA_EXTRACT',4,'${primary.gisa}',
 '${primary.restaurant}/${primary.caseId}/${replacement}/document.pdf','application/pdf',3000,repeat('e',64),'UPLOADED',
 '${randomUUID()}','${randomUUID()}','${randomUUID()}','${randomUUID()}','${owner}',clock_timestamp());
${auth({ who: actor2, session: session2 })}
do $block$ begin
  perform public.decide_platform_test_only_kyb_review(
    '${primary.restaurant}','${primary.organization}','${primary.branch}','APPROVE_TEST',${afterFirst.material_revision},
    ${q(afterFirst.snapshot_sha256)},'${firstReceipt}',${q(JSON.stringify(afterFirst.documents))}::jsonb,
    'TEST_ONLY_LOCAL_APPROVE_TEST',true,${q(`TEST_ONLY KYB APPROVE_TEST ${primary.name}`)},'${randomUUID()}'
  );
  raise exception 'EXPECTED_STALE_DENIAL';
exception when sqlstate 'P0001' then null; end $block$;
rollback;`);
assert.equal(sql(`select count(*) from public.test_only_kyb_review_receipts where restaurant_id='${primary.restaurant}';`), "1");
assert.equal(read(primary, { who: actor2, session: session2 }).snapshot_sha256, primaryInitial.snapshot_sha256);

const approvalState = read(primary, { who: actor2, session: session2 });
const approvalRequest = randomUUID();
const approvalCall = decide({
  actor: actor2, session: session2, action: "APPROVE_TEST", state: approvalState, request: approvalRequest,
});
const approval = json(approvalCall.sql);
assert.equal(approval.synthetic_test_only, true);
assert.equal(approval.real_kyb_verified, false);
assert.equal(approval.synthetic_review_complete, true);
assert.equal(json(approvalCall.sql).idempotent, true);
const completed = read(primary, { who: actor2, session: session2 });
assert.equal(completed.synthetic_review_complete, true);
assert.equal(sql(`select count(distinct actor_id) from public.test_only_kyb_review_receipts where restaurant_id='${primary.restaurant}';`), "2");
assert.equal(sql(`select count(distinct snapshot_sha256) from public.test_only_kyb_review_receipts where restaurant_id='${primary.restaurant}';`), "1");
assert.equal(sql(`select count(distinct material_revision) from public.test_only_kyb_review_receipts where restaurant_id='${primary.restaurant}';`), "1");
assert.equal(sql(`select count(distinct document_manifest) from public.test_only_kyb_review_receipts where restaurant_id='${primary.restaurant}';`), "1");

// A deliberately failed audit insert rolls the receipt back in the same transaction.
sql(`create function public.local_test_reject_test_only_audit() returns trigger language plpgsql as $$begin raise exception 'SYNTHETIC_AUDIT_FAILURE'; end$$;
create trigger reject_test_only_audit before insert on public.test_only_kyb_review_audit
for each row execute function public.local_test_reject_test_only_audit();`);
const rollbackState = read(rollback);
denied(decide({ tenant: rollback, state: rollbackState }).sql, /SYNTHETIC_AUDIT_FAILURE/i);
assert.equal(sql(`select count(*) from public.test_only_kyb_review_receipts where restaurant_id='${rollback.restaurant}';`), "0");
assert.equal(sql(`select count(*) from public.test_only_kyb_review_audit where restaurant_id='${rollback.restaurant}';`), "0");
sql("drop trigger reject_test_only_audit on public.test_only_kyb_review_audit; drop function public.local_test_reject_test_only_audit();");

// Distinct-request races are tenant-serialized/fail-fast: one effect, never two.
const raceState1 = read(race);
const raceState2 = read(race, { who: actor2, session: session2 });
const raced = await Promise.allSettled([
  asyncSql(decide({ tenant: race, state: raceState1, actor: actor1, session: session1, request: randomUUID() }).sql),
  asyncSql(decide({ tenant: race, state: raceState2, actor: actor2, session: session2, request: randomUUID() }).sql),
]);
assert.equal(raced.filter((entry) => entry.status === "fulfilled").length, 1);
assert.equal(raced.filter((entry) => entry.status === "rejected").length, 1);
assert.equal(sql(`select count(*) from public.test_only_kyb_review_receipts where restaurant_id='${race.restaurant}';`), "1");
assert.equal(sql(`select count(*) from public.test_only_kyb_review_audit where restaurant_id='${race.restaurant}';`), "1");

// Immutability applies even to postgres; no role has table access.
for (const statement of [
  `update public.test_only_kyb_review_receipts set reference=reference where restaurant_id='${primary.restaurant}'`,
  `delete from public.test_only_kyb_review_receipts where restaurant_id='${primary.restaurant}'`,
  "truncate public.test_only_kyb_review_receipts cascade",
  `update public.test_only_kyb_review_audit set event_type=event_type where restaurant_id='${primary.restaurant}'`,
  `delete from public.test_only_kyb_review_audit where restaurant_id='${primary.restaurant}'`,
  "truncate public.test_only_kyb_review_audit",
]) denied(statement, /BUSINESS_VERIFICATION_AUDIT_IMMUTABLE/i);

const receiptHashValid = sql(`select count(*) from public.test_only_kyb_review_audit audit
join public.test_only_kyb_review_receipts receipt on receipt.id=audit.receipt_id
where audit.restaurant_id='${primary.restaurant}' and audit.receipt_sha256=encode(extensions.digest(convert_to(jsonb_build_object(
 'receipt_id',receipt.id,'restaurant_id',receipt.restaurant_id,'organization_id',receipt.organization_id,
 'branch_id',receipt.branch_id,'case_id',receipt.case_id,'material_revision',receipt.material_revision,
 'action',receipt.action,'actor_id',receipt.actor_id,'request_id',receipt.request_id,
 'previous_receipt_id',receipt.previous_receipt_id,'document_manifest',receipt.document_manifest,
 'snapshot_sha256',receipt.snapshot_sha256,'reference',receipt.reference,
 'auth_evidence',receipt.auth_evidence,'result',receipt.result
)::text,'UTF8'),'sha256'),'hex');`);
assert.equal(receiptHashValid, "2");

const primarySideEffectsAfter = sideEffects(primary);
assert.deepEqual(primarySideEffectsAfter, primarySideEffectsBefore);
assert.equal(primarySideEffectsAfter.case_status, "PENDING_ACTIVATION");
assert.equal(primarySideEffectsAfter.case_decided_at, null);
assert.equal(primarySideEffectsAfter.real_intake, "BLOCKED");
assert.equal(primarySideEffectsAfter.catalog_access, false);
assert.equal(primarySideEffectsAfter.subscription.trial_started_at, null);
assert.equal(primarySideEffectsAfter.subscription.stripe_subscription_id, null);
assert.equal(sql(`select count(*) from public.business_verification_cases where restaurant_id='${primary.restaurant}' and status='VERIFIED';`), "0");
assert.equal(sql(`select count(*) from public.platform_operator_review_events where restaurant_id='${primary.restaurant}';`), "0");
assert.equal(sql(`select count(*) from public.business_verification_test_receipts where restaurant_id='${primary.restaurant}';`), "0");
assert.equal(sql(`select count(*) from public.test_only_kyb_review_receipts where restaurant_id='${primary.restaurant}';`), "2");
assert.equal(sql(`select count(*) from public.test_only_kyb_review_audit where restaurant_id='${primary.restaurant}';`), "2");
assert.equal(sql(`select md5(pg_get_functiondef('public.resolve_business_verification_readiness_internal(uuid,text,timestamptz)'::regprocedure))||'|'||md5(pg_get_functiondef('public.decide_platform_operator_review(uuid,uuid,uuid,text,text,text,uuid,text,jsonb,boolean,text,uuid)'::regprocedure));`), realDefinitionsBefore);

console.log(JSON.stringify({
  status: "TEST_ONLY_KYB_REVIEW_LOCAL_PASS",
  project_ref: projectRef,
  positive_receipts: 2,
  positive_audit_events: 2,
  distinct_reviewers: 2,
  exact_document_manifest: primaryInitial.documents,
  same_request_parallelism: { calls: 8, first_write: 1, idempotent_replays: 7 },
  distinct_request_race: { writes: 1, rejected: 1 },
  rollback_receipts: 0,
  rollback_audit_events: 0,
  case_status: primarySideEffectsAfter.case_status,
  real_kyb_verified: false,
  at_real_intake: primarySideEffectsAfter.real_intake,
  catalog_access: primarySideEffectsAfter.catalog_access,
  trial_delta: 0,
  pro_delta: 0,
  checkout_delta: 0,
  mail_delta: 0,
  shared_real_gate_definitions: "UNCHANGED",
  cloud_writes: 0,
}));
