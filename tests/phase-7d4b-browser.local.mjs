// Synthetic local-only Chromium/WebKit read-path verification.
// Runtime credentials and QR material remain in memory and are never printed.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { chromium, webkit } from "/Users/dongdongwu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";
import { CUSTOMER_PRESENTATION_MESSAGES } from "../src/shared/i18n/customerPresentationMessages.mjs";

const cwd = new URL("../", import.meta.url).pathname;
const cli = `${cwd}node_modules/.bin/supabase`;
let status;
try {
  status = JSON.parse(execFileSync(cli, ["status", "--output", "json"], {
    cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  }));
} catch {
  throw new Error("LOCAL_SUPABASE_STATUS_UNAVAILABLE");
}
assert.equal(status.API_URL, "http://127.0.0.1:56121");
const origin = "http://127.0.0.1:4181";
const container = "supabase_db_wuxuai-phase7b4d-local";
function sql(query) {
  try {
    const output = execFileSync("docker", ["exec", "-i", container, "psql", "-X", "-qAt",
      "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
    { input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    return output.trim();
  } catch {
    throw new Error("LOCAL_SYNTHETIC_SQL_FAILED");
  }
}
async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { if ((await fetch(origin)).status === 200) return; } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("LOCAL_VITE_NOT_READY");
}
function fingerprint() {
  return sql(`create temp table d4b_fingerprints(name text,digest text);
do $fingerprint$ declare r record; v text; begin
  for r in select tablename from pg_tables where schemaname='public' order by tablename loop
    execute format('select count(*)::text || '':'' || md5(coalesce(string_agg(to_jsonb(t)::text,''|'' order by to_jsonb(t)::text),'''')) from public.%I t',r.tablename) into v;
    insert into d4b_fingerprints values(r.tablename,v);
  end loop;
end $fingerprint$;
select name||'|'||digest from d4b_fingerprints order by name;`);
}
async function waitForPortal(page, pageErrors, requestFailures) {
  try {
    await page.locator("#customer-home-title").waitFor({ timeout: 8000 });
  } catch {
    const state = await page.evaluate(() => ({
      recovery: ["Zugang wiederherstellen", "Restore access", "Rétablir l’accès"]
        .some((label) => document.body.textContent?.includes(label)),
      login: document.body.textContent?.includes("Anmelden") ?? false,
      alert: document.querySelector('[role="alert"]') !== null,
      portal: document.querySelector(".customer-portal-page") !== null,
      errorState: document.querySelector(".premium-error-state") !== null,
      loadingState: document.querySelector(".premium-loading-state") !== null,
      centralShell: document.querySelector(".central-auth-shell") !== null,
      loading: document.body.textContent?.includes("geladen") ?? false,
      rootTextLength: document.querySelector("#root")?.textContent?.length ?? 0,
      rootChildClasses: [...(document.querySelector("#root")?.children ?? [])]
        .map((element) => element.className?.toString().slice(0, 60) ?? ""),
      h1Count: document.querySelectorAll("h1").length,
      registerRoute: location.pathname.startsWith("/customer/register"),
      centralRoute: location.pathname === "/customer",
    }));
    throw new Error(`LOCAL_PORTAL_NOT_READY ${JSON.stringify(state)} pageErrors=${pageErrors.length} rpcFailures=${JSON.stringify(requestFailures)}`);
  }
}

const email = `d4b-browser-${randomUUID()}@example.invalid`;
const password = randomUUID() + randomUUID();
const token = randomBytes(32).toString("hex");
const adminHeaders = { apikey: status.SERVICE_ROLE_KEY,
  authorization: `Bearer ${status.SERVICE_ROLE_KEY}`, "content-type": "application/json" };
const created = await fetch(`${status.API_URL}/auth/v1/admin/users`, {
  method: "POST", headers: adminHeaders,
  body: JSON.stringify({ email, password, email_confirm: true,
    user_metadata: { customer_first_name: "D4B", customer_phone: "+436600000001" } }),
});
assert.equal(created.status, 200, "LOCAL_CUSTOMER_CREATE_FAILED");
const createdBody = await created.json();
const userId = createdBody.id ?? createdBody.user?.id;
assert.ok(/^[0-9a-f-]{36}$/.test(String(userId)), "LOCAL_USER_ID_INVALID");
const id = { owner: randomUUID(), organization: randomUUID(), restaurant: randomUUID(),
  branch: randomUUID(), customer: randomUUID(), account: randomUUID() };
const slug = `d4b-browser-${id.restaurant.slice(0, 8)}`;
sql(`begin;
set local session_replication_role=replica;
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('${id.owner}','authenticated','authenticated','synthetic-${id.owner}@example.invalid',now(),'{}','{}',now(),now());
insert into public.organizations(id,owner_id,name) values('${id.organization}','${id.owner}','D4B BROWSER LOCAL');
insert into public.restaurants(id,owner_id,name,slug,organization_id)
values('${id.restaurant}','${id.owner}','D4B BROWSER LOCAL','${slug}','${id.organization}');
insert into public.branches(id,organization_id,restaurant_id,name,slug,country)
values('${id.branch}','${id.organization}','${id.restaurant}','D4B','${slug}','AT');
update public.restaurants set primary_branch_id='${id.branch}' where id='${id.restaurant}';
insert into public.branch_subscriptions(organization_id,branch_id,status,subscription_status,
selected_plan,plan_key,payment_status)
values('${id.organization}','${id.branch}','active','active','BASIC','BASIC','paid');
insert into public.loyalty_settings(restaurant_id,organization_id,branch_id,loyalty_mode)
values('${id.restaurant}','${id.organization}','${id.branch}','amount_based');
insert into public.customers(id,restaurant_id,organization_id,branch_id,auth_user_id,name,
customer_code,membership_status,is_test_customer,normalized_phone,phone)
values('${id.customer}','${id.restaurant}','${id.organization}','${id.branch}','${userId}',
'D4B Synthetic Customer','D4B BROWSER','active',true,'+436600000001','+436600000001');
insert into public.customer_accounts(id,auth_user_id,email,first_name,email_confirmed_at)
values('${id.account}','${userId}','${email}','D4B',now());
insert into public.customer_account_memberships(account_id,restaurant_id,customer_id)
values('${id.account}','${id.restaurant}','${id.customer}');
insert into public.customer_qr_tokens(restaurant_id,customer_id,organization_id,branch_id,token_hash,active)
values('${id.restaurant}','${id.customer}','${id.organization}','${id.branch}',
  public.hash_public_token('${token}'),true);
commit;`);

let server;
const browsers = [];
try {
  server = spawn("npm", ["run", "dev", "--", "--port", "4181", "--strictPort"], {
    cwd, detached: true, stdio: "ignore",
    env: { ...process.env, VITE_SUPABASE_URL: status.API_URL,
      VITE_SUPABASE_ANON_KEY: status.ANON_KEY },
  });
  await waitForServer();
  const languages = ["de", "en", "fr", "it", "es", "zh", "ko"];
  const widths = [320, 375, 390, 430, 767, 768, 1024, 1440];
  let checks = 0;
  for (const [engineName, engine] of [["Chromium", chromium], ["WebKit", webkit]]) {
    const browser = await engine.launch({ headless: true });
    browsers.push(browser);
    const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
    await context.route("**/*", (route) => ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname)
      ? route.continue() : route.abort());
    const page = await context.newPage();
    const pageErrors = [];
    const requestFailures = [];
    page.on("pageerror", (error) => { pageErrors.push(error.name); });
    page.on("response", (response) => {
      if (response.status() >= 400 && response.url().includes("/rest/v1/rpc/")) {
        void response.json().then((body) => {
          const message = String(body.message ?? "");
          requestFailures.push({ name: new URL(response.url()).pathname.split("/").at(-1),
            status: response.status(), code: String(body.code ?? ""),
            category: ["CUSTOMER", "TOKEN", "RESTAURANT", "BILLING", "LEGAL", "COUNTRY", "PERMISSION"]
              .find((candidate) => message.toUpperCase().includes(candidate)) ?? "OTHER" });
        }).catch(() => {});
      }
    });
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    const signedIn = await page.evaluate(async ({ emailValue, passwordValue }) => {
      const { supabase } = await import("/src/shared/lib/supabase.ts");
      const response = await supabase.auth.signInWithPassword({ email: emailValue, password: passwordValue });
      return Boolean(response.data.session) && !response.error;
    }, { emailValue: email, passwordValue: password });
    assert.equal(signedIn, true, `${engineName} local auth failed`);
    await page.evaluate(async ({ restaurantSlug, rawToken }) => {
      const { saveStoredCustomerToken } = await import("/src/modules/customer/customerTokenStorage.ts");
      saveStoredCustomerToken(restaurantSlug, { customer_token: rawToken, device_id: null });
    }, { restaurantSlug: slug, rawToken: token });
    const before = fingerprint();
    await page.goto(`${origin}/customer/${slug}`, { waitUntil: "domcontentloaded" });
    await waitForPortal(page, pageErrors, requestFailures);
    for (const language of languages) {
      await page.locator(".wux-language-selector select").first().selectOption(language);
      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 });
        await page.reload({ waitUntil: "domcontentloaded" });
        await waitForPortal(page, pageErrors, requestFailures);
        const layout = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
          small: [...document.querySelectorAll("button,a,select")]
            .filter((element) => element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0)
            .filter((element) => element.getBoundingClientRect().height < 44)
            .map((element) => ({ tag: element.tagName.toLowerCase(),
              className: element.className?.toString().slice(0, 50) ?? "" })),
        }));
        assert.equal(layout.overflow, false, `${engineName}/${language}/${width} valid overflow`);
        assert.equal(layout.small.length, 0, `${engineName}/${language}/${width} small portal target ${JSON.stringify(layout.small)}`);
        checks += 1;
      }
    }
    const infoButton = page.locator(".premium-customer-header .premium-icon-button").first();
    await infoButton.click();
    await page.locator('[role="dialog"]').waitFor();
    await page.locator(".app-drawer-close").click();
    await infoButton.click();
    await page.locator('[role="dialog"]').waitFor();
    await page.keyboard.press("Escape");
    await page.locator('[role="dialog"]').waitFor({ state: "hidden" });
    await page.evaluate(async (restaurantSlug) => {
      const { removeStoredCustomerToken } = await import("/src/modules/customer/customerTokenStorage.ts");
      removeStoredCustomerToken(restaurantSlug);
    }, slug);
    await page.reload({ waitUntil: "domcontentloaded" });
    for (const language of languages) {
      await page.locator(".wux-language-selector select").first().selectOption(language);
      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 });
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.getByText(CUSTOMER_PRESENTATION_MESSAGES[language]["customer.recovery.title"]).first().waitFor({ timeout: 15000 });
        const state = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth + 1,
          targets: [...document.querySelectorAll("button,a,select")]
            .filter((element) => element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0)
            .map((element) => ({ tag: element.tagName.toLowerCase(),
              className: element.className?.toString().slice(0, 50) ?? "",
              height: Math.round(element.getBoundingClientRect().height) })) }));
        assert.equal(state.overflow, false, `${engineName}/${language}/${width} recovery overflow`);
        const small = state.targets.filter((target) => target.height < 44);
        assert.equal(small.length, 0, `${engineName}/${language}/${width} small recovery target ${JSON.stringify(small)}`);
        checks += 1;
      }
    }
    await page.keyboard.press("Escape");
    await page.locator('.central-auth-actions a[href="/customer"]').click();
    await context.close();
    assert.equal(fingerprint(), before, `${engineName} page-view business write`);
  }
  console.log(`LOCAL CUSTOMER READ BROWSER MATRIX: ${checks} Chromium/WebKit language-width checks PASS`);
} finally {
  await Promise.allSettled(browsers.map((browser) => browser.close()));
  if (server?.pid) {
    try { process.kill(-server.pid, "SIGTERM"); } catch { /* already exited */ }
  }
}
