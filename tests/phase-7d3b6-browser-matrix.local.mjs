import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chromium, webkit } from "/Users/dongdongwu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const runtime = "/private/tmp/wuxuai-7d3b6-auth.VMoIzk";
const cli = "/private/tmp/wuxuai-7d2.1uZAeh/repo/node_modules/.bin/supabase";
const status = JSON.parse(execFileSync(cli, ["status", "--output", "json"], {
  cwd: runtime, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1", DO_NOT_TRACK: "1" },
}));
assert.equal(status.API_URL, "http://127.0.0.1:56221");
const origin = "http://127.0.0.1:4180";
const sql = (query) => execFileSync("docker", ["exec", "-i", "supabase_db_wuxuai-phase7d3b-isolated",
  "psql", "-U", "postgres", "-d", "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1"],
{ input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const fingerprint = () => sql(`create temp table d3b6_fingerprints(name text, digest text);
  do $$ declare r record; v text; begin
    for r in select tablename from pg_tables where schemaname='public' order by tablename loop
      execute format('select count(*)::text || '':'' || md5(coalesce(string_agg(to_jsonb(t)::text,''|'' order by to_jsonb(t)::text),'''')) from public.%I t', r.tablename) into v;
      insert into d3b6_fingerprints values (r.tablename,v);
    end loop;
  end $$;
  select name || '|' || digest from d3b6_fingerprints order by name;`);
assert.equal(sql("select count(*) from supabase_migrations.schema_migrations"), "171");
const [restaurantId, slug, ownerId] = sql(`select id,slug,owner_id from public.restaurants
  where name='D3B6 Synthetic Restaurant A' limit 1`).split("|");
const roleId = (role) => sql(`select user_id from public.restaurant_members
  where restaurant_id='${restaurantId}' and role='${role}' limit 1`);
const staffId = sql(`select auth_user_id from public.staff_members
  where restaurant_id='${restaurantId}' and active limit 1`);
for (const id of [restaurantId, ownerId, staffId, roleId("admin"), roleId("manager")])
  assert.match(id, /^[0-9a-f-]{36}$/);
const credentials = {};
const adminHeaders = { apikey: status.SERVICE_ROLE_KEY,
  authorization: `Bearer ${status.SERVICE_ROLE_KEY}`, "content-type": "application/json" };
for (const [role, id] of [["owner", ownerId], ["admin", roleId("admin")],
  ["manager", roleId("manager")], ["staff", staffId]]) {
  const email = sql(`select email from auth.users where id='${id}'`);
  const password = randomUUID() + randomUUID();
  const changed = await fetch(`${status.API_URL}/auth/v1/admin/users/${id}`,
    { method: "PUT", headers: adminHeaders, body: JSON.stringify({ password }) });
  assert.equal(changed.status, 200, `${role}_AUTH_SETUP_FAILED`);
  credentials[role] = { email, password };
}
async function createCustomer() {
  const email = `d3b6-layout-${randomUUID()}@example.invalid`;
  const password = randomUUID() + randomUUID();
  const birthday = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const created = await fetch(`${status.API_URL}/auth/v1/admin/users`, {
    method: "POST", headers: adminHeaders,
    body: JSON.stringify({ email, password, email_confirm: true,
      user_metadata: { customer_first_name: "D3B6 Layout",
        customer_phone: `+4366${randomInt(10000000, 99999999)}`,
        customer_birthday: birthday } }),
  });
  assert.equal(created.status, 200, "LAYOUT_CUSTOMER_AUTH_CREATE_FAILED");
  return { email, password };
}
credentials.customerPin = await createCustomer();
credentials.customerSwipe = await createCustomer();

const languages = process.env.D3B6_MATRIX_FAST === "1" ? ["de"] : ["de", "en", "fr", "it", "es", "zh", "ko"];
const widths = process.env.D3B6_MATRIX_FAST === "1" ? [390] : [320, 375, 390, 430, 767, 768, 1024, 1440];
const engines = process.env.D3B6_MATRIX_FAST === "1" ? [["CHROMIUM", chromium]] : [["CHROMIUM", chromium], ["WEBKIT", webkit]];
const tags = { de: "de-AT", en: "en-US", fr: "fr-FR", it: "it-IT", es: "es-ES", zh: "zh-CN", ko: "ko-KR" };
const queueTitle = { de: "Offene Einlösungen", en: "Open redemptions", fr: "Échanges en attente",
  it: "Riscatti in attesa", es: "Canjes pendientes", zh: "待确认兑换", ko: "대기 중인 교환" };
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
async function loginPage(browser, role, language) {
  const context = await browser.newContext({ locale: tags[language],
    viewport: { width: 390, height: 900 } });
  await context.addInitScript(memoryStorage);
  await context.route("**/*", (route) => ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname)
    ? route.continue() : route.abort());
  const page = await context.newPage();
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  if (role !== "anonymous") {
    const logged = await page.evaluate(async (credential) => {
      const { supabase } = await import("/src/shared/lib/supabase.ts");
      const result = await supabase.auth.signInWithPassword(credential);
      return !!result.data.session && !result.error;
    }, credentials[role]);
    assert.equal(logged, true, `${role}_${language}_LOGIN_FAILED`);
  }
  return { context, page };
}
async function joinAndStart(page, role) {
  const joined = await page.evaluate(async ({ restaurantSlug, roleName }) => {
    const { supabase } = await import("/src/shared/lib/supabase.ts");
    const result = await supabase.rpc("join_customer_account_restaurant", {
      input_restaurant_slug: restaurantSlug, input_terms_accepted: true,
      input_privacy_acknowledged: true, input_device_id: crypto.randomUUID(),
      input_existing_customer_token: null,
    });
    return { joined: result.data?.joined ?? false, error: result.error?.code ?? null,
      role: roleName };
  }, { restaurantSlug: slug, roleName: role });
  assert.equal(joined.joined, true, `${role}_JOIN_FAILED:${joined.error}`);
  const id = sql(`select g.id from public.customer_rewards g
    join public.customer_account_memberships m on m.customer_id=g.customer_id
    join public.customer_accounts a on a.id=m.account_id
    join auth.users u on u.id=a.auth_user_id
    where u.email='${credentials[role].email}' and g.gift_type='birthday' and g.status='active' limit 1`);
  assert.match(id, /^[0-9a-f-]{36}$/);
  const started = await page.evaluate(async ({ restaurantSlug, entitlementId }) => {
    const { supabase } = await import("/src/shared/lib/supabase.ts");
    const result = await supabase.functions.invoke("redemption-confirmation", { body: {
      action: "start", restaurant_slug: restaurantSlug, source_type: "gift",
      entitlement_id: entitlementId, request_id: crypto.randomUUID(),
      correlation_id: crypto.randomUUID(), idempotency_key: crypto.randomUUID(),
    } });
    return { status: result.data?.status ?? null, error: result.error?.context?.status ?? null,
      redemptionId: result.data?.redemption_id ?? null, correlationId: result.data?.correlation_id ?? null };
  }, { restaurantSlug: slug, entitlementId: id });
  assert.equal(started.status, "REQUESTED", `${role}_START_FAILED:${started.error}`);
  return started;
}

// Fixture setup stays entirely on local Auth/RPC/Edge. Customer access tokens
// and membership tokens remain in browser memory; only synthetic request IDs
// cross back to the assertion runner.
let pinRequestId = null;
let wrongPin = null;
const setupBrowser = await chromium.launch({ headless: true });
try {
  const pinActor = await loginPage(setupBrowser, "customerPin", "de");
  const swipeActor = await loginPage(setupBrowser, "customerSwipe", "de");
  pinRequestId = (await joinAndStart(pinActor.page, "customerPin")).redemptionId;
  const swipeRequest = await joinAndStart(swipeActor.page, "customerSwipe");
  const owner = await loginPage(setupBrowser, "owner", "de");
  const rotated = await owner.page.evaluate(async (restaurantSlug) => {
    const { supabase } = await import("/src/shared/lib/supabase.ts");
    const result = await supabase.functions.invoke("redemption-confirmation", { body: {
      action: "rotate_pin", restaurant_slug: restaurantSlug,
      request_id: crypto.randomUUID(), correlation_id: crypto.randomUUID(),
      idempotency_key: crypto.randomUUID(),
    } });
    if (result.error) throw new Error("PIN_ROTATION_FAILED");
    return result.data?.pin;
  }, slug);
  assert.match(rotated, /^\d{6}$/);
  wrongPin = rotated === "000000" ? "111111" : "000000";
  const verified = await swipeActor.page.evaluate(async ({ request, pin }) => {
    const { supabase } = await import("/src/shared/lib/supabase.ts");
    const result = await supabase.functions.invoke("redemption-confirmation", { body: {
      action: "verify_pin", redemption_id: request.redemptionId,
      correlation_id: request.correlationId, pin,
      request_id: crypto.randomUUID(), idempotency_key: crypto.randomUUID(),
    } });
    return result.data?.status ?? null;
  }, { request: swipeRequest, pin: rotated });
  assert.equal(verified, "PIN_VERIFIED");
  await pinActor.page.evaluate(async ({ restaurantSlug, targetRestaurantId }) => {
    const { supabase } = await import("/src/shared/lib/supabase.ts");
    const opened = await supabase.rpc("open_customer_account_membership", {
      input_restaurant_id: targetRestaurantId,
    });
    if (opened.error || !opened.data?.customer_token) throw new Error("CUSTOMER_MEMBERSHIP_OPEN_FAILED");
    history.pushState(null, "", `/customer/${restaurantSlug}?token=${encodeURIComponent(opened.data.customer_token)}`);
    dispatchEvent(new PopStateEvent("popstate"));
  }, { restaurantSlug: slug, targetRestaurantId: restaurantId });
  await pinActor.page.locator(".premium-active-code").waitFor();
  await pinActor.page.locator(".premium-active-code").click();
  await pinActor.page.locator("#secure-redemption-pin").waitFor();
  const beforeClose = fingerprint();
  await pinActor.page.keyboard.press("Escape");
  await pinActor.page.locator(".app-drawer-overlay").waitFor({ state: "hidden" });
  await pinActor.page.locator(".premium-active-code").click();
  await pinActor.page.locator("#secure-redemption-pin").waitFor();
  await pinActor.page.locator(".app-drawer-close").click();
  await pinActor.page.locator(".app-drawer-overlay").waitFor({ state: "hidden" });
  await pinActor.page.locator(".premium-active-code").click();
  await pinActor.page.locator("#secure-redemption-pin").waitFor();
  await pinActor.page.locator(".app-drawer-footer button").click();
  await pinActor.page.locator(".app-drawer-overlay").waitFor({ state: "hidden" });
  assert.equal(fingerprint(), beforeClose, "DRAWER_ESCAPE_X_CLOSE_WROTE_PUBLIC_DATA");
  console.log("D3B6_REAL_CUSTOMER_DRAWER_ESCAPE_X_CLOSE_ZERO_PUBLIC_WRITES_PASS");
  for (const item of [pinActor, swipeActor, owner]) await item.context.close();
} finally {
  await setupBrowser.close();
}
console.log("D3B6_REAL_LOCAL_ACTIVE_PIN_AND_SWIPE_FIXTURES_PASS");

let total = 0;
let pinStateChecks = 0;
let minimumPinHeight = Number.POSITIVE_INFINITY;
let minimumPinWidth = Number.POSITIVE_INFINITY;
async function checkPinState(page, engine, language, state, widthsToCheck, baseline = null) {
  for (const width of widthsToCheck) {
    await page.setViewportSize({ width, height: 900 });
    const measured = await page.evaluate((expectedWidth) => {
      const input = document.querySelector("#secure-redemption-pin");
      const panel = input?.closest(".app-drawer-panel");
      const body = panel?.querySelector(".app-drawer-body");
      const inputRect = input?.getBoundingClientRect();
      const mediaRect = panel?.querySelector(".premium-presentation-image")?.getBoundingClientRect();
      const controls = panel ? [...panel.querySelectorAll("button")]
        .filter((button) => button.getBoundingClientRect().width > 0)
        .map((button) => ({ height: button.getBoundingClientRect().height,
          width: button.getBoundingClientRect().width })) : [];
      const pinButton = panel?.querySelector(".premium-redemption-pin-entry button")?.getBoundingClientRect();
      const status = panel?.querySelector(".premium-presentation-window .status-message")?.getBoundingClientRect();
      return {
        inputHeight: inputRect?.height ?? 0, inputWidth: inputRect?.width ?? 0,
        boxSizing: input ? getComputedStyle(input).boxSizing : null,
        controls, bodyScroll: body ? getComputedStyle(body).overflowY : null,
        panelScroll: panel ? getComputedStyle(panel).overflowY : null,
        overflow: document.documentElement.scrollWidth > expectedWidth ||
          (panel?.scrollWidth ?? 0) > (panel?.clientWidth ?? 0) + 1 ||
          (body?.scrollWidth ?? 0) > (body?.clientWidth ?? 0) + 1,
        overlap: !!(inputRect && pinButton && inputRect.bottom > pinButton.top + 1),
        statusOverlap: !!(status && pinButton && pinButton.bottom > status.top + 1),
        media: mediaRect ? { width: mediaRect.width, height: mediaRect.height } : null,
      };
    }, width);
    const label = `${engine}/${language}/${width}/${state}`;
    assert.ok(measured.inputHeight >= 44, `${label}:PIN_HEIGHT`);
    assert.ok(measured.inputWidth >= 44, `${label}:PIN_WIDTH`);
    assert.equal(measured.boxSizing, "border-box", `${label}:BOX_SIZING`);
    assert.ok(measured.controls.length > 0 && measured.controls.every(({ height, width }) =>
      height >= 44 && width >= 44), `${label}:OTHER_TOUCH_TARGET`);
    assert.ok([measured.bodyScroll, measured.panelScroll].some((value) =>
      ["auto", "scroll"].includes(value)), `${label}:DRAWER_SCROLL`);
    assert.equal(measured.overflow, false, `${label}:OVERFLOW`);
    assert.equal(measured.overlap, false, `${label}:BUTTON_OVERLAP`);
    assert.equal(measured.statusOverlap, false, `${label}:STATUS_OVERLAP`);
    if (baseline?.get(width)) {
      const before = baseline.get(width);
      assert.ok(measured.media && Math.abs(measured.media.width - before.width) <= 1 &&
        Math.abs(measured.media.height - before.height) <= 1, `${label}:MEDIA_JUMP`);
    }
    minimumPinHeight = Math.min(minimumPinHeight, measured.inputHeight);
    minimumPinWidth = Math.min(minimumPinWidth, measured.inputWidth);
    pinStateChecks++;
    if (baseline && !baseline.has(width)) baseline.set(width, measured.media);
  }
}
for (const [engineName, launcher] of engines) {
  const browser = await launcher.launch({ headless: true });
  try {
    for (const language of languages) {
      if (engineName === "WEBKIT" && language === languages[0]) {
        credentials.customerPin = await createCustomer();
      }
      const pages = {};
      try {
        for (const role of ["owner", "admin", "manager", "staff", "customerPin", "customerSwipe", "anonymous"])
          pages[role] = await loginPage(browser, role, language);
        if (engineName === "WEBKIT" && language === languages[0]) {
          pinRequestId = (await joinAndStart(pages.customerPin.page, "customerPin")).redemptionId;
        }
        for (const role of ["owner", "admin", "manager", "staff", "anonymous"]) {
          const page = pages[role].page;
          await page.evaluate((restaurantSlug) => { history.pushState(null, "", `/staff/${restaurantSlug}`);
            dispatchEvent(new PopStateEvent("popstate")); }, slug);
          if (role === "owner" || role === "staff") {
            await page.bringToFront();
            await page.getByRole("heading", { name: queueTitle[language] }).waitFor();
          } else if (role === "admin" || role === "manager") {
            await page.locator("main.tablet-shell").waitFor();
            assert.equal(await page.getByRole("heading", { name: queueTitle[language] }).count(), 0);
          } else {
            await page.waitForTimeout(500);
            assert.equal(await page.locator("main.tablet-shell").count(), 0);
          }
        }
        for (const role of ["customerPin", "customerSwipe"]) {
          const page = pages[role].page;
          await page.evaluate(async ({ restaurantSlug, targetRestaurantId }) => {
            const { supabase } = await import("/src/shared/lib/supabase.ts");
            const opened = await supabase.rpc("open_customer_account_membership", {
              input_restaurant_id: targetRestaurantId,
            });
            if (opened.error || !opened.data?.customer_token) throw new Error("CUSTOMER_MEMBERSHIP_OPEN_FAILED");
            history.pushState(null, "", `/customer/${restaurantSlug}?token=${encodeURIComponent(opened.data.customer_token)}`);
            dispatchEvent(new PopStateEvent("popstate"));
          }, { restaurantSlug: slug, targetRestaurantId: restaurantId });
          await page.locator(".premium-active-code").waitFor();
          await page.locator(".premium-active-code").click();
          await page.locator(role === "customerPin" ? "#secure-redemption-pin" : ".premium-swipe-track").waitFor();
        }
        for (const width of widths) {
          for (const [role, item] of Object.entries(pages)) {
            await item.page.setViewportSize({ width, height: 900 });
            const layout = await item.page.evaluate((expectedWidth) => ({
              overflow: document.documentElement.scrollWidth > expectedWidth,
              lang: document.documentElement.lang,
              queueVisible: !!document.querySelector(".secure-redemption-queue-image"),
              pinVisible: !!document.querySelector("#secure-redemption-pin"),
              queueButtonsTall: [...document.querySelectorAll(".secure-redemption-queue-image")]
                .flatMap((image) => [...(image.closest("article")?.querySelectorAll("button") ?? [])])
                .every((button) => button.getBoundingClientRect().height >= 44),
              pinControlsTall: [...document.querySelectorAll(".premium-redemption-pin-entry input, .premium-redemption-pin-entry button")]
                .every((element) => element.getBoundingClientRect().height >= 44),
              swipeTall: [...document.querySelectorAll(".premium-swipe-track")]
                .every((element) => element.getBoundingClientRect().height >= 44),
              ratio: document.querySelector(".premium-presentation-image")
                ? getComputedStyle(document.querySelector(".premium-presentation-image")).aspectRatio : null,
            }), width);
            assert.equal(layout.overflow, false, `${engineName}/${language}/${width}/${role}:OVERFLOW`);
            assert.equal(layout.lang, language, `${engineName}/${language}/${width}/${role}:LANG`);
            if (["admin", "manager", "anonymous"].includes(role))
              assert.equal(layout.queueVisible, false, `${engineName}/${language}/${width}/${role}:QUEUE_LEAK`);
            if (role === "customerPin") assert.equal(layout.pinVisible, true);
            if (role.startsWith("customer") && layout.ratio) assert.equal(layout.ratio, "16 / 9");
            assert.equal(layout.queueButtonsTall, true, `${engineName}/${language}/${width}/${role}:QUEUE_TOUCH`);
            assert.equal(layout.pinControlsTall, true, `${engineName}/${language}/${width}/${role}:PIN_TOUCH`);
            assert.equal(layout.swipeTall, true, `${engineName}/${language}/${width}/${role}:SWIPE_TOUCH`);
            total++;
          }
        }
        const swipeCopy = await pages.customerSwipe.page.evaluate(async (currentLanguage) => {
          const { secureRedemptionMessages } = await import("/src/modules/rewards/secureRedemptionMessages.ts");
          const expected = secureRedemptionMessages(currentLanguage);
          const slider = document.querySelector(".premium-swipe-track");
          return { aria: slider?.getAttribute("aria-label") === expected.swipeAriaLabel,
            visible: document.querySelector(".premium-swipe-label")?.textContent?.trim() === expected.swipeLabel,
            helper: document.querySelector(".premium-swipe-confirmation")?.textContent?.includes(expected.swipeHelperText) ?? false,
            germanFallback: currentLanguage !== "de" && slider?.getAttribute("aria-label") ===
              secureRedemptionMessages("de").swipeAriaLabel };
        }, language);
        assert.deepEqual(swipeCopy, { aria: true, visible: true, helper: true, germanFallback: false });
        const measured = await Promise.all(["staff", "customerPin", "customerSwipe"].map(async (role) => {
          const page = pages[role].page;
          await page.setViewportSize({ width: 390, height: 900 });
          return page.evaluate(() => {
            const selector = document.querySelector(".premium-presentation-image")
              ? ".premium-presentation-image" : ".secure-redemption-queue-image";
            const rect = document.querySelector(selector)?.getBoundingClientRect();
            return rect ? { selector, width: rect.width, height: rect.height } : null;
          });
        }));
        await new Promise((resolve) => setTimeout(resolve, 5200));
        for (const [index, role] of ["staff", "customerPin", "customerSwipe"].entries()) {
          const prior = measured[index];
          assert.ok(prior, `${engineName}/${language}/${role}:MEDIA_MISSING`);
          const current = await pages[role].page.evaluate((selector) => {
            const rect = document.querySelector(selector)?.getBoundingClientRect();
            return rect ? { width: rect.width, height: rect.height } : null;
          }, prior.selector);
          assert.ok(current);
          assert.ok(Math.abs(current.width - prior.width) <= 1 && Math.abs(current.height - prior.height) <= 1,
            `${engineName}/${language}/${role}:POLLING_MEDIA_SHIFT`);
        }
        const pinPage = pages.customerPin.page;
        const pinBaseline = new Map();
        const beforeInput = fingerprint();
        await checkPinState(pinPage, engineName, language, "empty", widths, pinBaseline);
        await pinPage.locator("#secure-redemption-pin").focus();
        assert.equal(await pinPage.locator("#secure-redemption-pin").evaluate((input) =>
          document.activeElement === input), true);
        await checkPinState(pinPage, engineName, language, "focus", widths, pinBaseline);
        await pinPage.locator("#secure-redemption-pin").fill("12");
        await checkPinState(pinPage, engineName, language, "partial", widths, pinBaseline);
        await pinPage.locator("#secure-redemption-pin").fill(wrongPin);
        await checkPinState(pinPage, engineName, language, "full", widths, pinBaseline);
        assert.equal(fingerprint(), beforeInput, `${engineName}/${language}:INPUT_OR_RESIZE_WROTE_DATA`);
        await pinPage.locator(".premium-redemption-pin-entry button").click();
        await pinPage.locator("#secure-redemption-pin").waitFor();
        await pinPage.waitForFunction(() => document.querySelector("#secure-redemption-pin")?.value === "" &&
          !!document.querySelector(".premium-presentation-window .status-message"));
        await checkPinState(pinPage, engineName, language, "error", widths, pinBaseline);
        if (language === languages[0]) {
          for (let attempt = 2; attempt <= 5; attempt++) {
            await pinPage.locator("#secure-redemption-pin").fill(wrongPin);
            await pinPage.locator(".premium-redemption-pin-entry button").click();
            await pinPage.waitForFunction(() => document.querySelector("#secure-redemption-pin")?.value === "" &&
              !!document.querySelector(".premium-presentation-window .status-message"));
          }
        }
        assert.equal(sql(`select failed_pin_attempts from public.secure_redemption_requests
          where id='${pinRequestId}'`), "5", `${engineName}/${language}:FIVE_ATTEMPT_LOCK`);
        await checkPinState(pinPage, engineName, language, "locked", widths, pinBaseline);
        console.log(`D3B6_${engineName}_${language.toUpperCase()}_${widths.length}_WIDTHS_ROLE_LAYOUT_PASS`);
      } finally {
        for (const item of Object.values(pages)) await item.context.close();
      }
    }
  } finally {
    await browser.close();
  }
}
console.log(`D3B6_AUTHENTICATED_PHYSICAL_MATRIX_CHECKS=${total}`);
console.log(`D3B7_REAL_PIN_TOUCH_STATE_CHECKS=${pinStateChecks};MIN_HEIGHT=${minimumPinHeight};MIN_WIDTH=${minimumPinWidth}`);
