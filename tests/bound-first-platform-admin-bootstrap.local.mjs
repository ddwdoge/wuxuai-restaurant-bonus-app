// Disposable local-stack proof. No hosted project or external identity is touched.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, randomUUID } from "node:crypto";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const cli = resolve(root, "node_modules/.bin/supabase");
const taskRoot = mkdtempSync(join(tmpdir(), "wuxuai-first-platform-owner-"));
const projectId = taskRoot.split("/").at(-1).toLowerCase();
const run = (bin, args, input) => execFileSync(bin, args, {
  input,
  encoding: "utf8",
  stdio: ["pipe", "pipe", "pipe"],
  maxBuffer: 32 * 1024 * 1024,
  env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1", DO_NOT_TRACK: "1" },
}).trim();
const sqlArgs = ["exec", "-i", `supabase_db_${projectId}`, "psql", "-X", "-qAt", "-U", "postgres", "-v", "ON_ERROR_STOP=1"];
const sql = (statement) => run("docker", sqlArgs, statement);
const jsonSql = (statement) => JSON.parse(sql(statement));
const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
const denied = (statement, code) => assert.throws(
  () => sql(statement),
  (error) => String(error.stderr ?? error.message).includes(code),
);
const deniedAny = (statement) => assert.throws(() => sql(statement));
const asyncSql = (statement) => new Promise((resolvePromise, rejectPromise) => {
  const child = spawn("docker", sqlArgs, { stdio: ["pipe", "pipe", "pipe"] });
  let output = "";
  let error = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { error += chunk; });
  child.once("error", rejectPromise);
  child.once("close", (code) => code === 0
    ? resolvePromise(output.trim())
    : rejectPromise(new Error(error.trim())));
  child.stdin.end(statement);
});

let started = false;
let assertions = 0;
const check = (actual, expected) => {
  assert.deepEqual(actual, expected);
  assertions += 1;
};

try {
  mkdirSync(join(taskRoot, "supabase"));
  const basePort = 58520;
  const config = readFileSync(join(root, "supabase/config.toml"), "utf8")
    .replace(/^project_id = .+$/m, `project_id = "${projectId}"`)
    .replace(/561(\d\d)/g, (_, suffix) => String(basePort + Number(suffix) - 20));
  writeFileSync(join(taskRoot, "supabase/config.toml"), config);
  cpSync(join(root, "supabase/migrations"), join(taskRoot, "supabase/migrations"), { recursive: true });
  run(cli, ["start", "--workdir", taskRoot, "-x", "realtime,storage-api,imgproxy,studio,postgres-meta,edge-runtime,logflare,vector,supavisor"]);
  started = true;
  const status = JSON.parse(run(cli, ["status", "--workdir", taskRoot, "--output", "json"]));

  const post = async (path, body, token = null) => {
    const headers = { "Content-Type": "application/json", apikey: status.ANON_KEY };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${status.API_URL}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  };
  const signup = async (label) => {
    const email = `${label}-${randomUUID()}@example.invalid`;
    const response = await post("/auth/v1/signup", {
      email,
      password: `Aa!${randomBytes(24).toString("hex")}`,
    });
    check(response.status, 200);
    assert.ok(response.data.user?.id);
    assert.ok(response.data.access_token);
    assertions += 2;
    return { email, id: response.data.user.id, token: response.data.access_token };
  };

  const owner = await signup("tenant-owner");
  const ownerStart = await post("/rest/v1/rpc/start_restaurant_owner_trial", {
    input_owner_name: "Synthetic Tenant Owner",
    input_restaurant_name: "Synthetic tenant for bootstrap rejection",
    input_phone: null,
    input_country: "AT",
  }, owner.token);
  if (ownerStart.status !== 200) {
    throw new Error(`OWNER_PRODUCT_SETUP_${ownerStart.status}_${String(ownerStart.data?.code ?? "UNKNOWN")}`);
  }
  check(ownerStart.status, 200);
  const unconfirmed = await signup("unconfirmed-admin");
  sql(`update auth.users set email_confirmed_at=null where id=${q(unconfirmed.id)}::uuid;`);
  const candidate = await signup("platform-owner");

  const projectRef = "mbgveqbhessaunrhfudm";
  const issuer = `https://${projectRef}.supabase.co/auth/v1`;
  const origin = "https://staging-v2.bonus.wuxuaisbi.com";
  const anchor = jsonSql("select public.get_project_bootstrap_anchor();");
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
    operator_ref: "synthetic-local-first-admin-test",
    environment: "STAGING",
  };
  const installed = jsonSql(`select project_bootstrap.install(${q(JSON.stringify(bindingInput))}::jsonb,${q("b".repeat(64))});`);
  const setupRequest = randomUUID();
  jsonSql(`select project_bootstrap.activate_bound_staging_environment(
    ${q(setupRequest)}::uuid,${q(installed.binding_id)}::uuid,${q(projectRef)},${q(issuer)},${q(origin)},
    'synthetic-local-first-admin-test',${q("c".repeat(64))},
    ${q(`CONFIRMED:BOUND_STAGING_SETUP:${installed.binding_id}:${setupRequest}`)}
  );`);

  const sideEffects = () => jsonSql(`select jsonb_build_object(
    'restaurants',(select count(*) from public.restaurants),
    'organizations',(select count(*) from public.organizations),
    'branches',(select count(*) from public.branches),
    'subscriptions',(select count(*) from public.branch_subscriptions),
    'kyb_cases',(select count(*) from public.business_verification_cases),
    'test_markers',(select count(*) from public.platform_test_tenant_registry),
    'pro_grants',(select count(*) from public.commercial_pro_access_grants),
    'checkout_requests',(select count(*) from public.basic_test_checkout_requests),
    'mail_deliveries',(select count(*) from public.customer_transactional_email_deliveries),
    'catalog_rows',(select count(*) from public.restaurant_menu_catalogs),
    'catalog_objects',(select count(*) from storage.objects where bucket_id='restaurant-menu-private'),
    'at_real_intake',(select real_intake_status from public.country_kyb_intake_policies where country_code='AT')
  );`);
  const before = sideEffects();
  const requestId = randomUUID();
  const reason = "Create the first isolated staging-v2 Platform Owner identity.";
  const evidence = "d".repeat(64);
  const bootstrapSql = ({ user = candidate, request = requestId, email = user.email, binding = installed.binding_id, confirmation = null } = {}) => {
    const confirmed = confirmation ?? `CONFIRMED:FIRST_PLATFORM_OWNER:${binding}:${user.id}:${request}`;
    return `select project_bootstrap.bootstrap_first_platform_owner(
      ${q(request)}::uuid,${q(binding)}::uuid,${q(projectRef)},${q(issuer)},${q(origin)},
      ${q(user.id)}::uuid,${q(email)},'synthetic-local-first-admin-test',${q(reason)},${q(evidence)},${q(confirmed)}
    );`;
  };

  denied(bootstrapSql({ user: owner, request: randomUUID() }), "FIRST_PLATFORM_ADMIN_BOOTSTRAP_IDENTITY_NOT_SEPARATE");
  denied(bootstrapSql({ user: unconfirmed, request: randomUUID() }), "FIRST_PLATFORM_ADMIN_BOOTSTRAP_AUTH_IDENTITY_INVALID");
  denied(bootstrapSql({ request: randomUUID(), confirmation: "WRONG" }), "FIRST_PLATFORM_ADMIN_BOOTSTRAP_STRONG_CONFIRMATION_REQUIRED");
  denied(bootstrapSql({ request: randomUUID(), binding: randomUUID() }), "FIRST_PLATFORM_ADMIN_BOOTSTRAP_BINDING_MISMATCH");

  const parallel = await Promise.all([asyncSql(bootstrapSql()), asyncSql(bootstrapSql())]);
  const parallelResults = parallel.map(JSON.parse);
  check(parallelResults.filter((result) => result.idempotent === false).length, 1);
  check(parallelResults.filter((result) => result.idempotent === true).length, 1);
  check(new Set(parallelResults.map((result) => result.auth_user_id)).size, 1);
  check(sql("select count(*) from public.platform_admins where active and role='platform_owner';"), "1");
  check(sql("select count(*) from project_bootstrap.first_platform_admin_bootstrap_audit;"), "1");
  check(jsonSql(bootstrapSql()).idempotent, true);
  denied(bootstrapSql({ request: randomUUID() }), "FIRST_PLATFORM_ADMIN_BOOTSTRAP_ALREADY_COMPLETED");
  denied(bootstrapSql({ email: `other-${candidate.email}` }), "FIRST_PLATFORM_ADMIN_BOOTSTRAP_IDEMPOTENCY_CONFLICT");
  check(sideEffects(), before);

  for (const role of ["anon", "authenticated", "service_role"]) {
    check(sql(`select has_schema_privilege(${q(role)},'project_bootstrap','USAGE');`), "f");
    check(sql(`select has_function_privilege(${q(role)},'project_bootstrap.bootstrap_first_platform_owner(uuid,uuid,text,text,text,uuid,text,text,text,text,text)','EXECUTE');`), "f");
    check(sql(`select has_table_privilege(${q(role)},'project_bootstrap.first_platform_admin_bootstrap_audit','SELECT');`), "f");
    deniedAny(`begin; set local role ${role}; ${bootstrapSql({ request: randomUUID() })}; rollback;`);
  }
  denied("update project_bootstrap.first_platform_admin_bootstrap_audit set reason=reason;", "FIRST_PLATFORM_ADMIN_BOOTSTRAP_AUDIT_IMMUTABLE");
  denied("truncate project_bootstrap.first_platform_admin_bootstrap_audit;", "FIRST_PLATFORM_ADMIN_BOOTSTRAP_AUDIT_IMMUTABLE");

  const roleRead = await post("/rest/v1/rpc/get_current_platform_role", {}, candidate.token);
  check(roleRead.status, 200);
  check(roleRead.data, "platform_owner");
  const protectedRead = await post("/rest/v1/rpc/get_platform_restaurants", {}, candidate.token);
  assert.notEqual(protectedRead.status, 200);
  assert.match(JSON.stringify(protectedRead.data), /Nicht berechtigt|42501/);
  assertions += 2;
  check(sql(`select count(*) from auth.mfa_factors where user_id=${q(candidate.id)}::uuid and factor_type='totp' and status='verified';`), "0");
  check(sql(`select count(*) from auth.sessions where user_id=${q(candidate.id)}::uuid and aal='aal2';`), "0");
  check(sql("select environment from public.business_verification_environment where singleton;"), "STAGING");
  check(sql("select real_intake_status from public.country_kyb_intake_policies where country_code='AT';"), "BLOCKED");

  const lint = run(cli, ["db", "lint", "--local", "--workdir", taskRoot, "--schema", "project_bootstrap", "--level", "error", "--fail-on", "error"]);
  assert.doesNotMatch(lint, /ERROR|"level"\s*:\s*"error"/);
  assertions += 1;
  console.log(JSON.stringify({
    status: "LOCAL_FIRST_PLATFORM_OWNER_BOOTSTRAP_PASS",
    assertions,
    platformOwners: 1,
    auditRows: 1,
    totpFactors: 0,
    aal2Sessions: 0,
    protectedPlatformActionAtAal1: "DENIED",
    sideEffectsUnchanged: true,
    realAtIntake: "BLOCKED",
  }));
} catch (error) {
  console.error(JSON.stringify({
    status: "FAIL",
    code: /^[A-Z_0-9]+$/.test(error.message) ? error.message : "LOCAL_ASSERTION_FAILED",
    locations: error.stack?.split("\n").filter((line) => line.includes("bound-first-platform-admin-bootstrap.local.mjs")),
  }));
  process.exitCode = 1;
} finally {
  if (started) {
    try { run(cli, ["stop", "--workdir", taskRoot, "--no-backup"]); } catch {
      console.error(JSON.stringify({ status: "CLEANUP_FAILED" }));
      process.exitCode = 1;
    }
  }
  rmSync(taskRoot, { recursive: true, force: true });
}
