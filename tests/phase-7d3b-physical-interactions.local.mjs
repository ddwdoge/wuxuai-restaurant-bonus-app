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
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const [oldOwner, oldStaff, oldCustomer, restaurantId] = sql(`select
  (select user_id from public.restaurant_members where restaurant_id=f.restaurant_id and role='owner' limit 1),
  (select auth_user_id from public.staff_members where restaurant_id=f.restaurant_id and active limit 1),
  (select auth_user_id from public.customers where id=f.customer_id), f.restaurant_id
  from public.d3b_parallel_fixture f`).split("|");
for (const value of [oldOwner, oldStaff, oldCustomer, restaurantId]) assert.match(value, /^[0-9a-f-]{36}$/);
sql(`begin; set local session_replication_role=replica;
  insert into public.loyalty_settings(restaurant_id,organization_id,branch_id,loyalty_mode)
  select restaurant_id,organization_id,branch_id,'amount_based'
  from public.d3b_parallel_fixture f
  where not exists (select 1 from public.loyalty_settings s where s.restaurant_id=f.restaurant_id);
  commit;`);
const restaurantSlug = `d3b-${restaurantId.slice(0, 12)}`;
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
const publicClient = createClient(status.API_URL, status.ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
const password = randomUUID() + randomUUID();
const people = [];
for (const role of ["owner", "staff", "customer"]) {
  const email = `d3b-physical-${role}-${randomUUID()}@example.invalid`;
  const result = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(result.error, null, "LOCAL_AUTH_FIXTURE_FAILED");
  people.push({ id: result.data.user.id, email });
}
sql(`begin; set local session_replication_role=replica;
  update public.organizations set owner_id=${quote(people[0].id)} where owner_id=${quote(oldOwner)};
  update public.restaurants set owner_id=${quote(people[0].id)} where id=${quote(restaurantId)};
  update public.restaurant_members set user_id=${quote(people[0].id)} where restaurant_id=${quote(restaurantId)} and user_id=${quote(oldOwner)};
  update public.restaurant_members set user_id=${quote(people[1].id)} where restaurant_id=${quote(restaurantId)} and user_id=${quote(oldStaff)};
  update public.staff_members set auth_user_id=${quote(people[1].id)} where restaurant_id=${quote(restaurantId)} and auth_user_id=${quote(oldStaff)};
  update public.customers set auth_user_id=${quote(people[2].id)} where restaurant_id=${quote(restaurantId)} and auth_user_id=${quote(oldCustomer)};
  update public.customer_accounts set auth_user_id=${quote(people[2].id)}, email=${quote(people[2].email)} where auth_user_id=${quote(oldCustomer)};
  commit;`);
const sessions = [];
for (const person of people) {
  const result = await publicClient.auth.signInWithPassword({ email: person.email, password });
  assert.equal(result.error, null, "LOCAL_AUTH_SESSION_FAILED");
  sessions.push(result.data.session);
}
const snapshot = () => sql(`select jsonb_build_object(
  'requests',(select count(*) from public.secure_redemption_requests),
  'events',(select count(*) from public.reward_redemption_events),
  'points',(select coalesce(sum(points_balance),0) from public.customers))::text`);
if (process.env.D3B_MATRIX_ONLY === "1") {
  const probeClient = createClient(status.API_URL, status.ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${sessions[2].access_token}` } } });
  const probe = await probeClient.rpc("get_secure_redemption_status", {
    input_restaurant_slug: restaurantSlug, input_redemption_id: null,
  });
  console.log(`SWIPE_STATUS_PROBE error=${probe.error?.code ?? "NONE"} found=${probe.data?.found ?? false} status=${probe.data?.status ?? "NONE"}`);
}
const browsers = [];
let server;
let pin = "";
try {
  server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "4180", "--strictPort"], {
    env: { ...process.env, VITE_SUPABASE_URL: status.API_URL, VITE_SUPABASE_ANON_KEY: status.ANON_KEY },
    stdio: "ignore",
  });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch("http://127.0.0.1:4180")).ok) { ready = true; break; } } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready, "LOCAL_VITE_NOT_READY");
  const browser = await chromium.launch({ headless: true });
  browsers.push(browser);
  const openPage = async (role, index) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
    await context.route("**/*", (route) => ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname)
      ? route.continue() : route.abort());
    await context.addInitScript((session) => {
      localStorage.setItem("sb-127-auth-token", JSON.stringify(session));
      localStorage.setItem("wuxuai.ui-language", "de");
    }, sessions[index]);
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:4180/${role}/${restaurantSlug}`, { waitUntil: "networkidle" });
    for (let attempt = 0; attempt < 2; attempt++) {
      const retry = page.getByRole("button", { name: /Try again|Erneut versuchen/ });
      if (await retry.count()) await retry.first().click();
      else break;
      await page.waitForTimeout(500);
    }
    return { page, context };
  };
  if (process.env.D3B_REMAINING_ONLY === "1") {
    const waitForCount = async (query, expected, code) => {
      for (let attempt = 0; attempt < 50; attempt++) {
        if (sql(query) === expected) return;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.fail(code);
    };
    const openReward = async (title, occurrence = 0) => {
      const view = await openPage("customer", 2);
      await view.page.waitForTimeout(500);
      if (await view.page.locator(".app-drawer-overlay").count()) {
        await view.page.keyboard.press("Escape");
        await view.page.locator(".app-drawer-overlay").waitFor({ state: "hidden" });
      }
      await view.page.getByRole("button", { name: "Einlösen", exact: true }).first().click();
      const target = view.page.getByRole("button", { name: `${title}: Details` }).nth(occurrence);
      await target.waitFor();
      await target.evaluate((element) => element.scrollIntoView({ block: "center", inline: "center" }));
      await target.click();
      await view.page.getByRole("button", { name: /Jetzt einlösen/ }).click();
      await view.page.locator("#secure-redemption-pin").waitFor();
      return view;
    };
    let staff;
    if (process.env.D3B_OWNER_ONLY !== "1") {
    const staffCustomer = await openReward("D3B Other Reward");
    staff = await openPage("staff", 1);
    await staff.page.getByRole("heading", { name: "Offene Einlösungen" }).waitFor();
    const staffCard = staff.page.locator(".settings-info-card article").filter({ hasText: "D3B Other Reward" });
    await staffCard.getByRole("button", { name: "Bestätigen" }).click();
    await waitForCount("select count(*) from public.secure_redemption_requests where status='REDEEMED'", "2", "STAFF_APPROVAL_NOT_REDEEMED");
    assert.equal(sql("select count(*) from public.reward_redemption_events"), "2");
    assert.equal(sql("select points_balance from public.customers where restaurant_id=" + quote(restaurantId)), "800");
    await staffCustomer.context.close();
    console.log("PHYSICAL_STAFF_APPROVE_PASS");

    const rejectedCustomer = await openReward("D3B Extra");
    const rejectCard = staff.page.locator(".settings-info-card article").filter({ hasText: "D3B Extra" });
    await rejectCard.getByRole("button", { name: "Ablehnen" }).click();
    await waitForCount("select count(*) from public.secure_redemption_requests where status='REJECTED'", "1", "STAFF_REJECTION_FAILED");
    assert.equal(sql("select count(*) from public.reward_redemption_events"), "2");
    await rejectedCustomer.context.close();
    console.log("PHYSICAL_STAFF_REJECT_PASS");
    }

    let owner;
    if (process.env.D3B_LOCK_ONLY !== "1") {
    const ownerCustomer = await openReward("D3B Extra", 1);
    owner = await openPage("staff", 0);
    await owner.page.getByRole("heading", { name: "Offene Einlösungen" }).waitFor();
    const ownerCard = owner.page.locator(".settings-info-card article").filter({ hasText: "D3B Extra" });
    await ownerCard.getByRole("button", { name: "Bestätigen" }).click();
    await waitForCount("select count(*) from public.secure_redemption_requests where status='REDEEMED'", "3", "OWNER_APPROVAL_FAILED");
    assert.equal(sql("select count(*) from public.reward_redemption_events"), "3");
    assert.equal(sql("select points_balance from public.customers where restaurant_id=" + quote(restaurantId)), "700");
    await ownerCustomer.context.close();
    console.log("PHYSICAL_OWNER_APPROVE_PASS");
    } else {
      assert.equal(sql("select count(*) from public.secure_redemption_requests where status='REDEEMED'"), "3");
      assert.equal(sql("select points_balance from public.customers where restaurant_id=" + quote(restaurantId)), "700");
      owner = await openPage("staff", 0);
      await owner.page.getByRole("heading", { name: "Offene Einlösungen" }).waitFor();
      console.log("PHYSICAL_OWNER_APPROVE_PASS");
    }

    const rotate = owner.page.getByRole("button", { name: "Redemption-PIN erneuern" });
    await rotate.click();
    const firstPin = await owner.page.getByText(/Neue PIN – nur einmal sichtbar:/).locator("strong").innerText();
    await rotate.click();
    const secondPin = await owner.page.getByText(/Neue PIN – nur einmal sichtbar:/).locator("strong").innerText();
    assert.match(firstPin, /^\d{6}$/);
    assert.match(secondPin, /^\d{6}$/);
    assert.notEqual(firstPin, secondPin, "ROTATED_PIN_IDENTICAL");
    const lockedCustomer = await openReward("D3B Extra", 2);
    const pinInput = lockedCustomer.page.locator("#secure-redemption-pin");
    for (let attempt = 0; attempt < 5; attempt++) {
      await pinInput.fill(attempt === 0 ? firstPin : secondPin === "000000" ? "000001" : "000000");
      await lockedCustomer.page.getByRole("button", { name: "PIN prüfen" }).click();
      await lockedCustomer.page.getByText("PIN nicht bestätigt", { exact: false }).waitFor();
    }
    assert.equal(sql("select max(failed_pin_attempts) from public.secure_redemption_requests"), "5");
    assert.equal(await lockedCustomer.page.getByRole("slider").count(), 0);
    assert.equal(sql("select count(*) from public.reward_redemption_events"), "3");
    await lockedCustomer.page.getByRole("button", { name: "Antrag abbrechen" }).click();
    await waitForCount("select count(*) from public.secure_redemption_requests where status='CANCELLED'", "1", "CUSTOMER_CANCEL_FAILED");
    await lockedCustomer.context.close();
    if (staff) await staff.context.close();
    await owner.context.close();
    console.log("PHYSICAL_PIN_ROTATION_FIVE_FAILURES_CANCEL_PASS");
  } else {
  if (process.env.D3B_MATRIX_ONLY !== "1") {
  const owner = await openPage("staff", 0);
  await owner.page.getByRole("heading", { name: /Offene Einlösungen/ }).waitFor();
  await owner.page.getByRole("button", { name: /Redemption-PIN erneuern|Rotate redemption PIN/ }).click();
  const pinParagraph = owner.page.getByText(/Neue PIN – nur einmal sichtbar:|New PIN – shown only once:/).first();
  await pinParagraph.waitFor();
  pin = await pinParagraph.locator("strong").innerText();
  assert.match(pin, /^\d{6}$/);
  const customer = await openPage("customer", 2);
  if (await customer.page.locator(".app-drawer-overlay").count()) {
    await customer.page.keyboard.press("Escape");
    await customer.page.locator(".app-drawer-overlay").waitFor({ state: "hidden" });
  }
  await customer.page.getByRole("button", { name: /D3B Reward: Details/ }).first().click();
  await customer.page.getByRole("button", { name: /Jetzt einlösen/ }).click();
  await customer.page.getByText("Bestätigung ausstehend").first().waitFor();
  assert.equal(sql("select count(*) from public.secure_redemption_requests where status='REQUESTED'"), "1");
  console.log("PHYSICAL_REQUESTED_PASS");
  const beforeClose = snapshot();
  await customer.page.keyboard.press("Escape");
  assert.equal(snapshot(), beforeClose, "ESCAPE_WROTE_BUSINESS_DATA");
  await customer.page.getByRole("button", { name: /Einlösung|Bestätigung ausstehend/ }).last().click();
  await customer.page.locator("#secure-redemption-pin").fill(pin === "000000" ? "000001" : "000000");
  await customer.page.getByRole("button", { name: /PIN prüfen/ }).click();
  await customer.page.getByText("PIN nicht bestätigt", { exact: false }).waitFor();
  assert.equal(sql("select failed_pin_attempts from public.secure_redemption_requests limit 1"), "1");
  await customer.page.locator("#secure-redemption-pin").fill(pin);
  await customer.page.getByRole("button", { name: /PIN prüfen/ }).click();
  await customer.page.getByRole("slider", { name: "Zum Einlösen nach rechts wischen" }).waitFor();
  assert.equal(sql("select status from public.secure_redemption_requests limit 1"), "PIN_VERIFIED");
  const verifiedClient = createClient(status.API_URL, status.ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${sessions[2].access_token}` } } });
  const verifiedStatus = await verifiedClient.rpc("get_secure_redemption_status", {
    input_restaurant_slug: restaurantSlug, input_redemption_id: null,
  });
  assert.equal(verifiedStatus.error, null, "VERIFIED_STATUS_READ_FAILED");
  assert.equal(verifiedStatus.data?.status, "PIN_VERIFIED", "VERIFIED_STATUS_READ_MISMATCH");
  console.log("PHYSICAL_PIN_VERIFIED_PASS");
  await customer.context.close();
  await owner.context.close();
  }
  // Keep the verified request open while checking the real UI in both engines.
  const labels = {
    de: "Zum Einlösen nach rechts wischen", en: "Swipe right to redeem",
    fr: "Glisser à droite pour échanger", it: "Scorri a destra per riscattare",
    es: "Desliza a la derecha para canjear", zh: "向右滑动以兑换",
    ko: "오른쪽으로 밀어 교환하기",
  };
  let checks = 0;
  for (const [name, launcher] of [["Chromium", chromium], ["WebKit", webkit]]) {
    const engine = await launcher.launch({ headless: true });
    browsers.push(engine);
    for (const language of Object.keys(labels)) {
      const context = await engine.newContext({ viewport: { width: 390, height: 900 } });
      await context.route("**/*", (route) => ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname)
        ? route.continue() : route.abort());
      await context.addInitScript(({ session, language }) => {
        localStorage.setItem("sb-127-auth-token", JSON.stringify(session));
        localStorage.setItem("wuxuai.ui-language", language);
      }, { session: sessions[2], language });
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:4180/customer/${restaurantSlug}`, { waitUntil: "networkidle" });
      if (await page.locator(".app-drawer-overlay").count()) {
        await page.keyboard.press("Escape");
        await page.locator(".app-drawer-overlay").waitFor({ state: "hidden" });
      }
      const resume = page.locator(".premium-active-code");
      assert.equal(await resume.count(), 1, "VERIFIED_REDEMPTION_RESUME_NOT_VISIBLE");
      await resume.click();
      const slider = page.getByRole("slider", { name: labels[language] });
      await slider.waitFor();
      for (const width of [320, 375, 390, 430, 767, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        assert.equal(await slider.getAttribute("aria-label"), labels[language]);
        assert.equal(await page.locator(".premium-swipe-label").innerText(), labels[language]);
        const box = await slider.boundingBox();
        assert.ok(box && box.height >= 44, `${name}/${language}/${width}:touch`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false,
          `${name}/${language}/${width}:overflow`);
        checks++;
      }
      await context.close();
    }
    await engine.close();
    browsers.pop();
  }
  assert.equal(sql("select status from public.secure_redemption_requests limit 1"), "PIN_VERIFIED");
  console.log(`PHYSICAL_SWIPE_I18N_WIDTH_PASS ${checks}`);
  const finalCustomer = await openPage("customer", 2);
  if (await finalCustomer.page.locator(".app-drawer-overlay").count()) {
    await finalCustomer.page.keyboard.press("Escape");
    await finalCustomer.page.locator(".app-drawer-overlay").waitFor({ state: "hidden" });
  }
  await finalCustomer.page.locator(".premium-active-code").click();
  await finalCustomer.page.getByRole("slider", { name: "Zum Einlösen nach rechts wischen" }).press("End");
  let redeemed = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    if (sql("select count(*) from public.secure_redemption_requests where status='REDEEMED'") === "1") {
      redeemed = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(redeemed, "PHYSICAL_SWIPE_NOT_REDEEMED");
  assert.equal(sql("select count(*) from public.reward_redemption_events"), "1");
  assert.equal(sql("select points_balance from public.customers where restaurant_id=" + quote(restaurantId)), "900");
  await finalCustomer.context.close();
  console.log("PHYSICAL_SWIPE_SINGLE_REDEMPTION_PASS");
  }
} finally {
  pin = "";
  for (const browser of browsers) await browser.close();
  if (server) { server.kill("SIGTERM"); await new Promise((resolve) => server.once("exit", resolve)); }
}
