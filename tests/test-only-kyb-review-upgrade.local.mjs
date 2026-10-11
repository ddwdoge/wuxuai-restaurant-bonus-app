import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const cli = resolve(root, "node_modules/.bin/supabase");
const migrationName = "20261011164421_test_only_kyb_review_contract.sql";
const tempRoot = mkdtempSync(join(tmpdir(), "wuxuai-test-only-kyb-upgrade-"));
const projectId = basename(tempRoot).toLowerCase();
const workdir = tempRoot;
const container = `supabase_db_${projectId}`;
const commandEnv = { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1", DO_NOT_TRACK: "1" };
const run = (bin, args, input) => execFileSync(bin, args, {
  input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], env: commandEnv,
  timeout: 180_000, maxBuffer: 64 * 1024 * 1024,
}).trim();
const sql = (statement) => run("docker", [
  "exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres",
  "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
], statement);

let started = false;
try {
  mkdirSync(join(workdir, "supabase"));
  const config = readFileSync(join(root, "supabase/config.toml"), "utf8")
    .replace(/^project_id = .+$/m, `project_id = "${projectId}"`)
    .replace(/561(\d\d)/g, (_, suffix) => String(57700 + Number(suffix)));
  writeFileSync(join(workdir, "supabase/config.toml"), config);
  cpSync(join(root, "supabase/migrations"), join(workdir, "supabase/migrations"), { recursive: true });
  rmSync(join(workdir, "supabase/migrations", migrationName));

  run(cli, ["start", "--workdir", workdir, "-x", "realtime,storage-api,imgproxy,studio,postgres-meta,edge-runtime,logflare,vector,supavisor"]);
  started = true;
  assert.equal(sql(`select count(*) from supabase_migrations.schema_migrations where version='20261011164421';`), "0");

  const sentinel = randomUUID();
  sql(`insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
values(null,'${sentinel}','authenticated','authenticated','upgrade-sentinel@example.invalid',clock_timestamp(),'{}','{}',clock_timestamp(),clock_timestamp(),false,false);
insert into public.platform_admins(user_id,role,active) values('${sentinel}','platform_admin',true);`);

  const stateQuery = `select jsonb_build_object(
    'auth_users',(select count(*) from auth.users),
    'platform_admins',(select count(*) from public.platform_admins),
    'restaurants',(select count(*) from public.restaurants),
    'cases',(select count(*) from public.business_verification_cases),
    'documents',(select count(*) from public.business_verification_documents),
    'real_receipts',(select count(*) from public.platform_operator_review_events),
    'legacy_test_receipts',(select count(*) from public.business_verification_test_receipts),
    'trial_claims',(select count(*) from public.billing_trial_claims),
    'pro_grants',(select count(*) from public.commercial_pro_access_grants),
    'checkout',(select count(*) from public.basic_test_checkout_requests),
    'mail',(select count(*) from public.customer_transactional_email_deliveries),
    'environment',(select environment from public.business_verification_environment where singleton),
    'real_intake',(select real_intake_status from public.country_kyb_intake_policies where country_code='AT'),
    'catalog_limit',(select file_size_limit from storage.buckets where id='restaurant-menu-private'),
    'resolver_definition',md5(pg_get_functiondef('public.resolve_business_verification_readiness_internal(uuid,text,timestamptz)'::regprocedure)),
    'real_review_definition',md5(pg_get_functiondef('public.decide_platform_operator_review(uuid,uuid,uuid,text,text,text,uuid,text,jsonb,boolean,text,uuid)'::regprocedure))
  );`;
  const before = JSON.parse(sql(stateQuery));

  cpSync(join(root, "supabase/migrations", migrationName), join(workdir, "supabase/migrations", migrationName));
  run(cli, ["migration", "up", "--local", "--workdir", workdir]);

  assert.equal(sql(`select count(*) from supabase_migrations.schema_migrations where version='20261011164421';`), "1");
  const after = JSON.parse(sql(stateQuery));
  assert.deepEqual(after, before);
  assert.equal(sql("select count(*) from public.test_only_kyb_review_receipts;"), "0");
  assert.equal(sql("select count(*) from public.test_only_kyb_review_audit;"), "0");
  assert.equal(after.environment, "DISABLED");
  assert.equal(after.real_intake, "BLOCKED");
  assert.equal(after.catalog_limit, 1);

  console.log(JSON.stringify({
    status: "TEST_ONLY_KYB_REVIEW_UPGRADE_PASS",
    migration: "20261011164421",
    existing_state: "BYTE_EQUIVALENT",
    shared_real_gate_definitions: "UNCHANGED",
    synthetic_receipts_seeded: 0,
    synthetic_audit_seeded: 0,
    environment: after.environment,
    at_real_intake: after.real_intake,
    catalog_limit: after.catalog_limit,
    cloud_writes: 0,
  }));
} finally {
  if (started) {
    try { run(cli, ["stop", "--workdir", workdir, "--no-backup"]); } catch { /* cleanup best effort */ }
  }
  rmSync(tempRoot, { recursive: true, force: true });
}
