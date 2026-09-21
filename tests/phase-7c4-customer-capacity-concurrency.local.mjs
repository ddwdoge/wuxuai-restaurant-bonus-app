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
  env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60_000,
}).trim();

const owner = "7c4f0000-0000-4000-8000-000000000001";
const tenants = [
  {
    key: "different",
    restaurant: "7c4f0000-0000-4000-8000-000000000011",
    organization: "7c4f0000-0000-4000-8000-000000000012",
    branch: "7c4f0000-0000-4000-8000-000000000013",
  },
  {
    key: "same",
    restaurant: "7c4f0000-0000-4000-8000-000000000021",
    organization: "7c4f0000-0000-4000-8000-000000000022",
    branch: "7c4f0000-0000-4000-8000-000000000023",
  },
];
const cleanup = `
  set session_replication_role=replica;
  delete from public.points_transactions where restaurant_id::text like '7c4f0000-%';
  delete from public.redemption_activity_journal where restaurant_id::text like '7c4f0000-%';
  delete from public.customer_account_memberships where restaurant_id::text like '7c4f0000-%';
  delete from public.customers where restaurant_id::text like '7c4f0000-%';
  delete from public.restaurant_members where restaurant_id::text like '7c4f0000-%';
  delete from public.branch_subscriptions where branch_id::text like '7c4f0000-%';
  delete from public.branches where id::text like '7c4f0000-%';
  delete from public.restaurants where id::text like '7c4f0000-%';
  delete from public.organizations where id::text like '7c4f0000-%';
  delete from public.commercial_capacity_plan_versions where plan_key='BASIC' and version=99;
  delete from auth.users where id='${owner}';
  set session_replication_role=origin;
`;

const fingerprintQuery = `select jsonb_build_object(
  'users',(select count(*) from auth.users),
  'organizations',(select count(*) from public.organizations),
  'restaurants',(select count(*) from public.restaurants),
  'branches',(select count(*) from public.branches),
  'customers',(select count(*) from public.customers),
  'memberships',(select count(*) from public.customer_account_memberships),
  'points',(select count(*) from public.points_transactions),
  'journal',(select count(*) from public.redemption_activity_journal),
  'plans',(select count(*) from public.commercial_capacity_plan_versions)
)`;

sql(cleanup);
const before = sql(fingerprintQuery);

try {
  sql(`
    set session_replication_role=replica;
    insert into auth.users(id,email,created_at,updated_at) values ('${owner}','phase7c4-parallel@example.invalid',now(),now());
    insert into public.commercial_capacity_plan_versions(
      plan_key,version,monthly_price_minor,currency,tax_treatment,
      base_offer_limit,base_customer_limit,effective_from
    ) values ('BASIC',99,5900,'EUR','EX_VAT',5,5,now()-interval '1 day');
    insert into public.organizations(id,owner_id,name) values
      ('${tenants[0].organization}','${owner}','7C4 parallel different'),
      ('${tenants[1].organization}','${owner}','7C4 parallel same');
    insert into public.restaurants(id,owner_id,name,slug,organization_id) values
      ('${tenants[0].restaurant}','${owner}','7C4 parallel different','phase-7c4-parallel-different','${tenants[0].organization}'),
      ('${tenants[1].restaurant}','${owner}','7C4 parallel same','phase-7c4-parallel-same','${tenants[1].organization}');
    insert into public.branches(id,organization_id,restaurant_id,name,slug,country) values
      ('${tenants[0].branch}','${tenants[0].organization}','${tenants[0].restaurant}','Different','phase-7c4-parallel-different','AT'),
      ('${tenants[1].branch}','${tenants[1].organization}','${tenants[1].restaurant}','Same','phase-7c4-parallel-same','AT');
    update public.restaurants r set primary_branch_id=b.id from public.branches b where b.restaurant_id=r.id and r.id::text like '7c4f0000-%';
    insert into public.restaurant_members(restaurant_id,organization_id,branch_id,user_id,role)
      select id,organization_id,primary_branch_id,'${owner}','owner' from public.restaurants where id::text like '7c4f0000-%';
    insert into public.customers(id,restaurant_id,organization_id,branch_id,name,customer_code,normalized_phone,is_test_customer)
      select md5('different-'||s)::uuid,'${tenants[0].restaurant}','${tenants[0].organization}','${tenants[0].branch}',
        'Different '||s,'D-'||s,'+4381'||lpad(s::text,8,'0'),false from generate_series(1,96) s;
    insert into public.customers(id,restaurant_id,organization_id,branch_id,name,customer_code,normalized_phone,is_test_customer)
      select md5('same-base-'||s)::uuid,'${tenants[1].restaurant}','${tenants[1].organization}','${tenants[1].branch}',
        'Same base '||s,'S-'||s,'+4382'||lpad(s::text,8,'0'),false from generate_series(1,4) s;
    insert into public.customers(id,restaurant_id,organization_id,branch_id,name,customer_code,normalized_phone,is_test_customer)
      values (md5('same-candidate')::uuid,'${tenants[1].restaurant}','${tenants[1].organization}','${tenants[1].branch}',
        'Same candidate','S-CANDIDATE','+438299999999',false);
    insert into public.points_transactions(id,restaurant_id,organization_id,branch_id,customer_id,type,points,amount_cents,collection_source,created_at)
      select md5('same-base-point-'||s)::uuid,'${tenants[1].restaurant}','${tenants[1].organization}','${tenants[1].branch}',
        md5('same-base-'||s)::uuid,'earn',10,1000,'restaurant_controlled',now()-interval '1 day' from generate_series(1,4) s;
    set session_replication_role=origin;
  `);

  const differentAttempts = Array.from({ length: 96 }, (_, index) => {
    const attempt = index + 1;
    return run(psql, [...args, "-c", `insert into public.points_transactions(
      id,restaurant_id,organization_id,branch_id,customer_id,type,points,amount_cents,collection_source
    ) values (
      md5('different-point-${attempt}')::uuid,'${tenants[0].restaurant}','${tenants[0].organization}','${tenants[0].branch}',
      md5('different-${attempt}')::uuid,'earn',10,1000,'restaurant_controlled'
    )`], { env, timeout: 60_000, maxBuffer: 1024 * 1024 });
  });
  const differentResults = await Promise.allSettled(differentAttempts);
  const differentSuccesses = differentResults.filter((result) => result.status === "fulfilled").length;
  assert.equal(differentSuccesses, 5, "exactly five distinct customer activations may consume the five slots");
  for (const result of differentResults.filter((entry) => entry.status === "rejected")) {
    assert.match(String(result.reason.stderr), /CUSTOMER_CAPACITY_REACHED/);
    assert.doesNotMatch(String(result.reason.stderr), /deadlock|timeout|serialization/i);
  }

  const sameAttempts = Array.from({ length: 24 }, (_, index) => {
    const attempt = index + 1;
    return run(psql, [...args, "-c", `insert into public.points_transactions(
      id,restaurant_id,organization_id,branch_id,customer_id,type,points,amount_cents,collection_source
    ) values (
      md5('same-point-${attempt}')::uuid,'${tenants[1].restaurant}','${tenants[1].organization}','${tenants[1].branch}',
      md5('same-candidate')::uuid,'earn',10,1000,'customer_initiated'
    )`], { env, timeout: 60_000, maxBuffer: 1024 * 1024 });
  });
  const sameResults = await Promise.allSettled(sameAttempts);
  assert.equal(sameResults.filter((result) => result.status === "fulfilled").length, 24,
    "concurrent activity for one customer identity must not consume multiple slots");

  for (const tenant of tenants) {
    const snapshot = JSON.parse(sql(`select public.resolve_restaurant_capacity_internal('${tenant.restaurant}',clock_timestamp())`));
    assert.equal(Number(snapshot.active_customers.usage), 5);
    assert.equal(Number(snapshot.active_customers.effective_limit), 5);
  }
  assert.equal(Number(sql(`select count(*) from public.points_transactions where restaurant_id='${tenants[0].restaurant}'`)), 5);
  assert.equal(Number(sql(`select count(*) from public.points_transactions where restaurant_id='${tenants[1].restaurant}'`)), 28);

  console.log("PHASE_7C4_PARALLEL_CUSTOMER_CAPACITY_PASS: 96 distinct attempts -> 5 successes; 24 same-identity attempts -> 24 successes; usage 5/5");
} finally {
  sql(cleanup);
}

assert.equal(sql(fingerprintQuery), before, "parallel fixture cleanup must restore the database fingerprint");
console.log("PHASE_7C4_PARALLEL_CLEANUP_PASS: no orphan customer, membership, activity or plan rows");
