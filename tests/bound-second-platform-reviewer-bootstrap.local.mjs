// Disposable local-stack proof. No hosted project or external identity is touched.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const cli = resolve(root, "node_modules/.bin/supabase");
const taskRoot = mkdtempSync(join(tmpdir(), "wuxuai-second-platform-reviewer-"));
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

function decodeBase32(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of value.toUpperCase().replaceAll("=", "")) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error("INVALID_BASE32_SECRET");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Buffer.from(bytes);
}

function totp(secret, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 30_000);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret)).update(buffer).digest();
  const offset = digest.at(-1) & 0x0f;
  const number = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(number).padStart(6, "0");
}

let started = false;
let assertions = 0;
const check = (actual, expected) => {
  assert.deepEqual(actual, expected);
  assertions += 1;
};

try {
  mkdirSync(join(taskRoot, "supabase"));
  const basePort = 58620;
  const config = readFileSync(join(root, "supabase/config.toml"), "utf8")
    .replace(/^project_id = .+$/m, `project_id = "${projectId}"`)
    .replace(/561(\d\d)/g, (_, suffix) => String(basePort + Number(suffix) - 20));
  writeFileSync(join(taskRoot, "supabase/config.toml"), config);
  cpSync(join(root, "supabase/migrations"), join(taskRoot, "supabase/migrations"), { recursive: true });
  run(cli, ["start", "--workdir", taskRoot, "-x", "realtime,storage-api,imgproxy,studio,postgres-meta,edge-runtime,logflare,vector,supavisor"]);
  started = true;
  const status = JSON.parse(run(cli, ["status", "--workdir", taskRoot, "--output", "json"]));

  const signup = async (label) => {
    const client = createClient(status.API_URL, status.ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    const email = `${label}-${randomUUID()}@example.invalid`;
    const password = `Aa!${randomBytes(24).toString("hex")}`;
    const signed = await client.auth.signUp({ email, password });
    assert.ifError(signed.error);
    assert.ok(signed.data.user?.id);
    assert.ok(signed.data.session?.access_token);
    assertions += 3;
    return { client, email, id: signed.data.user.id, token: signed.data.session.access_token };
  };

  const first = await signup("first-platform-owner");
  const second = await signup("second-platform-reviewer");
  const tenant = await signup("tenant-bound-reviewer");
  const unconfirmed = await signup("unconfirmed-reviewer");
  sql(`update auth.users set email_confirmed_at=null where id=${q(unconfirmed.id)}::uuid;`);
  const tenantStart = await tenant.client.rpc("start_restaurant_owner_trial", {
    input_owner_name: "Synthetic local tenant owner",
    input_restaurant_name: "WUXUAI TEST local tenant",
    input_phone: null,
    input_country: "AT",
  });
  assert.ifError(tenantStart.error);
  assertions += 1;

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
    operator_ref: "synthetic-local-second-reviewer-test",
    environment: "STAGING",
  };
  const installed = jsonSql(`select project_bootstrap.install(${q(JSON.stringify(bindingInput))}::jsonb,${q("b".repeat(64))});`);
  const setupRequest = randomUUID();
  jsonSql(`select project_bootstrap.activate_bound_staging_environment(
    ${q(setupRequest)}::uuid,${q(installed.binding_id)}::uuid,${q(projectRef)},${q(issuer)},${q(origin)},
    'synthetic-local-second-reviewer-test',${q("c".repeat(64))},
    ${q(`CONFIRMED:BOUND_STAGING_SETUP:${installed.binding_id}:${setupRequest}`)}
  );`);

  const firstRequest = randomUUID();
  const firstConfirmation = `CONFIRMED:FIRST_PLATFORM_OWNER:${installed.binding_id}:${first.id}:${firstRequest}`;
  jsonSql(`select project_bootstrap.bootstrap_first_platform_owner(
    ${q(firstRequest)}::uuid,${q(installed.binding_id)}::uuid,${q(projectRef)},${q(issuer)},${q(origin)},
    ${q(first.id)}::uuid,${q(first.email)},'synthetic-local-second-reviewer-test',
    'Create first owner before the isolated second reviewer proof.',${q("d".repeat(64))},${q(firstConfirmation)}
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
  const reason = "Create the isolated second staging-v2 Platform reviewer.";
  const evidence = "e".repeat(64);
  const secondSql = ({
    user = second,
    request = requestId,
    email = user.email,
    binding = installed.binding_id,
    owner = first.id,
    session = randomUUID(),
    confirmation = null,
  } = {}) => {
    const confirmed = confirmation ?? `CONFIRMED:SECOND_PLATFORM_REVIEWER:${binding}:${owner}:${session}:${user.id}:${request}`;
    return `select project_bootstrap.bootstrap_second_platform_reviewer(
      ${q(request)}::uuid,${q(binding)}::uuid,${q(projectRef)},${q(issuer)},${q(origin)},
      ${q(owner)}::uuid,${q(session)}::uuid,${q(user.id)}::uuid,${q(email)},
      'synthetic-local-second-reviewer-test',${q(reason)},${q(evidence)},${q(confirmed)}
    );`;
  };

  denied(secondSql(), "SECOND_PLATFORM_REVIEWER_BOOTSTRAP_FIRST_OWNER_AAL2_REQUIRED");

  const enrollment = await first.client.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "Synthetic local first Platform Owner",
  });
  assert.ifError(enrollment.error);
  const challenge = await first.client.auth.mfa.challenge({ factorId: enrollment.data.id });
  assert.ifError(challenge.error);
  const verification = await first.client.auth.mfa.verify({
    factorId: enrollment.data.id,
    challengeId: challenge.data.id,
    code: totp(enrollment.data.totp.secret),
  });
  assert.ifError(verification.error);
  assertions += 3;
  const aal2Session = sql(`select id from auth.sessions where user_id=${q(first.id)}::uuid and aal='aal2' order by refreshed_at desc nulls last limit 1;`);
  assert.match(aal2Session, /^[a-f0-9-]{36}$/);
  assertions += 1;

  denied(secondSql({ session: randomUUID() }), "SECOND_PLATFORM_REVIEWER_BOOTSTRAP_FIRST_OWNER_AAL2_REQUIRED");
  denied(secondSql({ session: aal2Session, user: tenant, request: randomUUID() }), "SECOND_PLATFORM_REVIEWER_BOOTSTRAP_IDENTITY_NOT_SEPARATE");
  denied(secondSql({ session: aal2Session, user: unconfirmed, request: randomUUID() }), "SECOND_PLATFORM_REVIEWER_BOOTSTRAP_AUTH_IDENTITY_INVALID");
  denied(secondSql({ session: aal2Session, request: randomUUID(), confirmation: "WRONG" }), "SECOND_PLATFORM_REVIEWER_BOOTSTRAP_STRONG_CONFIRMATION_REQUIRED");
  denied(secondSql({ session: aal2Session, request: randomUUID(), binding: randomUUID() }), "SECOND_PLATFORM_REVIEWER_BOOTSTRAP_BINDING_MISMATCH");

  const positiveSql = secondSql({ session: aal2Session });
  const parallel = await Promise.all([asyncSql(positiveSql), asyncSql(positiveSql)]);
  const parallelResults = parallel.map(JSON.parse);
  check(parallelResults.filter((result) => result.idempotent === false).length, 1);
  check(parallelResults.filter((result) => result.idempotent === true).length, 1);
  check(new Set(parallelResults.map((result) => result.auth_user_id)).size, 1);
  check(sql("select count(*) from public.platform_admins where active;"), "2");
  check(sql("select count(*) from public.platform_admins where active and role='platform_owner';"), "1");
  check(sql("select count(*) from public.platform_admins where active and role='platform_admin';"), "1");
  check(sql("select count(*) from project_bootstrap.second_platform_reviewer_bootstrap_audit;"), "1");
  check(jsonSql(positiveSql).idempotent, true);
  denied(secondSql({ session: aal2Session, request: randomUUID() }), "SECOND_PLATFORM_REVIEWER_BOOTSTRAP_FIRST_OWNER_REQUIRED");
  denied(secondSql({ session: aal2Session, email: `other-${second.email}` }), "SECOND_PLATFORM_REVIEWER_BOOTSTRAP_IDEMPOTENCY_CONFLICT");
  check(sideEffects(), before);

  for (const role of ["anon", "authenticated", "service_role"]) {
    check(sql(`select has_schema_privilege(${q(role)},'project_bootstrap','USAGE');`), "f");
    check(sql(`select has_function_privilege(${q(role)},'project_bootstrap.bootstrap_second_platform_reviewer(uuid,uuid,text,text,text,uuid,uuid,uuid,text,text,text,text,text)','EXECUTE');`), "f");
    check(sql(`select has_table_privilege(${q(role)},'project_bootstrap.second_platform_reviewer_bootstrap_audit','SELECT');`), "f");
    deniedAny(`begin; set local role ${role}; ${secondSql({ session: aal2Session, request: randomUUID() })}; rollback;`);
  }
  denied("update project_bootstrap.second_platform_reviewer_bootstrap_audit set reason=reason;", "SECOND_PLATFORM_REVIEWER_BOOTSTRAP_AUDIT_IMMUTABLE");
  denied("truncate project_bootstrap.second_platform_reviewer_bootstrap_audit;", "SECOND_PLATFORM_REVIEWER_BOOTSTRAP_AUDIT_IMMUTABLE");

  const roleRead = await second.client.rpc("get_current_platform_role");
  assert.ifError(roleRead.error);
  check(roleRead.data, "platform_admin");
  const protectedRead = await second.client.rpc("get_platform_restaurants");
  assert.ok(protectedRead.error);
  assert.match(protectedRead.error.message, /Nicht berechtigt/i);
  assertions += 2;
  check(sql(`select count(*) from auth.mfa_factors where user_id=${q(second.id)}::uuid and factor_type='totp' and status='verified';`), "0");
  check(sql(`select count(*) from auth.sessions where user_id=${q(second.id)}::uuid and aal='aal2';`), "0");
  check(sql("select environment from public.business_verification_environment where singleton;"), "STAGING");
  check(sql("select real_intake_status from public.country_kyb_intake_policies where country_code='AT';"), "BLOCKED");

  const lint = run(cli, ["db", "lint", "--local", "--workdir", taskRoot, "--schema", "project_bootstrap", "--level", "error", "--fail-on", "error"]);
  assert.doesNotMatch(lint, /ERROR|"level"\s*:\s*"error"/);
  assertions += 1;
  console.log(JSON.stringify({
    status: "LOCAL_SECOND_PLATFORM_REVIEWER_BOOTSTRAP_PASS",
    assertions,
    activePlatformAdmins: 2,
    platformOwners: 1,
    platformAdmins: 1,
    secondReviewerAuditRows: 1,
    firstOwnerVerifiedTotpAndFreshAal2: true,
    secondReviewerProtectedActionAtAal1: "DENIED",
    sideEffectsUnchanged: true,
    realAtIntake: "BLOCKED",
  }));
} catch (error) {
  console.error(JSON.stringify({
    status: "FAIL",
    code: /^[A-Z_0-9]+$/.test(error.message) ? error.message : "LOCAL_ASSERTION_FAILED",
    message: error.message,
    stderr: String(error.stderr ?? "").slice(-4000),
    locations: error.stack?.split("\n").filter((line) => line.includes("bound-second-platform-reviewer-bootstrap.local.mjs")),
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
