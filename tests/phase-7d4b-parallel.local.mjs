// Local-only synthetic DB concurrency proof. No credential or token is logged.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const container = "supabase_db_wuxuai-phase7b4d-local";
const id = Object.fromEntries([
  "owner", "user", "organization", "restaurant", "branch", "customer", "account", "session",
].map((key) => [key, randomUUID()]));
const slug = `d4b-parallel-${id.restaurant.slice(0, 8)}`;

function run(sql) {
  return new Promise((resolve) => {
    const process = spawn("docker", ["exec", "-i", container, "psql", "-X", "-q", "-At",
      "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
    { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    process.stdout.on("data", (chunk) => { stdout += chunk; });
    // Error text can contain generated IDs; deliberately discard it.
    process.stderr.on("data", () => {});
    process.on("close", (code) => resolve({ code, stdout: stdout.trim() }));
    process.stdin.end(sql);
  });
}

const setup = `begin;
set local session_replication_role=replica;
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('${id.user}','authenticated','authenticated','synthetic-${id.user}@example.invalid',now(),'{}','{}',now(),now()),
('${id.owner}','authenticated','authenticated','synthetic-${id.owner}@example.invalid',now(),'{}','{}',now(),now());
insert into auth.sessions(id,user_id,created_at,updated_at) values('${id.session}','${id.user}',now(),now());
insert into public.organizations(id,owner_id,name) values('${id.organization}','${id.owner}','D4B PARALLEL LOCAL');
insert into public.restaurants(id,owner_id,name,slug,organization_id)
values('${id.restaurant}','${id.owner}','D4B PARALLEL LOCAL','${slug}','${id.organization}');
insert into public.branches(id,organization_id,restaurant_id,name,slug,country)
values('${id.branch}','${id.organization}','${id.restaurant}','D4B','${slug}','AT');
update public.restaurants set primary_branch_id='${id.branch}' where id='${id.restaurant}';
insert into public.branch_subscriptions(organization_id,branch_id,status,subscription_status,
selected_plan,plan_key,payment_status)
values('${id.organization}','${id.branch}','active','active','BASIC','BASIC','paid');
insert into public.customers(id,restaurant_id,organization_id,branch_id,auth_user_id,name,
customer_code,membership_status,is_test_customer,normalized_phone,phone)
values('${id.customer}','${id.restaurant}','${id.organization}','${id.branch}','${id.user}',
'D4B Synthetic','D4B PARALLEL','active',true,'+436600000001','+436600000001');
insert into public.customer_accounts(id,auth_user_id,email,first_name,email_confirmed_at)
values('${id.account}','${id.user}','synthetic-${id.user}@example.invalid','D4B',now());
insert into public.customer_account_memberships(account_id,restaurant_id,customer_id)
values('${id.account}','${id.restaurant}','${id.customer}');
commit;`;
assert.equal((await run(setup)).code, 0, "local synthetic fixture failed");

function authSql(body) {
  return `begin;
do $claims$ begin
  perform set_config('request.jwt.claim.sub','${id.user}',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub','${id.user}',
    'session_id','${id.session}','role','authenticated')::text,true);
end $claims$;
set local role authenticated;
${body}
commit;`;
}
const readSql = authSql(`do $read$ begin
  perform public.get_customer_account();
  perform public.get_customer_restaurant_context('${slug}');
  perform public.get_customer_restaurant_access('${slug}',null);
  perform public.open_customer_account_membership('${id.restaurant}');
end $read$;`);
const readResults = await Promise.all(Array.from({ length: 24 }, () => run(readSql)));
assert.equal(readResults.filter((result) => result.code === 0).length, 24, "parallel reads failed");
const before = await run(`select (select count(*) from public.customer_qr_tokens where customer_id='${id.customer}'),
  (select count(*) from public.audit_log where restaurant_id='${id.restaurant}');`);
assert.equal(before.stdout, "0|0", "parallel reads wrote");

const recoveryResults = await Promise.all(Array.from({ length: 24 }, () => run(authSql(
  `select public.recover_customer_membership_token('${slug}','${randomUUID()}','${randomUUID()}')->>'customer_token';`,
))));
const successes = recoveryResults.filter((result) => result.code === 0);
assert.equal(successes.length, 1, "parallel recovery issued multiple credentials");
const issuedToken = successes[0].stdout.split("\n").at(-1);
assert.ok(/^[0-9a-f]{64}$/.test(issuedToken), "issued token shape invalid");
const after = await run(`select (select count(*) from public.customer_qr_tokens
    where customer_id='${id.customer}' and active),
  (select count(*) from public.customer_token_recovery_receipts where account_id='${id.account}'),
  (select count(*) from public.audit_log where restaurant_id='${id.restaurant}');`);
assert.equal(after.stdout, "1|1|2", "parallel recovery side effects invalid");
const validReadSql = authSql(`do $read$ begin
  perform public.get_customer_restaurant_access('${slug}','${issuedToken}');
  perform public.get_customer_identity_summary('${slug}','${issuedToken}');
end $read$;`);
const validReads = await Promise.all(Array.from({ length: 24 }, () => run(validReadSql)));
assert.equal(validReads.filter((result) => result.code === 0).length, 24, "parallel valid reads failed");
const final = await run(`select (select count(*) from public.customer_qr_tokens
    where customer_id='${id.customer}' and active),
  (select count(*) from public.audit_log where restaurant_id='${id.restaurant}');`);
assert.equal(final.stdout, "1|2", "parallel valid reads wrote");
console.log("LOCAL PARALLEL IDENTITY/RECOVERY: 24 reads, 24 recovery attempts, 24 valid reads PASS");
