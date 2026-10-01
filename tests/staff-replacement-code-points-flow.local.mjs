import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

const cwd = new URL("../", import.meta.url).pathname;
const status = JSON.parse(execFileSync("./node_modules/.bin/supabase", ["status", "--output", "json"], {
  cwd,
  encoding: "utf8",
  env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1", DO_NOT_TRACK: "1" },
  stdio: ["ignore", "pipe", "pipe"],
}));
assert.equal(status.API_URL, "http://127.0.0.1:56121");

const dbContainer = "supabase_db_wuxuai-phase7b4d-local";
const sql = (query) => execFileSync("docker", ["exec", "-i", dbContainer, "psql", "-X", "-qAt",
  "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], {
  input: query,
  encoding: "utf8",
  stdio: ["pipe", "pipe", "pipe"],
}).trim();
const browserClient = () => createClient(status.API_URL, status.ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  realtime: { transport: WebSocket },
});
const adminHeaders = {
  apikey: status.SERVICE_ROLE_KEY,
  authorization: `Bearer ${status.SERVICE_ROLE_KEY}`,
  "content-type": "application/json",
};

const ids = Object.fromEntries([
  "organization", "restaurant", "branch", "foreignOrganization", "foreignRestaurant", "foreignBranch",
  "staffMember", "foreignStaffMember", "customer", "account",
].map((key) => [key, randomUUID()]));
const slug = `replacement-code-${ids.restaurant.slice(0, 8)}`;
const foreignSlug = `replacement-code-foreign-${ids.foreignRestaurant.slice(0, 8)}`;
const customerAccessValue = randomBytes(32).toString("hex");
const credentials = Object.fromEntries(["staff", "customer"].map((role) => [role, {
  email: `replacement-code-${role}-${randomUUID()}@example.invalid`,
  password: randomUUID() + randomUUID(),
  userId: null,
}]));

async function createUser(credential) {
  const response = await fetch(`${status.API_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ email: credential.email, password: credential.password, email_confirm: true }),
  });
  assert.equal(response.status, 200, "LOCAL_SYNTHETIC_AUTH_CREATE_FAILED");
  const body = await response.json();
  credential.userId = body.id ?? body.user?.id;
  assert.match(String(credential.userId), /^[0-9a-f-]{36}$/);
}

async function removeUser(credential) {
  if (!credential.userId) return;
  await fetch(`${status.API_URL}/auth/v1/admin/users/${credential.userId}`, {
    method: "DELETE",
    headers: adminHeaders,
  });
}

for (const credential of Object.values(credentials)) await createUser(credential);

let setupComplete = false;
try {
  sql(`begin;
    set local session_replication_role=replica;
    insert into public.organizations(id,owner_id,name,status)
    values('${ids.organization}','${credentials.staff.userId}','REPLACEMENT CODE LOCAL','active'),
      ('${ids.foreignOrganization}','${credentials.staff.userId}','REPLACEMENT CODE FOREIGN LOCAL','active');
    insert into public.restaurants(id,owner_id,name,slug,status,organization_id,operational_ready,security_ready,legal_ready,onboarding_status)
    values('${ids.restaurant}','${credentials.staff.userId}','REPLACEMENT CODE LOCAL','${slug}','active','${ids.organization}',true,true,true,'completed'),
      ('${ids.foreignRestaurant}','${credentials.staff.userId}','REPLACEMENT CODE FOREIGN LOCAL','${foreignSlug}','active','${ids.foreignOrganization}',true,true,true,'completed');
    insert into public.branches(id,organization_id,restaurant_id,name,slug,country,address,postal_code,city,status)
    values('${ids.branch}','${ids.organization}','${ids.restaurant}','Main','${slug}-main','AT','Synthetic 1','1000','Vienna','active'),
      ('${ids.foreignBranch}','${ids.foreignOrganization}','${ids.foreignRestaurant}','Foreign','${foreignSlug}-main','AT','Synthetic 2','1000','Vienna','active');
    update public.restaurants set primary_branch_id='${ids.branch}' where id='${ids.restaurant}';
    update public.restaurants set primary_branch_id='${ids.foreignBranch}' where id='${ids.foreignRestaurant}';
    insert into public.restaurant_members(restaurant_id,organization_id,branch_id,user_id,role)
    values('${ids.restaurant}','${ids.organization}','${ids.branch}','${credentials.staff.userId}','staff'),
      ('${ids.foreignRestaurant}','${ids.foreignOrganization}','${ids.foreignBranch}','${credentials.staff.userId}','staff');
    insert into public.staff_members(id,restaurant_id,organization_id,branch_id,name,pin_hash,role,active,auth_user_id,email,account_status,accepted_at)
    values('${ids.staffMember}','${ids.restaurant}','${ids.organization}','${ids.branch}','Synthetic Staff','not-used','staff',true,
      '${credentials.staff.userId}','${credentials.staff.email}','active',now()),
      ('${ids.foreignStaffMember}','${ids.foreignRestaurant}','${ids.foreignOrganization}','${ids.foreignBranch}','Synthetic Foreign Staff','not-used','staff',true,
      '${credentials.staff.userId}','${credentials.staff.email}','active',now());
    insert into public.branch_subscriptions(organization_id,branch_id,status,subscription_status,selected_plan,plan_key,payment_status,
      trial_started_at,trial_ends_at,current_period_start,current_period_ends_at,current_period_end)
    values('${ids.organization}','${ids.branch}','trialing','trialing','BASIC','BASIC','not_required',now()-interval '1 day',
      now()+interval '20 days',now()-interval '1 day',now()+interval '20 days',now()+interval '20 days'),
      ('${ids.foreignOrganization}','${ids.foreignBranch}','trialing','trialing','BASIC','BASIC','not_required',now()-interval '1 day',
      now()+interval '20 days',now()-interval '1 day',now()+interval '20 days',now()+interval '20 days');
    insert into public.loyalty_settings(restaurant_id,organization_id,branch_id,loyalty_mode,amount_per_point,points_collection_mode)
    values('${ids.restaurant}','${ids.organization}','${ids.branch}','amount_based',1,'both'),
      ('${ids.foreignRestaurant}','${ids.foreignOrganization}','${ids.foreignBranch}','amount_based',1,'both');
    insert into public.customers(id,restaurant_id,organization_id,branch_id,auth_user_id,name,customer_code,membership_status,is_test_customer,
      normalized_phone,phone,points_balance)
    values('${ids.customer}','${ids.restaurant}','${ids.organization}','${ids.branch}','${credentials.customer.userId}',
      'Synthetic Replacement Customer','REPLACEMENT-LOCAL','active',true,'+436600009911','+436600009911',0);
    insert into public.customer_accounts(id,auth_user_id,email,first_name,email_confirmed_at)
    values('${ids.account}','${credentials.customer.userId}','${credentials.customer.email}','Synthetic',now());
    insert into public.customer_account_memberships(account_id,restaurant_id,customer_id)
    values('${ids.account}','${ids.restaurant}','${ids.customer}');
    insert into public.customer_qr_tokens(restaurant_id,customer_id,organization_id,branch_id,token_hash,active)
    values('${ids.restaurant}','${ids.customer}','${ids.organization}','${ids.branch}',public.hash_public_token('${customerAccessValue}'),true);
    commit;`);
  setupComplete = true;

  const staff = browserClient();
  const customer = browserClient();
  const anonymous = browserClient();
  assert.ok((await staff.auth.signInWithPassword(credentials.staff)).data.session, "STAFF_LOGIN_FAILED");
  assert.ok((await customer.auth.signInWithPassword(credentials.customer)).data.session, "CUSTOMER_LOGIN_FAILED");

  const created = await customer.rpc("create_customer_points_credit_qr", {
    input_restaurant_slug: slug,
    input_customer_token: customerAccessValue,
  });
  assert.equal(created.error, null, "REFERENCE_CREATE_FAILED");
  assert.match(String(created.data?.qr_token ?? ""), /^[0-9a-f]{64}$/);
  assert.match(String(created.data?.manual_code ?? ""), /^\d{8}$/);
  const referenceId = sql(`select id from public.customer_points_qr_references
    where restaurant_id='${ids.restaurant}' and customer_id='${ids.customer}' and consumed_at is null and revoked_at is null`);
  assert.match(referenceId, /^[0-9a-f-]{36}$/);
  assert.equal(sql(`select count(*) from public.customer_points_qr_references
    where id='${referenceId}' and branch_id='${ids.branch}'
      and token_hash=public.hash_public_token('${created.data.qr_token}')
      and manual_code_hash=public.hash_public_token('${created.data.manual_code}')
      and expires_at>now() and expires_at<=now()+interval '5 minutes'`), "1");

  const amountCents = 6200;
  const qrPreview = await staff.rpc("preview_restaurant_controlled_points", {
    input_restaurant_id: ids.restaurant,
    input_qr_reference: created.data.qr_token,
    input_amount_cents: amountCents,
  });
  const codePreview = await staff.rpc("preview_restaurant_controlled_points", {
    input_restaurant_id: ids.restaurant,
    input_qr_reference: created.data.manual_code,
    input_amount_cents: amountCents,
  });
  assert.equal(qrPreview.error, null, "QR_PREVIEW_FAILED");
  assert.equal(codePreview.error, null, "CODE_PREVIEW_FAILED");
  for (const key of ["customer_label", "points_balance", "amount_cents", "expected_points", "base_points", "boost_multiplier", "final_points", "bonus_rule_version", "expires_at"]) {
    assert.deepEqual(codePreview.data?.[key], qrPreview.data?.[key], `PREVIEW_MISMATCH_${key}`);
  }

  const foreign = await staff.rpc("preview_restaurant_controlled_points", {
    input_restaurant_id: ids.foreignRestaurant,
    input_qr_reference: created.data.manual_code,
    input_amount_cents: amountCents,
  });
  assert.equal(foreign.error, null);
  assert.equal(foreign.data?.error_code, "QR_NOT_FOUND", "FOREIGN_TENANT_CODE_MUST_BE_HIDDEN");

  for (const [label, actor] of [["CUSTOMER", customer], ["ANONYMOUS", anonymous]]) {
    const denied = await actor.rpc("preview_restaurant_controlled_points", {
      input_restaurant_id: ids.restaurant,
      input_qr_reference: created.data.manual_code,
      input_amount_cents: amountCents,
    });
    assert.ok(denied.error, `${label}_PREVIEW_MUST_BE_DENIED`);
  }

  const directDml = await staff.from("customer_points_qr_references").update({ revoked_at: new Date().toISOString() })
    .eq("id", referenceId);
  assert.ok(directDml.error, "DIRECT_REFERENCE_DML_MUST_BE_DENIED");

  const pin = await staff.rpc("get_today_restaurant_pin", { input_restaurant_id: ids.restaurant });
  assert.equal(pin.error, null, "DAILY_PIN_FETCH_FAILED");
  assert.match(String(pin.data?.pin_code ?? ""), /^\d{4}$/);
  const [qrConfirm, codeConfirm] = await Promise.all([
    staff.rpc("confirm_restaurant_controlled_points", {
      input_restaurant_id: ids.restaurant,
      input_qr_reference: created.data.qr_token,
      input_amount_cents: amountCents,
      input_daily_pin: pin.data.pin_code,
      input_idempotency_key: randomUUID(),
    }),
    staff.rpc("confirm_restaurant_controlled_points", {
      input_restaurant_id: ids.restaurant,
      input_qr_reference: created.data.manual_code,
      input_amount_cents: amountCents,
      input_daily_pin: pin.data.pin_code,
      input_idempotency_key: randomUUID(),
    }),
  ]);
  assert.equal([qrConfirm, codeConfirm].filter((result) => !result.error && result.data?.transaction_id).length, 1,
    "QR_AND_CODE_MUST_COMPLETE_AT_MOST_ONCE");
  assert.equal(sql(`select count(*) from public.points_transactions where restaurant_id='${ids.restaurant}' and type='earn'`), "1");
  assert.equal(sql(`select count(*) from public.customer_points_qr_references where id='${referenceId}'
    and consumed_at is not null and consumed_transaction_id is not null`), "1");

  const used = await staff.rpc("preview_restaurant_controlled_points", {
    input_restaurant_id: ids.restaurant,
    input_qr_reference: created.data.manual_code,
    input_amount_cents: amountCents,
  });
  assert.ok(used.error, "USED_CODE_MUST_BE_DENIED");

  const expiredReference = await customer.rpc("create_customer_points_credit_qr", {
    input_restaurant_slug: slug,
    input_customer_token: customerAccessValue,
  });
  assert.equal(expiredReference.error, null);
  sql(`update public.customer_points_qr_references set expires_at=now()-interval '1 second'
    where restaurant_id='${ids.restaurant}' and manual_code_hash=public.hash_public_token('${expiredReference.data.manual_code}')`);
  const expired = await staff.rpc("preview_restaurant_controlled_points", {
    input_restaurant_id: ids.restaurant,
    input_qr_reference: expiredReference.data.manual_code,
    input_amount_cents: amountCents,
  });
  assert.ok(expired.error, "EXPIRED_CODE_MUST_BE_DENIED");

  const inactiveReference = await customer.rpc("create_customer_points_credit_qr", {
    input_restaurant_slug: slug,
    input_customer_token: customerAccessValue,
  });
  assert.equal(inactiveReference.error, null);
  sql(`update public.customers set membership_status='restricted' where id='${ids.customer}'`);
  const inactive = await staff.rpc("preview_restaurant_controlled_points", {
    input_restaurant_id: ids.restaurant,
    input_qr_reference: inactiveReference.data.manual_code,
    input_amount_cents: amountCents,
  });
  assert.ok(inactive.error, "INACTIVE_MEMBERSHIP_MUST_BE_DENIED");
  sql(`update public.customers set membership_status='active' where id='${ids.customer}'`);

  const ledgerBeforeInvalid = sql(`select count(*) from public.points_transactions where restaurant_id='${ids.restaurant}'`);
  let rateLimited = false;
  for (let attempt = 0; attempt < 31; attempt += 1) {
    const invalid = await staff.rpc("preview_restaurant_controlled_points", {
      input_restaurant_id: ids.restaurant,
      input_qr_reference: String(90_000_000 + attempt),
      input_amount_cents: amountCents,
    });
    assert.equal(invalid.error, null);
    if (invalid.data?.error_code === "RATE_LIMITED") rateLimited = true;
  }
  assert.equal(rateLimited, true, "INVALID_CODE_RATE_LIMIT_MUST_REMAIN_ACTIVE");
  assert.equal(sql(`select count(*) from public.points_transactions where restaurant_id='${ids.restaurant}'`), ledgerBeforeInvalid,
    "FAILED_CODES_MUST_NOT_CREATE_LEDGER_ROWS");

  console.log("LOCAL REPLACEMENT CODE: SAME REFERENCE / SAME PREVIEW / TENANT+BRANCH BOUND PASS");
  console.log("LOCAL CONCURRENCY: QR+CODE / ONE REFERENCE / EXACTLY ONE LEDGER COMMIT PASS");
  console.log("LOCAL SECURITY: INVALID+EXPIRED+USED+FOREIGN+INACTIVE+UNAUTHORIZED+DML+RATE LIMIT PASS");
} finally {
  if (setupComplete) {
    sql(`begin;
      set local session_replication_role=replica;
      delete from public.restaurant_points_credit_attempts where restaurant_id in ('${ids.restaurant}','${ids.foreignRestaurant}');
      delete from public.points_transactions where restaurant_id in ('${ids.restaurant}','${ids.foreignRestaurant}');
      delete from public.audit_log where restaurant_id in ('${ids.restaurant}','${ids.foreignRestaurant}');
      delete from public.restaurant_daily_pins where restaurant_id in ('${ids.restaurant}','${ids.foreignRestaurant}');
      delete from public.daily_pin_attempts where restaurant_id in ('${ids.restaurant}','${ids.foreignRestaurant}');
      delete from public.customer_points_qr_references where restaurant_id in ('${ids.restaurant}','${ids.foreignRestaurant}');
      delete from public.customer_qr_tokens where restaurant_id in ('${ids.restaurant}','${ids.foreignRestaurant}');
      delete from public.customer_account_memberships where restaurant_id in ('${ids.restaurant}','${ids.foreignRestaurant}');
      delete from public.customer_accounts where id='${ids.account}';
      delete from public.customers where restaurant_id in ('${ids.restaurant}','${ids.foreignRestaurant}');
      delete from public.loyalty_settings where restaurant_id in ('${ids.restaurant}','${ids.foreignRestaurant}');
      delete from public.branch_subscriptions where branch_id in ('${ids.branch}','${ids.foreignBranch}');
      delete from public.staff_members where restaurant_id in ('${ids.restaurant}','${ids.foreignRestaurant}');
      delete from public.restaurant_members where restaurant_id in ('${ids.restaurant}','${ids.foreignRestaurant}');
      delete from public.branches where restaurant_id in ('${ids.restaurant}','${ids.foreignRestaurant}');
      delete from public.restaurants where id in ('${ids.restaurant}','${ids.foreignRestaurant}');
      delete from public.organizations where id in ('${ids.organization}','${ids.foreignOrganization}');
      commit;`);
  }
  for (const credential of Object.values(credentials)) await removeUser(credential);
  if (setupComplete) {
    assert.equal(sql(`select count(*) from public.restaurants where id in ('${ids.restaurant}','${ids.foreignRestaurant}')`), "0");
  }
}
