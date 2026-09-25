import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chromium, webkit } from "/Users/dongdongwu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const runtime = "/private/tmp/wuxuai-7d3b6-auth.VMoIzk";
const cli = "/private/tmp/wuxuai-7d2.1uZAeh/repo/node_modules/.bin/supabase";
const status = JSON.parse(execFileSync(cli, ["status", "--output", "json"], {
  cwd: runtime, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1", DO_NOT_TRACK: "1" },
}));
assert.equal(status.API_URL, "http://127.0.0.1:56221");
const sql = (query) => execFileSync("docker", ["exec", "-i", "supabase_db_wuxuai-phase7d3b-isolated",
  "psql", "-U", "postgres", "-d", "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1"],
{ input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const [aId, aSlug] = sql(`select id,slug from public.restaurants where name='D3B6 Synthetic Restaurant A' limit 1`).split("|");
const bSlug = sql(`select slug from public.restaurants where name='D3B6 Synthetic Restaurant B' limit 1`);
const ids = [
  ["owner", sql(`select owner_id from public.restaurants where id='${aId}'`)],
  ["staff", sql(`select auth_user_id from public.staff_members where restaurant_id='${aId}' and active limit 1`)],
];
const creds = {};
for (const [role, id] of ids) {
  assert.match(id, /^[0-9a-f-]{36}$/);
  const email = sql(`select email from auth.users where id='${id}'`);
  const password = randomUUID() + randomUUID();
  const response = await fetch(`${status.API_URL}/auth/v1/admin/users/${id}`, { method: "PUT",
    headers: { apikey: status.SERVICE_ROLE_KEY,
      authorization: `Bearer ${status.SERVICE_ROLE_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ password }) });
  assert.equal(response.status, 200);
  creds[role] = { email, password };
}
const fingerprint = () => sql(`create temp table d3b6_fingerprints(name text, digest text);
  do $$ declare r record; v text; begin
    for r in select tablename from pg_tables where schemaname='public' order by tablename loop
      execute format('select count(*)::text || '':'' || md5(coalesce(string_agg(to_jsonb(t)::text,''|'' order by to_jsonb(t)::text),'''')) from public.%I t', r.tablename) into v;
      insert into d3b6_fingerprints values (r.tablename,v);
    end loop;
  end $$;
  select name || '|' || digest from d3b6_fingerprints order by name;`);
const before = fingerprint();
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
const navigate = (page, path) => page.evaluate((target) => {
  history.pushState(null, "", target);
  dispatchEvent(new PopStateEvent("popstate"));
}, path);
for (const [engineName, launcher] of [["CHROMIUM", chromium], ["WEBKIT", webkit]]) {
  const browser = await launcher.launch({ headless: true });
  try {
    for (const role of ["owner", "staff"]) {
      const context = await browser.newContext({ locale: "de-AT", viewport: { width: 390, height: 844 } });
      await context.addInitScript(memoryStorage);
      await context.route("**/*", (route) => ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname)
        ? route.continue() : route.abort());
      const page = await context.newPage();
      try {
        await page.goto("http://127.0.0.1:4180", { waitUntil: "domcontentloaded" });
        const logged = await page.evaluate(async (credential) => {
          const { supabase } = await import("/src/shared/lib/supabase.ts");
          const result = await supabase.auth.signInWithPassword(credential);
          return !!result.data.session && !result.error;
        }, creds[role]);
        assert.equal(logged, true);
        await page.bringToFront();
        await page.waitForFunction(() => !document.hidden);
        await navigate(page, `/staff/${aSlug}`);
        await page.getByRole("heading", { name: "Offene Einlösungen" }).waitFor();

        let releaseA;
        let markHeldA;
        const heldA = new Promise((resolve) => { markHeldA = resolve; });
        const release = new Promise((resolve) => { releaseA = resolve; });
        let lateFulfillAttempted = false;
        await page.route("**/rest/v1/rpc/get_secure_redemption_queue", async (route) => {
          const requestBody = route.request().postDataJSON();
          if (requestBody?.input_restaurant_slug !== aSlug) return route.continue();
          const genuine = await route.fetch();
          markHeldA();
          await release;
          lateFulfillAttempted = true;
          try { await route.fulfill({ response: genuine }); } catch { /* request cancelled on unmount */ }
        });
        await heldA;
        await navigate(page, `/staff/${bSlug}`);
        assert.equal(await page.getByRole("heading", { name: "Offene Einlösungen" }).count(), 0);
        await page.locator("main.auth-shell").waitFor();
        releaseA();
        await page.waitForTimeout(500);
        assert.equal(lateFulfillAttempted, true);
        assert.equal(await page.locator("main.tablet-shell").count(), 0);
        assert.equal(await page.getByRole("heading", { name: "Offene Einlösungen" }).count(), 0);
        await page.unroute("**/rest/v1/rpc/get_secure_redemption_queue");
        console.log(`D3B6_${engineName}_${role.toUpperCase()}_REAL_DELAYED_A_AFTER_B_IGNORED_PASS`);

        await navigate(page, `/staff/${aSlug}`);
        await page.getByRole("heading", { name: "Offene Einlösungen" }).waitFor();

        let releaseB;
        let markHeldB;
        const heldB = new Promise((resolve) => { markHeldB = resolve; });
        const bRelease = new Promise((resolve) => { releaseB = resolve; });
        await page.route("**/rest/v1/rpc/get_my_staff_restaurant_access", async (route) => {
          const requestBody = route.request().postDataJSON();
          if (requestBody?.input_restaurant_slug !== bSlug) return route.continue();
          const genuine = await route.fetch();
          markHeldB();
          await bRelease;
          try { await route.fulfill({ response: genuine }); } catch { /* request cancelled on slug change */ }
        });
        await navigate(page, `/staff/${bSlug}`);
        await heldB;
        assert.equal(await page.getByRole("heading", { name: "Offene Einlösungen" }).count(), 0);
        await navigate(page, `/staff/${aSlug}`);
        await page.getByRole("heading", { name: "Offene Einlösungen" }).waitFor();
        releaseB();
        await page.waitForTimeout(500);
        assert.equal(await page.getByRole("heading", { name: "Offene Einlösungen" }).count(), 1);
        await page.unroute("**/rest/v1/rpc/get_my_staff_restaurant_access");
        console.log(`D3B6_${engineName}_${role.toUpperCase()}_REAL_DELAYED_B_AFTER_A_IGNORED_PASS`);

        await page.evaluate(() => {
          window.__d3b6ForeignQueueFrames = 0;
          window.__d3b6Observer = new MutationObserver(() => {
            if (location.pathname.includes("/staff/") && !location.pathname.endsWith(window.__d3b6OwnSlug)
              && document.querySelector(".secure-redemption-queue-image"))
              window.__d3b6ForeignQueueFrames++;
          });
          window.__d3b6Observer.observe(document.body, { childList: true, subtree: true });
        });
        await page.evaluate((ownSlug) => { window.__d3b6OwnSlug = ownSlug; }, aSlug);
        for (let index = 0; index < 24; index++) {
          await navigate(page, `/staff/${aSlug}`);
          await navigate(page, `/staff/${bSlug}`);
          assert.equal(await page.getByRole("heading", { name: "Offene Einlösungen" }).count(), 0);
        }
        await page.locator("main.auth-shell").waitFor();
        const leakedFrames = await page.evaluate(() => {
          window.__d3b6Observer.disconnect();
          return window.__d3b6ForeignQueueFrames;
        });
        assert.equal(leakedFrames, 0, `${engineName}/${role}:FOREIGN_QUEUE_FRAME`);
        console.log(`D3B6_${engineName}_${role.toUpperCase()}_24_SLUG_SWITCHES_ZERO_FOREIGN_FRAMES_PASS`);

        await navigate(page, `/staff/${aSlug}`);
        await page.getByRole("heading", { name: "Offene Einlösungen" }).waitFor();
        let releaseUnmount;
        let markUnmountHeld;
        const unmountHeld = new Promise((resolve) => { markUnmountHeld = resolve; });
        const unmountRelease = new Promise((resolve) => { releaseUnmount = resolve; });
        const pageErrors = [];
        page.on("pageerror", (error) => pageErrors.push(error.name));
        await page.route("**/rest/v1/rpc/get_secure_redemption_queue", async (route) => {
          const genuine = await route.fetch();
          markUnmountHeld();
          await unmountRelease;
          try { await route.fulfill({ response: genuine }); } catch { /* request cancelled on unmount */ }
        });
        await unmountHeld;
        await navigate(page, "/");
        releaseUnmount();
        await page.waitForTimeout(300);
        assert.equal(await page.getByRole("heading", { name: "Offene Einlösungen" }).count(), 0);
        assert.deepEqual(pageErrors, []);
        await page.reload({ waitUntil: "domcontentloaded" });
        assert.equal(await page.getByRole("heading", { name: "Offene Einlösungen" }).count(), 0);
        await page.unroute("**/rest/v1/rpc/get_secure_redemption_queue");
        console.log(`D3B6_${engineName}_${role.toUpperCase()}_REAL_UNMOUNT_RELOAD_NO_STALE_QUEUE_PASS`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}
const after = fingerprint();
if (after !== before) {
  const prior = new Map(before.split("\n").map((line) => line.split("|")));
  const changed = after.split("\n").map((line) => line.split("|"))
    .filter(([name, digest]) => prior.get(name) !== digest)
    .map(([name]) => name);
  throw new Error(`ROUTE_QUEUE_RACE_TEST_CHANGED_PUBLIC_TABLES:${changed.join(",")}`);
}
console.log("D3B6_REAL_RACE_PUBLIC_FINGERPRINTS_IDENTICAL_PASS");
