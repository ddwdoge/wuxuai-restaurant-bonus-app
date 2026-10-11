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
assert.ok(projectId);
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
const json = (input) => JSON.parse(sql(input));
const denied = (input, code) => {
  assert.throws(() => sql(input), (error) => String(error.stderr ?? error.message).includes(code));
};

const projectRef = "mbgveqbhessaunrhfudm";
const issuer = `https://${projectRef}.supabase.co/auth/v1`;
const origin = "https://staging-v2.bonus.wuxuaisbi.com";
const anchor = json("select public.get_project_bootstrap_anchor();");
const bindingRequest = randomUUID();
const binding = {
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
  operator_ref: "synthetic-local-contract-test",
  environment: "STAGING",
};
let expectedBindingId = randomUUID();
const setupRequest = randomUUID();
const evidence = "a".repeat(64);
const setupSql = (requestId = setupRequest, operator = "synthetic-local-contract-test", overrides = {}) => {
  const expected = {
    binding_id: expectedBindingId,
    project_ref: projectRef,
    issuer,
    origin,
    ...overrides,
  };
  return `select project_bootstrap.activate_bound_staging_environment(
    ${q(requestId)}::uuid,${q(expected.binding_id)}::uuid,${q(expected.project_ref)},${q(expected.issuer)},
    ${q(expected.origin)},${q(operator)},${q(evidence)},
    ${q(`CONFIRMED:BOUND_STAGING_SETUP:${expected.binding_id}:${requestId}`)}
  );`;
};
const sideEffects = () => json(`select jsonb_build_object(
  'restaurants',(select count(*) from public.restaurants),
  'test_markers',(select count(*) from public.platform_test_tenant_registry),
  'pro_grants',(select count(*) from public.commercial_pro_access_grants),
  'checkout_requests',(select count(*) from public.basic_test_checkout_requests),
  'checkout_blocked',(select count(*) from public.billing_checkout_blocked_requests),
  'mail_deliveries',(select count(*) from public.customer_transactional_email_deliveries),
  'mail_outbox',(select count(*) from public.customer_offer_email_confirmation_outbox),
  'catalog_rows',(select count(*) from public.restaurant_menu_catalogs),
  'catalog_objects',(select count(*) from storage.objects where bucket_id='restaurant-menu-private'),
  'catalog_bucket_limit',(select file_size_limit from storage.buckets where id='restaurant-menu-private'),
  'at_real_intake',(select real_intake_status from public.country_kyb_intake_policies where country_code='AT')
);`);

assert.equal(sql("select environment||'|'||change_ref from public.business_verification_environment where singleton;"), "DISABLED|LOCAL_MIGRATION_DEFAULT");
assert.equal(sql("select count(*) from project_bootstrap.binding;"), "0");
denied(setupSql(), "PROJECT_BINDING_REQUIRED");

const installed = json(`select project_bootstrap.install(${q(JSON.stringify(binding))}::jsonb,${q("b".repeat(64))});`);
expectedBindingId = installed.binding_id;
assert.equal(sql("select count(*) from project_bootstrap.binding;"), "1");
const before = sideEffects();

for (const role of ["anon", "authenticated", "service_role"]) {
  assert.equal(sql(`select has_schema_privilege(${q(role)},'project_bootstrap','USAGE');`), "f");
  assert.equal(sql(`select has_function_privilege(${q(role)},'project_bootstrap.activate_bound_staging_environment(uuid,uuid,text,text,text,text,text,text)','EXECUTE');`), "f");
  assert.equal(sql(`select has_table_privilege(${q(role)},'public.business_verification_environment','UPDATE');`), "f");
  denied(`begin; set local role ${role}; ${setupSql()} rollback;`, "permission denied");
}
denied("update public.business_verification_environment set environment='STAGING';", "BUSINESS_VERIFICATION_ENVIRONMENT_DIRECT_WRITE_DENIED");
denied(setupSql(setupRequest, "synthetic-local-contract-test", { project_ref: "b".repeat(20) }), "STAGING_ENVIRONMENT_SETUP_INPUT_INVALID");
denied(setupSql(setupRequest, "synthetic-local-contract-test", { issuer: "https://b.example.invalid/auth/v1" }), "STAGING_ENVIRONMENT_SETUP_INPUT_INVALID");
denied(setupSql(setupRequest, "synthetic-local-contract-test", { origin: "https://wrong.example.invalid" }), "STAGING_ENVIRONMENT_SETUP_INPUT_INVALID");
denied(setupSql(setupRequest, "synthetic-local-contract-test", { binding_id: randomUUID() }), "STAGING_ENVIRONMENT_SETUP_BINDING_MISMATCH");
denied(setupSql().replace("CONFIRMED:BOUND_STAGING_SETUP", "CONFIRMED:WRONG"), "STAGING_ENVIRONMENT_SETUP_STRONG_CONFIRMATION_REQUIRED");
assert.equal(sql("select environment from public.business_verification_environment where singleton;"), "DISABLED");
assert.equal(sql("select count(*) from project_bootstrap.staging_environment_setup_audit;"), "0");

const parallel = await Promise.all([asyncSql(setupSql()), asyncSql(setupSql())]);
const results = parallel.map(JSON.parse);
assert.equal(results.filter((result) => result.idempotent === false).length, 1);
assert.equal(results.filter((result) => result.idempotent === true).length, 1);
assert.ok(results.every((result) => result.binding_id === expectedBindingId && result.environment === "STAGING"));
assert.equal(sql("select count(*) from project_bootstrap.staging_environment_setup_audit;"), "1");
assert.equal(sql("select environment||'|'||change_ref from public.business_verification_environment where singleton;"), `STAGING|BOUND_PROJECT_SETUP:${setupRequest}`);

assert.equal(json(setupSql()).idempotent, true);
denied(setupSql(setupRequest, "different-local-operator"), "STAGING_ENVIRONMENT_SETUP_IDEMPOTENCY_CONFLICT");
denied(setupSql(randomUUID()), "STAGING_ENVIRONMENT_SETUP_REPLAY_DENIED");
for (const mutation of [
  "update project_bootstrap.staging_environment_setup_audit set operator_ref=operator_ref",
  "delete from project_bootstrap.staging_environment_setup_audit",
  "truncate project_bootstrap.staging_environment_setup_audit",
]) denied(mutation, "STAGING_ENVIRONMENT_SETUP_AUDIT_IMMUTABLE");

const after = sideEffects();
assert.deepEqual(after, before);
assert.equal(after.at_real_intake, "BLOCKED");
assert.equal(after.catalog_bucket_limit, 1);
assert.equal(sql("select public.restaurant_menu_access_internal(gen_random_uuid(),gen_random_uuid());"), "f");
assert.equal(sql("select count(*) from public.customer_transactional_email_deliveries;"), "0");
assert.equal(sql("select count(*) from public.basic_test_checkout_requests;"), "0");

console.log(JSON.stringify({
  status: "BOUND_STAGING_ENVIRONMENT_LOCAL_PASS",
  project_ref: projectRef,
  parallel: { first_write: 1, idempotent_replay: 1 },
  audit_rows: 1,
  at_real_intake: after.at_real_intake,
  billing_checkout_delta: 0,
  mail_delta: 0,
  catalog_rows_delta: 0,
  catalog_objects_delta: 0,
  catalog_freeze: "ENFORCED",
}));
