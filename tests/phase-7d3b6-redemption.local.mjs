import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chromium } from "/Users/dongdongwu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const runtime = "/private/tmp/wuxuai-7d3b6-auth.VMoIzk";
const cli = "/private/tmp/wuxuai-7d2.1uZAeh/repo/node_modules/.bin/supabase";
const status = JSON.parse(execFileSync(cli, ["status", "--output", "json"], {
  cwd: runtime, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1", DO_NOT_TRACK: "1" },
}));
assert.equal(status.API_URL, "http://127.0.0.1:56221");
const origin = "http://127.0.0.1:4180";
const sql = (query) => {
  try {
    return execFileSync("docker", ["exec", "-i", "supabase_db_wuxuai-phase7d3b-isolated",
      "psql", "-U", "postgres", "-d", "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1"],
    { input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch { throw new Error("LOCAL_SYNTHETIC_SQL_FIXTURE_FAILED_REDACTED"); }
};
assert.equal(sql("select count(*) from supabase_migrations.schema_migrations"), "171");
const fixture = sql(`select r.id,r.slug,r.owner_id,
  (select s.auth_user_id from public.staff_members s where s.restaurant_id=r.id and s.active limit 1),
  (select a.auth_user_id from public.customer_accounts a join public.customer_account_memberships m on m.account_id=a.id where m.restaurant_id=r.id limit 1)
  from public.restaurants r where r.name='D3B6 Synthetic Restaurant A' limit 1`).split("|");
const [restaurantId, slug, ownerId, staffId, customerId] = fixture;
for (const id of [restaurantId, ownerId, staffId, customerId]) assert.match(id, /^[0-9a-f-]{36}$/);
const foreignFixture = sql(`select r.id,r.slug,
  (select s.auth_user_id from public.staff_members s where s.restaurant_id=r.id and s.active limit 1),
  (select a.auth_user_id from public.customer_accounts a join public.customer_account_memberships m on m.account_id=a.id where m.restaurant_id=r.id limit 1)
  from public.restaurants r where r.name='D3B6 Synthetic Restaurant B' limit 1`).split("|");
const [foreignRestaurantId, foreignSlug, foreignStaffId, foreignCustomerId] = foreignFixture;
for (const id of [foreignRestaurantId, foreignStaffId, foreignCustomerId]) assert.match(id, /^[0-9a-f-]{36}$/);
function publicFingerprints() {
  return sql(`create temp table d3b6_fingerprints(name text, digest text);
    do $$ declare r record; v text; begin
      for r in select tablename from pg_tables where schemaname='public' order by tablename loop
        execute format('select count(*)::text || '':'' || md5(coalesce(string_agg(to_jsonb(t)::text,''|'' order by to_jsonb(t)::text),'''')) from public.%I t', r.tablename) into v;
        insert into d3b6_fingerprints values (r.tablename,v);
      end loop;
    end $$;
    select name || '|' || digest from d3b6_fingerprints order by name;`);
}

const browser = await chromium.launch({ headless: true });
const contexts = [];
const memoryStorage = () => {
  const entries = new Map();
  Object.defineProperty(window, "localStorage", { configurable: true, value: {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => { entries.set(key, String(value)); },
    removeItem: (key) => { entries.delete(key); },
    clear: () => { entries.clear(); },
    key: (index) => [...entries.keys()][index] ?? null,
    get length() { return entries.size; },
  } });
};
async function actor(id, role) {
  const password = randomUUID() + randomUUID();
  const email = sql(`select email from auth.users where id='${id}'`);
  const changed = await fetch(`${status.API_URL}/auth/v1/admin/users/${id}`, {
    method: "PUT", headers: { apikey: status.SERVICE_ROLE_KEY,
      authorization: `Bearer ${status.SERVICE_ROLE_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  assert.equal(changed.status, 200, `${role}_LOCAL_AUTH_SETUP_FAILED:${changed.status}`);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  contexts.push(context);
  await context.addInitScript(memoryStorage);
  await context.route("**/*", (route) => ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname)
    ? route.continue() : route.abort());
  const page = await context.newPage();
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  const signed = await page.evaluate(async ({ email, password }) => {
    const { supabase } = await import("/src/shared/lib/supabase.ts");
    const result = await supabase.auth.signInWithPassword({ email, password });
    return { success: !!result.data.session && !result.error, error: result.error?.code ?? null };
  }, { email, password });
  assert.equal(signed.success, true, `${role}_LOCAL_BROWSER_LOGIN_FAILED:${signed.error}`);
  return { id, role, page, context, credentials: { email, password } };
}
async function edge(person, payload) {
  return person.page.evaluate(async (body) => {
    const { supabase } = await import("/src/shared/lib/supabase.ts");
    const result = await supabase.functions.invoke("redemption-confirmation", { body });
    if (!result.error) return { status: 200, data: result.data };
    let data = null;
    try { data = await result.error.context?.clone().json(); } catch { /* no payload */ }
    return { status: result.error.context?.status ?? 0, data };
  }, payload);
}
const body = (action, extra) => ({ action, request_id: randomUUID(), correlation_id: randomUUID(),
  idempotency_key: randomUUID(), ...extra });
async function parallelActions(person, action, redemptionId, correlationId) {
  return person.page.evaluate(async ({ actionName, id, correlation }) => {
    const { supabase } = await import("/src/shared/lib/supabase.ts");
    return Promise.all(Array.from({ length: 24 }, async () => {
      const result = await supabase.functions.invoke("redemption-confirmation", { body: {
        action: actionName, redemption_id: id, correlation_id: correlation,
        request_id: crypto.randomUUID(), idempotency_key: crypto.randomUUID(),
      } });
      if (!result.error) return { status: 200, state: result.data?.status ?? null };
      let payload = null;
      try { payload = await result.error.context?.clone().json(); } catch { /* no payload */ }
      return { status: result.error.context?.status ?? 0, code: payload?.error_code ?? null };
    }));
  }, { actionName: action, id: redemptionId, correlation: correlationId });
}
async function newBirthdayCustomer() {
  const password = randomUUID() + randomUUID();
  const email = `d3b6-birthday-${randomUUID()}@example.invalid`;
  const birthday = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const created = await fetch(`${status.API_URL}/auth/v1/admin/users`, {
    method: "POST", headers: { apikey: status.SERVICE_ROLE_KEY,
      authorization: `Bearer ${status.SERVICE_ROLE_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true,
      user_metadata: { customer_first_name: "D3B6 Synthetic",
        customer_phone: `+4366${randomInt(10000000, 99999999)}`,
        customer_birthday: birthday } }),
  });
  assert.equal(created.status, 200, `LOCAL_CUSTOMER_CREATE_FAILED:${created.status}`);
  const user = await created.json();
  assert.match(user.id, /^[0-9a-f-]{36}$/);
  const person = await actor(user.id, "customer");
  const joined = await person.page.evaluate(async (restaurantSlug) => {
    const { supabase } = await import("/src/shared/lib/supabase.ts");
    const result = await supabase.rpc("join_customer_account_restaurant", {
      input_restaurant_slug: restaurantSlug, input_terms_accepted: true,
      input_privacy_acknowledged: true, input_device_id: crypto.randomUUID(),
      input_existing_customer_token: null,
    });
    return { success: result.data?.joined === true, error: result.error?.code ?? null };
  }, slug);
  assert.equal(joined.success, true, `LOCAL_CUSTOMER_JOIN_FAILED:${joined.error}`);
  const giftId = sql(`select g.id from public.customer_rewards g join public.customer_account_memberships m
    on m.customer_id=g.customer_id join public.customer_accounts a on a.id=m.account_id
    where a.auth_user_id='${user.id}' and g.gift_type='birthday' and g.status='active' limit 1`);
  assert.match(giftId, /^[0-9a-f-]{36}$/);
  return { person, giftId };
}
try {
  const owner = await actor(ownerId, "owner");
  const staff = await actor(staffId, "staff");
  const foreignStaff = await actor(foreignStaffId, "foreign-staff");
  const foreignCustomer = await actor(foreignCustomerId, "foreign-customer");
  const { person: customer, giftId: birthdayGiftId } = await newBirthdayCustomer();
  const before = sql("select count(*) from public.secure_redemption_requests");
  const started = await edge(customer, body("start", { restaurant_slug: slug,
    source_type: "gift", entitlement_id: birthdayGiftId }));
  assert.equal(started.status, 200, `BIRTHDAY_START_HTTP_${started.status}:${started.data?.error_code ?? ""}`);
  assert.equal(started.data?.status, "REQUESTED");
  assert.equal(sql("select count(*) from public.secure_redemption_requests"), String(Number(before) + 1));
  console.log("D3B6_REAL_BROWSER_AUTH_EDGE_BIRTHDAY_REQUEST_PASS");
  const queue = await staff.page.evaluate(async ({ tenantSlug, redemptionId }) => {
    const { supabase } = await import("/src/shared/lib/supabase.ts");
    const result = await supabase.rpc("get_secure_redemption_queue", { input_restaurant_slug: tenantSlug });
    return { actorRole: result.data?.actor_role ?? null, includesNew: result.data?.requests?.some((item) =>
      item.redemption_id === redemptionId) ?? false,
      error: result.error?.code ?? null };
  }, { tenantSlug: slug, redemptionId: started.data.redemption_id });
  assert.equal(queue.actorRole, "STAFF");
  assert.equal(queue.includesNew, true);
  console.log("D3B6_REAL_STAFF_QUEUE_WITH_REQUEST_PASS");
  const pinResult = await edge(owner, body("rotate_pin", { restaurant_slug: slug }));
  assert.equal(pinResult.status, 200, `OWNER_ROTATE_PIN_FAILED:${pinResult.data?.error_code ?? ""}`);
  const pin = pinResult.data?.pin;
  assert.match(pin, /^\d{6}$/);
  const wrongPin = pin === "000000" ? "111111" : "000000";
  for (let attempt = 1; attempt <= 5; attempt++) {
    const rejected = await edge(customer, body("verify_pin", { redemption_id: started.data.redemption_id,
      correlation_id: started.data.correlation_id, pin: wrongPin }));
    assert.equal(rejected.status, 409, `WRONG_PIN_${attempt}_HTTP_${rejected.status}`);
    assert.equal(rejected.data?.error_code, "REDEMPTION_PIN_INVALID");
  }
  assert.equal(sql(`select failed_pin_attempts from public.secure_redemption_requests where id='${started.data.redemption_id}'`), "5");
  const blockedValid = await edge(customer, body("verify_pin", { redemption_id: started.data.redemption_id,
    correlation_id: started.data.correlation_id, pin }));
  assert.equal(blockedValid.status, 409);
  assert.equal(blockedValid.data?.error_code, "REDEMPTION_PIN_INVALID");
  console.log("D3B6_REAL_EDGE_FIVE_WRONG_PIN_LOCK_PASS");
  const cancelled = await edge(customer, body("cancel", { redemption_id: started.data.redemption_id,
    correlation_id: started.data.correlation_id }));
  assert.equal(cancelled.status, 200, "LOCKED_REQUEST_CANCEL_FAILED");
  const { person: validCustomer, giftId: validGiftId } = await newBirthdayCustomer();
  const retry = await edge(validCustomer, body("start", { restaurant_slug: slug,
    source_type: "gift", entitlement_id: validGiftId }));
  assert.equal(retry.status, 200, "BIRTHDAY_RETRY_START_FAILED");
  const verified = await edge(validCustomer, body("verify_pin", { redemption_id: retry.data.redemption_id,
    correlation_id: retry.data.correlation_id, pin }));
  assert.equal(verified.status, 200, `VALID_PIN_FAILED:${verified.data?.error_code ?? ""}`);
  assert.equal(verified.data?.status, "PIN_VERIFIED");
  console.log("D3B6_REAL_EDGE_PIN_VERIFIED_PASS");
  const swipes = await parallelActions(validCustomer, "swipe", retry.data.redemption_id,
    retry.data.correlation_id);
  assert.equal(swipes.length, 24);
  assert.equal(swipes.filter((item) => item.status === 200 && item.state === "REDEEMED").length, 1);
  assert.equal(sql(`select status from public.secure_redemption_requests where id='${retry.data.redemption_id}'`), "REDEEMED");
  assert.equal(sql(`select status from public.customer_rewards where id='${validGiftId}'`), "redeemed");
  assert.equal(sql(`select count(*) from public.redemption_activity_journal where source_id=(select presentation_id
    from public.secure_redemption_requests where id='${retry.data.redemption_id}')`), "1");
  console.log("D3B6_REAL_BROWSER_24_WAY_BIRTHDAY_SWIPE_ONE_EFFECT_PASS");

  const { person: staffCustomer, giftId: staffGiftId } = await newBirthdayCustomer();
  const staffRequest = await edge(staffCustomer, body("start", { restaurant_slug: slug,
    source_type: "gift", entitlement_id: staffGiftId }));
  assert.equal(staffRequest.status, 200, "STAFF_PATH_START_FAILED");
  const staffApprovals = await parallelActions(staff, "approve", staffRequest.data.redemption_id,
    staffRequest.data.correlation_id);
  assert.equal(staffApprovals.length, 24);
  assert.equal(staffApprovals.filter((item) => item.status === 200 && item.state === "REDEEMED").length, 1);
  assert.equal(sql(`select status from public.customer_rewards where id='${staffGiftId}'`), "redeemed");
  assert.equal(sql(`select count(*) from public.redemption_activity_journal where source_id=(select presentation_id
    from public.secure_redemption_requests where id='${staffRequest.data.redemption_id}')`), "1");
  console.log("D3B6_REAL_BROWSER_24_WAY_STAFF_APPROVE_ONE_EFFECT_PASS");

  const { person: rejectedCustomer, giftId: rejectedGiftId } = await newBirthdayCustomer();
  const rejectedRequest = await edge(rejectedCustomer, body("start", { restaurant_slug: slug,
    source_type: "gift", entitlement_id: rejectedGiftId }));
  assert.equal(rejectedRequest.status, 200, "STAFF_REJECT_START_FAILED");
  const rejected = await edge(staff, body("reject", { redemption_id: rejectedRequest.data.redemption_id,
    correlation_id: rejectedRequest.data.correlation_id }));
  assert.equal(rejected.status, 200, "STAFF_REJECT_FAILED");
  assert.equal(sql(`select status from public.secure_redemption_requests where id='${rejectedRequest.data.redemption_id}'`), "REJECTED");
  assert.equal(sql(`select status from public.customer_rewards where id='${rejectedGiftId}'`), "active");
  console.log("D3B6_REAL_BROWSER_STAFF_REJECT_NO_CONSUMPTION_PASS");

  const { person: ownerCustomer, giftId: ownerGiftId } = await newBirthdayCustomer();
  const ownerRequest = await edge(ownerCustomer, body("start", { restaurant_slug: slug,
    source_type: "gift", entitlement_id: ownerGiftId }));
  assert.equal(ownerRequest.status, 200, "OWNER_PATH_START_FAILED");
  const foreignBefore = publicFingerprints();
  const foreignApproves = await edge(foreignStaff, body("approve", {
    redemption_id: ownerRequest.data.redemption_id, correlation_id: ownerRequest.data.correlation_id }));
  const foreignRejects = await edge(foreignStaff, body("reject", {
    redemption_id: ownerRequest.data.redemption_id, correlation_id: ownerRequest.data.correlation_id }));
  const foreignGift = await edge(foreignCustomer, body("start", {
    restaurant_slug: slug, source_type: "gift", entitlement_id: ownerGiftId }));
  for (const denied of [foreignApproves, foreignRejects, foreignGift]) {
    assert.equal(denied.status, 409);
    assert.equal(JSON.stringify(denied.data).includes(ownerRequest.data.redemption_id), false);
  }
  const foreignQueue = await foreignStaff.page.evaluate(async (tenantSlug) => {
    const { supabase } = await import("/src/shared/lib/supabase.ts");
    const result = await supabase.rpc("get_secure_redemption_queue", { input_restaurant_slug: tenantSlug });
    return { error: result.error?.code ?? null, hasData: !!result.data?.requests?.length };
  }, slug);
  assert.equal(foreignQueue.hasData, false);
  assert.equal(publicFingerprints(), foreignBefore, "FOREIGN_TENANT_ATTEMPT_CHANGED_PUBLIC_DATA");
  console.log("D3B6_REAL_FOREIGN_STAFF_CUSTOMER_QUEUE_GIFT_ACTION_ZERO_WRITES_PASS");
  const ownerApprovals = await parallelActions(owner, "approve", ownerRequest.data.redemption_id,
    ownerRequest.data.correlation_id);
  assert.equal(ownerApprovals.length, 24);
  assert.equal(ownerApprovals.filter((item) => item.status === 200 && item.state === "REDEEMED").length, 1);
  assert.equal(sql(`select status from public.customer_rewards where id='${ownerGiftId}'`), "redeemed");
  assert.equal(sql(`select count(*) from public.redemption_activity_journal where source_id=(select presentation_id
    from public.secure_redemption_requests where id='${ownerRequest.data.redemption_id}')`), "1");
  console.log("D3B6_REAL_BROWSER_24_WAY_OWNER_APPROVE_ONE_EFFECT_PASS");

  const { person: pointsCustomer } = await newBirthdayCustomer();
  const pointsRewardId = sql(`select id from public.rewards where restaurant_id='${restaurantId}'
    and required_points=100 and not is_starter_reward and active limit 1`);
  assert.match(pointsRewardId, /^[0-9a-f-]{36}$/);
  const pointsBalance = () => Number(sql(`select coalesce(sum(c.points_balance),0) from public.customers c
    join public.customer_account_memberships m on m.customer_id=c.id
    join public.customer_accounts a on a.id=m.account_id
    where a.auth_user_id='${pointsCustomer.id}' and m.restaurant_id='${restaurantId}'`));
  const balanceBefore = pointsBalance();
  const pointsRedeemedBefore = Number(sql(`select count(*) from public.secure_redemption_requests
    where restaurant_id='${restaurantId}' and source_type='points' and status='REDEEMED'`));
  const pointResult = await pointsCustomer.page.evaluate(async (input) => {
    const { runPointsFlow } = await import("/tests/phase-7d3b6-points-browser.local.mjs");
    return runPointsFlow(input);
  }, { restaurantId, slug, rewardId: pointsRewardId,
    credentials: { owner: owner.credentials, staff: staff.credentials,
      customer: pointsCustomer.credentials } });
  assert.deepEqual(pointResult, { collected: true, requested: true, redeemed: true });
  assert.equal(pointsBalance(), balanceBefore);
  assert.equal(sql(`select count(*) from public.secure_redemption_requests where restaurant_id='${restaurantId}'
    and source_type='points' and status='REDEEMED'`), String(pointsRedeemedBefore + 1));
  console.log("D3B6_REAL_BROWSER_POINTS_COLLECTION_REDEMPTION_ONE_DEBIT_PASS");

  const welcomeGiftId = sql(`select g.id from public.customer_rewards g
    join public.customer_account_memberships m on m.customer_id=g.customer_id
    join public.customer_accounts a on a.id=m.account_id
    where a.auth_user_id='${pointsCustomer.id}' and g.gift_type='welcome' and g.status='active' limit 1`);
  assert.match(welcomeGiftId, /^[0-9a-f-]{36}$/);
  const welcomeRequest = await edge(pointsCustomer, body("start", { restaurant_slug: slug,
    source_type: "gift", entitlement_id: welcomeGiftId }));
  assert.equal(welcomeRequest.status, 200, "WELCOME_STAFF_REQUEST_FAILED");
  const welcomeApproved = await edge(staff, body("approve", {
    redemption_id: welcomeRequest.data.redemption_id,
    correlation_id: welcomeRequest.data.correlation_id }));
  assert.equal(welcomeApproved.status, 200, "WELCOME_STAFF_APPROVAL_FAILED");
  assert.equal(sql(`select status from public.customer_rewards where id='${welcomeGiftId}'`), "redeemed");
  assert.equal(sql(`select count(*) from public.redemption_activity_journal where source_id=(select presentation_id
    from public.secure_redemption_requests where id='${welcomeRequest.data.redemption_id}')`), "1");
  console.log("D3B6_REAL_BROWSER_WELCOME_GIFT_STAFF_ONE_CONSUMPTION_PASS");

  const { person: welcomeCustomer } = await newBirthdayCustomer();
  const welcomeUnlocked = await welcomeCustomer.page.evaluate(async (input) => {
    const { runPointsFlow } = await import("/tests/phase-7d3b6-points-browser.local.mjs");
    return runPointsFlow(input);
  }, { restaurantId, slug, rewardId: pointsRewardId, redeemPoints: false,
    credentials: { owner: owner.credentials, staff: staff.credentials,
      customer: welcomeCustomer.credentials } });
  assert.deepEqual(welcomeUnlocked, { collected: true });
  const pinWelcomeId = sql(`select g.id from public.customer_rewards g
    join public.customer_account_memberships m on m.customer_id=g.customer_id
    join public.customer_accounts a on a.id=m.account_id
    where a.auth_user_id='${welcomeCustomer.id}' and g.gift_type='welcome' and g.status='active' limit 1`);
  assert.match(pinWelcomeId, /^[0-9a-f-]{36}$/);
  const pinWelcomeRequest = await edge(welcomeCustomer, body("start", { restaurant_slug: slug,
    source_type: "gift", entitlement_id: pinWelcomeId }));
  assert.equal(pinWelcomeRequest.status, 200, "WELCOME_PIN_REQUEST_FAILED");
  const currentPin = await edge(owner, body("rotate_pin", { restaurant_slug: slug }));
  assert.equal(currentPin.status, 200, "WELCOME_PIN_ROTATE_FAILED");
  const pinWelcomeVerified = await edge(welcomeCustomer, body("verify_pin", {
    redemption_id: pinWelcomeRequest.data.redemption_id,
    correlation_id: pinWelcomeRequest.data.correlation_id, pin: currentPin.data.pin }));
  assert.equal(pinWelcomeVerified.status, 200, "WELCOME_PIN_VERIFY_FAILED");
  const welcomeSwiped = await edge(welcomeCustomer, body("swipe", {
    redemption_id: pinWelcomeRequest.data.redemption_id,
    correlation_id: pinWelcomeRequest.data.correlation_id }));
  assert.equal(welcomeSwiped.status, 200, "WELCOME_PIN_SWIPE_FAILED");
  assert.equal(sql(`select status from public.customer_rewards where id='${pinWelcomeId}'`), "redeemed");
  console.log("D3B6_REAL_BROWSER_WELCOME_GIFT_PIN_ONE_CONSUMPTION_PASS");

  const consumedBefore = publicFingerprints();
  const consumedAgain = await edge(validCustomer, body("start", { restaurant_slug: slug,
    source_type: "gift", entitlement_id: validGiftId }));
  assert.equal(consumedAgain.status, 409);
  const fakeToken = await edge(validCustomer, body("start", { restaurant_slug: slug,
    source_type: "gift", entitlement_id: randomUUID() }));
  assert.equal(fakeToken.status, 409);
  assert.equal(publicFingerprints(), consumedBefore, "CONSUMED_OR_FAKE_GIFT_ATTEMPT_WROTE_PUBLIC_DATA");
  console.log("D3B6_REAL_BROWSER_CONSUMED_AND_FAKE_GIFT_ZERO_WRITES_PASS");

  const { person: expiredCustomer, giftId: expiredGiftId } = await newBirthdayCustomer();
  sql(`update public.customer_rewards set valid_from=statement_timestamp()-interval '2 days',
    valid_until=statement_timestamp()-interval '1 day' where id='${expiredGiftId}'`);
  const expiredBefore = publicFingerprints();
  const expiredGift = await edge(expiredCustomer, body("start", { restaurant_slug: slug,
    source_type: "gift", entitlement_id: expiredGiftId }));
  assert.equal(expiredGift.status, 409);
  assert.equal(publicFingerprints(), expiredBefore, "EXPIRED_GIFT_ATTEMPT_WROTE_PUBLIC_DATA");
  console.log("D3B6_REAL_BROWSER_EXPIRED_GIFT_ZERO_WRITES_PASS");

  const { person: rotatedCustomer, giftId: rotatedGiftId } = await newBirthdayCustomer();
  const rotatedRequest = await edge(rotatedCustomer, body("start", { restaurant_slug: slug,
    source_type: "gift", entitlement_id: rotatedGiftId }));
  assert.equal(rotatedRequest.status, 200);
  const firstPin = await edge(owner, body("rotate_pin", { restaurant_slug: slug }));
  let secondPin = await edge(owner, body("rotate_pin", { restaurant_slug: slug }));
  if (firstPin.data.pin === secondPin.data.pin)
    secondPin = await edge(owner, body("rotate_pin", { restaurant_slug: slug }));
  assert.notEqual(firstPin.data.pin, secondPin.data.pin);
  const oldPinRejected = await edge(rotatedCustomer, body("verify_pin", {
    redemption_id: rotatedRequest.data.redemption_id,
    correlation_id: rotatedRequest.data.correlation_id, pin: firstPin.data.pin }));
  assert.equal(oldPinRejected.status, 409);
  const newPinVerified = await edge(rotatedCustomer, body("verify_pin", {
    redemption_id: rotatedRequest.data.redemption_id,
    correlation_id: rotatedRequest.data.correlation_id, pin: secondPin.data.pin }));
  assert.equal(newPinVerified.status, 200);
  const cancelOnce = await edge(rotatedCustomer, body("cancel", {
    redemption_id: rotatedRequest.data.redemption_id,
    correlation_id: rotatedRequest.data.correlation_id }));
  assert.equal(cancelOnce.status, 200);
  assert.equal(sql(`select status from public.secure_redemption_requests where id='${rotatedRequest.data.redemption_id}'`), "CANCELLED");
  const terminalBefore = publicFingerprints();
  const cancelAgain = await edge(rotatedCustomer, body("cancel", {
    redemption_id: rotatedRequest.data.redemption_id,
    correlation_id: rotatedRequest.data.correlation_id }));
  assert.equal(cancelAgain.status, 409);
  assert.equal(publicFingerprints(), terminalBefore, "TERMINAL_CANCEL_WROTE_PUBLIC_DATA");
  console.log("D3B6_REAL_PIN_ROTATION_OLD_INVALID_NEW_VALID_CANCEL_TERMINAL_PASS");

  const { person: expiryCustomer, giftId: expiryGiftId } = await newBirthdayCustomer();
  const expiryRequest = await edge(expiryCustomer, body("start", { restaurant_slug: slug,
    source_type: "gift", entitlement_id: expiryGiftId }));
  assert.equal(expiryRequest.status, 200);
  sql(`update public.secure_redemption_requests set requested_at=statement_timestamp()-interval '16 minutes',
    expires_at=statement_timestamp()-interval '1 minute' where id='${expiryRequest.data.redemption_id}';
    update public.gift_redemption_presentations
    set activated_at=statement_timestamp()-interval '16 minutes',
      expires_at=statement_timestamp()-interval '1 minute'
    where id=(select presentation_id from public.secure_redemption_requests where id='${expiryRequest.data.redemption_id}');`);
  const expiredAction = await edge(staff, body("approve", {
    redemption_id: expiryRequest.data.redemption_id,
    correlation_id: expiryRequest.data.correlation_id }));
  assert.equal(expiredAction.status, 409);
  assert.equal(sql(`select status from public.secure_redemption_requests where id='${expiryRequest.data.redemption_id}'`), "EXPIRED");
  assert.equal(sql(`select count(*) from public.redemption_activity_journal where source_id=(select presentation_id
    from public.secure_redemption_requests where id='${expiryRequest.data.redemption_id}')`), "0");
  console.log("D3B6_REAL_EDGE_SYNTHETIC_EXPIRED_WINDOW_NO_CONSUMPTION_PASS");
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
}
