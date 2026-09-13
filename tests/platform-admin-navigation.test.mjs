import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const app = read("src/app/App.tsx");
const layout = read("src/modules/platform/PlatformAdminLayout.tsx");
const labels = read("src/modules/platform/platformAdminNavigationI18n.ts");
const page = read("src/modules/platform/PlatformAdminPage.tsx");
const control = read("src/modules/platform/PlatformRestaurantControlCenter.tsx");
const css = read("src/styles.css");

test("seven real Platform Admin sections have additive protected routes", () => {
  assert.match(app, /path="\/admin\/platform\/\*"[\s\S]*PLATFORM_ADMIN_ROLES/);
  for (const path of ["businesses", "plans", "countries", "health", "audit", "system"])
    assert.match(layout, new RegExp(`path: \"/admin/platform/${path}\"`));
  assert.match(app, /path="\/admin\/platform\/restaurants\/:restaurantId"/);
  assert.match(page, /routeParams\["\*"\]/);
});

test("desktop sidebar and mobile Admin menu share one active navigation model", () => {
  for (const key of ["overview", "businesses", "plans", "countries", "health", "audit", "system"])
    assert.match(layout, new RegExp(`key: \"${key}\"`));
  assert.match(layout, /aria-current=\{active \? "page"/);
  assert.match(layout, /<AppDrawer[\s\S]*<Navigation close=/);
  assert.match(layout, /<LanguageSelector \/>[\s\S]*platform-admin-menu-trigger/);
  assert.doesNotMatch(layout, /\.rpc\(|fetch\(|supabase/);
});

test("navigation labels have exact seven-language parity", () => {
  for (const language of ["de", "en", "fr", "it", "es", "zh", "ko"])
    assert.match(labels, new RegExp(`${language}: \\{\\s*overview:`));
  assert.equal((labels.match(/^    overview:/gm) ?? []).length, 7);
  assert.equal((labels.match(/^    overview:[^\n]*adminMenu:/gm) ?? []).length, 7);
  assert.equal((labels.match(/^    descriptions:/gm) ?? []).length, 7);
});

test("route partitions avoid detail and telemetry requests outside their owning sections", () => {
  assert.match(page, /section === "overview"[\s\S]*loadOverviewData\(\)/);
  assert.match(page, /if \(showRestaurantWorkspace\)[\s\S]*loadRestaurantData\(restaurantId \?\? null\)/);
  assert.match(page, /if \(!showRestaurantWorkspace \|\| !selectedRestaurantId\)/);
  assert.match(page, /section === "overview" \? <button[\s\S]*loadOverviewData/);
  assert.match(page, /showRestaurantWorkspace \? <button[\s\S]*loadRestaurantData/);
});

test("restaurant detail sections are presentation-only partitions", () => {
  assert.match(page, /view=\{detailView\}/);
  for (const view of ["businesses", "plans", "system"])
    assert.match(control, new RegExp(`view === \"${view}\"`));
  assert.match(control, /PlatformOperationsPanel[\s\S]*PlatformPlanEntitlementsPanel[\s\S]*PlatformLegalI18nPanel[\s\S]*PlatformKassaCompliancePanel/);
  assert.doesNotMatch(control, /supabase\.|\.rpc\(/);
});

test("responsive navigation keeps 44px controls and never uses page scaling", () => {
  assert.match(css, /\.platform-admin-navigation a\s*\{[\s\S]*min-height: 46px/);
  assert.match(css, /\.platform-admin-menu-trigger\s*\{[\s\S]*min-height: 44px[\s\S]*min-width: 44px/);
  assert.match(css, /@media \(max-width: 1023px\)[\s\S]*\.platform-admin-sidebar\s*\{[\s\S]*display: none/);
  const navigationRules = [...css.matchAll(/\.platform-admin-(?:workspace|sidebar|navigation|menu)[^{}]*\{[^}]*\}/g)].map(match => match[0]).join("\n");
  assert.doesNotMatch(navigationRules, /zoom\s*:|transform:\s*scale\(/);
});
