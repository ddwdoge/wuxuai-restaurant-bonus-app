import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const adminLayout = readFileSync(new URL("../src/modules/admin/AdminLayout.tsx", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../src/modules/admin/pages/AdminDashboard.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/modules/admin/admin-premium.css", import.meta.url), "utf8");

test("Premium Owner Shell bleibt auf das Restaurant Portal begrenzt", () => {
  assert.match(adminLayout, /app-shell premium-owner-shell/);
  assert.match(adminLayout, /premium-owner-sidebar/);
  assert.match(adminLayout, /premium-owner-topbar/);
  assert.match(styles, /\.premium-owner-shell/);
  assert.doesNotMatch(styles, /platform-admin-shell|customer-premium-app/);
});

test("Dashboard verwendet sechs echte KPI-Werte aus dem bestehenden Vertrag", () => {
  for (const label of [
    "Kunden gesamt",
    "Neue Kunden heute",
    "Neue Kunden diese Woche",
    "Heute aktiv",
    "Einlösungen heute",
    "Vergebene Bonuspunkte heute",
  ]) {
    assert.match(dashboard, new RegExp(label));
  }

  assert.match(dashboard, /loadRewardKpis\(activeRestaurant\.id\)/);
  assert.doesNotMatch(dashboard, /loadCampaignKpis|demo|fake/i);
});

test("Dashboard hat echte Lade-, Leer- und Fehlerzustände", () => {
  assert.match(dashboard, /dashboard-kpi-skeleton/);
  assert.match(dashboard, /Noch keine Aktivität/);
  assert.match(dashboard, /Dashboard konnte nicht geladen werden/);
  assert.match(dashboard, /Die aktuellen Zahlen konnten nicht abgerufen werden/);
  assert.match(dashboard, /Erneut versuchen/);
  assert.match(dashboard, /reloadDashboard/);
});

test("Owner Navigation bleibt responsiv und berührungsfreundlich", () => {
  assert.match(styles, /@media \(min-width: 1024px\)[\s\S]*grid-template-columns: 256px/);
  assert.match(styles, /@media \(min-width: 1024px\)[\s\S]*dashboard-kpi-grid[\s\S]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(min-width: 1200px\)[\s\S]*dashboard-kpi-grid[\s\S]*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(max-width: 1023px\)/);
  assert.match(styles, /\.mobile-menu-drawer \.nav-link[\s\S]*min-height: 46px/);
  assert.match(styles, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /repeat\(auto-fit, minmax\(min\(220px, 100%\), 1fr\)\)/);
  assert.match(styles, /overflow-x: hidden/);
});
