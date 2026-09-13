import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { translateStructural } from "../src/shared/i18n/catalog.mjs";
import { customerPresentationText } from "../src/modules/customer/customerRewardPresentation.mjs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const require = createRequire(import.meta.url);
const expected = {
  de: "Sprache ändern, aktuell Deutsch",
  en: "Change language, currently English",
  fr: "Changer de langue, langue actuelle : français",
  it: "Cambia lingua, lingua attuale: italiano",
  es: "Cambiar idioma, idioma actual: español",
  zh: "更改语言，当前为简体中文",
  ko: "언어 변경, 현재 언어: 한국어",
};
const languages = Object.keys(expected);

function harness(language) {
  const selected = [];
  let selector;
  function load(id) {
    if (id.endsWith(".css")) return {};
    if (id.endsWith("/I18nProvider")) return { useI18n: () => ({ language, setLanguage: next => selected.push(next), translateKey: key => translateStructural(key, language) }) };
    if (id.endsWith("/LanguageSelector")) return selector;
    if (id.endsWith("/catalog.mjs")) return { translateStructural };
    if (id.endsWith("/customerRewardPresentation.mjs")) return { customerPresentationText };
    if (id.endsWith("/RestaurantLogoStage")) return { RestaurantLogoStage: ({ name }) => React.createElement("span", { "data-logo": true }, name) };
    if (id.endsWith("/InfoTrigger")) return { InfoTrigger: ({ label, onClick, className }) => React.createElement("button", { "aria-label": label, onClick, className, type: "button" }) };
    if (/\/(AppDrawer|RewardImageFrame|ui)$/.test(id)) return {};
    return require(id);
  }
  function compile(path) {
    const exports = {};
    const js = ts.transpileModule(read(path), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    new Function("require", "exports", js)(load, exports);
    return exports;
  }
  selector = compile("src/shared/i18n/LanguageSelector.tsx");
  return { ...compile("src/modules/customer/components/PremiumCustomerUi.tsx"), ...selector, selected };
}

for (const language of languages) {
  test(`${language}: Customer header has one existing selector between restaurant and info`, () => {
    const { AppShell, CustomerHeader } = harness(language);
    const html = renderToStaticMarkup(React.createElement(AppShell, { languageInHeader: true }, React.createElement(CustomerHeader, {
      compact: true, languageSelector: true, name: "Ein sehr langer Restaurantname für den Header", onInfo() {}, onSwitchRestaurant() {},
    })));
    assert.equal((html.match(/<select\b/g) ?? []).length, 1);
    assert.equal((html.match(/<option\b/g) ?? []).length, 7);
    assert.doesNotMatch(html, /customer-language-row/);
    for (const [, buttonContent] of html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)) {
      assert.doesNotMatch(buttonContent, /<select\b|<button\b/);
    }
    assert.ok(html.includes(expected[language]));
    assert.match(html, new RegExp(`wux-language-selector-code">${language.toUpperCase()}<`));
    assert.ok(html.indexOf("premium-customer-restaurant-selector") < html.indexOf("customer-header-language"));
    assert.ok(html.indexOf("customer-header-language") < html.indexOf("premium-icon-button"));
    assert.match(html, new RegExp(`<option value="${language}" selected=""`));
    assert.ok(html.includes(customerPresentationText("helpOpen", language).replaceAll("'", "&#x27;")));
  });
  test(`${language}: original native select delegates each choice once to the existing provider`, () => {
    const { LanguageSelector, selected } = harness(language);
    const element = LanguageSelector({ ariaLabel: expected[language] });
    const select = React.Children.toArray(element.props.children).find(child => child.type === "select");
    assert.equal(select.props.value, language);
    assert.equal(select.props["aria-label"], expected[language]);
    for (const next of languages) select.props.onChange({ target: { value: next } });
    assert.deepEqual(selected, languages);
    const ordinary = LanguageSelector({});
    const defaultSelect = React.Children.toArray(ordinary.props.children).find(child => child.type === "select");
    assert.notEqual(defaultSelect.props["aria-label"], expected[language]);
  });
}

test("non-restaurant shells no longer create a separate language row; explicit header action supports no switch callback", () => {
  const { AppShell, CustomerHeader } = harness("de");
  const ordinary = renderToStaticMarkup(React.createElement(AppShell, {}, "Inhalt"));
  assert.doesNotMatch(ordinary, /customer-language-row/);
  assert.equal((ordinary.match(/<select\b/g) ?? []).length, 0);
  const header = renderToStaticMarkup(React.createElement(CustomerHeader, { languageSelector: true, name: "Restaurant", onInfo() {} }));
  assert.equal((header.match(/<select\b/g) ?? []).length, 1);
  assert.doesNotMatch(header, /premium-customer-restaurant-selector/);
});

test("header compaction is scoped, preserves 44px controls and allows name ellipsis at 320px", () => {
  const css = read("src/modules/customer/customer-header-language.css");
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\) 44px 44px/);
  assert.match(css, /min-width: 0/);
  assert.match(css, /text-overflow: ellipsis;\s+white-space: nowrap/);
  assert.match(css, /min-height: 44px;\s+min-width: 44px/);
  assert.match(css, /:focus-within/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /env\(safe-area-inset-top\)/);
  assert.doesNotMatch(css, /zoom:|transform:|min-width: 390px|premium-horizontal-carousel|app-drawer|premium-bottom-navigation/);
});

test("only the existing restaurant header opts into placement; no second storage or dialog path", () => {
  const portal = read("src/modules/customer/CustomerPortal.tsx");
  assert.equal((portal.match(/\blanguageInHeader\b/g) ?? []).length, 1);
  assert.equal((portal.match(/\blanguageSelector\b/g) ?? []).length, 1);
  const selector = read("src/shared/i18n/LanguageSelector.tsx");
  assert.match(selector, /onChange=\{\(event\) => setLanguage\(event.target.value as UiLanguage\)\}/);
  assert.doesNotMatch(selector, /localStorage|sessionStorage|fetch\(|\.rpc\(|createPortal|flag|Flag/);
});
