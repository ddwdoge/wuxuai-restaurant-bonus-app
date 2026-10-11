import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
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
const fixture = json(`select jsonb_build_object(
  'restaurant',receipt.restaurant_id,
  'organization',receipt.organization_id,
  'branch',receipt.branch_id,
  'case_id',receipt.case_id,
  'name',restaurant.name,
  'actor',(select user_id from public.platform_admins where active order by role desc,user_id limit 1),
  'session',(select session.id from auth.sessions session join public.platform_admins admin_row on admin_row.user_id=session.user_id where admin_row.active order by admin_row.role desc,session.id limit 1)
) from public.test_only_kyb_review_receipts receipt
join public.restaurants restaurant on restaurant.id=receipt.restaurant_id
where receipt.action='APPROVE_TEST'
order by receipt.sequence limit 1;`);

const claims = ({ age = 0, jwtIssuer = issuer, timestamp = Math.floor(Date.now() / 1000) - age } = {}) => JSON.stringify({
  sub: fixture.actor,
  role: "authenticated",
  session_id: fixture.session,
  iss: jwtIssuer,
  aal: "aal2",
  amr: [{ method: "totp", timestamp }],
}).replaceAll("'", "''");
const auth = (options = {}) => `set local role authenticated;
select set_config('request.jwt.claims','${claims(options)}',true);`;

const body = "TEST ONLY: Synthetic platform terms for activation/trial readiness; no real legal approval.";
const bodyHash = createHash("sha256").update(body, "utf8").digest("hex");
const area = (name) => {
  const text = `TEST ONLY: Synthetic ${name} evidence for activation/trial readiness.`;
  return { status: "VERIFIED_TEST_ONLY", version: "TEST_ONLY_ACTIVATION_TRIAL_V1",
    source: "TEST_ONLY_ACTIVATION_TRIAL_LOCAL", body: text,
    sha256: createHash("sha256").update(text, "utf8").digest("hex") };
};
const manifest = { schema_version: "1", test_only: true, country: "AT", locale: "de-AT",
  restaurant_id: fixture.restaurant, legal: area("legal"), privacy: area("privacy"),
  document_catalog: area("document catalog"), retention: area("retention") };

const platform = json(`begin; ${auth({ age: 4 })}
select public.set_platform_terms_test_publication(
  '${fixture.restaurant}','PUBLISH_TEST','TEST_ONLY_ACTIVATION_TRIAL_V1',${q(body)},
  'TEST ONLY: Synthetic provider snapshot',null,'${randomUUID()}'
); commit;`);
assert.equal(platform.sha256, bodyHash);
const merchant = json(`begin; ${auth({ age: 3 })}
select public.set_platform_at_legal_synthetic_test_publication(
  '${fixture.restaurant}','PUBLISH_TEST',${q(JSON.stringify(manifest))}::jsonb,
  'NOT_FOUND',null,'${randomUUID()}'
); commit;`);
assert.equal(merchant.test_only, true);

const read = (options = {}) => json(`begin; ${auth(options)}
select public.get_platform_test_only_activation_trial('${fixture.restaurant}'); commit;`);
const decide = ({ state, action, request = randomUUID(), age = 0,
  timestamp,
  previous = state.previous_receipt_id, hash = state.snapshot_sha256,
  reference = `TEST_ONLY_LOCAL_${action}` } = {}) => ({
  request,
  sql: `begin; ${auth({ age, timestamp })}
select public.decide_platform_test_only_activation_trial(
  '${fixture.restaurant}',${q(action)},${q(hash)},
  ${previous ? `${q(previous)}::uuid` : "null"},${q(reference)},
  ${q(`TEST_ONLY ${action} ${fixture.restaurant}`)},'${request}'
); commit;`,
});

const sideEffects = () => json(`select jsonb_build_object(
  'restaurant',(select jsonb_build_object('status',status,'activation_status',activation_status,
    'legal_ready',legal_ready,'operational_ready',operational_ready,'security_ready',security_ready)
    from public.restaurants where id='${fixture.restaurant}'),
  'branch_status',(select status from public.branches where id='${fixture.branch}'),
  'subscription',(select jsonb_build_object('status',status,'subscription_status',subscription_status,
    'trial_started_at',trial_started_at,'trial_ends_at',trial_ends_at,
    'stripe_customer_id',stripe_customer_id,'stripe_subscription_id',stripe_subscription_id)
    from public.branch_subscriptions where branch_id='${fixture.branch}'),
  'case_status',(select status from public.business_verification_cases where id='${fixture.case_id}'),
  'real_legal',(select count(*) from public.legal_operator_publication_decisions where restaurant_id='${fixture.restaurant}'),
  'real_trial',(select count(*) from public.manual_basic_trial_decisions where restaurant_id='${fixture.restaurant}'),
  'trial_claims',(select count(*) from public.billing_trial_claims where restaurant_id='${fixture.restaurant}'),
  'pro_grants',(select count(*) from public.commercial_pro_access_grants where restaurant_id='${fixture.restaurant}'),
  'checkout',(select count(*) from public.basic_test_checkout_requests where restaurant_id='${fixture.restaurant}'),
  'mail',(select count(*) from public.customer_offer_email_deliveries where restaurant_id='${fixture.restaurant}'),
  'real_intake',(select real_intake_status from public.country_kyb_intake_policies where country_code='AT'),
  'catalog_access',public.restaurant_menu_access_internal('${fixture.restaurant}','${fixture.branch}'),
  'catalog_objects',(select count(*) from storage.objects where bucket_id='restaurant-menu-private')
);`);
const before = sideEffects();

denied(`begin; set local role anon; select public.get_platform_test_only_activation_trial('${fixture.restaurant}'); rollback;`,
  /permission denied|LEGAL_BUNDLE_ACCESS_DENIED|PROJECT_BINDING_REQUIRED/i);
denied(`begin; ${auth({ age: 601 })} select public.get_platform_test_only_activation_trial('${fixture.restaurant}'); rollback;`,
  /RECENT_PLATFORM_TOTP_REQUIRED/i);
denied(`begin; ${auth({ jwtIssuer: "https://wrong.example.invalid/auth/v1" })} select public.get_platform_test_only_activation_trial('${fixture.restaurant}'); rollback;`,
  /PROJECT_BINDING_REQUIRED/i);
for (const role of ["anon", "authenticated", "service_role"]) {
  assert.equal(sql(`select has_table_privilege('${role}','public.test_only_activation_trial_receipts','SELECT');`), "f");
  assert.equal(sql(`select has_table_privilege('${role}','public.test_only_activation_trial_audit','INSERT');`), "f");
}

const initial = read({ age: 3 });
assert.equal(initial.synthetic_test_only, true);
assert.equal(initial.real_activation, false);
assert.equal(initial.real_trial, false);
assert.equal(initial.next_action, "ACTIVATION_READINESS_TEST");
assert.equal(initial.snapshot.kyb.synthetic_review_complete, true);
assert.equal(initial.snapshot.kyb.real_kyb_verified, false);
assert.equal(initial.snapshot.legal.platform_publication_id, platform.id);
assert.equal(initial.snapshot.legal.merchant_publication_id, merchant.event_id);

// Audit failure rolls the decision back atomically.
sql(`create function public.local_reject_activation_trial_audit() returns trigger language plpgsql as
$$begin raise exception 'SYNTHETIC_AUDIT_FAILURE'; end$$;
create trigger reject_activation_trial_audit before insert on public.test_only_activation_trial_audit
for each row execute function public.local_reject_activation_trial_audit();`);
denied(decide({ state: initial, action: "ACTIVATION_READINESS_TEST", age: 2 }).sql, /SYNTHETIC_AUDIT_FAILURE/i);
assert.equal(sql(`select count(*) from public.test_only_activation_trial_receipts where restaurant_id='${fixture.restaurant}';`), "0");
sql("drop trigger reject_activation_trial_audit on public.test_only_activation_trial_audit; drop function public.local_reject_activation_trial_audit();");

const activationRequest = randomUUID();
const activationTotpAt = Math.floor(Date.now() / 1000) - 2;
const activationCall = decide({ state: initial, action: "ACTIVATION_READINESS_TEST", request: activationRequest,
  timestamp: activationTotpAt });
const activationParallel = await Promise.all(Array.from({ length: 6 }, () => asyncSql(activationCall.sql)));
const activationResults = activationParallel.map((output) => JSON.parse(output.split("\n").filter((line) => line.startsWith("{")).at(-1)));
assert.equal(activationResults.filter((result) => result.idempotent === false).length, 1);
assert.equal(activationResults.filter((result) => result.idempotent === true).length, 5);
assert.equal(new Set(activationResults.map((result) => result.receipt_id)).size, 1);
denied(activationCall.sql.replace("TEST_ONLY_LOCAL_ACTIVATION_READINESS_TEST", "TEST_ONLY_CHANGED_ACTIVATION"),
  /TEST_ONLY_ACTIVATION_TRIAL_REPLAY_CONFLICT/i);

const afterActivation = read({ age: 1 });
assert.equal(afterActivation.next_action, "TRIAL_READINESS_TEST");
denied(decide({ state: afterActivation, action: "TRIAL_READINESS_TEST", timestamp: activationTotpAt }).sql,
  /TEST_ONLY_ACTIVATION_TRIAL_NEW_TOTP_REQUIRED/i);
denied(decide({ state: afterActivation, action: "TRIAL_READINESS_TEST", age: 0,
  hash: "f".repeat(64) }).sql, /TEST_ONLY_ACTIVATION_TRIAL_STALE/i);
const trial = json(decide({ state: afterActivation, action: "TRIAL_READINESS_TEST",
  timestamp: activationTotpAt + 1 }).sql);
assert.equal(trial.synthetic_test_only, true);
assert.equal(trial.real_activation, false);
assert.equal(trial.real_trial, false);
assert.equal(trial.synthetic_chain_complete, true);

const completed = read({ age: 0 });
assert.equal(completed.synthetic_chain_complete, true);
assert.equal(completed.next_action, null);
assert.equal(sql(`select count(*) from public.test_only_activation_trial_receipts where restaurant_id='${fixture.restaurant}';`), "2");
assert.equal(sql(`select count(*) from public.test_only_activation_trial_audit where restaurant_id='${fixture.restaurant}';`), "2");
denied(`update public.test_only_activation_trial_receipts set reference=reference where restaurant_id='${fixture.restaurant}'`,
  /BUSINESS_VERIFICATION_APPEND_ONLY/i);
denied(`delete from public.test_only_activation_trial_audit where restaurant_id='${fixture.restaurant}'`,
  /BUSINESS_VERIFICATION_APPEND_ONLY/i);

const after = sideEffects();
assert.deepEqual(after, before);
assert.equal(after.restaurant.status, "draft");
assert.equal(after.restaurant.activation_status, "pending_activation");
assert.equal(after.subscription.subscription_status, "pending_activation");
assert.equal(after.subscription.trial_started_at, null);
assert.equal(after.case_status, "PENDING_ACTIVATION");
assert.equal(after.real_intake, "BLOCKED");
assert.equal(after.catalog_access, false);
assert.equal(after.catalog_objects, 0);

console.log(JSON.stringify({
  status: "TEST_ONLY_ACTIVATION_TRIAL_LOCAL_PASS",
  project_ref: projectRef,
  app_origin: origin,
  kyb_chain_consumed: "2/2",
  legal_platform_hash: bodyHash,
  legal_merchant_hash: merchant.bundle_hash,
  readiness_receipts: 2,
  audit_events: 2,
  activation_writes: 0,
  trial_writes: 0,
  pro_writes: 0,
  checkout_writes: 0,
  mail_writes: 0,
  catalog_writes: 0,
  at_real_intake: after.real_intake,
  rollback_receipts: 0,
  same_request_parallelism: { calls: 6, first_write: 1, idempotent_replays: 5 },
  cloud_writes: 0,
}));
