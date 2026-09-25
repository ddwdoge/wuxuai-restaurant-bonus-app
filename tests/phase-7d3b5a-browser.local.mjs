import assert from "node:assert/strict";
import { chromium, webkit } from "/Users/dongdongwu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const url = "http://127.0.0.1:4180/tests/phase-7d3b5a-browser-harness.local.html";
const languages = ["de", "en", "fr", "it", "es", "zh", "ko"];
const widths = [320, 375, 390, 430, 767, 768, 1024, 1440];
const roles = ["owner", "admin", "manager", "staff", "customer", "anonymous"];
const titles = { de: "Offene Einlösungen", en: "Open redemptions", fr: "Échanges en attente",
  it: "Riscatti in attesa", es: "Canjes pendientes", zh: "待确认兑换", ko: "대기 중인 교환" };
let checks = 0;
let pageErrors = 0;

const waitRequests = (page, type, count) => page.waitForFunction(([key, n]) => window.__d3b5a[key].length >= n,
  [type, count]);
const resolvePortal = (page, index, slug, role) => page.evaluate(({ index, slug, role }) => {
  window.__d3b5a.portalRequests[index].resolve({ success: role !== "customer" && role !== "anonymous",
    restaurant_slug: slug, restaurant_role: role });
}, { index, slug, role });
const resolveQueue = (page, index, slug, role) => page.evaluate(({ index, slug, role }) => {
  const now = new Date().toISOString();
  window.__d3b5a.queueRequests[index].resolve({ actor_role: role.toUpperCase(), server_now: now,
    requests: [{ redemption_id: `request-${slug}`, correlation_id: `correlation-${slug}`,
      reward_title: `Reward ${slug}`, customer_label: `Customer ${slug}`,
      presentation_type: "points", requested_at: now,
      expires_at: new Date(Date.now() + 600000).toISOString() }] });
}, { index, slug, role });

for (const [browserName, engine] of [["chromium", chromium], ["webkit", webkit]]) {
  const browser = await engine.launch({ headless: true });
  try {
    for (const language of languages) {
      for (const role of roles) {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
        const page = await context.newPage();
        page.on("pageerror", () => { pageErrors++; });
        await page.addInitScript((value) => { window.__d3b5aLanguage = value; }, language);
        await page.goto(url);
        await page.evaluate(() => window.__d3b5aNavigate("a"));
        await waitRequests(page, "portalRequests", 1);
        assert.equal(await page.locator('[data-testid="portal"]').count(), 0);
        assert.equal(await page.getByText(titles[language]).count(), 0);
        await resolvePortal(page, 0, "a", role);
        if (role === "customer" || role === "anonymous") {
          await page.getByText("Kein Mitarbeiterzugang").waitFor();
          assert.equal(await page.locator('[data-testid="portal"]').count(), 0);
          assert.equal(await page.evaluate(() => window.__d3b5a.queueRequests.length), 0);
        } else {
          await page.locator('[data-testid="portal"][data-slug="a"]').waitFor();
          await waitRequests(page, "queueRequests", 1);
          assert.equal(await page.getByText(titles[language]).count(), 0);
          if (role === "owner" || role === "staff") {
            await resolveQueue(page, 0, "a", role);
            await page.getByText(titles[language]).waitFor();
            assert.equal(await page.getByText("Customer a").count(), 1);
          } else {
            await page.evaluate(() => window.__d3b5a.queueRequests[0].reject(new Error("QUEUE_ROLE_DENIED")));
            await page.waitForTimeout(20);
            assert.equal(await page.locator('[data-testid="portal"]').count(), 1);
            assert.equal(await page.getByText(titles[language]).count(), 0);
          }
        }
        for (const width of widths) {
          await page.setViewportSize({ width, height: 844 });
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false,
            `${browserName}/${language}/${role}/${width}: overflow`);
          if (role === "owner" || role === "staff") {
            const small = await page.locator("section button").evaluateAll((buttons) =>
              buttons.filter((button) => button.getBoundingClientRect().height < 44).length);
            assert.equal(small, 0, `${browserName}/${language}/${role}/${width}: touch target`);
          }
          checks++;
        }
        if (language === "de" && ["owner", "admin", "manager"].includes(role)) {
          await page.evaluate(() => window.__d3b5aNavigate("b"));
          assert.equal(await page.locator('[data-testid="portal"]').count(), 0);
          assert.equal(await page.getByText("Customer a").count(), 0);
          await waitRequests(page, "portalRequests", 2);
          await page.evaluate(() => window.__d3b5a.portalRequests[1].resolve({
            success: false, restaurant_slug: "b", restaurant_role: "staff" }));
          await page.getByText("Kein Mitarbeiterzugang").waitFor();
          assert.equal(await page.getByText(titles[language]).count(), 0);
          checks += 4;
        }
        if (language === "de" && role === "staff") {
          // The first B render must hide A, before the B authorization effect settles.
          await page.evaluate(() => window.__d3b5aNavigate("b"));
          assert.equal(await page.getByText("Customer a").count(), 0);
          assert.equal(await page.locator('[data-testid="portal"]').count(), 0);
          await waitRequests(page, "portalRequests", 2);
          await resolvePortal(page, 1, "b", "staff");
          await page.locator('[data-testid="portal"][data-slug="b"]').waitFor();
          await waitRequests(page, "queueRequests", 2);
          assert.equal(await page.getByText("Customer a").count(), 0);
          await resolveQueue(page, 1, "b", "staff");
          await page.getByText("Customer b").waitFor();
          assert.equal(await page.getByText("Customer a").count(), 0);
          checks += 4;
          for (let i = 0; i < 24; i++) {
            const slug = i % 2 ? "b" : "a";
            await page.evaluate((value) => window.__d3b5aNavigate(value), slug);
            if (slug !== "a") assert.equal(await page.getByText("Customer a").count(), 0);
            if (slug !== "b") assert.equal(await page.getByText("Customer b").count(), 0);
            checks++;
          }
          const first = await page.evaluate(() => ({ portal: window.__d3b5a.portalRequests.length,
            queue: window.__d3b5a.queueRequests.length }));
          await page.evaluate(() => window.__d3b5aNavigate("a"));
          await waitRequests(page, "portalRequests", first.portal + 1);
          await page.evaluate(() => window.__d3b5aNavigate("b"));
          await waitRequests(page, "portalRequests", first.portal + 2);
          await resolvePortal(page, first.portal + 1, "b", "staff");
          await page.locator('[data-testid="portal"][data-slug="b"]').waitFor();
          await resolvePortal(page, first.portal, "a", "staff");
          assert.equal(await page.getByText("Customer a").count(), 0);
          await waitRequests(page, "queueRequests", first.queue + 1);
          await resolveQueue(page, first.queue, "b", "staff");
          await page.getByText("Customer b").waitFor();
          checks += 4;

          const second = await page.evaluate(() => ({ portal: window.__d3b5a.portalRequests.length,
            queue: window.__d3b5a.queueRequests.length }));
          await page.evaluate(() => window.__d3b5aNavigate("a"));
          await waitRequests(page, "portalRequests", second.portal + 1);
          await resolvePortal(page, second.portal, "a", "staff");
          await page.locator('[data-testid="portal"][data-slug="a"]').waitFor();
          await waitRequests(page, "queueRequests", second.queue + 1);
          await page.evaluate(() => window.__d3b5aNavigate("b"));
          await waitRequests(page, "portalRequests", second.portal + 2);
          await resolvePortal(page, second.portal + 1, "b", "staff");
          await page.locator('[data-testid="portal"][data-slug="b"]').waitFor();
          await waitRequests(page, "queueRequests", second.queue + 2);
          await resolveQueue(page, second.queue + 1, "b", "staff");
          await page.getByText("Customer b").waitFor();
          await resolveQueue(page, second.queue, "a", "staff");
          assert.equal(await page.getByText("Customer a").count(), 0);
          checks += 5;
          await page.evaluate(() => window.__d3b5aNavigate("a"));
          await waitRequests(page, "portalRequests", second.portal + 3);
          await page.goto(url); // unmount with the A authorization request unresolved
          assert.equal(await page.getByText("Customer a").count(), 0);
          assert.equal(await page.getByText("Customer b").count(), 0);
          await page.evaluate(() => window.__d3b5aNavigate("a"));
          await waitRequests(page, "portalRequests", 1);
          assert.equal(await page.getByText(titles[language]).count(), 0);
          checks += 3;
        }
        assert.equal(await page.evaluate(() => window.__d3b5a.writes), 0);
        await context.close();
      }
    }
  } finally { await browser.close(); }
}
assert.equal(pageErrors, 0, `browser errors: ${pageErrors}`);
console.log(JSON.stringify({ browsers: 2, languages: languages.length, widths: widths.length,
  roles: roles.length, checks, businessWrites: 0, pageErrors }));
