import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

const cwd = new URL("../", import.meta.url).pathname;
const status = JSON.parse(execFileSync("./node_modules/.bin/supabase", ["status", "--output", "json"], {
  cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
}));
assert.equal(status.API_URL, "http://127.0.0.1:56121");
const container = "supabase_db_wuxuai-phase7b4d-local";
const sql = (query) => execFileSync("docker", ["exec", "-i", container, "psql", "-X", "-qAt",
  "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], {
  input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
}).trim();
const client = (storage) => createClient(status.API_URL, status.ANON_KEY, {
  auth: { persistSession: Boolean(storage), autoRefreshToken: false, detectSessionInUrl: false,
    ...(storage ? { storage, storageKey: "staff-e2e-shared-auth" } : {}) },
  realtime: { transport: WebSocket },
});
const adminHeaders = { apikey: status.SERVICE_ROLE_KEY,
  authorization: `Bearer ${status.SERVICE_ROLE_KEY}`, "content-type": "application/json" };
const ids = Object.fromEntries(["owner", "organization", "restaurant", "branch", "staffMember",
  "customer", "account", "reward", "grant", "request", "negativeRequest"].map((key) => [key, randomUUID()]));
const slug = `staff-e2e-${ids.restaurant.slice(0, 8)}`;
const rawCustomerToken = randomBytes(32).toString("hex");
const previousEnvironment = sql("select environment from public.business_verification_environment where singleton");
const credentials = Object.fromEntries(["platform", "owner", "staff", "customer"].map((role) => [role, {
  email: `staff-e2e-${role}-${randomUUID()}@example.invalid`, password: randomUUID() + randomUUID(), userId: null,
}]));
const createUser = async (credential) => {
  const response = await fetch(`${status.API_URL}/auth/v1/admin/users`, { method: "POST", headers: adminHeaders,
    body: JSON.stringify({ email: credential.email, password: credential.password, email_confirm: true }) });
  assert.equal(response.status, 200, "LOCAL_SYNTHETIC_AUTH_CREATE_FAILED");
  const body = await response.json();
  credential.userId = body.id ?? body.user?.id;
  assert.match(String(credential.userId), /^[0-9a-f-]{36}$/);
};
const removeUser = async (credential) => credential.userId && fetch(
  `${status.API_URL}/auth/v1/admin/users/${credential.userId}`, { method: "DELETE", headers: adminHeaders });
for (const credential of Object.values(credentials)) await createUser(credential);

let setupComplete = false;
try {
  sql(`begin;
  set local session_replication_role=replica;
  insert into public.platform_admins(user_id,role,active)
  values('${credentials.platform.userId}','platform_admin',true);
  insert into public.organizations(id,owner_id,name,status)
  values('${ids.organization}','${credentials.owner.userId}','STAFF POINTS E2E LOCAL','active');
  insert into public.restaurants(id,owner_id,name,slug,status,organization_id,operational_ready,security_ready,legal_ready,onboarding_status)
  values('${ids.restaurant}','${credentials.owner.userId}','STAFF POINTS E2E LOCAL','${slug}','active','${ids.organization}',true,true,true,'completed');
  insert into public.branches(id,organization_id,restaurant_id,name,slug,country,address,postal_code,city,status)
  values('${ids.branch}','${ids.organization}','${ids.restaurant}','STAFF POINTS E2E','${slug}-main','AT','Synthetic 1','1000','Vienna','active');
  update public.restaurants set primary_branch_id='${ids.branch}' where id='${ids.restaurant}';
  insert into public.restaurant_members(restaurant_id,organization_id,branch_id,user_id,role)
  values('${ids.restaurant}','${ids.organization}','${ids.branch}','${credentials.staff.userId}','staff');
  insert into public.restaurant_members(restaurant_id,organization_id,branch_id,user_id,role)
  values('${ids.restaurant}','${ids.organization}','${ids.branch}','${credentials.owner.userId}','owner');
  insert into public.staff_members(id,restaurant_id,organization_id,branch_id,name,pin_hash,role,active,auth_user_id,email,account_status,accepted_at)
  values('${ids.staffMember}','${ids.restaurant}','${ids.organization}','${ids.branch}','Synthetic Staff','not-used','staff',true,
    '${credentials.staff.userId}','${credentials.staff.email}','active',now());
  insert into public.branch_subscriptions(organization_id,branch_id,status,subscription_status,selected_plan,plan_key,payment_status,
    trial_started_at,trial_ends_at,current_period_start,current_period_ends_at,current_period_end)
  values('${ids.organization}','${ids.branch}','trialing','trialing','BASIC','BASIC','not_required',now()-interval '1 day',
    now()+interval '20 days',now()-interval '1 day',now()+interval '20 days',now()+interval '20 days');
  insert into public.loyalty_settings(restaurant_id,organization_id,branch_id,loyalty_mode,amount_per_point,points_collection_mode)
  values('${ids.restaurant}','${ids.organization}','${ids.branch}','amount_based',1,'both');
  insert into public.platform_test_tenant_registry(restaurant_id,restaurant_name,organization_id,owner_user_id,test_session_id,marked_by)
  values('${ids.restaurant}','STAFF POINTS E2E LOCAL','${ids.organization}','${credentials.owner.userId}','staff-e2e-${ids.restaurant}','${credentials.platform.userId}');
  insert into public.commercial_pro_access_grants(id,restaurant_id,organization_id,access_kind,starts_at,expires_at,reason,created_by,request_id)
  values('${ids.grant}','${ids.restaurant}','${ids.organization}','INTERNAL_TEST_ONLY',now()-interval '1 minute',now()+interval '1 hour',
    'Synthetic local points reward inbox E2E','${credentials.platform.userId}','${ids.request}');
  update public.business_verification_environment set environment='STAGING',change_ref='STAFF_POINTS_E2E_LOCAL' where singleton;
  insert into public.customers(id,restaurant_id,organization_id,branch_id,auth_user_id,name,customer_code,membership_status,is_test_customer,
    normalized_phone,phone,points_balance)
  values('${ids.customer}','${ids.restaurant}','${ids.organization}','${ids.branch}','${credentials.customer.userId}','Synthetic Customer',
    'STAFF-E2E','active',true,'+436600009901','+436600009901',0);
  insert into public.customer_accounts(id,auth_user_id,email,first_name,email_confirmed_at)
  values('${ids.account}','${credentials.customer.userId}','${credentials.customer.email}','Synthetic',now());
  insert into public.customer_account_memberships(account_id,restaurant_id,customer_id)
  values('${ids.account}','${ids.restaurant}','${ids.customer}');
  insert into public.customer_qr_tokens(restaurant_id,customer_id,organization_id,branch_id,token_hash,active)
  values('${ids.restaurant}','${ids.customer}','${ids.organization}','${ids.branch}',public.hash_public_token('${rawCustomerToken}'),true);
  insert into public.rewards(id,restaurant_id,organization_id,branch_id,title,description,required_points,active,is_starter_reward)
  values('${ids.reward}','${ids.restaurant}','${ids.organization}','${ids.branch}','Synthetic Reward','Synthetic reward',62,true,false);
  commit;`);
  setupComplete = true;

  const platformClient = client();
  const ownerClient = client();
  const staffClient = client();
  const customerClient = client();
  for (const [role, target] of [["platform", platformClient], ["owner", ownerClient], ["staff", staffClient], ["customer", customerClient]]) {
    const result = await target.auth.signInWithPassword(credentials[role]);
    assert.ok(result.data.session && !result.error, `${role.toUpperCase()}_ISOLATED_LOGIN_FAILED`);
  }
  assert.notEqual((await platformClient.auth.getUser()).data.user.id, (await staffClient.auth.getUser()).data.user.id);
  assert.notEqual((await staffClient.auth.getUser()).data.user.id, (await customerClient.auth.getUser()).data.user.id);

  const amountCents = 6200;
  const pinResult = await staffClient.rpc("get_today_restaurant_pin", { input_restaurant_id: ids.restaurant });
  assert.equal(pinResult.error, null, "LOCAL_DAILY_PIN_FETCH_FAILED");
  assert.match(String(pinResult.data?.pin_code ?? ""), /^\d{4}$/);

  const collisionStorage = (() => { const values = new Map(); return {
    getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  }; })();
  const collisionClient = client(collisionStorage);
  assert.ok((await collisionClient.auth.signInWithPassword(credentials.staff)).data.session);
  assert.ok((await collisionClient.auth.signInWithPassword(credentials.platform)).data.session);
  assert.equal((await collisionClient.auth.getUser()).data.user.id, credentials.platform.userId);
  const collisionBlocked = await collisionClient.rpc("apply_staff_daily_pin_loyalty_action_v2", {
    input_restaurant_id: ids.restaurant, input_customer_id: ids.customer,
    input_daily_pin: pinResult.data.pin_code, input_amount_cents: amountCents,
    input_idempotency_key: ids.negativeRequest,
  });
  assert.ok(collisionBlocked.error, "SHARED_AUTH_CONTEXT_MUST_FAIL_CLOSED");
  assert.equal(collisionBlocked.error.code, "42501");
  assert.equal(collisionBlocked.error.message, "STAFF_ACTION_ACCESS_DENIED");
  assert.equal(sql(`select count(*) from public.points_collection_requests where restaurant_id='${ids.restaurant}'`), "0");
  assert.equal(sql(`select count(*) from public.points_transactions where restaurant_id='${ids.restaurant}'`), "0");
  console.log("SHARED AUTH STORAGE COLLISION: STAFF REPLACED BY PLATFORM ADMIN / FAIL-CLOSED / 0 WRITES PASS");

  const forbiddenActors = [
    ["OWNER", ownerClient], ["CUSTOMER", customerClient], ["PLATFORM_ADMIN", platformClient], ["ANONYMOUS", client()],
  ];
  for (const [label, actor] of forbiddenActors) {
    const denied = await actor.rpc("apply_staff_daily_pin_loyalty_action_v2", {
      input_restaurant_id: ids.restaurant, input_customer_id: ids.customer,
      input_daily_pin: pinResult.data.pin_code, input_amount_cents: amountCents,
      input_idempotency_key: randomUUID(),
    });
    assert.ok(denied.error, `${label}_MUST_BE_DENIED`);
  }
  const serviceClient = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    realtime: { transport: WebSocket },
  });
  const serviceDenied = await serviceClient.rpc("apply_staff_daily_pin_loyalty_action_v2", {
    input_restaurant_id: ids.restaurant, input_customer_id: ids.customer,
    input_daily_pin: pinResult.data.pin_code, input_amount_cents: amountCents,
    input_idempotency_key: randomUUID(),
  });
  assert.ok(serviceDenied.error, "SERVICE_ROLE_RPC_BYPASS_MUST_BE_DENIED");

  for (const amount of [0, -1, 30001]) {
    const rejected = await staffClient.rpc("apply_staff_daily_pin_loyalty_action_v2", {
      input_restaurant_id: ids.restaurant, input_customer_id: ids.customer,
      input_daily_pin: pinResult.data.pin_code, input_amount_cents: amount,
      input_idempotency_key: randomUUID(),
    });
    assert.equal(rejected.error, null);
    assert.equal(rejected.data?.success, false, `AMOUNT_${amount}_MUST_BE_REJECTED`);
  }
  const wrongTenant = await staffClient.rpc("apply_staff_daily_pin_loyalty_action_v2", {
    input_restaurant_id: ids.restaurant, input_customer_id: randomUUID(),
    input_daily_pin: pinResult.data.pin_code, input_amount_cents: amountCents,
    input_idempotency_key: randomUUID(),
  });
  assert.ok(wrongTenant.error, "FOREIGN_CUSTOMER_MUST_BE_DENIED");

  sql(`update public.staff_members set active=false where id='${ids.staffMember}'`);
  const revokedStaff = await staffClient.rpc("apply_staff_daily_pin_loyalty_action_v2", {
    input_restaurant_id: ids.restaurant, input_customer_id: ids.customer,
    input_daily_pin: pinResult.data.pin_code, input_amount_cents: amountCents,
    input_idempotency_key: randomUUID(),
  });
  assert.ok(revokedStaff.error, "REVOKED_STAFF_MUST_BE_DENIED");
  sql(`update public.staff_members set active=true where id='${ids.staffMember}'`);

  const directDml = await staffClient.from("points_transactions").insert({
    restaurant_id: ids.restaurant, organization_id: ids.organization, branch_id: ids.branch,
    customer_id: ids.customer, type: "earn", points: 62, amount_cents: amountCents,
    collection_source: "customer_initiated", idempotency_key: randomUUID(),
  });
  assert.ok(directDml.error, "AUTHENTICATED_DIRECT_LEDGER_DML_MUST_BE_DENIED");
  assert.equal(sql(`select count(*) from public.points_collection_requests where restaurant_id='${ids.restaurant}'`), "0");
  assert.equal(sql(`select count(*) from public.points_transactions where restaurant_id='${ids.restaurant}'`), "0");

  sql(`update public.restaurants set status='suspended' where id='${ids.restaurant}'`);
  const inactiveRestaurant = await staffClient.rpc("apply_staff_daily_pin_loyalty_action_v2", {
    input_restaurant_id: ids.restaurant, input_customer_id: ids.customer,
    input_daily_pin: pinResult.data.pin_code, input_amount_cents: amountCents,
    input_idempotency_key: randomUUID(),
  });
  assert.ok(inactiveRestaurant.error, "INACTIVE_RESTAURANT_MUST_BE_DENIED");
  sql(`update public.restaurants set status='active' where id='${ids.restaurant}'`);

  const wrongPinKey = randomUUID();
  const wrongPin = await staffClient.rpc("apply_staff_daily_pin_loyalty_action_v2", {
    input_restaurant_id: ids.restaurant, input_customer_id: ids.customer,
    input_daily_pin: "0000" === pinResult.data.pin_code ? "9999" : "0000",
    input_amount_cents: amountCents, input_idempotency_key: wrongPinKey,
  });
  assert.equal(wrongPin.error, null);
  assert.equal(wrongPin.data?.success, false, "WRONG_PIN_MUST_BE_REJECTED");
  assert.equal(sql(`select count(*) from public.points_transactions where restaurant_id='${ids.restaurant}'`), "0");
  console.log("LOCAL SECURITY MATRIX: OWNER/CUSTOMER/ANON/PLATFORM/SERVICE/REVOKED STAFF/FOREIGN CUSTOMER/DML/AMOUNTS PASS");

  const bookings = await Promise.all(Array.from({ length: 24 }, () => staffClient.rpc(
    "apply_staff_daily_pin_loyalty_action_v2", {
      input_restaurant_id: ids.restaurant, input_customer_id: ids.customer,
      input_daily_pin: pinResult.data.pin_code, input_amount_cents: amountCents,
      input_idempotency_key: ids.request,
    },
  )));
  for (const booking of bookings) {
    assert.equal(booking.error, null, `LOCAL_POINTS_RPC_FAILED:${booking.error?.code ?? "UNKNOWN"}`);
    assert.equal(booking.data?.success, true, `LOCAL_POINTS_BOOKING_REJECTED:${booking.data?.error_code ?? "UNKNOWN"}`);
  }
  assert.equal(new Set(bookings.map(({ data }) => data.transaction_id)).size, 1);
  const repeated = await staffClient.rpc("apply_staff_daily_pin_loyalty_action_v2", {
    input_restaurant_id: ids.restaurant, input_customer_id: ids.customer,
    input_daily_pin: pinResult.data.pin_code, input_amount_cents: amountCents,
    input_idempotency_key: ids.request,
  });
  assert.equal(repeated.error, null);
  assert.equal(repeated.data?.transaction_id, bookings[0].data.transaction_id);
  const mismatch = await staffClient.rpc("apply_staff_daily_pin_loyalty_action_v2", {
    input_restaurant_id: ids.restaurant, input_customer_id: ids.customer,
    input_daily_pin: pinResult.data.pin_code, input_amount_cents: 6300,
    input_idempotency_key: ids.request,
  });
  assert.equal(mismatch.error, null);
  assert.equal(mismatch.data?.error_code, "IDEMPOTENCY_KEY_PAYLOAD_MISMATCH");
  assert.equal(sql(`select count(*) from public.points_collection_requests where restaurant_id='${ids.restaurant}' and idempotency_key='${ids.request}'`), "1");
  assert.equal(sql(`select count(*) from public.points_transactions where restaurant_id='${ids.restaurant}' and type='earn'`), "1");
  assert.equal(sql(`select collection_source from public.points_transactions where restaurant_id='${ids.restaurant}' and type='earn'`), "customer_initiated");
  assert.equal(sql(`select amount_cents from public.points_transactions where restaurant_id='${ids.restaurant}' and type='earn'`), "6200");
  assert.equal(sql(`select points_balance from public.customers where id='${ids.customer}'`), "62");
  assert.equal(sql(`select count(*) from public.customer_pro_in_app_notifications where restaurant_id='${ids.restaurant}'
    and customer_id='${ids.customer}' and event_type='POINT_REWARD_AVAILABLE'`), "1");
  assert.equal(sql(`select count(*) from public.customer_offer_email_deliveries where restaurant_id='${ids.restaurant}'`), "0");
  assert.equal(sql(`select count(*) from public.customer_transactional_email_deliveries where restaurant_id='${ids.restaurant}'`), "0");

  const inbox = await customerClient.rpc("get_customer_pro_in_app_inbox", {
    input_restaurant_slug: slug, input_customer_token: rawCustomerToken,
  });
  assert.equal(inbox.error, null, "LOCAL_CUSTOMER_INBOX_READ_FAILED");
  assert.equal(inbox.data?.unread_count, 1);
  assert.equal(inbox.data?.items?.length, 1);

  sql(`update public.commercial_pro_access_grants set revoked_at=now(),revoked_by='${credentials.platform.userId}',
    revoke_reason='Synthetic local E2E cleanup' where id='${ids.grant}'`);
  assert.equal(sql(`select count(*) from public.commercial_pro_access_grants where id='${ids.grant}' and revoked_at is null`), "0");
  const hiddenInbox = await customerClient.rpc("get_customer_pro_in_app_inbox", {
    input_restaurant_slug: slug, input_customer_token: rawCustomerToken,
  });
  assert.equal(hiddenInbox.error, null);
  assert.equal(hiddenInbox.data?.available, false);
  assert.equal(hiddenInbox.data?.items?.length, 0);
  console.log("LOCAL STAFF POINTS E2E: 62,00 EUR / 6200 CENTS / 24 PARALLEL / 1 REQUEST / 1 BOOKING PASS");
  console.log("LOCAL REWARD INBOX: FIRST THRESHOLD / 1 ENTRY / NO EMAIL / NO PUSH / NO SCHEDULER PASS");
  console.log("SHARED AUTH STORAGE COLLISION: STAFF REPLACED BY PLATFORM ADMIN / FAIL-CLOSED / 0 WRITES PASS");
} finally {
  if (setupComplete) sql(`begin; set local session_replication_role=replica;
    delete from public.customer_pro_in_app_notifications where restaurant_id='${ids.restaurant}';
    delete from public.customer_reward_notification_state where restaurant_id='${ids.restaurant}';
    delete from public.points_collection_requests where restaurant_id='${ids.restaurant}';
    delete from public.points_transactions where restaurant_id='${ids.restaurant}';
    delete from public.audit_log where restaurant_id='${ids.restaurant}';
    delete from public.restaurant_daily_pins where restaurant_id='${ids.restaurant}';
    delete from public.daily_pin_attempts where restaurant_id='${ids.restaurant}';
    delete from public.customer_qr_tokens where restaurant_id='${ids.restaurant}';
    delete from public.customer_account_memberships where restaurant_id='${ids.restaurant}';
    delete from public.customer_accounts where id='${ids.account}';
    delete from public.customers where restaurant_id='${ids.restaurant}';
    delete from public.rewards where restaurant_id='${ids.restaurant}';
    delete from public.commercial_pro_access_grants where restaurant_id='${ids.restaurant}';
    delete from public.platform_test_tenant_registry where restaurant_id='${ids.restaurant}';
    delete from public.loyalty_settings where restaurant_id='${ids.restaurant}';
    delete from public.branch_subscriptions where branch_id='${ids.branch}';
    delete from public.staff_members where restaurant_id='${ids.restaurant}';
    delete from public.restaurant_members where restaurant_id='${ids.restaurant}';
    delete from public.branches where restaurant_id='${ids.restaurant}';
    delete from public.restaurants where id='${ids.restaurant}';
    delete from public.organizations where id='${ids.organization}';
    delete from public.platform_admins where user_id='${credentials.platform.userId}';
    update public.business_verification_environment set environment='${previousEnvironment}',change_ref='STAFF_POINTS_E2E_LOCAL_CLEANUP' where singleton;
    commit;`);
  for (const credential of Object.values(credentials)) await removeUser(credential);
  assert.equal(sql(`select count(*) from public.restaurants where id='${ids.restaurant}'`), "0");
  assert.equal(sql(`select count(*) from auth.users where id in ('${credentials.platform.userId}','${credentials.staff.userId}','${credentials.customer.userId}')`), "0");
}
