import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium, webkit } from "/Users/dongdongwu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const css = readFileSync(new URL("../src/modules/customer/customer-premium.css", import.meta.url), "utf8");
const labels = {
  de: "Zum Einlösen nach rechts wischen",
  en: "Swipe right to redeem",
  fr: "Glisser à droite pour échanger",
  it: "Scorri a destra per riscattare",
  es: "Desliza a la derecha para canjear",
  zh: "向右滑动以兑换",
  ko: "오른쪽으로 밀어 교환하기",
};
let checks = 0;
for (const [name, launcher] of [["Chromium", chromium], ["WebKit", webkit]]) {
  const browser = await launcher.launch({ headless: true });
  try {
    const page = await browser.newPage();
    for (const [language, label] of Object.entries(labels)) {
      for (const width of [320, 375, 390, 430, 767, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.setContent(`<style>${css}</style><div style="width:100%;max-width:${width}px">
          <div class="premium-swipe-confirmation"><div class="premium-swipe-track">
          <span class="premium-swipe-label"></span><span class="premium-swipe-thumb"></span></div></div></div>`);
        await page.locator(".premium-swipe-label").evaluate((element, value) => { element.textContent = value; }, label);
        const geometry = await page.locator(".premium-swipe-label").evaluate((element) => ({
          scrollWidth: element.scrollWidth, clientWidth: element.clientWidth,
          scrollHeight: element.scrollHeight, clientHeight: element.clientHeight,
        }));
        assert.ok(geometry.scrollWidth <= geometry.clientWidth + 1, `${name}/${language}/${width}:horizontal-clipping`);
        assert.ok(geometry.scrollHeight <= geometry.clientHeight + 1, `${name}/${language}/${width}:vertical-clipping`);
        checks++;
      }
    }
  } finally { await browser.close(); }
}
console.log(`SWIPE_LABEL_GEOMETRY_PASS ${checks}`);
