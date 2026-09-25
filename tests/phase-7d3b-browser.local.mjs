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
const fields = sql(`select
  (select user_id from public.restaurant_members where restaurant_id=f.restaurant_id and role='owner' limit 1),
  (select auth_user_id from public.staff_members where restaurant_id=f.restaurant_id and active limit 1),
  (select auth_user_id from public.customers where id=f.customer_id),f.restaurant_id
  from public.d3b_parallel_fixture f`).split("|");
const [oldOwner, oldStaff, oldCustomer, restaurantId] = fields;
for (const value of fields) assert.match(value, /^[0-9a-f-]{36}$/);
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
  const email = `d3b-browser-${role}-${randomUUID()}@example.invalid`;
  const result = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(result.error, null, "LOCAL_BROWSER_AUTH_FIXTURE_FAILED");
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
  assert.equal(result.error, null, "LOCAL_BROWSER_AUTH_SESSION_FAILED");
  sessions.push(result.data.session);
}
const businessSnapshot = () => sql(`select jsonb_build_object(
  'requests',(select count(*) from public.secure_redemption_requests),
  'events',(select count(*) from public.reward_redemption_events),
  'points',(select coalesce(sum(points_balance),0) from public.customers))::text`);
const beforeBrowser = businessSnapshot();
let server;
let browser;
let checks = 0;
const diagnostic = process.env.D3B_BROWSER_DIAG === "1";
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
  for (const [engine, launcher] of (diagnostic ? [["Chromium", chromium]] : [["Chromium", chromium], ["WebKit", webkit]])) {
    browser = await launcher.launch({ headless: true });
    for (const [index, role] of ["owner", "staff", "customer"].entries()) {
      if (diagnostic && role !== "customer") continue;
      const path = role === "customer" ? `/customer/${restaurantSlug}` : `/staff/${restaurantSlug}`;
      const context = await browser.newContext();
      const blockedHosts = new Set();
      await context.route("**/*", (route) => {
        const host = new URL(route.request().url()).hostname;
        if (["127.0.0.1", "localhost"].includes(host)) return route.continue();
        blockedHosts.add(host);
        return route.abort();
      });
      await context.addInitScript((session) => localStorage.setItem("sb-127-auth-token", JSON.stringify(session)), sessions[index]);
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.name));
      for (const language of (diagnostic ? ["de"] : ["de", "en", "fr", "it", "es", "zh", "ko"])) {
        await page.goto(`http://127.0.0.1:4180${path}`, { waitUntil: "domcontentloaded" });
        await page.evaluate((value) => localStorage.setItem("wuxuai.ui-language", value), language);
        await page.reload({ waitUntil: "networkidle" });
        for (const width of (diagnostic ? [390] : [320, 375, 390, 430, 767, 768, 1024, 1440])) {
          await page.setViewportSize({ width, height: 900 });
          assert.equal(new URL(page.url()).pathname, path, `${engine}/${role}/${language}/${width}:route`);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false,
            `${engine}/${role}/${language}/${width}:overflow`);
          if (role !== "customer") {
            const frames = page.locator(".secure-redemption-queue-image");
            if (await frames.count()) {
              const box = await frames.first().boundingBox();
              assert.ok(box && Math.abs(box.width / box.height - 16 / 9) < 0.02,
                `${engine}/${role}/${language}/${width}:media-ratio`);
            }
            const small = await page.locator(".settings-info-card button:not([disabled])").evaluateAll((elements) =>
              elements.filter((element) => element.getClientRects().length &&
                (element.getBoundingClientRect().width < 44 || element.getBoundingClientRect().height < 44)).length);
            assert.equal(small, 0, `${engine}/${role}/${language}/${width}:touch`);
          }
          checks++;
        }
        if (role !== "customer") {
          const queueHeading = page.getByRole("heading", { name: /Offene Einlösungen|Open redemptions|Échanges en attente|Riscatti in attesa|Canjes pendientes|待确认兑换|대기 중인 교환/ });
          try { await queueHeading.waitFor({ timeout: 30000 }); } catch {
            const headingCount = await page.locator("h1,h2").count();
            throw new Error(`${engine}/${role}/${language}:QUEUE_NOT_VISIBLE:${new URL(page.url()).pathname}:headings=${headingCount}`);
          }
        }
        // Navigation cancels in-flight polling requests in WebKit; assess the settled page separately.
        errors.length = 0;
        await page.waitForTimeout(200);
        assert.deepEqual(errors, [], `${engine}/${role}/${language}:settled-runtime`);
        if (diagnostic && role === "customer") {
          console.log(`D3B_CUSTOMER_DIAG route=${new URL(page.url()).pathname}`);
          console.log(`D3B_CUSTOMER_DIAG reward_visible=${await page.getByText("D3B Reward").count() > 0}`);
          console.log(`D3B_CUSTOMER_DIAG redeem_buttons=${await page.getByRole("button", { name: /Einlösen/ }).count()}`);
          console.log(`D3B_CUSTOMER_DIAG main_count=${await page.locator("main").count()}`);
          console.log(`D3B_CUSTOMER_DIAG loading=${await page.getByText("Dein Bonuskonto wird erkannt", { exact: false }).count() > 0}`);
          console.log(`D3B_CUSTOMER_DIAG account_loading=${await page.getByText("Das Restaurant wird geladen", { exact: false }).count() > 0}`);
          console.log(`D3B_CUSTOMER_DIAG shell_class=${await page.locator("main").first().getAttribute("class")}`);
        }
      }
      assert.deepEqual([...blockedHosts], [], `${engine}/${role}:unexpected-network-host`);
      await context.close();
    }
    await browser.close(); browser = null;
  }
  assert.equal(businessSnapshot(), beforeBrowser, "BROWSER_PAGE_VIEW_WROTE_BUSINESS_DATA");
  console.log(`D3B_LOCAL_BROWSER_ROUTE_LOCALE_WIDTH_PASS ${checks}`);
} finally {
  if (browser) await browser.close();
  if (server) { server.kill("SIGTERM"); await new Promise((resolve) => server.once("exit", resolve)); }
}
