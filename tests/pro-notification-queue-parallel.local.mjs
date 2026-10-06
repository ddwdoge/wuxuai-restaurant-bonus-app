// Isolated local queue proof: no SMTP/Push. Stop the task-owned stack afterward.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

const databaseUrl = process.env.PRO_NOTIFICATION_LOCAL_DB_URL;
assert.match(databaseUrl ?? "", /^postgresql:\/\/postgres:postgres@127\.0\.0\.1:\d+\/postgres$/,
  "an explicit local, unlinked PostgreSQL URL is required");

const id = Object.fromEntries([
  "owner", "customerAuth", "account", "organization", "restaurant", "branch",
  "subscription", "customer", "consent", "grant", "grantRequest",
].map((name) => [name, randomUUID()]));
const eventKey = `local-pro-parallel:${randomUUID()}`;
const syntheticPhone = `+4366${BigInt(`0x${id.customer.slice(0, 12).replaceAll("-", "")}`).toString().slice(0, 10)}`;

function run(sql) {
  return new Promise((resolve) => {
    const child = spawn("psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", databaseUrl],
      { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", () => {});
    child.on("close", (code) => resolve({ code, stdout: stdout.trim() }));
    child.stdin.end(sql);
  });
}

const setup = `begin;
set local session_replication_role=replica;
insert into auth.users(id,aud,role,email,email_confirmed_at,created_at,updated_at)
values('${id.owner}','authenticated','authenticated',
  'pro-mail-owner-${id.owner}@example.invalid',now(),now(),now()),
  ('${id.customerAuth}','authenticated','authenticated',
  'pro-mail-customer-${id.customerAuth}@example.invalid',now(),now(),now());
insert into public.organizations(id,owner_id,name,status)
values('${id.organization}','${id.owner}','PRO MAIL PARALLEL LOCAL','active');
insert into public.restaurants(id,owner_id,name,slug,status,organization_id,
  operational_ready,security_ready,legal_ready,onboarding_status)
values('${id.restaurant}','${id.owner}','PRO MAIL PARALLEL LOCAL',
  'pro-mail-${id.restaurant.slice(0, 8)}','active','${id.organization}',
  true,true,true,'completed');
insert into public.branches(id,organization_id,restaurant_id,name,slug,country,status)
values('${id.branch}','${id.organization}','${id.restaurant}','PRO MAIL',
  'pro-mail-${id.branch.slice(0, 8)}','AT','active');
update public.restaurants set primary_branch_id='${id.branch}' where id='${id.restaurant}';
insert into public.branch_subscriptions(id,organization_id,branch_id,status,subscription_status,
  selected_plan,plan_key,payment_status)
values('${id.subscription}','${id.organization}','${id.branch}','active','active',
  'PRO','PRO','paid');
insert into public.platform_test_tenant_registry(restaurant_id,restaurant_name,organization_id,
  owner_user_id,test_session_id,marked_by)
values('${id.restaurant}','PRO MAIL PARALLEL LOCAL','${id.organization}',
  '${id.owner}','pro-mail-parallel-${id.restaurant.slice(0, 8)}','${id.owner}');
insert into public.commercial_pro_access_grants(id,restaurant_id,organization_id,access_kind,
  starts_at,expires_at,reason,created_by,request_id)
values('${id.grant}','${id.restaurant}','${id.organization}','INTERNAL_TEST_ONLY',
  now()-interval '1 hour',now()+interval '1 day','Synthetic local queue proof',
  '${id.owner}','${id.grantRequest}');
update public.business_verification_environment
set environment='STAGING',change_ref='PRO_MAIL_PARALLEL_LOCAL' where singleton;
insert into public.customers(id,restaurant_id,organization_id,branch_id,auth_user_id,name,
  customer_code,membership_status,is_test_customer,normalized_phone,phone)
values('${id.customer}','${id.restaurant}','${id.organization}','${id.branch}',
  '${id.customerAuth}','Synthetic Customer','PRO-${id.customer.slice(0, 8)}','active',true,
  '${syntheticPhone}','${syntheticPhone}');
insert into public.customer_accounts(id,auth_user_id,email,email_confirmed_at)
values('${id.account}','${id.customerAuth}',
  'pro-mail-customer-${id.customerAuth}@example.invalid',now());
insert into public.customer_account_memberships(account_id,restaurant_id,customer_id)
values('${id.account}','${id.restaurant}','${id.customer}');
insert into public.customer_account_emails(account_id,email,status,confirmed_at)
values('${id.account}','pro-mail-customer-${id.customerAuth}@example.invalid','CONFIRMED',now());
insert into public.customer_offer_email_consents(id,account_id,restaurant_id,customer_id,email,
  frequency,status,consent_version,consented_at,email_confirmed_at)
values('${id.consent}','${id.account}','${id.restaurant}','${id.customer}',
  'pro-mail-customer-${id.customerAuth}@example.invalid','WEEKLY','ACTIVE',
  'LOCAL_TEST_ONLY',now(),now());
commit;`;
assert.equal((await run(setup)).code, 0, "synthetic queue fixture setup failed");

const enabled = await run(`select public.restaurant_entitlement_enabled(
  '${id.restaurant}', 'offer_notifications');`);
assert.equal(enabled.stdout, "t", "synthetic PRO entitlement missing");

const enqueue = `select public.enqueue_customer_transactional_email(
  '${id.restaurant}','${id.customer}','OFFER_PUBLISHED','${eventKey}');`;
const enqueues = await Promise.all(Array.from({ length: 6 }, () => run(enqueue)));
assert.equal(enqueues.filter(({ code, stdout }) => code === 0 && stdout === "t").length, 1,
  "exactly one parallel enqueue must insert");
assert.equal(enqueues.filter(({ code, stdout }) => code === 0 && stdout === "f").length, 5,
  "all parallel replays must be idempotent");

const reserve = `select count(*) from public.reserve_customer_transactional_emails(1)
  where event_type='OFFER_PUBLISHED';`;
const reserves = await Promise.all(Array.from({ length: 6 }, () => run(reserve)));
assert.equal(reserves.filter(({ code, stdout }) => code === 0 && stdout === "1").length, 1,
  "exactly one parallel worker must reserve the delivery");
assert.equal(reserves.filter(({ code, stdout }) => code === 0 && stdout === "0").length, 5,
  "other workers must skip the processing row");

const withdraw = await run(`begin;
select set_config('request.jwt.claim.role','service_role',true);
update public.customer_offer_email_consents
set status='WITHDRAWN',frequency='NEVER',withdrawn_at=now(),updated_at=now()
where id='${id.consent}';
select authorized,reason_code from public.authorize_customer_transactional_email_delivery(
  (select id from public.customer_transactional_email_deliveries where event_key='${eventKey}'));
select status,last_error_code from public.customer_transactional_email_deliveries
where event_key='${eventKey}';
commit;`);
assert.equal(withdraw.code, 0);
assert.match(withdraw.stdout, /f\|OFFER_EMAIL_CONSENT_INACTIVE/);
assert.match(withdraw.stdout, /SKIPPED\|OFFER_EMAIL_CONSENT_INACTIVE/);
const final = await run(`select count(*) from public.customer_transactional_email_deliveries
where event_key='${eventKey}';`);
assert.equal(final.stdout, "1", "historical delivery evidence must remain unique");

console.log("PRO MAIL LOCAL: 6/6 enqueue and 6/6 reserve; withdrawal before provider PASS; SMTP calls 0");
