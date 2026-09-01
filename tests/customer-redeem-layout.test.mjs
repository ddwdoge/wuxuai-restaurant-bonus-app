import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [portal, styles] = await Promise.all([
  readFile(new URL("../src/modules/customer/CustomerPortal.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/modules/customer/customer-premium.css", import.meta.url), "utf8"),
]);

test("Einloesen verwendet den kanonischen Customer-Seitencontainer", () => {
  assert.match(portal, /activeView === "redemptions" \? " premium-redemption-page"/);
  assert.match(portal, /className="premium-view-stack premium-redemption-content"/);
  assert.match(styles, /\.customer-page-container[\s\S]{0,260}max-width: 460px/);
  assert.match(styles, /@media \(min-width: 768px\)[\s\S]{0,120}\.customer-page-container \{ max-width: 720px/);
});

test("alle Hauptelemente der Einloeseseite teilen dieselben Aussenkanten", () => {
  assert.match(styles, /\.premium-redemption-page > \.premium-customer-header,[\s\S]{0,180}\.premium-redemption-content > \*[\s\S]{0,180}width: 100%/);
  assert.match(styles, /\.premium-redemption-content[\s\S]{0,80}gap: 16px/);
});

test("Tabs sind gleich breit und haben ausreichend grosse Touchziele", () => {
  assert.match(styles, /\.premium-segmented-control[\s\S]{0,260}grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.premium-segmented-control button[\s\S]{0,220}min-height: 44px/);
});

test("Reward-Inhalt bleibt in der synchronisierten Seitenbreite", () => {
  assert.match(styles, /\.premium-redemption-rewards \{[^}]*min-width: 0[^}]*width: 100%/);
  assert.match(styles, /\.premium-reward-media \{ aspect-ratio: 16 \/ 9/);
  assert.match(styles, /\.premium-reward-card > \.premium-button[^}]*min-height: 44px/);
});

test("kleine Displays stapeln die Punktezeile ohne horizontales Ueberlaufen", () => {
  assert.match(styles, /@media \(max-width: 380px\)[\s\S]*\.premium-redemption-summary \{ align-items: start; flex-direction: column/);
  assert.match(styles, /\.premium-redemption-summary p \{ max-width: none; text-align: left; \}/);
});

test("Redeem-Fix veraendert weder Navigation noch Einloesehandler", () => {
  assert.match(portal, /<BottomNavigation activeView=\{activeView\}/);
  assert.match(portal, /onOpen=\{\(\) => openRewardRedemption\(reward\)\}/);
  assert.match(portal, /startCustomerPointsPresentation\(\{/);
  assert.match(portal, /startCustomerGiftPresentation\(\{/);
});
