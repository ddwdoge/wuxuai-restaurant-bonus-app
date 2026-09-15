import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import postcss from "postcss";
import { translateStructural } from "../src/shared/i18n/catalog.mjs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const page = read("src/modules/admin/pages/AdminDashboard.tsx");
const offersPage = read("src/modules/admin/pages/RestaurantOffersPage.tsx");
const css = read("src/modules/admin/admin-premium.css");
const rules = postcss.parse(css);
const start = css.indexOf("/* Phase 6E dashboard reference only;");
const compact = css.slice(start, css.indexOf("@media (max-width: 359px)", start));

function declarations(selector, media) {
  const result = {};
  rules.walkRules(selector, rule => {
    if ((media && rule.parent.type === "atrule" && rule.parent.params === media) || (!media && rule.parent.type !== "atrule")) {
      rule.walkDecls(d => { result[d.prop] = d.value; });
    }
  });
  return result;
}

test("kompakte Regeln bleiben auf das Dashboard begrenzt, ohne Header-/Editor-Eingriff", () => {
  const root = postcss.parse(compact);
  root.walkRules(rule => assert.ok(rule.selector.startsWith(".premium-owner-shell .premium-dashboard")));
  assert.doesNotMatch(compact, /zoom\s*:|scale\(|owner-header|topbar|image-editor|app-drawer/);
  root.walkAtRules(rule => assert.ok(rule.params.includes("max-width: 639px") || rule.params === "(prefers-reduced-motion: reduce)"));
});

test("mobile KPI-Karten wachsen mit langen Werten und Texten statt sie abzuschneiden", () => {
  const d = declarations(".premium-owner-shell .premium-dashboard .dashboard-kpi-card", "(max-width: 639px)");
  assert.equal(d["min-height"], "112px");
  assert.equal(d.padding, "14px");
  assert.equal(d["grid-template-columns"], "38px minmax(0, 1fr)");
  assert.equal(d.height, undefined);
  assert.equal(d.overflow, undefined);
  assert.match(compact, /overflow-wrap: anywhere/);
  assert.doesNotMatch(compact, /line-clamp|text-overflow|overflow:\s*hidden/);
});

test("Schnellzugriffe sind erst ab 360 zweispaltig; 320 behält den bestehenden Fallback", () => {
  const selector = '.premium-owner-shell .premium-dashboard section[aria-labelledby="quick-access-title"] .dashboard-quick-grid';
  assert.equal(declarations(selector, "(min-width: 360px) and (max-width: 639px)")["grid-template-columns"], "repeat(2, minmax(0, 1fr))");
  assert.deepEqual(declarations(selector, "(max-width: 639px)"), {});
  assert.match(compact, /safe-area-inset-bottom/);
  assert.match(compact, /prefers-reduced-motion: reduce/);
  assert.match(css, /dashboard-quick-card:focus-visible\s*\{[^}]*outline[^}]*outline-offset/s);
  assert.equal(declarations(".premium-owner-shell .dashboard-quick-card")["min-height"], "76px");
  assert.equal(declarations(".premium-owner-shell .dashboard-quick-card").height, "100%");
});

const kpis = page.slice(page.indexOf("  const dashboardKpis = ["), page.indexOf("  const quickLinks = ["));
const markupStart = page.indexOf('<section className="dashboard-kpi-grid" aria-label="Heute im Bonusprogramm">');
const markup = page.slice(markupStart, page.indexOf("</section>", markupStart) + "</section>".length);
const source = `const Users=()=>null,UserPlus=()=>null,Activity=()=>null,Gift=()=>null,Star=()=>null;
const Link=({to,children,...props})=><a href={to} {...props}>{children}</a>;
export function Cards({rewardKpis}) { ${kpis} return (${markup}); }`;
const exports = {};
new Function("require", "exports", ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText)(createRequire(import.meta.url), exports);

test("echtes KPI-JSX: nur die passende vorhandene Gästeübersicht ist verlinkt", () => {
  const rewardKpis = { activeCustomers: 123456789012, newMembersToday: 2, newMembersThisWeek: 3, activeTodayCount: 4, rewardsRedeemedToday: 5, pointsIssuedToday: 6 };
  const html = renderToStaticMarkup(React.createElement(exports.Cards, { rewardKpis }));
  assert.equal((html.match(/<a /g) ?? []).length, 1);
  assert.match(html, /href="\/admin\/customers"/);
  assert.match(html, /123456789012/);
  assert.equal((html.match(/<article /g) ?? []).length, 5);
  assert.doesNotMatch(html, /<button|tabindex|onclick/);
  assert.match(css, /dashboard-kpi-link:focus-visible\s*\{[^}]*outline-offset: -4px/s);
  assert.match(css, /dashboard-kpi-link p\s*\{[^}]*text-decoration: underline/s);
});

test("Setup-Priorität, Laden/Fehler und Zahlenquellen bleiben erhalten", () => {
  assert.ok(page.indexOf("{recommendation ? <section") < page.indexOf("{loading ? ("));
  for (const source of ["loadRewardKpis(activeRestaurant.id)", "loadBonusBoostKpis(activeRestaurant.id)", "dashboard-kpi-skeleton", 'aria-busy="true"', "loadError ?", "dashboardIsEmpty"]) assert.ok(page.includes(source));
  assert.ok(page.indexOf('aria-labelledby="quick-access-title"') < page.indexOf('aria-labelledby="boost-overview-title"'));
});

test("Schnellzugriffe zeigen exakt die sechs operativen Ziele in Founder-Reihenfolge", () => {
  const quickLinkSource = page.slice(page.indexOf("  const quickLinks = ["), page.indexOf("  const dashboardIsEmpty"));
  const items = [...quickLinkSource.matchAll(/\{ labelKey: "([^"]+)", actionKey: "([^"]+)", to: "([^"]+)", icon: [A-Za-z]+ \}/g)]
    .map((match) => match.slice(1));
  assert.deepEqual(items, [
    ["owner.quick.createOffer.title", "owner.quick.createOffer.action", "/admin/offers?create=1"],
    ["owner.quick.guests.title", "owner.quick.guests.action", "/admin/customers"],
    ["owner.quick.activity.title", "owner.quick.activity.action", "/admin/reports"],
    ["owner.quick.qr.title", "owner.quick.qr.action", "/admin/qr"],
    ["owner.quick.rewards.title", "owner.quick.rewards.action", "/admin/rewards"],
    ["owner.quick.staff.title", "owner.quick.staff.action", "/admin/staff"],
  ]);
  assert.doesNotMatch(quickLinkSource, /settings|branding|legal|onboarding|welcome-gifts|staffPath/);
  const quickMarkup = page.slice(page.indexOf('<section className="premium-dashboard-section" aria-labelledby="quick-access-title">'), page.indexOf('aria-labelledby="boost-overview-title"'));
  assert.match(quickMarkup, /translateKey\(item\.labelKey\)/);
  assert.match(quickMarkup, /translateKey\(item\.actionKey\)/);
  assert.doesNotMatch(quickMarkup, />Öffnen</);
});

test("direkte Angebotsnavigation öffnet nur den bestehenden Entwurf-Drawer und bleibt reload-fest", () => {
  assert.match(offersPage, /useSearchParams/);
  assert.match(offersPage, /searchParams\.get\("create"\) === "1"/);
  assert.match(offersPage, /startCreate\(\)/);
  assert.match(offersPage, /setFormOpen\(true\)/);
  assert.doesNotMatch(offersPage, /searchParams\.get\("create"\)[\s\S]{0,500}(?:saveRestaurantOffer|runAction|uploadOwnerRewardImage)/);
});

test("alle sechs Schnellzugriffe besitzen natürliche Texte in sieben Sprachen", () => {
  const keys = [
    "owner.quick.createOffer.title", "owner.quick.createOffer.action",
    "owner.quick.guests.title", "owner.quick.guests.action",
    "owner.quick.activity.title", "owner.quick.activity.action",
    "owner.quick.qr.title", "owner.quick.qr.action",
    "owner.quick.rewards.title", "owner.quick.rewards.action",
    "owner.quick.staff.title", "owner.quick.staff.action",
  ];
  for (const language of ["de", "en", "fr", "it", "es", "zh", "ko"]) {
    for (const key of keys) {
      const value = translateStructural(key, language);
      assert.notEqual(value, key, `${language}:${key}`);
      assert.ok(value.trim(), `${language}:${key}`);
    }
  }
});
