import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const cli = resolve(root, "node_modules/.bin/supabase");
const migrationName = "20261012213314_test_only_basic_offer_usage_readback.sql";
const tempRoot = mkdtempSync(join(tmpdir(), "wuxuai-offer-usage-"));
const projectId = basename(tempRoot).toLowerCase();
const container = `supabase_db_${projectId}`;
const commandEnv = { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1", DO_NOT_TRACK: "1" };
const run = (bin, args, input) => execFileSync(bin, args, {
  input,
  encoding: "utf8",
  stdio: ["pipe", "pipe", "pipe"],
  env: commandEnv,
  timeout: 240_000,
  maxBuffer: 64 * 1024 * 1024,
}).trim();
const sql = (statement) => run("docker", [
  "exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres",
  "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
], statement);

let started = false;
try {
  mkdirSync(join(tempRoot, "supabase"));
  const config = readFileSync(join(root, "supabase/config.toml"), "utf8")
    .replace(/^project_id = .+$/m, `project_id = "${projectId}"`)
    .replace(/561(\d\d)/g, (_, suffix) => String(57900 + Number(suffix)));
  writeFileSync(join(tempRoot, "supabase/config.toml"), config);
  cpSync(join(root, "supabase/migrations"), join(tempRoot, "supabase/migrations"), { recursive: true });
  rmSync(join(tempRoot, "supabase/migrations", migrationName));

  run(cli, ["start", "--workdir", tempRoot, "-x", "realtime,storage-api,imgproxy,studio,postgres-meta,edge-runtime,logflare,vector,supavisor"]);
  started = true;
  assert.equal(sql("select count(*) from supabase_migrations.schema_migrations where version='20261012213314';"), "0");

  const sentinel = randomUUID();
  sql(`insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
    values(null,'${sentinel}','authenticated','authenticated','offer-usage-upgrade@example.invalid',clock_timestamp(),'{}','{}',clock_timestamp(),clock_timestamp(),false,false);`);
  const stateQuery = `select jsonb_build_object(
    'auth_users',(select count(*) from auth.users),
    'restaurants',(select count(*) from public.restaurants),
    'offers',(select count(*) from public.restaurant_offers),
    'access_receipts',(select count(*) from public.test_only_basic_access_receipts),
    'access_audits',(select count(*) from public.test_only_basic_access_audit),
    'publication_receipts',(select count(*) from public.test_only_basic_offer_publication_receipts),
    'publication_audits',(select count(*) from public.test_only_basic_offer_publication_audit),
    'real_trials',(select count(*) from public.manual_basic_trial_decisions),
    'checkout',(select count(*) from public.basic_test_checkout_requests),
    'mail',(select count(*) from public.customer_offer_email_deliveries)
  );`;
  const before = JSON.parse(sql(stateQuery));
  const previousDefinition = sql("select md5(pg_get_functiondef('public.get_test_only_basic_runtime(uuid)'::regprocedure));");

  cpSync(join(root, "supabase/migrations", migrationName), join(tempRoot, "supabase/migrations", migrationName));
  run(cli, ["migration", "up", "--local", "--workdir", tempRoot]);

  assert.equal(sql("select count(*) from supabase_migrations.schema_migrations where version='20261012213314';"), "1");
  assert.deepEqual(JSON.parse(sql(stateQuery)), before);
  assert.notEqual(sql("select md5(pg_get_functiondef('public.get_test_only_basic_runtime(uuid)'::regprocedure));"), previousDefinition);
  assert.equal(sql("select position('offer_usage' in pg_get_functiondef('public.get_test_only_basic_runtime(uuid)'::regprocedure)) > 0;"), "t");
  assert.equal(sql("select has_function_privilege('anon','public.get_test_only_basic_runtime(uuid)','EXECUTE');"), "f");
  assert.equal(sql("select has_function_privilege('authenticated','public.get_test_only_basic_runtime(uuid)','EXECUTE');"), "t");
  assert.equal(sql("select has_function_privilege('service_role','public.get_test_only_basic_runtime(uuid)','EXECUTE');"), "f");
  const repeat = JSON.parse(run(cli, ["migration", "up", "--local", "--workdir", tempRoot]));
  assert.deepEqual(repeat.applied, []);

  console.log(JSON.stringify({
    status: "TEST_ONLY_BASIC_OFFER_USAGE_UPGRADE_PASS",
    migration: "20261012213314",
    preexisting_state: "UNCHANGED",
    repeat_dry_run: "EMPTY",
    grants_created: 0,
    publications_created: 0,
    business_writes: 0,
  }));
} finally {
  if (started) {
    try { run(cli, ["stop", "--workdir", tempRoot, "--no-backup"]); } catch {}
  }
  rmSync(tempRoot, { recursive: true, force: true });
}
