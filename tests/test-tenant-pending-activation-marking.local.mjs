import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const status = JSON.parse(execFileSync("npx", ["--no-install", "supabase", "status", "--output", "json"], {
  encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1", DO_NOT_TRACK: "1" },
}));
assert.equal(status.API_URL, "http://127.0.0.1:56121");
const container = "supabase_db_wuxuai-phase7b4d-local";
const sql = (input) => execFileSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1"], {
  input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
}).trim();
const q = (value) => `'${String(value).replaceAll("'", "''")}'`;

function decodeBase32(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of value.replace(/=+$/u, "").toUpperCase()) bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  const bytes = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  return Buffer.from(bytes);
}
function totp(secret) {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac("sha1", decodeBase32(secret)).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

const service = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const browser = () => createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const password = randomBytes(24).toString("base64url");
const users = {};
const fixtures = {};

async function createUser(label) {
  const created = await service.auth.admin.createUser({ email: `${label}-${randomUUID()}@example.invalid`, password, email_confirm: true });
  assert.ifError(created.error);
  users[label] = created.data.user.id;
  const client = browser();
  assert.ifError((await client.auth.signInWithPassword({ email: created.data.user.email, password })).error);
  return client;
}
function createFixture(label, ownerId) {
  const fixture = { organization: randomUUID(), restaurant: randomUUID(), branch: randomUUID(), name: `WUXUAI TEST ${label.toUpperCase()}` };
  fixtures[label] = fixture;
  sql(`begin; set local session_replication_role=replica;
    insert into public.organizations(id,owner_id,name) values(${q(fixture.organization)},${q(ownerId)},${q(fixture.name)});
    insert into public.restaurants(id,owner_id,name,slug,status,organization_id,activation_status)
      values(${q(fixture.restaurant)},${q(ownerId)},${q(fixture.name)},${q(`test-${label}-${fixture.restaurant.slice(0, 8)}`)},'draft',${q(fixture.organization)},'pending_activation');
    insert into public.branches(id,organization_id,restaurant_id,name,slug,status,country,address,postal_code,city)
      values(${q(fixture.branch)},${q(fixture.organization)},${q(fixture.restaurant)},${q(fixture.name)},${q(`test-${label}-${fixture.branch.slice(0, 8)}`)},'draft','AT','Synthetic Road 1','1000','Synthetic City');
    update public.restaurants set primary_branch_id=${q(fixture.branch)} where id=${q(fixture.restaurant)};
    insert into public.restaurant_members(restaurant_id,organization_id,branch_id,user_id,role)
      values(${q(fixture.restaurant)},${q(fixture.organization)},${q(fixture.branch)},${q(ownerId)},'owner');
    insert into public.branch_subscriptions(organization_id,branch_id,status,subscription_status,selected_plan,plan_key,payment_status)
      values(${q(fixture.organization)},${q(fixture.branch)},'pending_activation','pending_activation','BASIC','BASIC','not_required');
    commit;`);
  return fixture;
}
function restoreSafePending(fixture) {
  sql(`begin; set local session_replication_role=replica;
    delete from public.branch_entitlement_overrides where subscription_id in (select id from public.branch_subscriptions where branch_id=${q(fixture.branch)});
    delete from public.restaurant_capacity_addon_entitlements where restaurant_id=${q(fixture.restaurant)};
    delete from public.commercial_pro_access_grants where restaurant_id=${q(fixture.restaurant)};
    delete from public.billing_trial_claims where restaurant_id=${q(fixture.restaurant)};
    delete from public.billing_checkout_blocked_requests where restaurant_id=${q(fixture.restaurant)};
    delete from public.billing_test_webhook_inbox where tenant_ref=${q(fixture.restaurant)};
    update public.restaurants set status='draft',activation_status='pending_activation' where id=${q(fixture.restaurant)};
    update public.branch_subscriptions set status='pending_activation',subscription_status='pending_activation',selected_plan='BASIC',plan_key='BASIC',payment_status='not_required',
      trial_started_at=null,trial_ends_at=null,current_period_start=null,current_period_end=null,current_period_ends_at=null,
      stripe_customer_id=null,stripe_subscription_id=null where branch_id=${q(fixture.branch)};
    commit;`);
}
async function preflight(client, fixture) {
  const result = await client.rpc("get_platform_test_tenant_cleanup_preflight", { input_restaurant_id: fixture.restaurant });
  assert.ifError(result.error);
  return result.data;
}

const adminAal1 = await createUser("platform-admin");
const ownerClient = await createUser("owner");
const negativeOwnerClient = await createUser("negative-owner");
const staffClient = await createUser("staff");
const positive = createFixture("positive", users.owner);
const negative = createFixture("negative", users["negative-owner"]);
sql(`insert into public.platform_admins(user_id,role,active) values(${q(users["platform-admin"])},'platform_admin',true);
  set session_replication_role=replica;
  insert into public.restaurant_members(restaurant_id,organization_id,branch_id,user_id,role)
    values(${q(negative.restaurant)},${q(negative.organization)},${q(negative.branch)},${q(users.staff)},'staff');
  set session_replication_role=origin;`);

assert.ok((await adminAal1.rpc("get_platform_test_tenant_cleanup_preflight", { input_restaurant_id: positive.restaurant })).error, "AAL1 must be denied");
assert.ok((await ownerClient.rpc("get_platform_test_tenant_cleanup_preflight", { input_restaurant_id: negative.restaurant })).error, "foreign owner must be denied");
assert.ok((await staffClient.rpc("get_platform_test_tenant_cleanup_preflight", { input_restaurant_id: negative.restaurant })).error, "staff must be denied");
assert.ok((await browser().rpc("get_platform_test_tenant_cleanup_preflight", { input_restaurant_id: negative.restaurant })).error, "anonymous must be denied");

const enrollment = await adminAal1.auth.mfa.enroll({ factorType: "totp", friendlyName: "Local TEST_ONLY marking" });
assert.ifError(enrollment.error);
assert.ifError((await adminAal1.auth.mfa.challengeAndVerify({ factorId: enrollment.data.id, code: totp(enrollment.data.totp.secret) })).error);
const safe = await preflight(adminAal1, positive);
assert.equal(safe.contract_version, "test-tenant-pending-activation-marking-v4");
assert.equal(safe.marking_preflight.eligible, true);
assert.equal(safe.eligible, false, "cleanup remains blocked by the subscription");
assert.ok(safe.blockers.includes("PAYMENT_OR_STRIPE_STATE_PRESENT"));
assert.equal(safe.billing_summary.pending_activation_marking_exception, true);

const matrix = [
  ["active subscription", `update public.branch_subscriptions set status='active',subscription_status='active',payment_status='paid' where branch_id=${q(negative.branch)}`, "PAYMENT_OR_STRIPE_STATE_PRESENT"],
  ...["pending", "paid", "failed", "manual"].map((state) => [`payment ${state}`, `update public.branch_subscriptions set payment_status='${state}' where branch_id=${q(negative.branch)}`, "PAYMENT_OR_STRIPE_STATE_PRESENT"]),
  ["trial started", `update public.branch_subscriptions set trial_started_at=now() where branch_id=${q(negative.branch)}`, "PAYMENT_OR_STRIPE_STATE_PRESENT"],
  ["trial ending", `update public.branch_subscriptions set trial_ends_at=now()+interval '1 month' where branch_id=${q(negative.branch)}`, "PAYMENT_OR_STRIPE_STATE_PRESENT"],
  ["period started", `update public.branch_subscriptions set current_period_start=now() where branch_id=${q(negative.branch)}`, "PAYMENT_OR_STRIPE_STATE_PRESENT"],
  ["Stripe customer", `update public.branch_subscriptions set stripe_customer_id='synthetic_customer_reference' where branch_id=${q(negative.branch)}`, "PAYMENT_OR_STRIPE_STATE_PRESENT"],
  ["Stripe subscription", `update public.branch_subscriptions set stripe_subscription_id='synthetic_subscription_reference' where branch_id=${q(negative.branch)}`, "PAYMENT_OR_STRIPE_STATE_PRESENT"],
  ["PRO plan", `update public.branch_subscriptions set selected_plan='PRO',plan_key='PRO' where branch_id=${q(negative.branch)}`, "PAYMENT_OR_STRIPE_STATE_PRESENT"],
  ["entitlement override", `insert into public.branch_entitlement_overrides(subscription_id,reason,changed_by) select id,'Synthetic local negative evidence',${q(users["platform-admin"])} from public.branch_subscriptions where branch_id=${q(negative.branch)}`, "PAID_OR_OVERRIDE_ENTITLEMENT_PRESENT"],
  ["PRO grant", `insert into public.commercial_pro_access_grants(restaurant_id,organization_id,access_kind,starts_at,expires_at,reason,created_by,request_id) values(${q(negative.restaurant)},${q(negative.organization)},'INTERNAL_TEST_ONLY',now(),now()+interval '1 hour','Synthetic local negative evidence',${q(users["platform-admin"])},${q(randomUUID())})`, "PRO_ACCESS_GRANT_PRESENT"],
  ["trial claim", `insert into public.billing_trial_claims(organization_id,restaurant_id,provider_event_reference) values(${q(negative.organization)},${q(negative.restaurant)},${q(`synthetic-${randomUUID()}`)})`, "BILLING_TRIAL_CLAIM_PRESENT"],
  ["checkout state", `insert into public.billing_checkout_blocked_requests(restaurant_id,request_id,organization_id,actor_id,plan_key,return_route,catalog_version,resolved_amount_minor,resolved_currency,decision,blocker_codes) values(${q(negative.restaurant)},${q(randomUUID())},${q(negative.organization)},${q(users["negative-owner"])},'BASIC','/admin/settings/tarif-kapazitaet',1,5900,'EUR','BLOCKED',array['SYNTHETIC_LOCAL'])`, "BILLING_EVENT_OR_CHECKOUT_STATE_PRESENT"],
];
for (const [label, mutation, blocker] of matrix) {
  restoreSafePending(negative);
  sql(`begin; set local session_replication_role=replica; ${mutation}; commit;`);
  const value = await preflight(adminAal1, negative);
  assert.equal(value.marking_preflight.eligible, false, label);
  assert.ok(value.marking_preflight.blockers.includes(blocker), `${label}: ${JSON.stringify(value.marking_preflight.blockers)}`);
}
restoreSafePending(negative);

const before = sql(`select jsonb_build_object(
  'restaurant',(select to_jsonb(r) from public.restaurants r where id=${q(positive.restaurant)}),
  'subscription',(select to_jsonb(s) from public.branch_subscriptions s where branch_id=${q(positive.branch)}),
  'trial_claims',(select count(*) from public.billing_trial_claims where restaurant_id=${q(positive.restaurant)}),
  'pro_grants',(select count(*) from public.commercial_pro_access_grants where restaurant_id=${q(positive.restaurant)}),
  'overrides',(select count(*) from public.branch_entitlement_overrides o join public.branch_subscriptions s on s.id=o.subscription_id where s.branch_id=${q(positive.branch)})
)::text`);
const marked = await adminAal1.rpc("mark_platform_test_tenant", {
  input_restaurant_id: positive.restaurant,
  input_test_session_id: `local-${randomUUID()}`,
  input_reason: "Synthetic local pending activation marker verification",
  input_confirmation: `CONFIRMED:${positive.name}:${positive.restaurant}`,
  input_idempotency_key: randomUUID(),
});
assert.ifError(marked.error);
assert.equal(marked.data.marked, true);
const after = sql(`select jsonb_build_object(
  'restaurant',(select to_jsonb(r) from public.restaurants r where id=${q(positive.restaurant)}),
  'subscription',(select to_jsonb(s) from public.branch_subscriptions s where branch_id=${q(positive.branch)}),
  'trial_claims',(select count(*) from public.billing_trial_claims where restaurant_id=${q(positive.restaurant)}),
  'pro_grants',(select count(*) from public.commercial_pro_access_grants where restaurant_id=${q(positive.restaurant)}),
  'overrides',(select count(*) from public.branch_entitlement_overrides o join public.branch_subscriptions s on s.id=o.subscription_id where s.branch_id=${q(positive.branch)})
)::text`);
assert.equal(after, before, "marking must not mutate restaurant, subscription, trial, grant or entitlement state");
assert.equal(sql(`select count(*) from public.platform_test_tenant_registry where restaurant_id=${q(positive.restaurant)}`), "1");
assert.equal(sql(`select status||'|'||subscription_status||'|'||payment_status from public.branch_subscriptions where branch_id=${q(positive.branch)}`), "pending_activation|pending_activation|not_required");
assert.equal(sql(`select status||'|'||activation_status from public.restaurants where id=${q(positive.restaurant)}`), "draft|pending_activation");

console.log(`TEST_ONLY_PENDING_ACTIVATION_LOCAL_PASS matrix=${matrix.length} roles=aal1,foreign-owner,staff,anon positive=1 business-writes=0`);
