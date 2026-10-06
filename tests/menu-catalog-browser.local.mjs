import assert from "node:assert/strict";
import { createServer } from "vite";

const playwright = await import(process.env.WUXUAI_PLAYWRIGHT_MODULE || "playwright");
const languages = ["de", "en", "fr", "it", "es", "zh", "ko"];
const widths = [320, 390, 430, 844];
const server = await createServer({ configFile: false, logLevel: "error", server: { host: "127.0.0.1", port: 0 } });
let checks = 0;
let errors = 0;
await server.listen();
const address = server.httpServer.address();
if (!address || typeof address === "string") throw new Error("MENU_BROWSER_SERVER_UNAVAILABLE");
const url = `http://127.0.0.1:${address.port}/tests/menu-catalog-browser.local.html`;
try {
  for (const [name, engine] of [["chromium", playwright.chromium], ["webkit", playwright.webkit]]) {
    const browser = await engine.launch({ headless: true });
    try {
      for (const language of languages) {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
        page.on("pageerror", () => { errors += 1; });
        await page.goto(url);
        await page.waitForFunction(() => Boolean(window.__menuHarness));
        await page.evaluate((value) => window.__menuHarness.setLanguage(value), language);
        await page.waitForFunction((value) => document.documentElement.lang === value, language);
        const stateTexts = await page.evaluate(() => ["title", "loading", "unavailable", "retry", "error", "draft", "upload", "publish", "unpublish", "noEntitlement"].map((key) => window.__menuHarness.text(key)));
        assert.equal(stateTexts.length, 10);
        assert.ok(stateTexts.every((value) => typeof value === "string" && value.trim().length > 0));
        const menu = page.locator(".premium-bottom-navigation button").nth(2);
        assert.equal(await menu.innerText(), ({ de: "Menü", en: "Menu", fr: "Menu", it: "Menù", es: "Menú", zh: "菜单", ko: "메뉴" })[language]);
        assert.equal(await page.locator(".premium-bottom-navigation button").count(), 5);
        assert.match(await page.locator(".premium-bottom-navigation button").nth(3).innerText(), /\S/);
        for (const width of widths) {
          await page.setViewportSize({ width, height: width === 844 ? 390 : 760 });
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
          assert.ok(overflow <= 1, `${name}/${language}/${width}: horizontal overflow ${overflow}`);
          checks += 1;
        }
        await menu.focus();
        await page.keyboard.press("Enter");
        await page.getByTestId("menu-content").waitFor();
        await page.goto(`${url}?view=menu`);
        await page.getByTestId("menu-content").waitFor();
        await page.evaluate(() => window.__menuHarness.setAvailable(false));
        await page.waitForFunction(() => document.querySelectorAll(".premium-bottom-navigation button").length === 4);
        assert.equal(await page.locator(".premium-bottom-navigation button").count(), 4);
        assert.equal(await page.getByTestId("menu-content").count(), 0);
        checks += 5;
        await page.close();
      }
    } finally { await browser.close(); }
  }
  assert.equal(errors, 0, "browser console errors");
  console.log(`MENU_BROWSER_NAV_PASS checks=${checks} engines=chromium,webkit languages=7 widths=320,390,430,landscape`);
} finally { await server.close(); }
