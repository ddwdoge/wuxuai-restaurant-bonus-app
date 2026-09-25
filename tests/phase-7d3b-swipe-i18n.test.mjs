import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const swipeSource = readFileSync(new URL("../src/modules/customer/components/SwipeToRedeem.tsx", import.meta.url), "utf8");
const portalSource = readFileSync(new URL("../src/modules/customer/CustomerPortal.tsx", import.meta.url), "utf8");
const messageSource = readFileSync(new URL("../src/modules/rewards/secureRedemptionMessages.ts", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/modules/customer/customer-premium.css", import.meta.url), "utf8");

function evaluateTypeScript(source, jsx = false) {
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: jsx ? ts.JsxEmit.ReactJSX : undefined },
  }).outputText;
  const module = { exports: {} };
  const localRequire = (id) => id === "../swipeRedemption.mjs"
    ? { clampSwipeProgress: (value) => Math.max(0, Math.min(1, value)), swipeCompletesRedemption: (value) => value >= 0.88 }
    : require(id);
  new Function("require", "module", "exports", output)(localRequire, module, module.exports);
  return module.exports;
}

const { secureRedemptionMessages } = evaluateTypeScript(messageSource);
const { SwipeToRedeem } = evaluateTypeScript(swipeSource, true);
const locales = ["de", "en", "fr", "it", "es", "zh", "ko"];
const escapedText = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#x27;");

test("swipe texts are explicit, localized and wired through three required props", () => {
  assert.match(swipeSource, /ariaLabel: string;[\s\S]*swipeLabel: string;[\s\S]*helperText: string;/);
  assert.match(swipeSource, /aria-label=\{ariaLabel\}/);
  assert.match(swipeSource, /\{swipeLabel\}/);
  assert.match(swipeSource, /<p>\{helperText\}<\/p>/);
  assert.doesNotMatch(swipeSource, /Zum Einlösen wischen|Bitte jetzt vor dem Mitarbeiter|Verbindung wird geprüft/);
  assert.match(portalSource, /ariaLabel=\{sr\.swipeAriaLabel\}/);
  assert.match(portalSource, /swipeLabel=\{secureActionPending \? sr\.checking : sr\.swipeLabel\}/);
  assert.match(portalSource, /helperText=\{sr\.swipeHelperText\}/);
});

for (const language of locales) {
  test(`${language}: ARIA, visible label and helper use the same locale`, () => {
    const strings = secureRedemptionMessages(language);
    for (const key of ["swipeAriaLabel", "swipeLabel", "swipeHelperText"]) {
      assert.ok(strings[key]?.trim(), `${language}/${key}`);
      if (language !== "de") assert.notEqual(strings[key], secureRedemptionMessages("de")[key]);
    }
    const html = renderToStaticMarkup(createElement(SwipeToRedeem, {
      ariaLabel: strings.swipeAriaLabel, swipeLabel: strings.swipeLabel,
      helperText: strings.swipeHelperText, onConfirm: async () => true,
    }));
    assert.ok(html.includes(`aria-label="${escapedText(strings.swipeAriaLabel)}"`));
    assert.ok(html.includes(`class="premium-swipe-label">${escapedText(strings.swipeLabel)}</span>`));
    assert.ok(html.includes(`<p>${escapedText(strings.swipeHelperText)}</p>`));
    if (language !== "de") assert.ok(!html.includes(secureRedemptionMessages("de").swipeLabel));
  });
}

test("long labels remain wrap-capable and swipe mechanics are unchanged", () => {
  assert.match(css, /\.premium-swipe-label\s*\{[^}]*display: flex;[^}]*text-align: center;/);
  assert.doesNotMatch(css, /\.premium-swipe-label\s*\{[^}]*white-space:\s*nowrap/);
  assert.match(swipeSource, /onPointerDown=\{handlePointerDown\}/);
  assert.match(swipeSource, /onPointerMove=\{handlePointerMove\}/);
  assert.match(swipeSource, /lockedRef\.current = true/);
  assert.doesNotMatch(swipeSource, /onClick=/);
});
