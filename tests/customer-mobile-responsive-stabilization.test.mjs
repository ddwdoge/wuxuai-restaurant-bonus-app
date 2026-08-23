import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = async (path) => readFile(new URL(path, import.meta.url), "utf8");

const [premiumCss, centralCss, finderCss, mapCss, portal, finder, navigation] = await Promise.all([
  read("../src/modules/customer/customer-premium.css"),
  read("../src/modules/customer/central-customer.css"),
  read("../src/modules/customer/partner-restaurant-finder.css"),
  read("../src/modules/customer/partner-restaurant-map.css"),
  read("../src/modules/customer/CustomerPortal.tsx"),
  read("../src/modules/customer/PartnerRestaurantFinderPage.tsx"),
  read("../src/modules/customer/components/CentralCustomerNavigation.tsx"),
]);

test("Customer-Shell verwendet normalen Seitenfluss statt verschachteltem Viewport-Lock", () => {
  assert.match(premiumCss, /\.customer-premium-shell[\s\S]{0,1200}min-height: 100dvh;[\s\S]{0,80}overflow-x: clip/);
  assert.doesNotMatch(premiumCss, /\.customer-premium-shell[\s\S]{0,1200}height: 100dvh;[\s\S]{0,80}overflow: hidden/);
  assert.match(premiumCss, /\.customer-page-container[\s\S]{0,420}min-height: 100dvh/);
  assert.doesNotMatch(premiumCss, /\.customer-page-container[\s\S]{0,500}overflow-y: auto/);
});

test("beide Customer-Navigationen reservieren Inhalt oberhalb der Safe Area", () => {
  assert.match(premiumCss, /calc\(112px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(centralCss, /calc\(108px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(finderCss, /calc\(104px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(centralCss, /central-customer-navigation[^}]*grid-template-columns: repeat\(4/);
  assert.equal((navigation.match(/label: "/g) ?? []).length, 4);
});

test("320 bis 430 Pixel erhalten kompakte und umbrechende Layouts", () => {
  assert.match(premiumCss, /@media \(max-width: 380px\)/);
  assert.match(premiumCss, /@media \(max-width: 340px\)/);
  assert.match(centralCss, /@media \(max-width: 430px\)[\s\S]*grid-template-columns: repeat\(2/);
  assert.match(finderCss, /@media \(max-width: 420px\)[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.doesNotMatch(`${premiumCss}\n${centralCss}\n${finderCss}`, /width:\s*100vw/);
});

test("lange Restaurant-, Reward- und Kontoinhalte dürfen umbrechen", () => {
  assert.match(centralCss, /central-location-heading h2[^}]*overflow-wrap: anywhere/);
  assert.match(finderCss, /partner-result-copy strong[^}]*overflow-wrap: anywhere/);
  assert.match(premiumCss, /premium-reward-copy h3[^}]*overflow-wrap: anywhere/);
  assert.match(premiumCss, /premium-account-heading h1[^}]*overflow-wrap: anywhere/);
  assert.doesNotMatch(premiumCss, /premium-account-heading h1[^}]*white-space: nowrap/);
});

test("Finder hält Karte, Controls und Portal-Drawer in klarer Layer-Hierarchie", () => {
  assert.match(finderCss, /grid-template-rows: minmax\(280px, 48dvh\)/);
  assert.match(finderCss, /partner-map-panel[^}]*isolation: isolate;[^}]*z-index: 0/);
  assert.match(finderCss, /partner-detail-drawer-content\) \.app-drawer-body[^}]*padding-bottom: calc\(18px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(finderCss, /partner-view-toggle button[^}]*min-width: 0/);
  assert.match(mapCss, /partner-map-runtime[\s\S]{0,120}min-width: 0/);
  assert.match(finder, /open=\{detailOpenInDrawer\}/);
});

test("Customer Business-Handler und sichere Finder-Aktionen bleiben erhalten", () => {
  for (const contract of ["collectBonusPoints({", "startCustomerGiftPresentation({", "startCustomerPointsPresentation({"]) {
    assert.ok(portal.includes(contract));
  }
  assert.match(finder, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(finder, /<LazyPartnerRestaurantMap/);
  assert.match(finder, />Bonus öffnen</);
  assert.match(finder, /Route starten/);
});
