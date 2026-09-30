// Explicit opt-in PostgreSQL integration matrix for Migration 188.
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

const id = (n) => `18800000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = id(900);
const owner = id(101);
const staff = id(102);
const customer = id(103);
const other = id(104);
const targetRestaurant = id(1);
const unauditedRestaurant = id(2);
const noMarkerRestaurant = id(3);
const branch = id(11);
const unauditedBranch = id(12);
const noMarkerBranch = id(13);
const factor = id(800);
const staffFactor = id(801);
const customerFactor = id(802);
const otherFactor = id(803);
const unverifiedFactor = id(804);
const session = id(700);
const staffSession = id(701);
const customerSession = id(702);
const otherSession = id(703);
const missingFactorSession = id(704);
const unverifiedFactorSession = id(705);
const foreignFactorSession = id(706);
const oldName = "WUXUAI TEST ONLY – OLD SNAPSHOT";
const newName = "WUXUAI TEST ONLY CURRENT";

const jwt = ({ who = actor, sessionId = session, age = 0, aal = "aal2", method = "totp" } = {}) => {
  const timestamp = Math.floor(Date.now() / 1000) - age;
  return JSON.stringify({
    sub: who,
    session_id: sessionId,
    aal,
    amr: [{ method, timestamp }],
  }).replaceAll("'", "''");
};
const auth = (options) => `set role authenticated; select set_config('request.jwt.claims','${jwt(options)}',false);`;
const confirmation = (restaurant = targetRestaurant, name = newName) =>
  `CONFIRMED:TEST_ONLY_NAME_SNAPSHOT_REFRESH:${name}:${restaurant}`;
const refresh = ({
  restaurant = targetRestaurant,
  expectedOld = oldName,
  expectedCurrent = newName,
  key = id(500),
  confirmed = confirmation(restaurant, expectedCurrent),
} = {}) => `select public.refresh_platform_test_tenant_marker_name_snapshot(
  '${restaurant}','${expectedOld}','${expectedCurrent}','${confirmed}','${key}'
)`;

const denied = (statement, prefix = auth(), pattern = /DENIED|REQUIRED|INVALID|MISMATCH|CONFLICT|STALE|CHANGED|permission denied|42501|40001|22023|P0002/i) => {
  try {
    sql(`${prefix}${statement}`);
    assert.fail("expected fail-closed denial");
  } catch (error) {
    assert.match(String(error.stderr ?? error.message), pattern);
  }
};

assert.equal(target.host === "127.0.0.1" || target.host === "localhost" || target.host === "[::1]", true);
assert.equal(sql("select count(*) from supabase_migrations.schema_migrations where version='20260930001000'"), "1");

sql(`
insert into auth.users(instance_id,id,aud,role,raw_app_meta_data,raw_user_meta_data,
  created_at,updated_at,is_sso_user,is_anonymous)
select null, user_id, 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb,
  clock_timestamp(), clock_timestamp(), false, false
from (values
  ('${actor}'::uuid),('${owner}'::uuid),('${staff}'::uuid),('${customer}'::uuid),('${other}'::uuid)
) users(user_id);

insert into auth.mfa_factors(id,user_id,friendly_name,factor_type,status,created_at,updated_at)
values
  ('${factor}','${actor}','Synthetic platform factor','totp','verified',clock_timestamp(),clock_timestamp()),
  ('${staffFactor}','${staff}','Synthetic staff factor','totp','verified',clock_timestamp(),clock_timestamp()),
  ('${customerFactor}','${customer}','Synthetic customer factor','totp','verified',clock_timestamp(),clock_timestamp()),
  ('${otherFactor}','${other}','Synthetic other factor','totp','verified',clock_timestamp(),clock_timestamp()),
  ('${unverifiedFactor}','${actor}','Synthetic unverified factor','totp','unverified',clock_timestamp(),clock_timestamp());

insert into auth.sessions(id,user_id,created_at,updated_at,factor_id,aal,not_after)
values
  ('${session}','${actor}',clock_timestamp(),clock_timestamp(),'${factor}','aal2',clock_timestamp()+interval '1 hour'),
  ('${staffSession}','${staff}',clock_timestamp(),clock_timestamp(),'${staffFactor}','aal2',clock_timestamp()+interval '1 hour'),
  ('${customerSession}','${customer}',clock_timestamp(),clock_timestamp(),'${customerFactor}','aal2',clock_timestamp()+interval '1 hour'),
  ('${otherSession}','${other}',clock_timestamp(),clock_timestamp(),'${otherFactor}','aal2',clock_timestamp()+interval '1 hour'),
  ('${missingFactorSession}','${actor}',clock_timestamp(),clock_timestamp(),null,'aal2',clock_timestamp()+interval '1 hour'),
  ('${unverifiedFactorSession}','${actor}',clock_timestamp(),clock_timestamp(),'${unverifiedFactor}','aal2',clock_timestamp()+interval '1 hour'),
  ('${foreignFactorSession}','${actor}',clock_timestamp(),clock_timestamp(),'${otherFactor}','aal2',clock_timestamp()+interval '1 hour');

insert into public.platform_admins(user_id,role,active) values('${actor}','platform_admin',true);
update public.business_verification_environment
set environment='STAGING', change_ref='SYNTHETIC_LOCAL_MIGRATION_188_TEST'
where singleton;

-- Synthetic fixture construction only. The RPC itself is tested with all
-- production triggers and RLS/ACL behavior enabled below.
set session_replication_role=replica;
insert into public.organizations(id,owner_id,name)
values
  ('${targetRestaurant}','${owner}','Synthetic organization 1'),
  ('${unauditedRestaurant}','${owner}','Synthetic organization 2'),
  ('${noMarkerRestaurant}','${owner}','Synthetic organization 3');
insert into public.restaurants(id,owner_id,name,slug,status,organization_id)
values
  ('${targetRestaurant}','${owner}','${newName}','migration-188-target','active','${targetRestaurant}'),
  ('${unauditedRestaurant}','${owner}','WUXUAI TEST UNAUDITED CURRENT','migration-188-unaudited','active','${unauditedRestaurant}'),
  ('${noMarkerRestaurant}','${owner}','WUXUAI TEST NO MARKER','migration-188-no-marker','active','${noMarkerRestaurant}');
insert into public.branches(id,organization_id,restaurant_id,name,slug,country)
values
  ('${branch}','${targetRestaurant}','${targetRestaurant}','Synthetic branch 1','migration-188-branch-1','AT'),
  ('${unauditedBranch}','${unauditedRestaurant}','${unauditedRestaurant}','Synthetic branch 2','migration-188-branch-2','AT'),
  ('${noMarkerBranch}','${noMarkerRestaurant}','${noMarkerRestaurant}','Synthetic branch 3','migration-188-branch-3','AT');
update public.restaurants set primary_branch_id='${branch}' where id='${targetRestaurant}';
update public.restaurants set primary_branch_id='${unauditedBranch}' where id='${unauditedRestaurant}';
update public.restaurants set primary_branch_id='${noMarkerBranch}' where id='${noMarkerRestaurant}';
insert into public.restaurant_members(restaurant_id,user_id,role,organization_id,branch_id)
values
  ('${targetRestaurant}','${owner}','owner','${targetRestaurant}','${branch}'),
  ('${unauditedRestaurant}','${owner}','owner','${unauditedRestaurant}','${unauditedBranch}'),
  ('${noMarkerRestaurant}','${owner}','owner','${noMarkerRestaurant}','${noMarkerBranch}'),
  ('${targetRestaurant}','${staff}','staff','${targetRestaurant}','${branch}');

insert into public.platform_test_tenant_registry(
  restaurant_id,restaurant_name,organization_id,owner_user_id,test_session_id,marked_by,marked_at
) values
  ('${targetRestaurant}','${oldName}','${targetRestaurant}','${owner}','migration-188-target','${actor}',clock_timestamp()-interval '2 hours'),
  ('${unauditedRestaurant}','WUXUAI TEST UNAUDITED OLD','${unauditedRestaurant}','${owner}','migration-188-unaudited','${actor}',clock_timestamp()-interval '2 hours');

insert into public.audit_log(
  restaurant_id,organization_id,branch_id,actor_type,actor_id,action,target_table,target_id,
  metadata,source,is_test_event,test_session_id,created_at
) values (
  '${targetRestaurant}','${targetRestaurant}','${branch}','admin','${owner}',
  'admin_restaurants_updated','restaurants','${targetRestaurant}',
  jsonb_build_object('old',jsonb_build_object('name','${oldName}'),
    'new',jsonb_build_object('name','${newName}'),'operation','UPDATE'),
  'restaurant_portal',true,'migration-188-target',clock_timestamp()-interval '1 hour'
);
set session_replication_role=origin;
`);

const markerBefore = sql(`select to_jsonb(marker)-'restaurant_name' from public.platform_test_tenant_registry marker where restaurant_id='${targetRestaurant}'`);

// Roles and authentication boundaries.
denied(refresh(), "set role anon;", /permission denied/i);
denied(refresh(), auth({ who: owner, sessionId: otherSession }));
denied(refresh(), auth({ who: staff, sessionId: staffSession }));
denied(refresh(), auth({ who: customer, sessionId: customerSession }));
denied(refresh(), auth({ who: other, sessionId: otherSession }));
denied(refresh(), auth({ aal: "aal1" }));
denied(refresh(), auth({ age: 601 }));
denied(refresh(), auth({ sessionId: missingFactorSession }));
denied(refresh(), auth({ sessionId: unverifiedFactorSession }));
denied(refresh(), auth({ sessionId: foreignFactorSession }));
denied(refresh(), auth({ sessionId: id(799) }));

// Exact target and marker state boundaries.
denied(refresh({ restaurant: noMarkerRestaurant, expectedCurrent: "WUXUAI TEST NO MARKER" }));
denied(refresh({ restaurant: unauditedRestaurant, expectedOld: "WUXUAI TEST UNAUDITED OLD", expectedCurrent: "WUXUAI TEST UNAUDITED CURRENT" }));
denied(refresh({ expectedOld: "WUXUAI TEST UNKNOWN OLD" }));
denied(refresh({ expectedCurrent: "WUXUAI TEST UNKNOWN TARGET" }));
denied(refresh({ confirmed: "WRONG CONFIRMATION" }));
denied(`begin; update public.platform_test_tenant_registry set deleted_at=clock_timestamp() where restaurant_id='${targetRestaurant}'; ${auth()} ${refresh()}`);
denied(`begin; update public.platform_test_tenant_registry set organization_id='${other}' where restaurant_id='${targetRestaurant}'; ${auth()} ${refresh()}`);
denied(`begin; update public.platform_test_tenant_registry set owner_user_id='${other}' where restaurant_id='${targetRestaurant}'; ${auth()} ${refresh()}`);
denied(`begin; set local session_replication_role=replica; update public.restaurants set name='WUXUAI TEST CONCURRENT RENAME' where id='${targetRestaurant}'; set local session_replication_role=origin; ${auth()} ${refresh()}`);

// Direct DML is unavailable to browser and generic service-role callers.
denied(`update public.platform_test_tenant_registry set restaurant_name='FORBIDDEN' where restaurant_id='${targetRestaurant}'`, auth(), /permission denied/i);
denied(`update public.platform_test_tenant_registry set restaurant_name='FORBIDDEN' where restaurant_id='${targetRestaurant}'`, "set role service_role;", /permission denied/i);
denied("insert into public.platform_test_tenant_marker_refresh_audit default values", auth(), /permission denied/i);

// Twenty-four distinct concurrent requests yield one mutation and one audit.
const calls = Array.from({ length: 24 }, (_, index) => asyncSql(`${auth()}${refresh({ key: id(500 + index) })}`));
const outcomes = await Promise.all(calls);
const results = outcomes.map(({ stdout }) => lastJson(stdout));
assert.equal(results.filter((result) => result.idempotent === false).length, 1);
assert.equal(results.filter((result) => result.idempotent === true).length, 23);
assert.equal(sql(`select count(*) from public.platform_test_tenant_marker_refresh_audit where tenant_id='${targetRestaurant}'`), "1");
assert.equal(sql(`select restaurant_name from public.platform_test_tenant_registry where restaurant_id='${targetRestaurant}'`), newName);
assert.equal(sql(`select to_jsonb(marker)-'restaurant_name' from public.platform_test_tenant_registry marker where restaurant_id='${targetRestaurant}'`), markerBefore);
assert.equal(sql(`select count(*) from public.platform_test_tenant_registry marker join public.restaurants restaurant on restaurant.id=marker.restaurant_id and restaurant.organization_id=marker.organization_id and restaurant.owner_id=marker.owner_user_id and restaurant.name=marker.restaurant_name where marker.restaurant_id='${targetRestaurant}' and marker.deleted_at is null`), "1");

// Same request and a new request for the same proven transition are read-only replays.
const auditBeforeReplay = sql(`select count(*) from public.platform_test_tenant_marker_refresh_audit where tenant_id='${targetRestaurant}'`);
assert.equal(lastJson(sql(`${auth()}${refresh({ key: id(500) })}`)).idempotent, true);
assert.equal(lastJson(sql(`${auth()}${refresh({ key: id(599) })}`)).idempotent, true);
assert.equal(sql(`select count(*) from public.platform_test_tenant_marker_refresh_audit where tenant_id='${targetRestaurant}'`), auditBeforeReplay);

// Idempotency conflicts and append-only audit protections are fail-closed.
const committedIdempotencyKey = sql(`select idempotency_key from public.platform_test_tenant_marker_refresh_audit where tenant_id='${targetRestaurant}'`);
denied(refresh({ key: committedIdempotencyKey, confirmed: confirmation(targetRestaurant, newName) + ":CHANGED" }), auth(), /IDEMPOTENCY_CONFLICT/);
for (const statement of [
  "update public.platform_test_tenant_marker_refresh_audit set reason_code=reason_code",
  "delete from public.platform_test_tenant_marker_refresh_audit",
  "truncate public.platform_test_tenant_marker_refresh_audit",
]) denied(statement, "", /IMMUTABLE/);

// No product, billing, PRO or Inbox authority was written.
for (const [table, expected] of [
  ["commercial_pro_access_grants", "0"],
  ["commercial_pro_access_audit", "0"],
  ["customer_pro_in_app_notifications", "0"],
  ["billing_trial_claims", "0"],
]) assert.equal(sql(`select count(*) from public.${table}`), expected, table);

console.log("LOCAL MIGRATION 188 SECURITY MATRIX PASS: roles/AAL2/session/factor/tenant/audit/idempotency/24-way concurrency");
