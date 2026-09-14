import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import postcss from "postcss";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const consumers = [
  ["admin/pages/AdminDashboard", 1], ["admin/pages/CustomersPage", 1],
  ["admin/pages/StaffPage", 2], ["admin/pages/RewardsPage", 5],
  ["admin/pages/WelcomeGiftsPage", 4], ["admin/pages/RestaurantOffersPage", 2],
  ["admin/pages/RestaurantOnboarding", 1], ["reports/BonusActivityReportsPage", 1],
];

for (const [path, count] of consumers) test(`${path}: vorhandene Drawer verwenden denselben opt-in Viewport-Vertrag`, () => {
  const source = ts.createSourceFile(path, read(`src/modules/${path}.tsx`), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const drawers = [];
  const visit = node => {
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(source) === "AppDrawer") drawers.push(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.equal(drawers.length, count);
  for (const drawer of drawers) {
    const props = new Map(drawer.attributes.properties.map(p => [p.name?.getText(source), p]));
    assert.equal(props.get("className").initializer.text, "owner-mobile-drawer");
    assert.ok(props.has("fitVisualViewport"));
    assert.ok(props.has("onClose"));
    assert.ok(props.has("open"));
  }
});

test("gesperrter Header und Logo-Editor erhalten keine neuen Drawer-Styles", () => {
  for (const path of ["src/modules/admin/AdminLayout.tsx", "src/modules/admin/pages/SettingsPage.tsx"]) {
    assert.doesNotMatch(read(path), /owner-mobile-drawer/);
  }
});

test("Owner-Sheet ist inhaltsgetrieben: nur Body scrollt, Aktionen und Safe Area bleiben im Layout", () => {
  const root = postcss.parse(read("src/modules/admin/admin-premium.css"));
  const rules = new Map();
  root.walkRules(rule => {
    if (!rule.selector.includes("owner-mobile-drawer")) return;
    assert.equal(rule.parent.type, "atrule");
    assert.equal(rule.parent.params, "(max-width: 767px)");
    rules.set(rule.selector, Object.fromEntries(rule.nodes.filter(n => n.type === "decl").map(n => [n.prop, n.value])));
    assert.doesNotMatch(rule.toString(), /\bzoom:|scale\(/);
  });
  const panel = rules.get(".app-drawer-panel.owner-mobile-drawer");
  assert.equal(panel.height, "auto");
  assert.equal(panel["min-height"], "0");
  assert.match(panel["max-height"], /--drawer-viewport-height/);
  const body = rules.get(".owner-mobile-drawer > .app-drawer-body");
  assert.equal(body.flex, "0 1 auto");
  assert.equal(body["overflow-y"], "auto");
  assert.equal(body["overscroll-behavior"], "contain");
  const footer = rules.get(".owner-mobile-drawer > .app-drawer-footer");
  assert.equal(footer.flex, "0 0 auto");
  assert.match(footer.padding, /env\(safe-area-inset-bottom\)/);
  assert.equal(rules.get(".owner-mobile-drawer > .app-drawer-footer .button")["min-height"], "48px");
});
