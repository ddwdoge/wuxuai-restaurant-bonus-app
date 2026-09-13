import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { customerRewardPresentation, customerPresentationText } from "../src/modules/customer/customerRewardPresentation.mjs";
import { CUSTOMER_PRESENTATION_MESSAGES } from "../src/shared/i18n/customerPresentationMessages.mjs";
import { translateStructural } from "../src/shared/i18n/catalog.mjs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const expected = {
  de: ["Überraschung des Hauses", "Eine Überraschung für dich"],
  en: ["A surprise from the restaurant", "A surprise for you"],
  fr: ["Surprise de la maison", "Une surprise pour toi"],
  it: ["Sorpresa della casa", "Una sorpresa per te"],
  es: ["Sorpresa de la casa", "Una sorpresa para ti"],
  zh: ["店家惊喜", "给你的惊喜"],
  ko: ["매장에서 준비한 깜짝 선물", "당신을 위한 깜짝 선물"],
};
const reserved = { category: "Eigene Überraschung", title: "Eigene Überraschung" };
const expectedControls = {
  de: ["Details ansehen", "Ansicht schließen", "Start", "Sammeln"],
  en: ["View details", "Close view", "Home", "Collect"],
  fr: ["Voir les détails", "Fermer la vue", "Accueil", "Cumuler"],
  it: ["Vedi dettagli", "Chiudi vista", "Home", "Accumula"],
  es: ["Ver detalles", "Cerrar vista", "Inicio", "Acumular"],
  zh: ["查看详情", "关闭视图", "首页", "集点"],
  ko: ["자세히 보기", "화면 닫기", "홈", "적립"],
};

for (const [language, [category, title]] of Object.entries(expected)) {
  test(`${language}: exact reserved title and blank title use distinct Founder copy`, () => {
    for (const raw of [reserved.title, `  ${reserved.title}\n`, "", "  ", null]) {
      const input = Object.freeze({ ...reserved, title: raw });
      assert.deepEqual(customerRewardPresentation(input, language), { customSurprise: true, category, title });
      assert.equal(input.title, raw);
      assert.notEqual(category, title);
    }
  });
  test(`${language}: individual titles and ambiguous/foreign categories are preserved`, () => {
    for (const raw of ["Chefkoch-Menü", "Eigene Überraschung Deluxe", "Meine Eigene Überraschung", "eigene Überraschung", "  Spezialität des Tages  ", "Gratis Getränk"]) {
      assert.equal(customerRewardPresentation({ ...reserved, title: raw }, language).title, raw);
    }
    for (const other of ["Dessert", "Eigene Belohnung", "eigene überraschung", null, undefined]) {
      assert.equal(customerRewardPresentation({ title: reserved.title, category: other, product_group: reserved.category }, language).title, reserved.title);
    }
    assert.equal(customerRewardPresentation({ ...reserved, category: ` ${reserved.category} ` }, language).title, title);
  });
  test(`${language}: all new catalog keys exist without fallback or unresolved parameters`, () => {
    assert.deepEqual(["details", "close", "home", "collect"].map(key => customerPresentationText(key, language)), expectedControls[language]);
    assert.deepEqual(Object.keys(CUSTOMER_PRESENTATION_MESSAGES[language]), Object.keys(CUSTOMER_PRESENTATION_MESSAGES.de));
    for (const [key, value] of Object.entries(CUSTOMER_PRESENTATION_MESSAGES[language])) {
      assert.equal(translateStructural(key, language), value);
      assert.ok(value.trim());
      const result = customerPresentationText(key.split(".").at(-1), language, { title: "Bistro", current: 1, total: 2, count: 3, name: "Test", date: "13.09.2026", used: 0, limit: 5 });
      assert.doesNotMatch(result, /customer\.presentation\.|\{\w+\}/);
    }
  });
}

const source = read("src/modules/customer/components/PremiumCustomerUi.tsx");
const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const require = createRequire(import.meta.url);
function components(language) {
  const exports = {};
  const load = id => {
    if (id.endsWith(".css")) return {};
    if (id.endsWith("/I18nProvider")) return { useI18n: () => ({ language, translateKey: key => translateStructural(key, language) }) };
    if (id.endsWith("/catalog.mjs")) return { translateStructural };
    if (id.endsWith("/customerRewardPresentation.mjs")) return { customerPresentationText };
    if (id.endsWith("/ui")) return {
      UiCard: ({ children, variant: _variant, ...props }) => React.createElement("article", props, children),
      UiButton: ({ children, variant: _variant, ...props }) => React.createElement("button", props, children),
      UiStatus: ({ children, tone: _tone, ...props }) => React.createElement("span", props, children),
    };
    if (id.endsWith("/RewardImageFrame")) return { RewardImageFrame: ({ alt }) => React.createElement("img", { alt }) };
    if (/\/(AppDrawer|RestaurantLogoStage|InfoTrigger|LanguageSelector)$/.test(id)) return {};
    return require(id);
  };
  new Function("require", "exports", compiled)(load, exports);
  return exports;
}
for (const [language, [category, title]] of Object.entries(expected)) {
  test(`${language}: actual RewardCard renders distinct title/category, localized ARIA and the same action`, () => {
    const { RewardCard } = components(language);
    const html = renderToStaticMarkup(React.createElement(RewardCard, {
      ...customerRewardPresentation(reserved, language), imageFirst: true,
      meta: customerPresentationText("birthdayMeta", language),
      status: customerPresentationText("giftRedeemable", language), state: "available", onOpen() {},
    }));
    assert.ok(html.includes(category)); assert.ok(html.includes(title));
    assert.ok(html.includes(customerPresentationText("details", language)));
    assert.doesNotMatch(html, language === "de" ? /Eigene Überraschung|customer\.presentation\./u : /Eigene Überraschung|Standardbild|Details ansehen|customer\.presentation\./u);
    assert.equal((html.match(/<button\b/g) ?? []).length, 1);
    assert.match(html, /class="[^"]*customer-image-first-action/);
    assert.match(html, /<h3 data-i18n-skip="true">/);
  });
  test(`${language}: actual customer navigation uses current locale without structural changes`, () => {
    const html = renderToStaticMarkup(React.createElement(components(language).BottomNavigation, { activeView: "home", onChange() {} }));
    assert.equal((html.match(/<button\b/g) ?? []).length, 4);
    assert.match(html, /class="premium-bottom-navigation"/);
    assert.ok(html.includes(customerPresentationText("collect", language)));
    assert.ok(html.includes(customerPresentationText("collectPoints", language)));
    assert.match(html, /data-i18n-skip="true"/);
  });
}

test("Owner dictionaries/templates and raw persistence are unchanged; no mutation in presentation resolver", () => {
  assert.match(read("src/modules/admin/pages/RestaurantOnboarding.tsx"), /key: "eigene-belohnung",\s+title: "Eigene Überraschung",[\s\S]*?category: "Eigene Überraschung"/);
  assert.match(read("src/modules/admin/pages/WelcomeGiftsPage.tsx"), /title: editing\.title\.trim\(\)/);
  assert.match(read("src/shared/i18n/messages.generated.mjs"), /"recovery.auto_4925a2ea744e": "Eigene Überraschung"/);
  assert.doesNotMatch(read("src/modules/customer/customerRewardPresentation.mjs"), /\.rpc\(|fetch\(|localStorage|\.title\s*=/);
});

test("Customer Home, Rewards and detail render presentation names without replacing business objects", () => {
  const portal = read("src/modules/customer/CustomerPortal.tsx");
  assert.equal((portal.match(/title=\{present\(reward\)\.title\}/g) ?? []).length, 2);
  assert.match(portal, /title=\{present\(gift\)\.title\}/);
  assert.match(portal, /<h2 data-i18n-skip="true">\{present\(redeemOffer\)\.title\}<\/h2>/);
  assert.match(portal, /openRewardRedemption\(gift\)/);
  assert.match(portal, /openRewardRedemption\(reward\)/);
  assert.doesNotMatch(portal, /setRewards\([^\n]*present\(/);
});
