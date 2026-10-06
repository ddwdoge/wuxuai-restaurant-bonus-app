// Local-only 24-way deduplication proof. The caller stops the task-owned DB afterward.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

const databaseUrl = process.env.PRO_NOTIFICATION_LOCAL_DB_URL;
assert.match(databaseUrl ?? "", /^postgresql:\/\/postgres:postgres@127\.0\.0\.1:\d+\/postgres$/,
  "an explicit local, unlinked PostgreSQL URL is required");
const id = Object.fromEntries([
  "owner", "customerAuth", "account", "organization", "restaurant", "branch", "subscription", "customer", "reward",
  "grant", "grantRequest",
].map((key) => [key, randomUUID()]));
const eventKey = randomUUID();
const syntheticPhone = `+4366${BigInt(`0x${id.customer.slice(0, 12).replaceAll("-", "")}`).toString().slice(0, 10)}`;

function run(sql) {
  return new Promise((resolve) => {
    const child = spawn("psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", databaseUrl],
    { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    // Generated fixture identifiers can occur in diagnostics; never surface stderr.
    child.stderr.on("data", () => {});
    child.on("close", (code) => resolve({ code, stdout: stdout.trim() }));
    child.stdin.end(sql);
  });
}

const setup = `begin;
set local session_replication_role=replica;
insert into auth.users(id,aud,role,email,email_confirmed_at,created_at,updated_at)
values('${id.owner}','authenticated','authenticated',
  'pro-inbox-parallel-${id.owner}@example.invalid',now(),now(),now()),
  ('${id.customerAuth}','authenticated','authenticated',
  'pro-inbox-parallel-${id.customerAuth}@example.invalid',now(),now(),now());
insert into public.organizations(id,owner_id,name,status)
values('${id.organization}','${id.owner}','PRO INBOX PARALLEL LOCAL','active');
insert into public.restaurants(id,owner_id,name,slug,status,organization_id,
  operational_ready,security_ready,legal_ready,onboarding_status)
values('${id.restaurant}','${id.owner}','PRO INBOX PARALLEL LOCAL',
  'pro-inbox-${id.restaurant.slice(0, 8)}','active','${id.organization}',
  true,true,true,'completed');
insert into public.branches(id,organization_id,restaurant_id,name,slug,country,status)
values('${id.branch}','${id.organization}','${id.restaurant}','PRO INBOX',
  'pro-inbox-${id.branch.slice(0, 8)}','AT','active');
update public.restaurants set primary_branch_id='${id.branch}' where id='${id.restaurant}';
insert into public.branch_subscriptions(id,organization_id,branch_id,status,subscription_status,
  selected_plan,plan_key,payment_status)
values('${id.subscription}','${id.organization}','${id.branch}','active','active',
  'PRO','PRO','paid');
insert into public.platform_test_tenant_registry(restaurant_id,restaurant_name,organization_id,
  owner_user_id,test_session_id,marked_by)
values('${id.restaurant}','PRO INBOX PARALLEL LOCAL','${id.organization}',
  '${id.owner}','pro-inbox-parallel-${id.restaurant.slice(0, 8)}','${id.owner}');
insert into public.commercial_pro_access_grants(id,restaurant_id,organization_id,access_kind,
  starts_at,expires_at,reason,created_by,request_id)
values('${id.grant}','${id.restaurant}','${id.organization}','INTERNAL_TEST_ONLY',
  now()-interval '1 hour',now()+interval '1 day','Synthetic local inbox parallel proof',
  '${id.owner}','${id.grantRequest}');
update public.business_verification_environment
set environment='STAGING',change_ref='PRO_INBOX_PARALLEL_LOCAL' where singleton;
insert into public.customers(id,restaurant_id,organization_id,branch_id,auth_user_id,name,customer_code,
  membership_status,is_test_customer,normalized_phone,phone)
values('${id.customer}','${id.restaurant}','${id.organization}','${id.branch}',
  '${id.customerAuth}','Synthetic Customer','PRO-${id.customer.slice(0, 8)}',
  'active',true,'${syntheticPhone}','${syntheticPhone}');
insert into public.customer_accounts(id,auth_user_id,email,email_confirmed_at)
values('${id.account}','${id.customerAuth}',
  'pro-inbox-parallel-${id.customerAuth}@example.invalid',now());
insert into public.customer_account_memberships(account_id,restaurant_id,customer_id)
values('${id.account}','${id.restaurant}','${id.customer}');
insert into public.rewards(id,restaurant_id,organization_id,branch_id,title,description,
  required_points,active,is_starter_reward)
values('${id.reward}','${id.restaurant}','${id.organization}','${id.branch}',
  'Synthetic Reward','Synthetic reward',10,true,false);
commit;`;
assert.equal((await run(setup)).code, 0, "parallel fixture setup failed");
const prerequisites = await run(`select
  public.pro_in_app_test_scope_allowed_internal('${id.restaurant}','${id.customer}'),
  public.restaurant_entitlement_enabled('${id.restaurant}','reward_notifications'),
  exists(select 1 from public.rewards where id='${id.reward}');`);
assert.equal(prerequisites.code, 0);
assert.equal(prerequisites.stdout, "t|t|t", "parallel fixture prerequisites failed");

const enqueue = `select public.enqueue_customer_pro_in_app_notification_internal(
  '${id.restaurant}','${id.customer}','POINT_REWARD_AVAILABLE','${eventKey}',
  null,'${id.reward}',statement_timestamp());`;
const results = await Promise.all(Array.from({ length: 24 }, () => run(enqueue)));
assert.equal(results.filter(({ code }) => code === 0).length, 24, "parallel calls failed");
assert.equal(results.filter(({ stdout }) => stdout === "t").length, 1,
  "exactly one parallel call must insert");
assert.equal(results.filter(({ stdout }) => stdout === "f").length, 23,
  "all duplicate calls must be idempotent");

const count = await run(`select count(*) from public.customer_pro_in_app_notifications
where restaurant_id='${id.restaurant}' and customer_id='${id.customer}'
  and event_type='POINT_REWARD_AVAILABLE' and event_key='${eventKey}';`);
assert.equal(count.code, 0);
assert.equal(count.stdout, "1", "parallel calls created duplicate inbox rows");

console.log("PRO IN-APP INBOX PARALLEL DEDUPLICATION: 24/24 PASS; exactly one row");
