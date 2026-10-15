// Read-only browser proof against the disposable local stack after the DB contract test.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { chromium, webkit } from "/Users/dongdongwu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

assert.equal(process.env.ALLOW_LOCAL_TEST_ONLY_BASIC, "1");
const root = new URL("..", import.meta.url).pathname;
const env = { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1", DO_NOT_TRACK: "1" };
const run = (command, args) => String(execFileSync(command, args, {
  cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env,
}) ?? "").trim();
const status = JSON.parse(run("npx", ["--no-install", "supabase", "status", "--output", "json"]));
assert.equal(status.API_URL, "http://127.0.0.1:56121");
const sql = (statement) => execFileSync("docker", [
  "exec", "-i", "supabase_db_wuxuai-phase7b4d-local", "psql", "-U", "postgres", "-d", "postgres",
  "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
], { input: statement, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const fixture = JSON.parse(sql(`select jsonb_build_object(
  'restaurant',restaurant.id,'name',restaurant.name,'case_id',review_case.id,
  'admin',admin_row.user_id,'session_id',session.id,'email',auth_user.email,
  'readiness_receipt',access_receipt.readiness_receipt_id,
  'customer_join_receipt',access_receipt.customer_join_receipt_id
) from public.test_only_basic_access_receipts access_receipt
join public.restaurants restaurant on restaurant.id=access_receipt.restaurant_id
join public.business_verification_cases review_case on review_case.restaurant_id=restaurant.id
cross join lateral (select * from public.platform_admins where active order by role desc,user_id limit 1) admin_row
join auth.users auth_user on auth_user.id=admin_row.user_id
join auth.sessions session on session.user_id=admin_row.user_id
where access_receipt.action='REVOKE'
order by access_receipt.created_at desc,session.created_at desc limit 1;`));

function jwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", status.JWT_SECRET).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

const now = Math.floor(Date.now() / 1000);
const accessToken = jwt({
  aud: "authenticated", exp: now + 3600, iat: now, iss: "https://mbgveqbhessaunrhfudm.supabase.co/auth/v1",
  sub: fixture.admin, email: fixture.email, role: "authenticated", aal: "aal2", session_id: fixture.session_id,
  amr: [{ method: "password", timestamp: now - 60 }, { method: "totp", timestamp: now }],
});
const session = {
  access_token: accessToken,
  refresh_token: "local-read-only-browser-proof",
  expires_in: 3600,
  expires_at: now + 3600,
  token_type: "bearer",
  user: { id: fixture.admin, aud: "authenticated", role: "authenticated", email: fixture.email,
    app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {}, identities: [], created_at: new Date().toISOString() },
};

let server;
try {
  server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "56137", "--strictPort"], {
    cwd: root,
    env: { ...env, VITE_SUPABASE_URL: status.API_URL, VITE_SUPABASE_ANON_KEY: status.ANON_KEY,
      VITE_PLATFORM_TEST_CONTROL_ENABLED: "true" },
    stdio: "ignore",
  });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { if ((await fetch("http://127.0.0.1:56137")).ok) break; } catch { /* local Vite startup */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const viewports = [
    ["desktop", { width: 1440, height: 900 }],
    ["tablet", { width: 820, height: 1180 }],
    ["mobile", { width: 390, height: 900 }],
  ];
  for (const [engine, launcher] of [["chromium", chromium], ["webkit", webkit]]) {
    const browser = await launcher.launch({ headless: true });
    for (const [viewportName, viewport] of viewports) {
      const context = await browser.newContext({ viewport });
      await context.route("**/*", (route) => ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname)
        ? route.continue() : route.abort());
      await context.addInitScript((value) => {
        localStorage.setItem("sb-127-auth-token", JSON.stringify(value));
        localStorage.setItem("wuxuai.ui-language", "de");
      }, session);
      const page = await context.newPage();
      await page.goto("http://127.0.0.1:56137/admin/platform/verification", { waitUntil: "networkidle" });
      const row = page.getByRole("row").filter({ hasText: fixture.name });
      await row.getByRole("button", { name: "Details" }).click();
      assert.equal(new URL(page.url()).searchParams.get("review_case"), fixture.case_id);
      const panel = page.getByTestId("test-only-basic-access");
      await panel.waitFor({ timeout: 20_000 });
      await panel.getByText("GESCHLOSSEN", { exact: true }).waitFor({ timeout: 20_000 });
      const text = await panel.innerText();
      assert.match(text, /TEST_ONLY BASIC/);
      assert.match(text, /GESCHLOSSEN/);
      assert.match(text, /GRANT/);
      assert.match(text, new RegExp(fixture.readiness_receipt));
      assert.match(text, new RegExp(fixture.customer_join_receipt));
      assert.equal(await panel.getByRole("button", { name: "TEST_ONLY BASIC befristet öffnen" }).count(), 0);
      await panel.getByRole("button", { name: "TOTP erneut bestätigen" }).click();
      await panel.getByLabel("Aktueller sechsstelliger Bestätigungscode").waitFor();
      await panel.getByRole("button", { name: "Abbrechen" }).click();
      assert.equal(await panel.getByLabel("Aktueller sechsstelliger Bestätigungscode").count(), 0);
      assert.equal(await panel.getByRole("button", { name: "TEST_ONLY BASIC befristet öffnen" }).count(), 0);
      if (engine === "chromium" && viewportName === "desktop") {
        await page.evaluate(({ restaurantId, identityId }) => {
          sessionStorage.setItem("wuxuai.test-only-basic-reauth-continuation", JSON.stringify({
            version: 1,
            restaurantId,
            identityId,
            continuationId: crypto.randomUUID(),
            startedAt: Date.now(),
          }));
        }, { restaurantId: fixture.restaurant, identityId: fixture.admin });
        await page.reload({ waitUntil: "networkidle" });
        const resumedPanel = page.getByTestId("test-only-basic-access");
        await resumedPanel.getByText("TOTP und frischer serverseitiger Vertrags-Readback bestanden.", { exact: true }).waitFor();
        assert.equal(await resumedPanel.getByRole("button", { name: "TEST_ONLY BASIC befristet öffnen" }).count(), 1);
        assert.equal(await page.evaluate(() => sessionStorage.getItem("wuxuai.test-only-basic-reauth-continuation")), null);

        await page.reload({ waitUntil: "networkidle" });
        const replayPanel = page.getByTestId("test-only-basic-access");
        await replayPanel.getByText("GESCHLOSSEN", { exact: true }).waitFor();
        assert.equal(await replayPanel.getByRole("button", { name: "TEST_ONLY BASIC befristet öffnen" }).count(), 0);

        await page.route("**/rest/v1/rpc/get_platform_test_only_basic_access", (route) => route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({ code: "42501", message: "RECENT_PLATFORM_TOTP_REQUIRED" }),
        }));
        await page.evaluate(({ restaurantId, identityId }) => {
          sessionStorage.setItem("wuxuai.test-only-basic-reauth-continuation", JSON.stringify({
            version: 1,
            restaurantId,
            identityId,
            continuationId: crypto.randomUUID(),
            startedAt: Date.now(),
          }));
        }, {
          restaurantId: fixture.restaurant,
          identityId: fixture.admin,
        });
        await page.reload({ waitUntil: "networkidle" });
        const rejectedPanel = page.getByTestId("test-only-basic-access");
        await rejectedPanel.getByText("Der serverseitige TOTP-Nachweis ist abgelaufen.", { exact: false }).waitFor();
        assert.equal(await rejectedPanel.getByRole("button", { name: "TEST_ONLY BASIC befristet öffnen" }).count(), 0);
        assert.equal(await page.evaluate(() => sessionStorage.getItem("wuxuai.test-only-basic-reauth-continuation")), null);
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, `${engine} ${viewportName} overflow`);
      await context.close();
    }
    await browser.close();
  }
  console.log(JSON.stringify({
    status: "TEST_ONLY_BASIC_UI_BROWSER_PASS",
    engines: ["chromium", "webkit"],
    viewports: ["desktop", "tablet", "mobile"],
    state: "CLOSED_AFTER_REVOKE",
    totp_cancel: "FAIL_CLOSED",
    totp_reload_continuation: "ONE_TIME_PASS",
    totp_failed_readback: "CLOSED",
    totp_replay: "CLOSED",
    cloud_writes: 0,
  }));
} finally {
  if (server && !server.killed) server.kill("SIGTERM");
}
