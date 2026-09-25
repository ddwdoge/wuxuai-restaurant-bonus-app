import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium, webkit } from "/Users/dongdongwu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const languages = ["de", "en", "fr", "it", "es", "zh", "ko"];
const widths = [320, 375, 390, 430, 767, 768, 1024, 1440];
const headings = { de: "Offene Einlösungen", en: "Open redemptions", fr: "Échanges en attente",
  it: "Riscatti in attesa", es: "Canjes pendientes", zh: "待确认兑换", ko: "대기 중인 교환" };
const nextLabels = { de: "Nächste", en: "Next", fr: "Suivante", it: "Successiva",
  es: "Siguiente", zh: "下一项", ko: "다음" };
let checks = 0;
let browserErrors = 0;

const server = await createServer({ configFile: "tests/phase-7d4c-vite.local.mjs",
  logLevel: "error", server: { host: "127.0.0.1", port: 0 } });
await server.listen();
const address = server.httpServer.address();
if (!address || typeof address === "string") throw new Error("LOCAL_BROWSER_SERVER_UNAVAILABLE");
const url = `http://127.0.0.1:${address.port}/tests/phase-7d4c-browser-harness.local.html`;

function rows(count, prefix = "a", expiresInMs = 600000) {
  const now = Date.now();
  return Array.from({ length: count }, (_, index) => ({
    redemption_id: `request-${prefix}-${index}`, correlation_id: `correlation-${prefix}-${index}`,
    reward_title: `Sehr langer Prämienname ${prefix} ${index} mit zusätzlichen Worten zum Umbruch`,
    customer_label: `Langer Kundenname ${prefix} ${index} mit Zusatz`,
    presentation_type: "points", status: "REQUESTED",
    requested_at: new Date(now - index * 1000).toISOString(),
    expires_at: new Date(now + expiresInMs + index * 1000).toISOString(),
  }));
}

const waitRequests = (page, key, count) => page.waitForFunction(([name, amount]) =>
  window.__d4c[name].length >= amount, [key, count]);

async function openPage(browser, language, role, count = 10, options = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.on("pageerror", () => { browserErrors++; });
  await page.addInitScript((value) => { window.__d4cLanguage = value; }, language);
  if (options.rapidPolling) await page.addInitScript(() => {
    const original = window.setInterval.bind(window);
    window.setInterval = (callback, delay, ...args) =>
      original(callback, delay === 5000 ? 50 : delay, ...args);
  });
  await page.goto(`${url}?role=${role}#/staff/a`);
  await page.evaluate(() => window.__d4cNavigate("a"));
  await waitRequests(page, "portalRequests", 1);
  await page.evaluate(({ role }) => window.__d4c.portalRequests[0].resolve({
    success: role !== "customer" && role !== "anonymous", restaurant_slug: "a", restaurant_role: role,
  }), { role });
  if (role === "customer" || role === "anonymous") {
    await page.getByText("Kein Mitarbeiterzugang").waitFor();
  } else {
    await page.locator('[data-testid="portal"]').waitFor();
    await waitRequests(page, "queueRequests", 1);
    if (role === "owner" || role === "staff") {
      await page.evaluate(({ role, requests }) => window.__d4c.queueRequests[0].resolve({
        actor_role: role.toUpperCase(), server_now: new Date().toISOString(), requests,
      }), { role, requests: options.requests ?? rows(count) });
      await page.locator(".secure-redemption-queue-heading h2").waitFor();
    } else {
      await page.evaluate(() => window.__d4c.queueRequests[0].reject(new Error("QUEUE_ROLE_DENIED")));
    }
  }
  return { context, page };
}

async function resolveQueueAt(page, index, requests, role = "staff") {
  await waitRequests(page, "queueRequests", index + 1);
  await page.evaluate(({ index, requests, role }) => window.__d4c.queueRequests[index].resolve({
    actor_role: role.toUpperCase(), server_now: new Date().toISOString(), requests,
  }), { index, requests, role });
}

try {
  for (const [engineName, engine] of [["chromium", chromium], ["webkit", webkit]]) {
    const browser = await engine.launch({ headless: true });
    try {
      for (const language of languages) {
        const { context, page } = await openPage(browser, language, "staff", 10);
        try {
          assert.equal(await page.locator(".secure-redemption-card").count(), 20);
          assert.match(await page.locator(".secure-redemption-queue-heading h2").innerText(),
            new RegExp(`${headings[language]} · 10`));
          for (const width of widths) {
            await page.setViewportSize({ width, height: 844 });
            const metrics = await page.evaluate(() => {
              const track = document.querySelector(".secure-redemption-queue-track");
              const cards = [...track.children];
              const trackRect = track.getBoundingClientRect();
              const visible = cards.filter((card) => {
                const rect = card.getBoundingClientRect();
                return rect.left >= trackRect.left - 1 && rect.right <= trackRect.right + 1;
              }).length;
              const image = document.querySelector(".secure-redemption-queue-image");
              const imageRect = image.getBoundingClientRect();
              const badTargets = [...document.querySelectorAll(".secure-redemption-queue button")]
                .filter((button) => button.getBoundingClientRect().height > 0)
                .filter((button) => button.getBoundingClientRect().height < 44
                  || button.getBoundingClientRect().width < 44).length;
              return { pageOverflow: document.documentElement.scrollWidth > innerWidth,
                height: trackRect.height, visible, imageWidth: imageRect.width,
                imageHeight: imageRect.height, imageFit: getComputedStyle(image.querySelector("img")).objectFit,
                badTargets };
            });
            assert.equal(metrics.pageOverflow, false, `${engineName}/${language}/${width}: page overflow`);
            assert.equal(metrics.height, 242, `${engineName}/${language}/${width}: queue height`);
            assert.equal(metrics.visible, width >= 1024 ? 2 : 1,
              `${engineName}/${language}/${width}: visible cards`);
            assert.ok(metrics.imageWidth >= 72 && metrics.imageWidth <= 88);
            assert.equal(metrics.imageWidth, metrics.imageHeight);
            assert.equal(metrics.imageFit, "cover");
            assert.equal(metrics.badTargets, 0, `${engineName}/${language}/${width}: touch targets`);
            checks++;
          }
          await page.setViewportSize({ width: 390, height: 844 });
          await page.getByRole("button", { name: nextLabels[language] }).focus();
          await page.keyboard.press("Enter");
          const position = await page.locator(".secure-redemption-queue-navigation span").innerText();
          assert.equal(position, language === "zh" ? "第 2 项，共 10 项"
            : language === "ko" ? "전체 10개 중 2번째" : `2 ${{
              de: "von", en: "of", fr: "sur", it: "di", es: "de",
            }[language]} 10`);
          assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), nextLabels[language]);
          await page.locator(".secure-redemption-queue-heading button").click();
          assert.equal(await page.locator(".secure-redemption-all-dialog").evaluate((dialog) => dialog.open), true);
          await page.keyboard.press("Escape");
          assert.equal(await page.locator(".secure-redemption-all-dialog").evaluate((dialog) => dialog.open), false);
          if (language === "de") {
            await page.locator(".secure-redemption-queue-heading button").click();
            await page.getByRole("button", { name: "Abbrechen" }).click();
            assert.equal(await page.locator(".secure-redemption-all-dialog").evaluate((dialog) => dialog.open), false);
            await page.locator(".secure-redemption-queue-heading button").click();
            await page.getByRole("button", { name: "Schließen" }).click();
            assert.equal(await page.locator(".secure-redemption-all-dialog").evaluate((dialog) => dialog.open), false);
            const beforeWheel = await page.locator(".secure-redemption-queue-track").evaluate((track) => track.scrollLeft);
            await page.locator(".secure-redemption-queue-track").hover();
            await page.mouse.wheel(180, 0);
            await page.waitForTimeout(100);
            assert.ok(await page.locator(".secure-redemption-queue-track").evaluate((track) => track.scrollLeft) > beforeWheel);
            checks += 3;
          }
          assert.equal(await page.evaluate(() => window.__d4c.actions.length + window.__d4c.otherWrites), 0);
          checks += 4;
        } finally { await context.close(); }
      }

      for (const role of ["owner", "admin", "manager", "staff", "customer", "anonymous"]) {
        const { context, page } = await openPage(browser, "de", role, 2);
        try {
          assert.equal(await page.locator('[data-testid="portal"]').count(),
            role === "customer" || role === "anonymous" ? 0 : 1);
          assert.equal(await page.locator(".secure-redemption-queue").count(),
            role === "owner" || role === "staff" ? 1 : 0);
          assert.equal(await page.evaluate(() => window.__d4c.actions.length + window.__d4c.otherWrites), 0);
          checks += 3;
        } finally { await context.close(); }
      }

      for (const count of [0, 1, 2, 5, 10]) {
        const { context, page } = await openPage(browser, "de", "staff", count);
        try {
          assert.equal(await page.locator(".secure-redemption-queue-track .secure-redemption-card").count(), count);
          assert.equal(await page.locator(".secure-redemption-queue-navigation button").count(), count > 1 ? 2 : 0);
          assert.equal(await page.locator(".secure-redemption-queue-heading button").count(), count > 2 ? 1 : 0);
          checks += 3;
        } finally { await context.close(); }
      }

      {
        const { context, page } = await openPage(browser, "de", "staff", 2);
        try {
          await page.getByRole("button", { name: "Nächste" }).click();
          await resolveQueueAt(page, 1, [...rows(2), ...rows(24, "new")]);
          await page.waitForFunction(() => document.querySelectorAll(".secure-redemption-queue-track .secure-redemption-card").length === 26);
          const ids = await page.locator(".secure-redemption-queue-track .secure-redemption-card").evaluateAll((cards) =>
            cards.map((card) => card.dataset.requestId));
          assert.deepEqual(ids.slice(0, 2), ["request-a-0", "request-a-1"]);
          assert.equal(new Set(ids).size, 26);
          assert.match(await page.locator(".secure-redemption-queue-navigation span").innerText(), /^2 von 26$/);
          assert.equal(await page.evaluate(() => window.__d4c.actions.length + window.__d4c.otherWrites), 0);
          checks += 4;
        } finally { await context.close(); }
      }

      {
        const { context, page } = await openPage(browser, "de", "staff", 5, { rapidPolling: true });
        try {
          await waitRequests(page, "queueRequests", 25);
          await page.evaluate(() => Object.defineProperty(document, "hidden", { configurable: true, get: () => true }));
          for (let index = 24; index >= 1; index--)
            await resolveQueueAt(page, index, rows(5));
          assert.equal(await page.locator(".secure-redemption-queue-track .secure-redemption-card").count(), 5);
          assert.equal(await page.evaluate(() => window.__d4c.actions.length + window.__d4c.otherWrites), 0);
          checks += 2;
        } finally { await context.close(); }
      }

      {
        const { context, page } = await openPage(browser, "de", "staff", 1,
          { requests: rows(1, "a", 1200) });
        try {
          await page.waitForTimeout(2200);
          assert.equal(await page.locator(".secure-redemption-queue-track .secure-redemption-card button:disabled").count(), 2);
          assert.match(await page.locator(".secure-redemption-queue-track .secure-redemption-card-status").innerText(), /Abgelaufen/);
          assert.equal(await page.evaluate(() => window.__d4c.actions.length), 0);
          checks += 3;
        } finally { await context.close(); }
      }

      {
        const { context, page } = await openPage(browser, "de", "staff", 2);
        try {
          const first = page.locator(".secure-redemption-queue-track .secure-redemption-card").first();
          await first.getByRole("button", { name: "Bestätigen" }).click();
          assert.deepEqual(await page.evaluate(() => window.__d4c.actions), [{ action: "approve",
            redemptionId: "request-a-0", correlationId: "correlation-a-0" }]);
          await resolveQueueAt(page, 1, rows(2).slice(1));
          await page.waitForFunction(() => document.querySelectorAll(".secure-redemption-queue-track .secure-redemption-card").length === 1);
          await page.waitForFunction(() => document.activeElement?.getAttribute("data-request-id") === "request-a-1");
          await page.locator(".secure-redemption-queue-track .secure-redemption-card")
            .getByRole("button", { name: "Ablehnen" }).click();
          assert.equal(await page.evaluate(() => window.__d4c.actions.length), 2);
          assert.deepEqual(await page.evaluate(() => window.__d4c.actions[1]), { action: "reject",
            redemptionId: "request-a-1", correlationId: "correlation-a-1" });
          await resolveQueueAt(page, 2, []);
          await page.getByText("Keine offenen Anträge.").waitFor();
          await page.waitForFunction(() => document.activeElement?.textContent?.includes("Offene Einlösungen · 0"));
          checks += 5;
        } finally { await context.close(); }
      }

      {
        const { context, page } = await openPage(browser, "de", "staff", 2, { rapidPolling: true });
        try {
          await waitRequests(page, "queueRequests", 2); // A response remains unresolved.
          await page.evaluate(() => window.__d4cNavigate("b"));
          assert.equal(await page.locator(".secure-redemption-queue").count(), 0);
          await waitRequests(page, "portalRequests", 2);
          await page.evaluate(() => window.__d4c.portalRequests[1].resolve({
            success: true, restaurant_slug: "b", restaurant_role: "staff" }));
          await page.waitForFunction(() => window.__d4c.queueRequests.some((request) => request.slug === "b"));
          const bIndex = await page.evaluate(() => window.__d4c.queueRequests.findIndex((request) => request.slug === "b"));
          await resolveQueueAt(page, bIndex, rows(1, "b"));
          await page.locator('.secure-redemption-queue-track [data-request-id="request-b-0"]').waitFor();
          await resolveQueueAt(page, 1, rows(2, "a"));
          assert.equal(await page.locator('[data-request-id^="request-a-"]').count(), 0);
          assert.equal(await page.evaluate(() => window.__d4c.actions.length + window.__d4c.otherWrites), 0);
          checks += 3;
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
  assert.equal(browserErrors, 0);
  console.log(`LOCAL COMPACT REDEMPTION QUEUE: ${checks} Chromium/WebKit checks PASS; writes 0`);
} finally { await server.close(); }
