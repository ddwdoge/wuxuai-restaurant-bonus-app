import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
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
const targetTenant = process.env.D3B3_TENANT === "B" ? "B" : "A";
const targetEngine = process.env.D3B3_ENGINE === "WEBKIT" ? "WEBKIT" : "CHROMIUM";
const fixture = sql(`select f.restaurant_id,r.slug,
  (select a.auth_user_id from public.customer_accounts a
    join public.customer_account_memberships m on m.account_id=a.id
    where m.restaurant_id=f.restaurant_id limit 1),
  (select s.auth_user_id from public.staff_members s where s.restaurant_id=f.restaurant_id and s.active limit 1),
  f.owner_id from public.d3b3_historical_fixture f join public.restaurants r on r.id=f.restaurant_id where f.label='${targetTenant}'`).split("|");
const [restaurantId, slug, customerId, staffId, ownerId] = fixture;
const targetGift = process.env.D3B3_GIFT === "welcome" ? "welcome" : "birthday";
const targetTitle = `D3B3 ${targetTenant} ${targetGift === "welcome" ? "Welcome" : "Birthday"}`;
const initiallyRedeemed = Number(sql(`select count(*) from public.secure_redemption_requests where source_type='gift' and status='REDEEMED' and restaurant_id='${restaurantId}'`));
for (const id of [restaurantId, customerId, staffId, ownerId]) assert.match(id, /^[0-9a-f-]{36}$/);
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(status.API_URL, status.ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
const sessions = {};
for (const [role, userId] of [["customer", customerId], ["staff", staffId], ["owner", ownerId]]) {
  const password = randomUUID() + randomUUID();
  const email = sql(`select email from auth.users where id='${userId}'`);
  const changed = await admin.auth.admin.updateUserById(userId, { password });
  assert.equal(changed.error, null, `${role}_PASSWORD_SETUP_FAILED`);
  const login = await anon.auth.signInWithPassword({ email, password });
  assert.equal(login.error, null, `${role}_LOGIN_FAILED`);
  sessions[role] = login.data.session;
}
const customerClient = createClient(status.API_URL, status.ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${sessions.customer.access_token}` } } });
const opened = await customerClient.rpc("open_customer_account_membership", { input_restaurant_id: restaurantId });
assert.equal(opened.error, null, `CUSTOMER_MEMBERSHIP_OPEN_FAILED:${opened.error?.code ?? ""}`);
assert.ok(opened.data?.customer_token);
const token = opened.data.customer_token;
if (process.env.D3B3_UNLOCK === "1") {
  const ownerClient = createClient(status.API_URL, status.ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${sessions.owner.access_token}` } } });
  const pinResult = await ownerClient.rpc("get_today_restaurant_pin", { input_restaurant_id: restaurantId });
  assert.equal(pinResult.error, null, `DAILY_PIN_OWNER_READ_FAILED:${pinResult.error?.code ?? ""}`);
  assert.match(pinResult.data?.pin_code, /^\d{4}$/);
  const qr = await customerClient.rpc("create_customer_points_credit_qr", {
    input_restaurant_slug: slug, input_customer_token: token,
  });
  assert.equal(qr.error, null, `CUSTOMER_POINTS_QR_FAILED:${qr.error?.code ?? ""}`);
  const staffClient = createClient(status.API_URL, status.ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${sessions.staff.access_token}` } } });
  const preview = await staffClient.rpc("preview_restaurant_controlled_points", {
    input_restaurant_id: restaurantId, input_qr_reference: qr.data.qr_token,
    input_amount_cents: 1000,
  });
  assert.equal(preview.error, null, `POINT_PREVIEW_FAILED:${preview.error?.code ?? ""}`);
  const collected = await staffClient.rpc("confirm_restaurant_controlled_points", {
    input_restaurant_id: restaurantId, input_qr_reference: qr.data.qr_token,
    input_amount_cents: 1000, input_daily_pin: pinResult.data.pin_code,
    input_idempotency_key: randomUUID(),
  });
  assert.equal(collected.error, null, `POINT_COLLECTION_FAILED:${collected.error?.code ?? ""}`);
  assert.equal(sql("select status from public.customer_rewards where restaurant_id='" + restaurantId + "' and gift_type='welcome'"), "active");
  console.log("D3B3_WELCOME_UNLOCKED_BY_CANONICAL_DAILY_PIN_COLLECTION_PASS");
}

let vite;
const browsers = [];
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
  for (const [name, launcher] of [["CHROMIUM", chromium], ["WEBKIT", webkit]]) {
    const browser = await launcher.launch({ headless: true });
    browsers.push(browser);
    const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
    await context.route("**/*", (route) => ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname)
      ? route.continue() : route.abort());
    await context.addInitScript((session) => {
      localStorage.setItem("sb-127-auth-token", JSON.stringify(session));
      localStorage.setItem("wuxuai.ui-language", "de");
    }, sessions.customer);
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:4180/customer/${slug}?token=${encodeURIComponent(token)}`, { waitUntil: "networkidle" });
    const welcome = page.getByText(`D3B3 ${targetTenant} Welcome`, { exact: true });
    const birthday = page.getByText(`D3B3 ${targetTenant} Birthday`, { exact: true });
    if (sql("select count(*) from public.customer_rewards where restaurant_id='" + restaurantId + "' and gift_type='welcome' and status in ('active','locked')") !== "0") {
      await welcome.first().waitFor({ timeout: 15000 });
    }
    if (sql("select count(*) from public.customer_rewards where restaurant_id='" + restaurantId + "' and gift_type='birthday' and status='redeemed'") === "0") {
      await birthday.first().waitFor({ timeout: 15000 });
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    console.log(`D3B3_${name}_ACTIVE_GIFT_CUSTOMER_VISIBLE_PASS`);
    if (name === targetEngine) {
      if (process.env.D3B3_OWNER_DIAG === "1") {
        const ownerContext = await browser.newContext({ viewport: { width: 390, height: 900 } });
        await ownerContext.route("**/*", (route) => ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname)
          ? route.continue() : route.abort());
        await ownerContext.addInitScript((session) => localStorage.setItem("sb-127-auth-token", JSON.stringify(session)), sessions.owner);
        const ownerPage = await ownerContext.newPage();
        await ownerPage.goto(`http://127.0.0.1:4180/staff/${slug}`, { waitUntil: "networkidle" });
        const safeText = (await ownerPage.locator("main").innerText()).slice(0, 400)
          .replace(/\b\d{6}\b/g, "[REDACTED]");
        console.log(`D3B3_OWNER_SAFE_VIEW ${JSON.stringify(safeText)}`);
        await ownerContext.close();
        await context.close();
        continue;
      }
      if (await page.locator(".app-drawer-overlay").count()) {
        await page.keyboard.press("Escape");
        await page.locator(".app-drawer-overlay").waitFor({ state: "hidden" });
      }
      if (process.env.D3B3_RESUME === "1") {
        await page.locator(".premium-active-code").waitFor();
        await page.locator(".premium-active-code").click();
      } else {
        await page.getByRole("button", { name: "Einlösen", exact: true }).first().click();
        const details = page.getByRole("button", { name: `${targetTitle}: Details` });
        await details.waitFor();
        await details.evaluate((element) => element.scrollIntoView({ block: "center", inline: "center" }));
        await details.click();
      }
      if (process.env.D3B3_DIAG === "1") {
        const labels = await page.getByRole("button").evaluateAll((elements) => elements
          .map((element) => (element.getAttribute("aria-label") || element.textContent || "").trim())
          .filter((label) => /einlös|geschenk|welcome/i.test(label))
          .map((label) => label.replace(/\b\d{6}\b/g, "[REDACTED]")));
        console.log(`D3B3_SAFE_BUTTON_LABELS ${JSON.stringify(labels)}`);
        continue;
      }
      if (process.env.D3B3_RESUME !== "1") await page.getByRole("button", { name: /Jetzt einlösen/ }).click();
      await page.locator("#secure-redemption-pin").waitFor();
      assert.equal(sql("select count(*) from public.secure_redemption_requests where source_type='gift' and status='REQUESTED'"), "1");
      console.log(`D3B3_CHROMIUM_${targetGift.toUpperCase()}_REQUESTED_PASS`);

      const approverRole = process.env.D3B3_APPROVE === "staff" ? "staff" : "owner";
      const ownerContext = await browser.newContext({ viewport: { width: 390, height: 900 } });
      await ownerContext.route("**/*", (route) => ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname)
        ? route.continue() : route.abort());
      await ownerContext.addInitScript((session) => localStorage.setItem("sb-127-auth-token", JSON.stringify(session)), sessions[approverRole]);
      const ownerPage = await ownerContext.newPage();
      await ownerPage.goto(`http://127.0.0.1:4180/staff/${slug}`, { waitUntil: "networkidle" });
      if (process.env.D3B3_DIAG === "1") {
        const safeText = (await ownerPage.locator("main").innerText()).slice(0, 400)
          .replace(/\b\d{6}\b/g, "[REDACTED]");
        console.log(`D3B3_OWNER_SAFE_VIEW ${JSON.stringify(safeText)}`);
        await ownerContext.close();
        await context.close();
        continue;
      }
      await ownerPage.getByRole("heading", { name: /Offene Einlösungen|Open redemptions/ }).waitFor();
      if (approverRole === "staff") {
        const card = ownerPage.locator(".settings-info-card article").filter({ hasText: targetTitle });
        await card.getByRole("button", { name: /Bestätigen|Confirm/ }).click();
      } else {
        await ownerPage.getByRole("button", { name: /Redemption-PIN erneuern|Rotate redemption PIN/ }).click();
        const pin = await ownerPage.getByText(/Neue PIN – nur einmal sichtbar:|New PIN – shown only once:/).locator("strong").innerText();
        assert.match(pin, /^\d{6}$/);
        await page.locator("#secure-redemption-pin").fill(pin);
        await page.getByRole("button", { name: "PIN prüfen" }).click();
        const slider = page.getByRole("slider", { name: "Zum Einlösen nach rechts wischen" });
        await slider.waitFor();
        assert.equal(sql("select count(*) from public.secure_redemption_requests where source_type='gift' and status='PIN_VERIFIED'"), "1");
        await slider.focus();
        await page.keyboard.press("End");
      }
      for (let attempt = 0; attempt < 50; attempt++) {
        if (sql("select count(*) from public.secure_redemption_requests where source_type='gift' and status='REDEEMED' and restaurant_id='" + restaurantId + "'") === String(initiallyRedeemed + 1)) break;
        await page.waitForTimeout(100);
      }
      assert.equal(sql("select count(*) from public.secure_redemption_requests where source_type='gift' and status='REDEEMED' and restaurant_id='" + restaurantId + "'"), String(initiallyRedeemed + 1));
      assert.equal(sql("select count(*) from public.customer_rewards where restaurant_id='" + restaurantId + "' and gift_type='" + targetGift + "' and status='redeemed'"), "1");
      assert.equal(sql("select count(*) from public.redemption_activity_journal where restaurant_id='" + restaurantId + "' and source_type='gift_presentation'"), String(initiallyRedeemed + 1));
      assert.equal(sql("select count(*) from public.reward_redemption_events where restaurant_id='" + restaurantId + "'"), "0");
      console.log(`D3B3_${name}_${targetGift.toUpperCase()}_${approverRole === "staff" ? "STAFF" : "PIN_SWIPE"}_ONCE_REDEEMED_PASS`);
      await ownerContext.close();
    }
    await context.close();
  }
} finally {
  await Promise.all(browsers.map((browser) => browser.close()));
  if (vite && vite.exitCode === null) {
    vite.kill("SIGTERM");
    await new Promise((resolve) => vite.once("exit", resolve));
  }
}
