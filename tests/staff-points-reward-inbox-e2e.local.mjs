// Opt-in, disposable local integration proof. Never point this harness at hosted data.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

assert.equal(process.env.ALLOW_LOCAL_PRO_GOLDEN_TESTS, "1", "LOCAL_OPT_IN_REQUIRED");
const runtime = realpathSync(process.env.PRO_GOLDEN_RUNTIME ?? ".");
assert.match(runtime, /^\/private\/tmp\/wuxuai-pro-golden-[a-z0-9]+$/);
assert.equal(readFileSync(`${runtime}/PRO_GOLDEN_TASK_OWNED`, "utf8").trim(),
  "fd1ee07f26dd49b9d753fb2df696a06cefa745d4");
assert.equal(existsSync(`${runtime}/supabase/.temp/project-ref`), false, "LINKED_PROJECT_FORBIDDEN");
const config = readFileSync(`${runtime}/supabase/config.toml`, "utf8");
assert.match(config, /project_id = "wuxuai-pro-golden-local"/);
assert.match(config, /\[edge_runtime\]\s*enabled = false/);
assert.match(config, /\[local_smtp\]\s*enabled = false/);
const daemon = process.env.DOCKER_HOST && !process.env.DOCKER_CONTEXT
  ? process.env.DOCKER_HOST
  : execFileSync("docker", ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
assert.ok(daemon.startsWith("unix://"), "LOCAL_DOCKER_DAEMON_REQUIRED");
const container = "supabase_db_wuxuai-pro-golden-local";
const inspect = JSON.parse(execFileSync("docker", ["inspect", container],
  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }))[0];
assert.equal(inspect.State.Running, true);
assert.equal(inspect.NetworkSettings.Ports["5432/tcp"][0].HostPort, "56122");
const sql = (query) => {
  try {
    return execFileSync("docker", ["exec", "-i", container, "psql", "-X", "-qAt",
      "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
    { input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 30000 }).trim();
  } catch { throw new Error("LOCAL_SQL_FAILED (details suppressed to protect ephemeral credentials)"); }
};
assert.equal(sql("show cron.launch_active_jobs"), "off", "SCHEDULER_MUST_BE_DISABLED");
assert.equal(sql("select count(*) from supabase_migrations.schema_migrations"), "193");
assert.equal(sql("select count(*) from auth.users"), "0", "FRESH_DISPOSABLE_STACK_REQUIRED");
assert.equal(sql("select count(*) from public.restaurants"), "0");
const status = JSON.parse(execFileSync(`${runtime}/node_modules/.bin/supabase`,
  ["status", "--output", "json"], { cwd: runtime, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1", DO_NOT_TRACK: "1" } }));
assert.equal(status.API_URL, "http://127.0.0.1:56121");
assert.ok(!status.FUNCTIONS_URL || new URL(status.FUNCTIONS_URL).hostname === "127.0.0.1");
const client = () => createClient(status.API_URL, status.ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  realtime: { transport: WebSocket },
});
const adminHeaders = { apikey: status.SERVICE_ROLE_KEY,
  authorization: `Bearer ${status.SERVICE_ROLE_KEY}`, "content-type": "application/json" };
let syntheticUserCount = 0;
const clients = [];
const credential = async () => {
  const value = { email: `pro-golden-${randomUUID()}@example.invalid`,
    password: randomUUID() + randomUUID(), userId: null };
  const response = await fetch(`${status.API_URL}/auth/v1/admin/users`, {
    method: "POST", headers: adminHeaders,
    body: JSON.stringify({ email: value.email, password: value.password, email_confirm: true }),
  });
  assert.equal(response.status, 200, "SYNTHETIC_AUTH_CREATE_FAILED");
  const body = await response.json();
  value.userId = body.id ?? body.user?.id;
  assert.match(String(value.userId), /^[0-9a-f-]{36}$/);
  syntheticUserCount += 1;
  return value;
};
const login = async (value) => {
  const target = client();
  clients.push(target);
  const result = await target.auth.signInWithPassword({ email: value.email, password: value.password });
  assert.ok(!result.error && result.data.session, "ISOLATED_LOGIN_FAILED");
  return target;
};
const ok = (result, label) => {
  assert.ok(!result.error && result.data?.success !== false, label);
  return result.data;
};
const denied = (result, label) => assert.ok(result.error || result.data?.success === false, label);
const jsonSql = (query) => JSON.parse(sql(query));
const count = (table, where) => Number(sql(`select count(*) from public.${table} where ${where}`));
const replicaFixture = (query) => sql(`begin; set local session_replication_role=replica; ${query} commit;`);
let completed = false;
try {
  const owner = await credential();
  const platform = await credential();
  const staffIdentity = await credential();
  replicaFixture(`insert into public.platform_admins(user_id,role,active)
    values('${platform.userId}','platform_admin',true);
    update public.business_verification_environment set environment='STAGING',
      change_ref='PRO_GOLDEN_DISPOSABLE_LOCAL' where singleton;`);
  const staff = await login(staffIdentity);
  const platformClient = await login(platform);
  const ownerClient = await login(owner);
  const makeTenant = (label, staffAllowed) => {
    const t = Object.fromEntries(["organization", "restaurant", "branch", "staffMember", "reward", "grant"]
      .map((key) => [key, randomUUID()]));
    t.slug = `pro-golden-${t.restaurant.slice(0, 8)}`;
    t.name = `PRO GOLDEN LOCAL ${label}`;
    replicaFixture(`
      insert into public.organizations(id,owner_id,name,status)
      values('${t.organization}','${owner.userId}','${t.name}','active');
      insert into public.restaurants(id,owner_id,name,slug,status,organization_id,
        operational_ready,security_ready,legal_ready,onboarding_status)
      values('${t.restaurant}','${owner.userId}','${t.name}','${t.slug}','active',
        '${t.organization}',true,true,true,'completed');
      insert into public.branches(id,organization_id,restaurant_id,name,slug,country,address,postal_code,city,status)
      values('${t.branch}','${t.organization}','${t.restaurant}','Synthetic Main','${t.slug}-main',
        'AT','Synthetic 1','1000','Vienna','active');
      update public.restaurants set primary_branch_id='${t.branch}' where id='${t.restaurant}';
      insert into public.restaurant_members(restaurant_id,organization_id,branch_id,user_id,role)
      values('${t.restaurant}','${t.organization}','${t.branch}','${owner.userId}','owner');
      ${staffAllowed ? `insert into public.restaurant_members(restaurant_id,organization_id,branch_id,user_id,role)
      values('${t.restaurant}','${t.organization}','${t.branch}','${staffIdentity.userId}','staff');
      insert into public.staff_members(id,restaurant_id,organization_id,branch_id,name,pin_hash,role,active,
        auth_user_id,email,account_status,accepted_at)
      values('${t.staffMember}','${t.restaurant}','${t.organization}','${t.branch}','Synthetic Staff','not-used',
        'staff',true,'${staffIdentity.userId}','${staffIdentity.email}','active',now());` : ""}
      insert into public.branch_subscriptions(organization_id,branch_id,status,subscription_status,selected_plan,
        plan_key,payment_status,trial_started_at,trial_ends_at,current_period_start,current_period_ends_at,current_period_end)
      values('${t.organization}','${t.branch}','trialing','trialing','BASIC','BASIC','not_required',
        now()-interval '1 day',now()+interval '20 days',now()-interval '1 day',now()+interval '20 days',now()+interval '20 days');
      insert into public.loyalty_settings(restaurant_id,organization_id,branch_id,loyalty_mode,amount_per_point,points_collection_mode)
      values('${t.restaurant}','${t.organization}','${t.branch}','amount_based',1,'restaurant_controlled_only');
      insert into public.platform_test_tenant_registry(restaurant_id,restaurant_name,organization_id,owner_user_id,test_session_id,marked_by)
      values('${t.restaurant}','${t.name}','${t.organization}','${owner.userId}','pro-golden-${t.restaurant}','${platform.userId}');
      insert into public.rewards(id,restaurant_id,organization_id,branch_id,title,description,required_points,active,is_starter_reward)
      values('${t.reward}','${t.restaurant}','${t.organization}','${t.branch}','Synthetic Reward','Synthetic reward',62,true,false);`);
    return t;
  };
  const makeCustomer = async (t) => {
    const identity = await credential();
    const c = { id: randomUUID(), account: randomUUID(), token: randomBytes(32).toString("hex"),
      identity, api: await login(identity), phone: `+43660${String(syntheticUserCount).padStart(7, "0")}` };
    replicaFixture(`insert into public.customers(id,restaurant_id,organization_id,branch_id,auth_user_id,
      name,customer_code,membership_status,is_test_customer,normalized_phone,phone,points_balance)
      values('${c.id}','${t.restaurant}','${t.organization}','${t.branch}','${identity.userId}',
        'Synthetic Customer','GOLDEN-${c.id.slice(0,8)}','active',true,'${c.phone}','${c.phone}',0);
      insert into public.customer_accounts(id,auth_user_id,email,first_name,email_confirmed_at)
      values('${c.account}','${identity.userId}','${identity.email}','Synthetic',now());
      insert into public.customer_account_memberships(account_id,restaurant_id,customer_id)
      values('${c.account}','${t.restaurant}','${c.id}');
      insert into public.customer_qr_tokens(restaurant_id,customer_id,organization_id,branch_id,token_hash,active)
      values('${t.restaurant}','${c.id}','${t.organization}','${t.branch}',public.hash_public_token('${c.token}'),true);`);
    assert.equal(sql(`select count(*) from public.customer_account_memberships m
      join public.customers c on c.id=m.customer_id and c.restaurant_id=m.restaurant_id
      join public.platform_test_tenant_registry r on r.restaurant_id=c.restaurant_id and r.organization_id=c.organization_id
      join public.branches b on b.id=c.branch_id and b.restaurant_id=c.restaurant_id and b.organization_id=c.organization_id
      where m.account_id='${c.account}' and c.id='${c.id}' and b.id='${t.branch}'
      and r.owner_user_id='${owner.userId}' and r.restaurant_name='${t.name}' and r.deleted_at is null`), "1");
    return c;
  };
  const effects = (t, c) => jsonSql(`select jsonb_build_object(
    'balance',(select points_balance from public.customers where id='${c.id}'),
    'earns',(select count(*) from public.points_transactions where restaurant_id='${t.restaurant}' and customer_id='${c.id}' and type='earn' and points>0),
    'states',(select count(*) from public.customer_reward_notification_state where restaurant_id='${t.restaurant}' and customer_id='${c.id}' and reward_id='${t.reward}'),
    'above',(select count(*) from public.customer_reward_notification_state where restaurant_id='${t.restaurant}' and customer_id='${c.id}' and above_threshold),
    'assigned',(select count(*) from public.customer_rewards where restaurant_id='${t.restaurant}' and customer_id='${c.id}'),
    'redeemed',(select count(*) from public.redemption_activity_journal where restaurant_id='${t.restaurant}' and customer_id='${c.id}'),
    'inbox',(select count(*) from public.customer_pro_in_app_notifications where restaurant_id='${t.restaurant}' and customer_id='${c.id}' and event_type='POINT_REWARD_AVAILABLE'))`);
  const zero = { balance: 0, earns: 0, states: 0, above: 0, assigned: 0, redeemed: 0, inbox: 0 };
  const reference = async (t, c) => {
    const data = ok(await c.api.rpc("create_customer_points_credit_qr", {
      input_restaurant_slug: t.slug, input_customer_token: c.token }), "FRESH_REFERENCE_REQUIRED");
    assert.match(String(data.qr_token), /^[0-9a-f]{64}$/);
    assert.match(String(data.manual_code), /^\d{8}$/);
    assert.equal(count("customer_points_qr_references", `restaurant_id='${t.restaurant}' and customer_id='${c.id}'
      and organization_id='${t.organization}' and branch_id='${t.branch}' and consumed_at is null
      and revoked_at is null and expires_at>now() and token_hash=public.hash_public_token('${data.qr_token}')
      and manual_code_hash=public.hash_public_token('${data.manual_code}')`), 1);
    return data;
  };
  const inbox = (t, c, actor = c.api, slug = t.slug) => actor.rpc("get_customer_pro_in_app_inbox", {
    input_restaurant_slug: slug, input_customer_token: c.token });
  const confirm = (t, ref, pin, key = randomUUID(), amount = 6200, actor = staff) =>
    actor.rpc("confirm_restaurant_controlled_points", { input_restaurant_id: t.restaurant,
      input_qr_reference: ref, input_amount_cents: amount, input_daily_pin: pin, input_idempotency_key: key });
  const pinFor = async (t, actor = staff) => {
    const data = ok(await actor.rpc("get_today_restaurant_pin", { input_restaurant_id: t.restaurant }), "PIN_READ_FAILED");
    assert.match(String(data.pin_code), /^\d{4}$/);
    return data.pin_code;
  };
  for (const method of ["qr_token", "manual_code"]) {
    const t = makeTenant(method, true);
    const foreign = makeTenant(`foreign-${method}`, true);
    const c = await makeCustomer(t);
    assert.deepEqual(effects(t, c), zero);
    assert.equal(count("rewards", `restaurant_id='${t.restaurant}' and active and not is_starter_reward and required_points=62`), 1);
    assert.equal(sql(`select points_collection_mode from public.loyalty_settings where restaurant_id='${t.restaurant}'`), "restaurant_controlled_only");
    replicaFixture(`insert into public.commercial_pro_access_grants(id,restaurant_id,organization_id,access_kind,
      starts_at,expires_at,reason,created_by,request_id) values('${t.grant}','${t.restaurant}','${t.organization}',
      'INTERNAL_TEST_ONLY',now()-interval '1 minute',now()+interval '1 hour','Synthetic local Golden Path',
      '${platform.userId}','${randomUUID()}');`);
    assert.equal(sql(`select public.restaurant_entitlement_enabled('${t.restaurant}','reward_notifications')`), "t");
    const entitlement = jsonSql(`select public.resolve_restaurant_entitlements_internal('${t.restaurant}')`);
    assert.equal(entitlement.effective_plan, "PRO");
    assert.equal(entitlement.entitlement_source, "INTERNAL_TEST_ONLY");
    const ref = await reference(t, c);
    const pin = await pinFor(t);
    const beforeSearch = effects(t, c);
    const search = await staff.rpc("list_restaurant_customers_safe", { input_restaurant_id: t.restaurant });
    assert.ok(!search.error && search.data.some((row) => row.id === c.id), "SEARCH_READ_FAILED");
    assert.deepEqual(effects(t, c), beforeSearch, "SEARCH_MUST_BE_READ_ONLY");
    for (const actor of [c.api, platformClient, client()]) {
      denied(await confirm(t, ref[method], pin, randomUUID(), 6200, actor), "WRONG_ROLE_MUST_FAIL");
    }
    denied(await confirm(foreign, ref[method], pin), "FOREIGN_TENANT_MUST_FAIL");
    let foreignPin = await pinFor(foreign, ownerClient);
    if (foreignPin === pin) {
      foreignPin = pin === "0000" ? "9999" : "0000";
      sql(`update public.restaurant_daily_pins set pin_code='${foreignPin}' where restaurant_id='${foreign.restaurant}'`);
    }
    denied(await confirm(t, ref[method], foreignPin), "FOREIGN_BRANCH_PIN_MUST_FAIL");
    denied(await confirm(t, ref[method], pin === "0000" ? "9999" : "0000"), "INVALID_PIN_MUST_FAIL");
    sql(`update public.restaurant_daily_pins set valid_until=now()-interval '1 second' where restaurant_id='${t.restaurant}'`);
    denied(await confirm(t, ref[method], pin), "EXPIRED_PIN_MUST_FAIL");
    sql(`update public.restaurant_daily_pins set valid_until=now()+interval '1 hour' where restaurant_id='${t.restaurant}'`);
    assert.deepEqual(effects(t, c), zero, "NEGATIVE_ATTEMPTS_MUST_NOT_BOOK");
    denied(await inbox(t, c, ownerClient), "FOREIGN_CUSTOMER_IDENTITY_MUST_FAIL");
    denied(await inbox(t, c, c.api, foreign.slug), "FOREIGN_INBOX_TENANT_MUST_FAIL");
    const previews = await Promise.all([ref.qr_token, ref.manual_code].map((value) => staff.rpc(
      "preview_restaurant_controlled_points", { input_restaurant_id: t.restaurant,
        input_qr_reference: value, input_amount_cents: 6200 })));
    for (const preview of previews) {
      const data = ok(preview, "PREVIEW_FAILED");
      assert.equal(data.base_points, 62); assert.equal(data.final_points, 62); assert.equal(data.boost_multiplier, 1);
    }
    assert.deepEqual(effects(t, c), zero, "PREVIEW_MUST_NOT_BOOK");
    const key = randomUUID();
    const bookings = await Promise.all(Array.from({ length: 24 }, () => confirm(t, ref[method], pin, key)));
    for (const result of bookings) ok(result, "PARALLEL_CONFIRM_FAILED");
    assert.equal(new Set(bookings.map(({ data }) => data.transaction_id)).size, 1);
    const transactionId = bookings[0].data.transaction_id;
    for (const value of [ref.qr_token, ref.manual_code]) {
      assert.equal(ok(await confirm(t, value, pin, key), "CROSS_REFERENCE_REPLAY_FAILED").transaction_id, transactionId);
    }
    assert.equal((await confirm(t, ref[method], pin, key, 6300)).data?.error_code, "IDEMPOTENCY_KEY_PAYLOAD_MISMATCH");
    denied(await confirm(t, ref[method], pin), "CONSUMED_REFERENCE_MUST_FAIL");
    assert.deepEqual(effects(t, c), { balance: 62, earns: 1, states: 1, above: 1, assigned: 0, redeemed: 0, inbox: 1 });
    assert.equal(count("points_transactions", `id='${transactionId}' and restaurant_id='${t.restaurant}'
      and organization_id='${t.organization}' and branch_id='${t.branch}' and customer_id='${c.id}'
      and collection_source='restaurant_controlled' and amount_cents=6200 and points=62 and base_points=62 and boost_multiplier=1`), 1);
    const visible = ok(await inbox(t, c), "INBOX_READ_FAILED");
    assert.equal(visible.available, true); assert.equal(visible.unread_count, 1); assert.equal(visible.items.length, 1);
    assert.equal(visible.items[0].event_type, "POINT_REWARD_AVAILABLE");
    assert.equal(count("customer_pro_in_app_notifications", `restaurant_id='${t.restaurant}' and customer_id='${c.id}'
      and reward_id='${t.reward}' and event_key='${t.reward}'`), 1);
    // A distinct customer proves the successful-earn limit; failures above did not consume a place.
    const limitCustomer = await makeCustomer(t);
    denied(await inbox(t, c, limitCustomer.api), "OTHER_CUSTOMER_IDENTITY_MUST_FAIL");
    const failedLimitRef = await reference(t, limitCustomer);
    denied(await confirm(t, failedLimitRef[method], foreignPin, randomUUID(), 100), "LIMIT_CUSTOMER_WRONG_PIN_MUST_FAIL");
    assert.deepEqual(effects(t, limitCustomer), zero, "FAILED_PIN_MUST_NOT_CONSUME_SUCCESS_LIMIT");
    for (let i = 0; i < 2; i++) {
      const next = await reference(t, limitCustomer);
      ok(await confirm(t, next[method], pin, randomUUID(), 100), "TWO_SUCCESSFUL_EARNS_ALLOWED");
    }
    const limitRef = await reference(t, limitCustomer);
    const limited = await confirm(t, limitRef[method], pin, randomUUID(), 100);
    assert.equal(limited.data?.error_code, "POINTS_DAILY_LIMIT");
    assert.equal(effects(t, limitCustomer).earns, 2);
    assert.equal(effects(t, limitCustomer).balance, 2);
    // Grant removal/expiry must hide old entries and prevent new PRO entries, while BASIC earn survives.
    for (const mode of ["BASIC", "REVOKED", "EXPIRED"]) {
      replicaFixture(`update public.commercial_pro_access_grants set
        revoked_at=${mode === "EXPIRED" ? "null" : "now()"},
        revoked_by=${mode === "EXPIRED" ? "null" : `'${platform.userId}'`},
        revoke_reason=${mode === "EXPIRED" ? "null" : "'Synthetic local grant removal'"},
        starts_at=now()-interval '2 hours', expires_at=${mode === "EXPIRED" ? "now()-interval '1 hour'" : "now()+interval '1 hour'"}
        where id='${t.grant}';
        ${mode === "BASIC" ? `delete from public.commercial_pro_access_grants where id='${t.grant}';` : ""}`);
      assert.equal(jsonSql(`select public.resolve_restaurant_entitlements_internal('${t.restaurant}')`).effective_plan, "BASIC");
      const hidden = ok(await inbox(t, c), "DOWNGRADE_READ_FAILED");
      assert.equal(hidden.available, false); assert.equal(hidden.items.length, 0);
      const basicCustomer = await makeCustomer(t);
      assert.deepEqual(effects(t, basicCustomer), zero);
      const basicRef = await reference(t, basicCustomer);
      ok(await confirm(t, basicRef[method], pin), "BASIC_POINTS_MUST_SURVIVE");
      assert.deepEqual(effects(t, basicCustomer), { balance: 62, earns: 1, states: 1, above: 1, assigned: 0, redeemed: 0, inbox: 0 });
      assert.equal(ok(await inbox(t, basicCustomer), "BASIC_INBOX_READ_FAILED").available, false);
      // Re-create only a synthetic expired/revoked fixture after the no-grant BASIC case.
      if (mode === "BASIC") replicaFixture(`insert into public.commercial_pro_access_grants(id,restaurant_id,organization_id,
        access_kind,starts_at,expires_at,reason,created_by,request_id) values('${t.grant}','${t.restaurant}',
        '${t.organization}','INTERNAL_TEST_ONLY',now()-interval '1 minute',now()+interval '1 hour',
        'Synthetic negative grant fixture','${platform.userId}','${randomUUID()}');`);
    }
    assert.deepEqual(effects(t, c), { balance: 62, earns: 1, states: 1, above: 1, assigned: 0, redeemed: 0, inbox: 1 },
      "GRANT_CHANGES_MUST_RETAIN_HISTORICAL_BUSINESS_AND_INBOX_ROWS");
    assert.equal(count("customer_offer_email_deliveries", `restaurant_id='${t.restaurant}'`), 0);
    assert.equal(count("customer_transactional_email_deliveries", `restaurant_id='${t.restaurant}'`), 0);
    assert.equal(sql("show cron.launch_active_jobs"), "off");
    console.log(`LOCAL PRO GOLDEN ${method === "qr_token" ? "QR" : "8-DIGIT CODE"}: 6200 CENTS / 62 POINTS / ONE LEDGER+THRESHOLD+INBOX; SECURITY+BASIC+GRANT MATRIX PASS`);
  }
  completed = true;
} finally {
  // The entire task-owned stack is destroyed by the caller even after failure.
  // Never disable append-only protections to imitate a shared-stack cleanup.
  for (const target of clients) { await target.auth.signOut({ scope: "local" }); target.removeAllChannels(); }
  assert.equal(sql("show cron.launch_active_jobs"), "off");
  if (completed) console.log("DISPOSABLE STACK REQUIRES CALLER TEARDOWN; NO DISPATCHER OR SCHEDULER STARTED");
}
