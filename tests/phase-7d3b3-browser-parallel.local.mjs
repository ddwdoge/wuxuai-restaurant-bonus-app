import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomInt, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { chromium, webkit } from "/Users/dongdongwu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const runtime = "/private/tmp/wuxuai-7d3b-runtime.R81Aj8";
const cli = "/private/tmp/wuxuai-7d2.1uZAeh/repo/node_modules/.bin/supabase";
const status = JSON.parse(execFileSync(cli, ["status", "--output", "json"], {
  cwd: runtime, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1", DO_NOT_TRACK: "1" },
}));
assert.equal(status.API_URL, "http://127.0.0.1:56221");
const sql = (input) => execFileSync("docker", ["exec", "-i", "supabase_db_wuxuai-phase7d3b-isolated",
  "psql", "-U", "postgres", "-d", "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1"],
{ input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const allPublicFingerprints = () => new Map(sql(`create temp table d3b3_fingerprints(name text, digest text);
do $$ declare r record; v text; begin
  for r in select tablename from pg_tables where schemaname='public' order by tablename loop
    execute format('select count(*)::text || '':'' || md5(coalesce(string_agg(to_jsonb(t)::text,''|'' order by to_jsonb(t)::text),'''')) from public.%I t', r.tablename) into v;
    insert into d3b3_fingerprints values (r.tablename,v);
  end loop;
end $$;
select name || '|' || digest from d3b3_fingerprints order by name;`)
  .split("\n").filter(Boolean).map((line) => {
    const index = line.indexOf("|");
    return [line.slice(0, index), line.slice(index + 1)];
  }));
const rowKeys = {
  audit_log: ["id"], capacity_warning_states: ["restaurant_id", "capacity_type", "warning_level"],
  customer_rewards: ["id"], gift_redemption_presentations: ["id"],
  kassa_redemption_workflows: ["id"], redemption_activity_journal: ["id"],
  redemption_confirmation_pins: ["restaurant_id", "branch_id", "local_day"],
  secure_redemption_audit: ["id"], secure_redemption_pin_attempts: ["id"],
  secure_redemption_requests: ["id"],
};
const rowSnapshot = () => new Map(Object.entries(rowKeys).map(([table, keys]) => {
  const rows = sql(`select row_to_json(t)::text from public.${table} t`).split("\n").filter(Boolean).map(JSON.parse);
  return [table, new Map(rows.map((row) => [keys.map((key) => row[key]).join("/"), row]))];
}));
const fixtureRows = sql("select f.label,f.restaurant_id,r.slug,f.owner_id from public.d3b3_historical_fixture f join public.restaurants r on r.id=f.restaurant_id order by f.label")
  .split("\n").map((row) => {
    const [label, restaurantId, slug, ownerId] = row.split("|");
    return { label, restaurantId, slug, ownerId };
  });
const [a, b] = fixtureRows;
assert.deepEqual(fixtureRows.map((item) => item.label), ["A", "B"]);
const actor = ["customer", "staff", "owner"].includes(process.env.D3B3_PARALLEL_ACTOR)
  ? process.env.D3B3_PARALLEL_ACTOR : "customer";
const giftType = process.env.D3B3_PARALLEL_GIFT === "welcome" ? "welcome" : "birthday";
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(status.API_URL, status.ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
const authed = (session) => createClient(status.API_URL, status.ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${session.access_token}` } } });
const loginExisting = async (userId) => {
  const password = randomUUID() + randomUUID();
  const email = sql(`select email from auth.users where id='${userId}'`);
  const updated = await admin.auth.admin.updateUserById(userId, { password });
  assert.equal(updated.error, null, "LOCAL_AUTH_UPDATE_FAILED");
  const login = await anon.auth.signInWithPassword({ email, password });
  assert.equal(login.error, null, "LOCAL_AUTH_LOGIN_FAILED");
  return login.data.session;
};
const ownerSession = await loginExisting(a.ownerId);
const aStaffId = sql(`select auth_user_id from public.staff_members where restaurant_id='${a.restaurantId}' and active limit 1`);
const aStaffSession = await loginExisting(aStaffId);
const bStaffId = sql(`select auth_user_id from public.staff_members where restaurant_id='${b.restaurantId}' and active limit 1`);
const bStaffSession = await loginExisting(bStaffId);
const bCustomerId = sql(`select c.auth_user_id from public.customer_accounts c
  join public.customer_account_memberships m on m.account_id=c.id
  where m.restaurant_id='${b.restaurantId}' limit 1`);
const bCustomerSession = await loginExisting(bCustomerId);
const aExistingCustomerId = sql(`select c.auth_user_id from public.customer_accounts c
  join public.customer_account_memberships m on m.account_id=c.id
  where m.restaurant_id='${a.restaurantId}' limit 1`);
const aExistingCustomerSession = await loginExisting(aExistingCustomerId);
const birthday = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
const email = `d3b3-parallel-customer-${randomUUID()}@example.invalid`;
const password = randomUUID() + randomUUID();
const created = await admin.auth.admin.createUser({ email, password, email_confirm: true,
  user_metadata: { customer_first_name: "D3B3 Parallel",
    customer_phone: `+4366${randomInt(10000000, 99999999)}`,
    customer_birthday: birthday } });
assert.equal(created.error, null, "PARALLEL_CUSTOMER_AUTH_FAILED");
const signed = await anon.auth.signInWithPassword({ email, password });
assert.equal(signed.error, null, "PARALLEL_CUSTOMER_LOGIN_FAILED");
const customerSession = signed.data.session;
const joined = await authed(customerSession).rpc("join_customer_account_restaurant", {
  input_restaurant_slug: a.slug, input_terms_accepted: true,
  input_privacy_acknowledged: true, input_device_id: `d3b3-${randomUUID()}`,
  input_existing_customer_token: null,
});
assert.equal(joined.error, null, `PARALLEL_CUSTOMER_JOIN_FAILED:${joined.error?.code ?? ""}`);
if (giftType === "welcome") {
  const owner = authed(ownerSession);
  const customer = authed(customerSession);
  const staff = authed(aStaffSession);
  const qr = await customer.rpc("create_customer_points_credit_qr", {
    input_restaurant_slug: a.slug, input_customer_token: joined.data.customer_token,
  });
  assert.equal(qr.error, null, "PARALLEL_CUSTOMER_QR_FAILED");
  const preview = await staff.rpc("preview_restaurant_controlled_points", {
    input_restaurant_id: a.restaurantId, input_qr_reference: qr.data.qr_token,
    input_amount_cents: 1000,
  });
  assert.equal(preview.error, null, "PARALLEL_POINTS_PREVIEW_FAILED");
  const pin = await owner.rpc("get_today_restaurant_pin", { input_restaurant_id: a.restaurantId });
  assert.equal(pin.error, null, "PARALLEL_DAILY_PIN_FAILED");
  const collected = await staff.rpc("confirm_restaurant_controlled_points", {
    input_restaurant_id: a.restaurantId, input_qr_reference: qr.data.qr_token,
    input_amount_cents: 1000, input_daily_pin: pin.data.pin_code,
    input_idempotency_key: randomUUID(),
  });
  assert.equal(collected.error, null, "PARALLEL_WELCOME_UNLOCK_FAILED");
}
const entitlementId = sql(`select g.id from public.customer_rewards g
  join public.customer_account_memberships m on m.customer_id=g.customer_id
  join public.customer_accounts c on c.id=m.account_id
  where c.auth_user_id='${created.data.user.id}' and g.gift_type='${giftType}' and g.status='active'`);
assert.match(entitlementId, /^[0-9a-f-]{36}$/);

let vite;
let browser;
try {
  vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "4180", "--strictPort"], {
    env: { ...process.env, VITE_SUPABASE_URL: status.API_URL, VITE_SUPABASE_ANON_KEY: status.ANON_KEY },
    stdio: "ignore",
  });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch("http://127.0.0.1:4180")).ok) { ready = true; break; } } catch { /* startup */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready, "LOCAL_VITE_NOT_READY");
  browser = await chromium.launch({ headless: true });
  const openPage = async (slug, session) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
    await context.route("**/*", (route) => ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname)
      ? route.continue() : route.abort());
    await context.addInitScript((value) => {
      localStorage.setItem("sb-127-auth-token", JSON.stringify(value));
      localStorage.setItem("wuxuai.ui-language", "de");
    }, session);
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:4180/customer/${slug}`, { waitUntil: "networkidle" });
    return { context, page };
  };
  const customer = await openPage(a.slug, customerSession);
  const owner = await openPage(a.slug, ownerSession);
  const staff = await openPage(a.slug, aStaffSession);
  const foreignStaff = await openPage(b.slug, bStaffSession);
  const foreignCustomer = await openPage(b.slug, bCustomerSession);
  const wrongCustomer = await openPage(a.slug, aExistingCustomerSession);
  const endpoint = `${status.API_URL}/functions/v1/redemption-confirmation`;
  const post = async (page, payload, count = 1) => page.evaluate(async ({ endpointUrl, apiKey, body, copies }) => {
    const session = JSON.parse(localStorage.getItem("sb-127-auth-token") || "null");
    if (!session?.access_token) throw new Error("BROWSER_SESSION_MISSING");
    return Promise.all(Array.from({ length: copies }, async () => {
      const response = await fetch(endpointUrl, { method: "POST", headers: {
        apikey: apiKey, authorization: `Bearer ${session.access_token}`,
        "content-type": "application/json", origin: location.origin,
      }, body: JSON.stringify(body) });
      return { status: response.status, data: await response.json() };
    }));
  }, { endpointUrl: endpoint, apiKey: status.ANON_KEY, body: payload, copies: count });
  const body = (action, extra) => ({ action, request_id: randomUUID(),
    correlation_id: randomUUID(), idempotency_key: randomUUID(), ...extra });
  const existingB = sql(`select id from public.secure_redemption_requests where restaurant_id='${b.restaurantId}'
    order by requested_at desc limit 1`);
  if (!existingB) {
    const bGiftId = sql(`select id from public.customer_rewards where restaurant_id='${b.restaurantId}'
      and gift_type='birthday' and status='active' order by created_at limit 1`);
    assert.match(bGiftId, /^[0-9a-f-]{36}$/);
    const bStarted = (await post(foreignCustomer.page, body("start", {
      restaurant_slug: b.slug, source_type: "gift", entitlement_id: bGiftId,
    })))[0];
    assert.equal(bStarted.status, 200, "B_OWN_GIFT_START_FAILED");
  }
  if (process.env.D3B3_EXPIRED_GIFT === "1") {
    sql(`update public.customer_rewards set valid_from=statement_timestamp()-interval '2 days',
      valid_until=statement_timestamp()-interval '1 day' where id='${entitlementId}';`);
    const before = allPublicFingerprints();
    const expired = (await post(customer.page, body("start", {
      restaurant_slug: a.slug, source_type: "gift", entitlement_id: entitlementId,
    })))[0];
    assert.equal(expired.status, 409, "EXPIRED_GIFT_TOKEN_ACCEPTED");
    assert.deepEqual(allPublicFingerprints(), before, "EXPIRED_GIFT_ATTEMPT_WROTE_PUBLIC_TABLE");
    console.log("D3B3_BROWSER_EXPIRED_GIFT_TOKEN_FAIL_CLOSED_ALL_133_TABLES_IDENTICAL_PASS");
    await Promise.all([customer, owner, staff, foreignStaff, foreignCustomer, wrongCustomer]
      .map(({ context }) => context.close()));
  } else {
  const started = (await post(customer.page, body("start", {
    restaurant_slug: a.slug, source_type: "gift", entitlement_id: entitlementId,
  })))[0];
  assert.equal(started.status, 200, "BROWSER_GIFT_START_FAILED");
  assert.equal(started.data.status, "REQUESTED");
  const redemptionId = started.data.redemption_id;
  const correlationId = started.data.correlation_id;
  assert.match(redemptionId, /^[0-9a-f-]{36}$/);
  const beforeWrongToken = process.env.D3B3_FULL_FP === "1" ? allPublicFingerprints() : null;
  const wrongCustomerStart = (await post(wrongCustomer.page, body("start", {
    restaurant_slug: a.slug, source_type: "gift", entitlement_id: entitlementId,
  })))[0];
  assert.equal(wrongCustomerStart.status, 409, "WRONG_CUSTOMER_GIFT_TOKEN_ACCEPTED");
  const foreignCustomerStart = (await post(foreignCustomer.page, body("start", {
    restaurant_slug: a.slug, source_type: "gift", entitlement_id: entitlementId,
  })))[0];
  assert.equal(foreignCustomerStart.status, 409, "FOREIGN_CUSTOMER_GIFT_TOKEN_ACCEPTED");
  if (beforeWrongToken) assert.deepEqual(allPublicFingerprints(), beforeWrongToken,
    "WRONG_GIFT_TOKEN_CHANGED_PUBLIC_TABLE");
  console.log("D3B3_BROWSER_WRONG_CUSTOMER_AND_FOREIGN_GIFT_TOKEN_FAIL_CLOSED_PASS");
  const queueRead = async (page, slug) => page.evaluate(async ({ apiUrl, apiKey, restaurantSlug }) => {
    const session = JSON.parse(localStorage.getItem("sb-127-auth-token") || "null");
    const response = await fetch(`${apiUrl}/rest/v1/rpc/get_secure_redemption_queue`, {
      method: "POST", headers: { apikey: apiKey,
        authorization: `Bearer ${session.access_token}`, "content-type": "application/json" },
      body: JSON.stringify({ input_restaurant_slug: restaurantSlug }),
    });
    return { status: response.status, data: await response.json() };
  }, { apiUrl: status.API_URL, apiKey: status.ANON_KEY, restaurantSlug: slug });
  const bReadsA = await queueRead(foreignStaff.page, a.slug);
  assert.notEqual(bReadsA.status, 200, "FOREIGN_STAFF_QUEUE_LEAK");
  assert.equal(JSON.stringify(bReadsA.data).includes(redemptionId), false, "FOREIGN_STAFF_REQUEST_ID_LEAK");
  const bOwnQueue = await queueRead(foreignStaff.page, b.slug);
  assert.equal(bOwnQueue.status, 200);
  assert.equal(JSON.stringify(bOwnQueue.data).includes(redemptionId), false, "OWN_QUEUE_CROSS_TENANT_LEAK");
  const aReadsB = await queueRead(owner.page, b.slug);
  assert.notEqual(aReadsB.status, 200, "FOREIGN_OWNER_QUEUE_LEAK");
  console.log("D3B3_BROWSER_FOREIGN_QUEUE_READ_BLOCKED_OWN_QUEUE_SCOPED_PASS");

  if (process.env.D3B3_LAYOUT === "1") {
    const widths = [320, 375, 390, 430, 767, 768, 1024, 1440];
    await Promise.all([customer, owner, staff, foreignStaff, foreignCustomer, wrongCustomer].map(({ context }) => context.close()));
    await browser.close();
    browser = null;
    for (const [engineName, launcher] of [["CHROMIUM", chromium], ["WEBKIT", webkit]]) {
      const engine = await launcher.launch({ headless: true });
      try {
        const views = await Promise.all(widths.map(async (width) => {
          const context = await engine.newContext({ viewport: { width, height: 900 } });
          await context.route("**/*", (route) => ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname)
            ? route.continue() : route.abort());
          await context.addInitScript((value) => {
            localStorage.setItem("sb-127-auth-token", JSON.stringify(value));
            localStorage.setItem("wuxuai.ui-language", "de");
          }, customerSession);
          const page = await context.newPage();
          await page.goto(`http://127.0.0.1:4180/customer/${a.slug}?token=${encodeURIComponent(joined.data.customer_token)}`,
            { waitUntil: "networkidle" });
          if (await page.locator(".app-drawer-overlay").count()) await page.keyboard.press("Escape");
          await page.locator(".premium-active-code").click();
          await page.locator("#secure-redemption-pin").waitFor();
          const staffContext = await engine.newContext({ viewport: { width, height: 900 } });
          await staffContext.route("**/*", (route) => ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname)
            ? route.continue() : route.abort());
          await staffContext.addInitScript((value) => {
            localStorage.setItem("sb-127-auth-token", JSON.stringify(value));
            localStorage.setItem("wuxuai.ui-language", "de");
          }, aStaffSession);
          const staffPage = await staffContext.newPage();
          await staffPage.goto(`http://127.0.0.1:4180/staff/${a.slug}`, { waitUntil: "networkidle" });
          await staffPage.locator(".secure-redemption-queue-image").first().waitFor();
          return { width, context, page, staffContext, staffPage };
        }));
        const sample = async ({ page, staffPage, width }) => {
          const customerLayout = await page.evaluate((expectedWidth) => {
          const box = (selector) => {
            const element = document.querySelector(selector);
            if (!element) throw new Error(`LAYOUT_ELEMENT_MISSING:${selector}`);
            const rect = element.getBoundingClientRect();
            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
          };
          const media = box(".premium-presentation-image");
          const pin = box("#secure-redemption-pin");
          const countdown = box(".premium-presentation-countdown");
          const cancel = box(".premium-presentation-window button:last-of-type");
          return { media, pin, countdown, cancel,
            overflow: document.documentElement.scrollWidth > expectedWidth,
            ratio: getComputedStyle(document.querySelector(".premium-presentation-image")).aspectRatio };
          }, width);
          const queueLayout = await staffPage.evaluate((expectedWidth) => {
            const media = document.querySelector(".secure-redemption-queue-image")?.getBoundingClientRect();
            const card = document.querySelector(".secure-redemption-queue-image")?.closest("article");
            const buttons = [...(card?.querySelectorAll("button") ?? [])].map((button) => button.getBoundingClientRect());
            if (!media || !card || buttons.length < 2) throw new Error("STAFF_QUEUE_LAYOUT_MISSING");
            const rect = (value) => ({ x: value.x, y: value.y, width: value.width, height: value.height });
            return { media: rect(media), card: rect(card.getBoundingClientRect()),
              buttons: buttons.map(rect), overflow: document.documentElement.scrollWidth > expectedWidth };
          }, width);
          return { ...customerLayout, queue: queueLayout };
        };
        await new Promise((resolve) => setTimeout(resolve, 12000));
        const beforePolling = allPublicFingerprints();
        await Promise.all(views.flatMap(({ page, staffPage }) => [page, staffPage].map((target) =>
          target.evaluate(() => {
            window.__d3b3LayoutShifts = 0;
            window.__d3b3ShiftSources = [];
            if (!PerformanceObserver.supportedEntryTypes.includes("layout-shift")) return;
            const observer = new PerformanceObserver((list) => {
              for (const entry of list.getEntries()) {
                if (!entry.hadRecentInput && entry.value > 0) {
                  window.__d3b3LayoutShifts += entry.value;
                  window.__d3b3ShiftSources.push(...(entry.sources ?? []).map((source) => {
                    const node = source.node;
                    return `${node?.nodeName ?? "UNKNOWN"}.${typeof node?.className === "string" ? node.className.slice(0, 80) : ""}`
                      + `:${Math.round(source.previousRect.y)}→${Math.round(source.currentRect.y)}`
                      + `:${Math.round(source.previousRect.height)}→${Math.round(source.currentRect.height)}`;
                  }));
                }
              }
            });
            observer.observe({ type: "layout-shift", buffered: false });
          }))));
        const bases = await Promise.all(views.map(sample));
        for (let tick = 0; tick < (process.env.D3B3_LAYOUT_DIAG === "1" ? 4 : 20); tick++) {
          await new Promise((resolve) => setTimeout(resolve, 5100));
          const current = await Promise.all(views.map(sample));
          for (let i = 0; i < views.length; i++) {
            assert.equal(current[i].overflow, false, `${engineName}/${widths[i]}:OVERFLOW`);
            assert.equal(current[i].queue.overflow, false, `${engineName}/${widths[i]}:QUEUE_OVERFLOW`);
            assert.equal(current[i].ratio, "16 / 9", `${engineName}/${widths[i]}:RATIO`);
            assert.ok(current[i].cancel.height >= 44, `${engineName}/${widths[i]}:TOUCH`);
            assert.ok(current[i].queue.buttons.every((button) => button.height >= 44),
              `${engineName}/${widths[i]}:QUEUE_TOUCH`);
            for (const key of ["media", "pin", "countdown", "cancel"])
              for (const metric of ["x", "y", "width", "height"])
                assert.ok(Math.abs(current[i][key][metric] - bases[i][key][metric]) <= 1,
                  `${engineName}/${widths[i]}:${key}:${metric}:LAYOUT_SHIFT:${bases[i][key][metric]}→${current[i][key][metric]}`);
            for (const key of ["media", "card"])
              for (const metric of ["x", "y", "width", "height"])
                assert.ok(Math.abs(current[i].queue[key][metric] - bases[i].queue[key][metric]) <= 1,
                  `${engineName}/${widths[i]}:QUEUE_${key}_${metric}_SHIFT`);
          }
        }
        const observedPages = views.flatMap(({ page, staffPage }) => [page, staffPage]);
        const shiftScores = await Promise.all(observedPages.map((target) =>
          target.evaluate(() => ({ supported: PerformanceObserver.supportedEntryTypes.includes("layout-shift"),
            score: window.__d3b3LayoutShifts, sources: [...new Set(window.__d3b3ShiftSources)].slice(0, 8) }))));
        if (shiftScores.some((result) => result.supported && result.score > 0))
          console.log(`D3B3_${engineName}_SHIFT_GEOMETRY_DIAGNOSTIC ${JSON.stringify(shiftScores.map((result, index) => ({
            width: widths[Math.floor(index / 2)], role: index % 2 ? "STAFF" : "CUSTOMER",
            score: Number(result.score.toFixed(6)), sources: result.sources,
          })).filter((result) => result.score > 0))}`);
        assert.ok(shiftScores.every((result) => !result.supported || result.score === 0),
          `${engineName}:UNEXPECTED_LAYOUT_SHIFT_EVENT`);
        const afterPolling = allPublicFingerprints();
        const pollingDiff = [...afterPolling].filter(([name, digest]) => digest !== beforePolling.get(name))
          .map(([name]) => name).sort();
        console.log(`D3B3_${engineName}_POLLING_PUBLIC_TABLE_DIFF ${JSON.stringify(pollingDiff)}`);
        assert.deepEqual(pollingDiff, [], `${engineName}:LAYOUT_POLLING_WROTE_PUBLIC_TABLE`);
        await Promise.all(views.flatMap(({ context, staffContext }) => [context.close(), staffContext.close()]));
        console.log(`D3B3_${engineName}_8_WIDTHS_20_STAFF_POLLS_CUSTOMER_CLOCK_RERENDERS_STABLE_PASS observer_supported=${shiftScores.filter((result) => result.supported).length}`);
      } finally { await engine.close(); }
    }
    console.log("D3B3_LAYOUT_POLLING_ZERO_BUSINESS_WRITES_PASS");
  } else if (process.env.D3B3_CLOSE === "1") {
    await customer.page.goto(`http://127.0.0.1:4180/customer/${a.slug}?token=${encodeURIComponent(joined.data.customer_token)}`,
      { waitUntil: "networkidle" });
    const resume = customer.page.locator(".premium-active-code");
    await resume.waitFor({ timeout: 15000 });
    const fingerprint = allPublicFingerprints;
    for (const method of ["footer", "x", "escape"]) {
      await resume.click();
      await customer.page.locator("#secure-redemption-pin").waitFor();
      const before = fingerprint();
      if (method === "footer") await customer.page.locator(".app-drawer-footer button").last().click();
      else if (method === "x") await customer.page.locator(".app-drawer-close").last().click();
      else await customer.page.keyboard.press("Escape");
      await customer.page.locator("#secure-redemption-pin").waitFor({ state: "hidden" });
      assert.deepEqual(fingerprint(), before, `UI_${method}_WROTE_PUBLIC_TABLE`);
      assert.equal(sql(`select status from public.secure_redemption_requests where id='${redemptionId}'`), "REQUESTED");
      console.log(`D3B3_UI_${method.toUpperCase()}_ZERO_BUSINESS_WRITES_PASS`);
    }
    await resume.click();
    const beforeCancel = fingerprint();
    await customer.page.getByRole("button", { name: /Antrag abbrechen|Cancel request/ }).click();
    for (let attempt = 0; attempt < 50; attempt++) {
      if (sql(`select status from public.secure_redemption_requests where id='${redemptionId}'`) === "CANCELLED") break;
      await customer.page.waitForTimeout(100);
    }
    assert.equal(sql(`select status from public.secure_redemption_requests where id='${redemptionId}'`), "CANCELLED");
    assert.equal(sql(`select count(*) from public.secure_redemption_audit where redemption_id='${redemptionId}' and event_type='CANCELLED'`), "1");
    assert.equal(sql(`select count(*) from public.redemption_activity_journal where source_id=(select presentation_id from public.secure_redemption_requests where id='${redemptionId}')`), "0");
    const afterCancel = fingerprint();
    const cancelDiff = [...afterCancel].filter(([name, digest]) => digest !== beforeCancel.get(name)).map(([name]) => name).sort();
    assert.deepEqual(cancelDiff, ["customer_rewards", "gift_redemption_presentations",
      "secure_redemption_audit", "secure_redemption_requests"], "TRUE_CANCEL_UNEXPECTED_TABLE_DIFF");
    console.log("D3B3_TRUE_CANCEL_ONCE_NO_CONSUMPTION_PASS");
    await Promise.all([customer, owner, staff, foreignStaff, foreignCustomer, wrongCustomer].map(({ context }) => context.close()));
  } else if (process.env.D3B3_EXPIRY === "1") {
    const beforeJournal = sql(`select count(*) from public.redemption_activity_journal where restaurant_id='${a.restaurantId}'`);
    const beforePoints = sql(`select coalesce(sum(points_balance),0) from public.customers where restaurant_id='${a.restaurantId}'`);
    // Local synthetic clock fixture only: retain the database's 15-minute invariant.
    sql(`update public.secure_redemption_requests set requested_at=statement_timestamp()-interval '16 minutes',
      expires_at=statement_timestamp()-interval '1 minute' where id='${redemptionId}';`);
    sql(`update public.gift_redemption_presentations
      set activated_at=statement_timestamp()-interval '16 minutes',
        expires_at=statement_timestamp()-interval '1 minute'
      where id=(select presentation_id from public.secure_redemption_requests where id='${redemptionId}');`);
    const beforeExpiry = allPublicFingerprints();
    for (const [action, page, extra] of [
      ["verify_pin", customer.page, { pin: "000000" }],
      ["swipe", customer.page, {}],
      ["approve", staff.page, {}],
      ["approve", owner.page, {}],
    ]) {
      const result = (await post(page, body(action, {
        redemption_id: redemptionId, correlation_id: correlationId, ...extra,
      })))[0];
      assert.equal(result.status, 409, `EXPIRED_${action}_NOT_BLOCKED`);
    }
    assert.equal(sql(`select status from public.secure_redemption_requests where id='${redemptionId}'`), "EXPIRED");
    assert.notEqual(sql(`select status from public.customer_rewards where id='${entitlementId}'`), "redeemed");
    assert.equal(sql(`select count(*) from public.redemption_activity_journal where restaurant_id='${a.restaurantId}'`), beforeJournal);
    assert.equal(sql(`select coalesce(sum(points_balance),0) from public.customers where restaurant_id='${a.restaurantId}'`), beforePoints);
    const afterExpiry = allPublicFingerprints();
    const expiryDiff = [...afterExpiry].filter(([name, digest]) => digest !== beforeExpiry.get(name)).map(([name]) => name).sort();
    assert.ok(JSON.stringify(expiryDiff) === JSON.stringify(["secure_redemption_requests"]) ||
      JSON.stringify(expiryDiff) === JSON.stringify(["audit_log", "customer_rewards",
        "gift_redemption_presentations", "secure_redemption_requests"]),
    `EXPIRED_UNEXPECTED_TABLE_DIFF:${expiryDiff.join(",")}`);
    const cooldown = (await post(customer.page, body("start", {
      restaurant_slug: a.slug, source_type: "gift", entitlement_id: entitlementId,
    })))[0];
    assert.equal(cooldown.status, 409);
    assert.equal(cooldown.data.error_code, "REDEMPTION_RETRY_COOLDOWN");
    const afterCooldown = allPublicFingerprints();
    const cooldownDiff = [...afterCooldown].filter(([name, digest]) => digest !== afterExpiry.get(name)).map(([name]) => name).sort();
    assert.ok(cooldownDiff.length === 0 ||
      JSON.stringify(cooldownDiff) === JSON.stringify(["audit_log", "customer_rewards", "gift_redemption_presentations"]),
    `COOLDOWN_UNEXPECTED_TABLE_DIFF:${cooldownDiff.join(",")}`);
    assert.notEqual(sql(`select status from public.customer_rewards where id='${entitlementId}'`), "redeemed");
    assert.equal(sql(`select count(*) from public.redemption_activity_journal where restaurant_id='${a.restaurantId}'`), beforeJournal);
    if (cooldownDiff.length) console.log("D3B3_SYSTEM_MINUTE_CRON_EXPIRED_PRESENTATION_REARMED_GIFT_WITHOUT_CONSUMPTION_PASS");
    sql(`update public.secure_redemption_requests set completed_at=statement_timestamp()-interval '61 seconds'
      where id='${redemptionId}' and status='EXPIRED';`);
    const restart = (await post(customer.page, body("start", {
      restaurant_slug: a.slug, source_type: "gift", entitlement_id: entitlementId,
    })))[0];
    assert.equal(restart.status, 200, "RESTART_AFTER_COOLDOWN_FAILED");
    assert.equal(restart.data.status, "REQUESTED");
    console.log("D3B3_SERVER_EXPIRY_15M_PIN_SWIPE_STAFF_OWNER_BLOCKED_ZERO_CONSUMPTION_COOLDOWN_RESTART_PASS");
    await Promise.all([customer, owner, staff, foreignStaff, foreignCustomer, wrongCustomer].map(({ context }) => context.close()));
  } else {

  const protectedFingerprint = () => sql(`select md5(concat_ws('|',
    (select md5(coalesce(string_agg(to_jsonb(t)::text,'|' order by t.id::text),'')) from public.secure_redemption_requests t),
    (select md5(coalesce(string_agg(to_jsonb(t)::text,'|' order by t.id::text),'')) from public.secure_redemption_audit t),
    (select md5(coalesce(string_agg(to_jsonb(t)::text,'|' order by t.id::text),'')) from public.customer_rewards t),
    (select md5(coalesce(string_agg(to_jsonb(t)::text,'|' order by t.id::text),'')) from public.gift_redemption_presentations t),
    (select md5(coalesce(string_agg(to_jsonb(t)::text,'|' order by t.id::text),'')) from public.redemption_activity_journal t),
    (select md5(coalesce(string_agg(to_jsonb(t)::text,'|' order by t.id::text),'')) from public.customers t)))`);
  const beforeForeign = protectedFingerprint();
  let beforeForeignAll = process.env.D3B3_FULL_FP === "1" ? allPublicFingerprints() : null;
  let beforeRows = beforeForeignAll ? rowSnapshot() : null;
  for (const action of ["approve", "reject", "cancel"]) {
    const foreign = (await post(foreignStaff.page, body(action, {
      redemption_id: redemptionId, correlation_id: correlationId,
    })))[0];
    assert.equal(foreign.status, 409, `FOREIGN_STAFF_${action}_NOT_BLOCKED`);
    assert.equal(foreign.data.code, "REDEMPTION_REQUEST_BLOCKED");
  }
  const foreignPin = (await post(foreignCustomer.page, body("verify_pin", {
    redemption_id: redemptionId, correlation_id: correlationId, pin: "000000",
  })))[0];
  assert.equal(foreignPin.status, 409, "FOREIGN_CUSTOMER_PIN_NOT_BLOCKED");
  const bRedemptionId = sql(`select id from public.secure_redemption_requests where restaurant_id='${b.restaurantId}' order by requested_at desc limit 1`);
  assert.match(bRedemptionId, /^[0-9a-f-]{36}$/);
  const aOnB = (await post(owner.page, body("approve", {
    redemption_id: bRedemptionId, correlation_id: randomUUID(),
  })))[0];
  assert.equal(aOnB.status, 409, "FOREIGN_OWNER_NOT_BLOCKED");
  const afterForeignProtected = protectedFingerprint();
  if (afterForeignProtected !== beforeForeign && beforeForeignAll) {
    const afterCron = allPublicFingerprints();
    const cronDiff = [...afterCron].filter(([name, digest]) => digest !== beforeForeignAll.get(name)).map(([name]) => name).sort();
    assert.deepEqual(cronDiff, ["audit_log", "customer_rewards", "gift_redemption_presentations"],
      "FOREIGN_STAFF_WROTE_BUSINESS_DATA");
    assert.ok(Number(sql(`select count(*) from public.audit_log where event_type='GIFT_REDEMPTION_PRESENTATION_EXPIRED'
      and created_at>statement_timestamp()-interval '2 minutes'`)) > 0,
    "CRON_EXPIRY_AUDIT_MISSING");
    assert.equal(sql(`select status from public.secure_redemption_requests where id='${redemptionId}'`), "REQUESTED");
    assert.equal(sql(`select status from public.customer_rewards where id='${entitlementId}'`), "redemption_started");
    beforeForeignAll = afterCron;
    beforeRows = rowSnapshot();
    console.log("D3B3_CONCURRENT_MINUTE_CRON_EXPIRY_ISOLATED_FROM_FOREIGN_ATTEMPTS_PASS");
  } else {
    assert.equal(afterForeignProtected, beforeForeign, "FOREIGN_STAFF_WROTE_BUSINESS_DATA");
  }
  if (beforeForeignAll) {
    assert.deepEqual(allPublicFingerprints(), beforeForeignAll, "FOREIGN_TENANT_CHANGED_PUBLIC_TABLE");
    console.log(`D3B3_CROSS_TENANT_ALL_${beforeForeignAll.size}_PUBLIC_TABLE_FINGERPRINTS_IDENTICAL_PASS`);
  }
  console.log("D3B3_BROWSER_CROSS_TENANT_STAFF_CUSTOMER_OWNER_FAIL_CLOSED_ZERO_WRITES_PASS");

  if (actor === "customer") {
    const rotated = (await post(owner.page, body("rotate_pin", { restaurant_slug: a.slug })))[0];
    assert.equal(rotated.status, 200);
    assert.match(rotated.data.pin, /^\d{6}$/);
    const verified = (await post(customer.page, body("verify_pin", {
      redemption_id: redemptionId, correlation_id: correlationId, pin: rotated.data.pin,
    })))[0];
    assert.equal(verified.status, 200);
    assert.equal(verified.data.status, "PIN_VERIFIED");
  }
  const finish = body(actor === "customer" ? "swipe" : "approve", {
    redemption_id: redemptionId, correlation_id: correlationId,
  });
  const results = await post(actor === "customer" ? customer.page : actor === "staff" ? staff.page : owner.page,
    finish, 24);
  assert.equal(results.filter((item) => item.status === 200 && item.data.success && !item.data.already_confirmed).length, 1,
    "BROWSER_24_SWIPES_NOT_EXACTLY_ONE_FINALIZATION");
  assert.equal(sql(`select status from public.secure_redemption_requests where id='${redemptionId}'`), "REDEEMED");
  assert.equal(sql(`select count(*) from public.redemption_activity_journal where source_id=(select presentation_id from public.secure_redemption_requests where id='${redemptionId}')`), "1");
  assert.equal(sql(`select count(*) from public.secure_redemption_audit where redemption_id='${redemptionId}' and event_type='REDEEMED'`), "1");
  assert.equal(sql(`select status from public.customer_rewards where id='${entitlementId}'`), "redeemed");
  const consumedAgain = (await post(customer.page, body("start", {
    restaurant_slug: a.slug, source_type: "gift", entitlement_id: entitlementId,
  })))[0];
  assert.equal(consumedAgain.status, 409, "CONSUMED_GIFT_RESTARTED");
  console.log("D3B3_BROWSER_CONSUMED_GIFT_TOKEN_FAIL_CLOSED_PASS");
  if (beforeForeignAll) {
    const afterAll = allPublicFingerprints();
    const changed = [...afterAll].filter(([name, digest]) => digest !== beforeForeignAll.get(name)).map(([name]) => name);
    // Existing append-only audit, capacity-evaluation and Kassa triggers are
    // part of the canonical redemption finalization, not unrelated writes.
    const expected = ["audit_log", "capacity_warning_states", "customer_rewards",
      "gift_redemption_presentations", "kassa_redemption_workflows",
      "redemption_activity_journal", "secure_redemption_audit",
      "secure_redemption_requests",
      ...(actor === "customer" ? ["redemption_confirmation_pins", "secure_redemption_pin_attempts"] : [])].sort();
    assert.deepEqual(changed.sort(), expected, `UNEXPECTED_PUBLIC_TABLE_DIFF:${changed.join(",")}`);
    const afterRows = rowSnapshot();
    for (const table of expected) {
      const prior = beforeRows.get(table);
      const next = afterRows.get(table);
      for (const [key, oldRow] of prior) assert.ok(next.has(key), `${table}:UNEXPECTED_DELETE`);
      for (const [key, newRow] of next) {
        const oldRow = prior.get(key);
        if (oldRow && JSON.stringify(oldRow) === JSON.stringify(newRow)) continue;
        if (newRow.restaurant_id) assert.equal(newRow.restaurant_id, a.restaurantId, `${table}:FOREIGN_TENANT_ROW`);
        if (table === "customer_rewards") assert.equal(key, entitlementId, "UNRELATED_GIFT_CHANGED");
        if (["secure_redemption_audit", "secure_redemption_pin_attempts", "secure_redemption_requests"].includes(table))
          assert.equal(table === "secure_redemption_requests" ? key : newRow.redemption_id,
            redemptionId, `${table}:UNRELATED_REQUEST_CHANGED`);
        const columns = oldRow ? Object.keys(newRow).filter((column) => JSON.stringify(newRow[column]) !== JSON.stringify(oldRow[column]))
          : ["<INSERT>"];
        console.log(`D3B3_ALLOWED_ROW_DIFF ${table} ${key} ${columns.join(",")}`);
      }
    }
    console.log(`D3B3_FINALIZATION_ALL_${afterAll.size}_PUBLIC_TABLES_EXACT_ALLOWLIST_PASS:${changed.join(",")}`);
  }
  console.log(`D3B3_BROWSER_24_${actor.toUpperCase()}_${giftType.toUpperCase()}_ONE_REDEMPTION_PASS`);
  await customer.context.close();
  await owner.context.close();
  await staff.context.close();
  await foreignStaff.context.close();
  await foreignCustomer.context.close();
  await wrongCustomer.context.close();
  }
  }
} finally {
  if (browser) await browser.close();
  if (vite && vite.exitCode === null) {
    vite.kill("SIGTERM");
    await new Promise((resolve) => vite.once("exit", resolve));
  }
}
