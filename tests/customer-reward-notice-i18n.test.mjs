import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { CUSTOMER_PRESENTATION_MESSAGES } from "../src/shared/i18n/customerPresentationMessages.mjs";
import { customerPresentationText } from "../src/modules/customer/customerRewardPresentation.mjs";
import { translateStructural } from "../src/shared/i18n/catalog.mjs";

const expected = {
  "de": "Diese Punkteeinlösungen werden vom Restaurant angeboten. Verfügbarkeit und Einlösung richten sich nach den Teilnahmebedingungen des Restaurants.",
  "en": "These points rewards are offered by the restaurant. Availability and redemption are subject to the restaurant’s participation terms.",
  "fr": "Ces récompenses en points sont proposées par le restaurant. Leur disponibilité et leur utilisation sont soumises aux conditions de participation du restaurant.",
  "it": "Questi premi riscattabili con i punti sono offerti dal ristorante. La disponibilità e il riscatto sono soggetti alle condizioni di partecipazione del ristorante.",
  "es": "Estas recompensas por puntos son ofrecidas por el restaurante. La disponibilidad y el canje están sujetos a las condiciones de participación del restaurante.",
  "zh": "这些积分奖励由餐厅提供。是否可用及兑换规则以餐厅的参与条款为准。",
  "ko": "이 포인트 보상은 매장에서 제공합니다. 이용 가능 여부와 사용 조건은 매장의 참여 약관을 따릅니다."
};
const source = readFileSync(new URL("../src/modules/customer/CustomerPortal.tsx", import.meta.url), "utf8");
const notice = source.match(/<p className="premium-legal-notice" data-i18n-skip="true">\{ct\("rewardNotice"\)\}<\/p>/)?.[0];
const require = createRequire(import.meta.url);
assert.ok(notice, "actual overview JSX must use the existing customer presentation resolver");
const exports = {};
const compiled = ts.transpileModule(`export function Notice({ct}) {return (${notice});}`, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
new Function("require", "exports", compiled)(require, exports);

for (const [language, text] of Object.entries(expected)) {
  test(`${language}: approved notice exists without fallback and resolves through existing i18n`, () => {
    assert.equal(CUSTOMER_PRESENTATION_MESSAGES[language]["customer.presentation.rewardNotice"], text);
    assert.equal(translateStructural("customer.presentation.rewardNotice", language), text);
    assert.equal(customerPresentationText("rewardNotice", language), text);
    if (language !== "de") assert.notEqual(text, expected.de);
  });
  test(`${language}: real overview paragraph renders one accessible localized text`, () => {
    const html = renderToStaticMarkup(React.createElement(exports.Notice, {
      ct: key => customerPresentationText(key, language),
    }));
    assert.equal(html, `<p class="premium-legal-notice" data-i18n-skip="true">${text}</p>`);
    assert.doesNotMatch(html, /aria-hidden|aria-label|aria-description/);
  });
}
test("notice is scoped to overview; Spanish correction and German original are exact", () => {
  assert.equal((source.match(/ct\("rewardNotice"\)/g) ?? []).length, 1);
  const overview = source.slice(source.indexOf('{activeView === "redemptions" ? ('), source.indexOf('{activeView === "account" ? ('));
  assert.ok(overview.includes(notice));
  assert.match(expected.es, /condiciones de participación del restaurante/);
  assert.doesNotMatch(expected.es, /participation/);
});
test("birthday description remains stored copy and type label remains separate", () => {
  assert.ok(source.includes('{redeemOffer.description ? <p>{redeemOffer.description}</p> : null}'));
  assert.ok(source.includes('redeemOffer.gift_type === "birthday" ? "birthdayGift"'));
});

