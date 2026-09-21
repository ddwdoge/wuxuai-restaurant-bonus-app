// Explicit opt-in local concurrency test; never invoked by npm test.
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { loadVerifiedLocalSupabaseTestTarget } from "./helpers/local-supabase-test-guard.mjs";

const run = promisify(execFile);
const root = new URL("../", import.meta.url);
const target = loadVerifiedLocalSupabaseTestTarget({ rootUrl: root });
const psql = "/opt/homebrew/opt/postgresql@17/bin/psql";
const args = ["-X", "-h", target.host, "-p", target.port, "-U", target.username, "-d", target.database, "-v", "ON_ERROR_STOP=1", "-Atq"];
const env = { ...process.env, PGPASSWORD: target.password };
const sql = (statement) => execFileSync(psql, [...args, "-c", statement], {
  env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30_000,
}).trim();

const tenants = [
  { suffix: "1", limit: 5, units: 0 },
  { suffix: "2", limit: 10, units: 1 },
  { suffix: "3", limit: 15, units: 2 },
  { suffix: "4", limit: 20, units: 3 },
];
const restaurantId = (suffix) => `7c3f0000-0000-4000-8000-00000000001${suffix}`;
const organizationId = (suffix) => `7c3f0000-0000-4000-8000-00000000002${suffix}`;
const branchId = (suffix) => `7c3f0000-0000-4000-8000-00000000003${suffix}`;
const offerId = (suffix, attempt) => `7c3f${suffix}${String(attempt).padStart(3, "0")}-0000-4000-8000-000000000001`;

const cleanup = `
  set session_replication_role=replica;
  delete from public.restaurant_offers where restaurant_id::text like '7c3f0000-%';
  delete from public.restaurant_capacity_addon_entitlements where restaurant_id::text like '7c3f0000-%';
  delete from public.restaurant_members where restaurant_id::text like '7c3f0000-%';
  delete from public.branch_subscriptions where branch_id::text like '7c3f0000-%';
  delete from public.branches where id::text like '7c3f0000-%';
  delete from public.restaurants where id::text like '7c3f0000-%';
  delete from public.organizations where id::text like '7c3f0000-%';
  delete from auth.users where id='7c3f0000-0000-4000-8000-000000000001';
  set session_replication_role=origin;
`;

const fingerprintQuery = `select jsonb_build_object(
  'users',(select count(*) from auth.users),
  'organizations',(select count(*) from public.organizations),
  'restaurants',(select count(*) from public.restaurants),
  'branches',(select count(*) from public.branches),
  'subscriptions',(select count(*) from public.branch_subscriptions),
  'members',(select count(*) from public.restaurant_members),
  'addons',(select count(*) from public.restaurant_capacity_addon_entitlements),
  'offers',(select count(*) from public.restaurant_offers)
)`;

sql(cleanup);
const before = sql(fingerprintQuery);

try {
  const values = tenants.map(({ suffix }) => `
    ('${organizationId(suffix)}','7c3f0000-0000-4000-8000-000000000001','7C3 parallel ${suffix}')`).join(",");
  const restaurants = tenants.map(({ suffix }) => `
    ('${restaurantId(suffix)}','7c3f0000-0000-4000-8000-000000000001','7C3 parallel ${suffix}','phase-7c3-parallel-${suffix}','${organizationId(suffix)}')`).join(",");
  const branches = tenants.map(({ suffix }) => `
    ('${branchId(suffix)}','${organizationId(suffix)}','${restaurantId(suffix)}','7C3 parallel ${suffix}','phase-7c3-parallel-${suffix}','AT')`).join(",");
  const subscriptions = tenants.map(({ suffix }) => `
    ('7c3f0000-0000-4000-8000-00000000004${suffix}','${organizationId(suffix)}','${branchId(suffix)}','active','BASIC','active','manual',now()+interval '30 days',now())`).join(",");
  const addons = tenants.filter(({ units }) => units > 0).map(({ suffix, units }) => `
    ('7c3f0000-0000-4000-8000-00000000005${suffix}',1,'${restaurantId(suffix)}','${organizationId(suffix)}','${branchId(suffix)}','OFFER_CAPACITY',1,${units},'ACTIVE',now()-interval '1 day','TEST_FIXTURE','7c3f0000-0000-4000-8000-00000000006${suffix}','Local parallel fixture')`).join(",");
  const drafts = tenants.flatMap(({ suffix }) => Array.from({ length: 24 }, (_, index) => `
    ('${offerId(suffix, index + 1)}','${restaurantId(suffix)}','${branchId(suffix)}','NEWS','Parallel ${suffix}-${index + 1}','Local parallel fixture',now(),now()+interval '30 days','DRAFT',false)`)).join(",");

  sql(`
    set session_replication_role=replica;
    insert into auth.users(id,email,created_at,updated_at) values ('7c3f0000-0000-4000-8000-000000000001','phase7c3-parallel@example.invalid',now(),now());
    insert into public.organizations(id,owner_id,name) values ${values};
    insert into public.restaurants(id,owner_id,name,slug,organization_id) values ${restaurants};
    insert into public.branches(id,organization_id,restaurant_id,name,slug,country) values ${branches};
    update public.restaurants restaurant set primary_branch_id=branch.id from public.branches branch where branch.restaurant_id=restaurant.id and restaurant.id::text like '7c3f0000-%';
    insert into public.restaurant_members(restaurant_id,organization_id,branch_id,user_id,role)
      select id,organization_id,primary_branch_id,'7c3f0000-0000-4000-8000-000000000001','owner' from public.restaurants where id::text like '7c3f0000-%';
    insert into public.branch_subscriptions(id,organization_id,branch_id,status,plan_key,subscription_status,payment_status,current_period_end,created_at) values ${subscriptions};
    insert into public.restaurant_capacity_addon_entitlements(entitlement_key,revision,restaurant_id,organization_id,branch_id,addon_key,addon_version,units,status,effective_from,source,request_id,reason) values ${addons};
    insert into public.restaurant_offers(id,restaurant_id,branch_id,offer_type,title,short_description,valid_from,valid_to,status,is_active) values ${drafts};
    set session_replication_role=origin;
  `);

  const attempts = tenants.flatMap(({ suffix }) => Array.from({ length: 24 }, (_, index) => ({
    suffix,
    promise: run(psql, [...args, "-c", `update public.restaurant_offers set status='PUBLISHED',is_active=true where id='${offerId(suffix, index + 1)}'`], {
      env, timeout: 60_000, maxBuffer: 1024 * 1024,
    }),
  })));
  const results = await Promise.allSettled(attempts.map(({ promise }) => promise));

  for (const tenant of tenants) {
    const tenantResults = results.filter((_, index) => attempts[index].suffix === tenant.suffix);
    const succeeded = tenantResults.filter((result) => result.status === "fulfilled").length;
    const failed = tenantResults.filter((result) => result.status === "rejected");
    assert.equal(succeeded, tenant.limit, `capacity ${tenant.limit} success count`);
    assert.equal(failed.length, 24 - tenant.limit, `capacity ${tenant.limit} failure count`);
    for (const result of failed) {
      assert.match(String(result.reason.stderr), /OFFER_CAPACITY_REACHED/);
      assert.doesNotMatch(String(result.reason.stderr), /deadlock|timeout|serialization/i);
    }
    assert.equal(Number(sql(`select count(*) from public.restaurant_offers where restaurant_id='${restaurantId(tenant.suffix)}' and status='PUBLISHED' and is_active=true`)), tenant.limit);
  }

  console.log("PHASE_7C3_PARALLEL_CAPACITY_PASS: 96 attempts; exact 5/10/15/20 successes; tenant isolation preserved");
} finally {
  sql(cleanup);
  assert.equal(sql(fingerprintQuery), before, "parallel fixture cleanup must restore the database fingerprint");
}
