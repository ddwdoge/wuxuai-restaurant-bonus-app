// Explicit opt-in PostgreSQL integration matrix for Migration 190.
// It targets only the isolated loopback Supabase project guarded below.
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { loadVerifiedLocalSupabaseTestTarget } from "./helpers/local-supabase-test-guard.mjs";

const run = promisify(execFile);
const root = new URL("../", import.meta.url);
const target = loadVerifiedLocalSupabaseTestTarget({ rootUrl: root });
const psql = "/opt/homebrew/bin/psql";
const args = ["-X", "-h", target.host, "-p", target.port, "-U", target.username, "-d", target.database, "-v", "ON_ERROR_STOP=1", "-Atq"];
const childEnv = { ...process.env, PGPASSWORD: target.password };
const sql = (statement) => execFileSync(psql, args, {
  env: childEnv,
  input: statement,
  encoding: "utf8",
  timeout: 30_000,
  stdio: ["pipe", "pipe", "pipe"],
}).trim();
const asyncSql = async (statement) => {
  try {
    return await run(psql, [...args, "-c", statement], {
      env: childEnv,
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    });
  } catch (error) {
    throw Object.assign(new Error(error.stderr ?? "local psql failure"), { stderr: error.stderr });
  }
};
const lastJson = (output) => JSON.parse(output.trim().split("\n").at(-1));
const id = (n) => `19000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const actor = id(900);
const owner = id(101);
const admin = id(102);
const manager = id(103);
const staff = id(104);
const customer = id(105);
const other = id(106);
const targetRestaurant = id(1);
const realRestaurant = id(2);
const targetBranch = id(11);
const realBranch = id(12);
const targetSettings = id(21);
const realSettings = id(22);
const factor = id(800);
const unverifiedFactor = id(801);
const foreignFactor = id(802);
const session = id(700);
const missingFactorSession = id(701);
const unverifiedFactorSession = id(702);
const foreignFactorSession = id(703);
const actionCode = "TEST_ONLY_PRO_REWARD_FLOW";

const jwt = ({ who = actor, sessionId = session, age = 0, aal = "aal2", method = "totp" } = {}) => {
  const timestamp = Math.floor(Date.now() / 1000) - age;
  return JSON.stringify({ sub: who, session_id: sessionId, aal, amr: [{ method, timestamp }] }).replaceAll("'", "''");
};
const auth = (options) => `set role authenticated; select set_config('request.jwt.claims','${jwt(options)}',false);`;
const change = ({
  tenant = targetRestaurant,
  expected = "restaurant_controlled_only",
  targetMode = "both",
  key = id(500),
  code = actionCode,
} = {}) => `select public.set_platform_test_collection_mode(
  '${tenant}','${expected}','${targetMode}',${key === null ? "null" : `'${key}'`},'${code}'
)`;
const denied = (
  statement,
  prefix = auth(),
  pattern = /DENIED|REQUIRED|INVALID|MISMATCH|CONFLICT|STALE|NOT_FOUND|permission denied|42501|40001|22023|P0002/i,
) => {
  try {
    sql(`${prefix}${statement}`);
    assert.fail("expected fail-closed denial");
  } catch (error) {
    assert.match(String(error.stderr ?? error.message), pattern);
  }
};

assert.equal(target.host === "127.0.0.1" || target.host === "localhost" || target.host === "[::1]", true);
assert.equal(sql("select count(*) from supabase_migrations.schema_migrations where version='20261001002000'"), "1");
const originalEnvironment = sql("select environment from public.business_verification_environment where singleton");

const cleanup = () => sql(`
reset role;
set session_replication_role=replica;
delete from public.platform_test_collection_mode_audit where tenant_id in ('${targetRestaurant}','${realRestaurant}');
delete from public.platform_test_tenant_registry where restaurant_id in ('${targetRestaurant}','${realRestaurant}');
delete from public.loyalty_settings where id in ('${targetSettings}','${realSettings}');
delete from public.restaurant_members where restaurant_id in ('${targetRestaurant}','${realRestaurant}');
delete from public.branches where id in ('${targetBranch}','${realBranch}');
delete from public.restaurants where id in ('${targetRestaurant}','${realRestaurant}');
delete from public.organizations where id in ('${targetRestaurant}','${realRestaurant}');
delete from public.platform_admins where user_id='${actor}';
delete from auth.sessions where id in ('${session}','${missingFactorSession}','${unverifiedFactorSession}','${foreignFactorSession}');
delete from auth.mfa_factors where id in ('${factor}','${unverifiedFactor}','${foreignFactor}');
delete from auth.users where id in ('${actor}','${owner}','${admin}','${manager}','${staff}','${customer}','${other}');
update public.business_verification_environment set environment='${originalEnvironment.replaceAll("'", "''")}', change_ref='MIGRATION_190_LOCAL_CLEANUP' where singleton;
set session_replication_role=origin;
`);

try {
  sql(`
insert into auth.users(instance_id,id,aud,role,raw_app_meta_data,raw_user_meta_data,
  created_at,updated_at,is_sso_user,is_anonymous)
select null, user_id, 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb,
  clock_timestamp(), clock_timestamp(), false, false
from (values
  ('${actor}'::uuid),('${owner}'::uuid),('${admin}'::uuid),('${manager}'::uuid),
  ('${staff}'::uuid),('${customer}'::uuid),('${other}'::uuid)
) users(user_id);

insert into auth.mfa_factors(id,user_id,friendly_name,factor_type,status,created_at,updated_at)
values
  ('${factor}','${actor}','Synthetic platform factor','totp','verified',clock_timestamp(),clock_timestamp()),
  ('${unverifiedFactor}','${actor}','Synthetic unverified factor','totp','unverified',clock_timestamp(),clock_timestamp()),
  ('${foreignFactor}','${other}','Synthetic foreign factor','totp','verified',clock_timestamp(),clock_timestamp());

insert into auth.sessions(id,user_id,created_at,updated_at,factor_id,aal,not_after)
values
  ('${session}','${actor}',clock_timestamp(),clock_timestamp(),'${factor}','aal2',clock_timestamp()+interval '1 hour'),
  ('${missingFactorSession}','${actor}',clock_timestamp(),clock_timestamp(),null,'aal2',clock_timestamp()+interval '1 hour'),
  ('${unverifiedFactorSession}','${actor}',clock_timestamp(),clock_timestamp(),'${unverifiedFactor}','aal2',clock_timestamp()+interval '1 hour'),
  ('${foreignFactorSession}','${actor}',clock_timestamp(),clock_timestamp(),'${foreignFactor}','aal2',clock_timestamp()+interval '1 hour');

insert into public.platform_admins(user_id,role,active) values('${actor}','platform_admin',true);
update public.business_verification_environment
set environment='STAGING', change_ref='SYNTHETIC_LOCAL_MIGRATION_190_TEST'
where singleton;

set session_replication_role=replica;
insert into public.organizations(id,owner_id,name)
values ('${targetRestaurant}','${owner}','Synthetic TEST_ONLY organization'),
       ('${realRestaurant}','${other}','Synthetic unmarked organization');
insert into public.restaurants(id,owner_id,name,slug,status,organization_id)
values ('${targetRestaurant}','${owner}','WUXUAI TEST MIGRATION 190','migration-190-target','active','${targetRestaurant}'),
       ('${realRestaurant}','${other}','Synthetic real restaurant','migration-190-real','active','${realRestaurant}');
insert into public.branches(id,organization_id,restaurant_id,name,slug,country)
values ('${targetBranch}','${targetRestaurant}','${targetRestaurant}','Synthetic test branch','migration-190-branch','AT'),
       ('${realBranch}','${realRestaurant}','${realRestaurant}','Synthetic real branch','migration-190-real-branch','AT');
update public.restaurants set primary_branch_id='${targetBranch}' where id='${targetRestaurant}';
update public.restaurants set primary_branch_id='${realBranch}' where id='${realRestaurant}';
insert into public.restaurant_members(restaurant_id,user_id,role,organization_id,branch_id)
values
  ('${targetRestaurant}','${owner}','owner','${targetRestaurant}','${targetBranch}'),
  ('${targetRestaurant}','${admin}','admin','${targetRestaurant}','${targetBranch}'),
  ('${targetRestaurant}','${manager}','manager','${targetRestaurant}','${targetBranch}'),
  ('${targetRestaurant}','${staff}','staff','${targetRestaurant}','${targetBranch}'),
  ('${realRestaurant}','${other}','owner','${realRestaurant}','${realBranch}');
insert into public.loyalty_settings(
  id,restaurant_id,organization_id,branch_id,loyalty_mode,active,points_collection_mode
) values
  ('${targetSettings}','${targetRestaurant}','${targetRestaurant}','${targetBranch}','amount_based',true,'restaurant_controlled_only'),
  ('${realSettings}','${realRestaurant}','${realRestaurant}','${realBranch}','amount_based',true,'restaurant_controlled_only');
insert into public.platform_test_tenant_registry(
  restaurant_id,restaurant_name,organization_id,owner_user_id,test_session_id,marked_by,marked_at
) values (
  '${targetRestaurant}','WUXUAI TEST MIGRATION 190','${targetRestaurant}','${owner}',
  'migration-190-target','${actor}',clock_timestamp()
);
set session_replication_role=origin;
`);

  const settingsBefore = sql(`select to_jsonb(settings)-'points_collection_mode' from public.loyalty_settings settings where id='${targetSettings}'`);
  const businessBefore = sql(`select jsonb_build_object(
    'restaurants',(select count(*) from public.restaurants where id in ('${targetRestaurant}','${realRestaurant}')),
    'members',(select count(*) from public.restaurant_members where restaurant_id in ('${targetRestaurant}','${realRestaurant}')),
    'points',(select count(*) from public.points_transactions where restaurant_id in ('${targetRestaurant}','${realRestaurant}')),
    'rewards',(select count(*) from public.customer_rewards where restaurant_id in ('${targetRestaurant}','${realRestaurant}')),
    'inbox',(select count(*) from public.customer_pro_in_app_notifications where restaurant_id in ('${targetRestaurant}','${realRestaurant}')),
    'grants',(select count(*) from public.commercial_pro_access_grants where restaurant_id in ('${targetRestaurant}','${realRestaurant}'))
  )`);

  // ACL and role matrix.
  assert.equal(sql("select has_function_privilege('anon','public.set_platform_test_collection_mode(uuid,text,text,uuid,text)','EXECUTE')"), "f");
  assert.equal(sql("select has_function_privilege('authenticated','public.set_platform_test_collection_mode(uuid,text,text,uuid,text)','EXECUTE')"), "t");
  assert.equal(sql("select has_function_privilege('service_role','public.set_platform_test_collection_mode(uuid,text,text,uuid,text)','EXECUTE')"), "f");
  assert.equal(sql("select has_table_privilege('authenticated','public.platform_test_collection_mode_audit','SELECT')"), "f");
  denied(change(), "set role anon;", /permission denied/i);
  denied(change(), auth({ who: customer, sessionId: id(711) }));
  denied(change(), auth({ who: staff, sessionId: id(712) }));
  denied(change(), auth({ who: owner, sessionId: id(713) }));
  denied(change(), auth({ who: manager, sessionId: id(714) }));
  denied(change(), auth({ who: admin, sessionId: id(715) }));
  denied(change(), auth({ aal: "aal1" }));
  denied(change(), auth({ age: 601 }));
  denied(change(), auth({ sessionId: missingFactorSession }));
  denied(change(), auth({ sessionId: unverifiedFactorSession }));
  denied(change(), auth({ sessionId: foreignFactorSession }));
  denied(change(), "set role service_role;", /permission denied/i);

  // Tenant, expected-state, transition and request boundaries.
  denied(change({ tenant: id(99) }));
  denied(change({ tenant: realRestaurant }));
  denied(change({ expected: "both", targetMode: "restaurant_controlled_only" }));
  denied(change({ expected: "restaurant_controlled_only", targetMode: "customer_initiated_only" }));
  denied(change({ expected: "both", targetMode: "customer_initiated_only" }));
  denied(change({ expected: "restaurant_controlled_only", targetMode: "restaurant_controlled_only" }));
  denied(change({ key: null }));
  denied(change({ code: "UNAPPROVED_REASON" }));
  denied(`begin; set local session_replication_role=replica; update public.platform_test_tenant_registry set organization_id='${realRestaurant}' where restaurant_id='${targetRestaurant}'; set local session_replication_role=origin; ${auth()} ${change()}`);
  denied(`begin; set local session_replication_role=replica; update public.platform_test_tenant_registry set owner_user_id='${other}' where restaurant_id='${targetRestaurant}'; set local session_replication_role=origin; ${auth()} ${change()}`);

  // Direct access to the operation audit remains unavailable.
  denied("insert into public.platform_test_collection_mode_audit default values", auth(), /permission denied/i);
  denied("insert into public.platform_test_collection_mode_audit default values", "set role service_role;", /permission denied/i);

  // Twenty-four identical concurrent requests: one mutation, one receipt.
  const concurrentKey = id(500);
  const outcomes = await Promise.all(Array.from({ length: 24 }, () => asyncSql(`${auth()}${change({ key: concurrentKey })}`)));
  const results = outcomes.map(({ stdout }) => lastJson(stdout));
  assert.equal(results.filter((result) => result.idempotent === false).length, 1);
  assert.equal(results.filter((result) => result.idempotent === true).length, 23);
  assert.equal(sql(`select points_collection_mode from public.loyalty_settings where id='${targetSettings}'`), "both");
  assert.equal(sql(`select count(*) from public.platform_test_collection_mode_audit where tenant_id='${targetRestaurant}'`), "1");
  assert.equal(sql(`select count(*) from public.audit_log where restaurant_id='${targetRestaurant}' and action='admin_loyalty_settings_updated'`), "0");
  assert.equal(sql(`select to_jsonb(settings)-'points_collection_mode' from public.loyalty_settings settings where id='${targetSettings}'`), settingsBefore);

  // Exact replay is read-only; changed payload with same key conflicts.
  assert.equal(lastJson(sql(`${auth()}${change({ key: concurrentKey })}`)).idempotent, true);
  assert.equal(sql(`select count(*) from public.platform_test_collection_mode_audit where tenant_id='${targetRestaurant}'`), "1");
  denied(change({ expected: "both", targetMode: "restaurant_controlled_only", key: concurrentKey }), auth(), /IDEMPOTENCY_CONFLICT/);

  // A new key performs the exact reverse and restores the complete row.
  const reverse = lastJson(sql(`${auth()}${change({ expected: "both", targetMode: "restaurant_controlled_only", key: id(501) })}`));
  assert.equal(reverse.idempotent, false);
  assert.equal(sql(`select points_collection_mode from public.loyalty_settings where id='${targetSettings}'`), "restaurant_controlled_only");
  assert.equal(sql(`select count(*) from public.platform_test_collection_mode_audit where tenant_id='${targetRestaurant}'`), "2");
  assert.equal(sql(`select to_jsonb(settings)-'points_collection_mode' from public.loyalty_settings settings where id='${targetSettings}'`), settingsBefore);
  assert.equal(sql(`select jsonb_build_object(
    'restaurants',(select count(*) from public.restaurants where id in ('${targetRestaurant}','${realRestaurant}')),
    'members',(select count(*) from public.restaurant_members where restaurant_id in ('${targetRestaurant}','${realRestaurant}')),
    'points',(select count(*) from public.points_transactions where restaurant_id in ('${targetRestaurant}','${realRestaurant}')),
    'rewards',(select count(*) from public.customer_rewards where restaurant_id in ('${targetRestaurant}','${realRestaurant}')),
    'inbox',(select count(*) from public.customer_pro_in_app_notifications where restaurant_id in ('${targetRestaurant}','${realRestaurant}')),
    'grants',(select count(*) from public.commercial_pro_access_grants where restaurant_id in ('${targetRestaurant}','${realRestaurant}'))
  )`), businessBefore);

  // Audit rows are immutable and no rejected request created an audit.
  for (const statement of [
    "update public.platform_test_collection_mode_audit set status=status",
    "delete from public.platform_test_collection_mode_audit",
    "truncate public.platform_test_collection_mode_audit",
  ]) denied(statement, "", /IMMUTABLE/);

  console.log("LOCAL MIGRATION 190 SECURITY MATRIX PASS: ACL/AAL2/factor/recent/tenant/expected-state/idempotency/24-way concurrency/round-trip");
} finally {
  cleanup();
}

assert.equal(sql(`select count(*) from public.restaurants where id in ('${targetRestaurant}','${realRestaurant}')`), "0");
assert.equal(sql(`select count(*) from auth.users where id in ('${actor}','${owner}','${admin}','${manager}','${staff}','${customer}','${other}')`), "0");
console.log("LOCAL MIGRATION 190 FIXTURE CLEANUP PASS: 0 synthetic rows remain");
