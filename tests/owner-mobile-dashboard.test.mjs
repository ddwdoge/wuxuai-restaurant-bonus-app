import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import postcss from "postcss";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const page = read("src/modules/admin/pages/AdminDashboard.tsx");
const css = read("src/modules/admin/admin-premium.css");
const rules = postcss.parse(css);
const start = css.indexOf("/* Phase 6E dashboard reference only;");
const compact = css.slice(start, css.indexOf("@media (max-width: 359px)", start));

function declarations(selector, media) {
  const result = {};
  rules.walkRules(selector, rule => {
    if (rule.parent.type === "atrule" && rule.parent.params === media) {
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

test("Setup-Priorität, Laden/Fehler, Zahlenquellen und Schnellzugriffsziele bleiben erhalten", () => {
  assert.ok(page.indexOf("{recommendation ? <section") < page.indexOf("{loading ? ("));
  for (const source of ["loadRewardKpis(activeRestaurant.id)", "loadBonusBoostKpis(activeRestaurant.id)", "dashboard-kpi-skeleton", 'aria-busy="true"', "loadError ?", "dashboardIsEmpty", 'to: "/admin/qr"', 'to: "/admin/rewards"', "to: staffPath"]) assert.ok(page.includes(source));
  assert.ok(page.indexOf('aria-labelledby="quick-access-title"') < page.indexOf('aria-labelledby="boost-overview-title"'));
});
