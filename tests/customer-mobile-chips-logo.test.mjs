import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = async (path) => readFile(new URL(path, import.meta.url), "utf8");

const [centralCss, finderCss, premiumCss, centralPage, finderPage, restaurantImage, logoStage] = await Promise.all([
  read("../src/modules/customer/central-customer.css"),
  read("../src/modules/customer/partner-restaurant-finder.css"),
  read("../src/modules/customer/customer-premium.css"),
  read("../src/modules/customer/CentralCustomerPage.tsx"),
  read("../src/modules/customer/PartnerRestaurantFinderPage.tsx"),
  read("../src/modules/customer/components/RestaurantHeroImage.tsx"),
  read("../src/shared/components/RestaurantLogoStage.tsx"),
]);

test("Customer-Filterleisten bleiben horizontal scrollbar und der letzte Chip erreichbar", () => {
  for (const css of [centralCss, finderCss]) {
    assert.match(css, /flex-wrap: nowrap/);
    assert.match(css, /overflow-x: auto/);
    assert.match(css, /scroll-padding-inline: 10px/);
    assert.match(css, /env\(safe-area-inset-right\)/);
    assert.match(css, /flex-shrink: 0/);
    assert.match(css, /white-space: nowrap/);
    assert.match(css, /min-height: 44px/);
  }
  assert.match(finderPage, /label: "Bereits besucht"/);
  assert.doesNotMatch(`${centralCss}\n${finderCss}\n${premiumCss}`, /width:\s*100vw/);
});

test("Restaurantlogos werden vollständig und ohne Cover-Crop dargestellt", () => {
  for (const css of [centralCss, finderCss, premiumCss]) {
    assert.match(css, /object-fit: contain/);
    assert.match(css, /max-width: 100%/);
    assert.match(css, /max-height: 100%/);
  }
  assert.doesNotMatch(centralCss, /central-location-logo img[^}]*object-fit: cover/);
  assert.doesNotMatch(finderCss, /(?:partner-result-logo|partner-detail-logo)[^}]*overflow: hidden/);
  assert.doesNotMatch(premiumCss, /(?:premium-restaurant-logo|premium-member-card-logo|premium-account-sheet-logo)[^}]*overflow: hidden/);
});

test("Restaurantkarten begrenzen ihre Breite und lassen lange Inhalte umbrechen", () => {
  assert.match(centralCss, /central-location-card[^}]*max-width: 100%/);
  assert.match(centralCss, /central-location-heading h2[^}]*overflow-wrap: anywhere/);
  assert.match(centralCss, /central-location-heading p[^}]*overflow-wrap: anywhere/);
  assert.match(finderCss, /partner-result-card[\s\S]{0,500}max-width: 100%/);
  assert.match(finderCss, /partner-result-copy strong[^}]*overflow-wrap: anywhere/);
  assert.match(finderCss, /partner-result-copy small[^}]*overflow-wrap: anywhere/);
  assert.match(finderCss, /partner-detail-heading h2[^}]*overflow-wrap: anywhere/);
  assert.match(finderCss, /partner-detail-heading p[^}]*overflow-wrap: anywhere/);
});

test("fehlende Logos behalten in Liste, Karte und Kundenportal einen sichtbaren Fallback", () => {
  assert.match(centralPage, /<RestaurantLogoStage[^>]+logoUrl=\{membership\.logo_url\}/);
  assert.equal((finderPage.match(/<RestaurantLogoImage/g) ?? []).length, 2);
  assert.match(restaurantImage, /<RestaurantLogoStage/);
  assert.match(logoStage, /className="restaurant-logo-fallback"/);
  assert.match(logoStage, /<Store aria-hidden="true"/);
});

test("Bottom-Navigation behält ihre Safe-Area- und Inhaltsreserve", () => {
  assert.match(centralCss, /calc\(108px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(centralCss, /bottom: max\(8px, env\(safe-area-inset-bottom\)\)/);
  assert.match(finderCss, /calc\(104px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(premiumCss, /calc\(112px \+ env\(safe-area-inset-bottom\)\)/);
});
