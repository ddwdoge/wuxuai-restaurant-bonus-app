import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [portal, carousel, carouselStyles] = await Promise.all([
  readFile(new URL("../src/modules/customer/CustomerPortal.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/modules/customer/components/PremiumHorizontalCarousel.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/modules/customer/components/premium-horizontal-carousel.css", import.meta.url), "utf8"),
]);

test("Angebote und Belohnungen verwenden denselben horizontalen Discovery-Baustein", () => {
  assert.match(portal, /<PremiumHorizontalCarousel[\s\S]{0,180}label="Aktuelles und Angebote"[\s\S]{0,180}nextLabel="Nächstes Angebot"[\s\S]{0,180}previousLabel="Vorheriges Angebot"/);
  assert.match(portal, /<PremiumHorizontalCarousel key=\{rewardFilter\} label="Belohnungen">/);
  assert.doesNotMatch(portal, /className="customer-offer-grid"[\s\S]{0,220}restaurantOffers\.slice\(0, 3\)/);
});

test("native Swipe- und Scroll-Snap-Geometrie zeigt mobil die naechste Karte", () => {
  assert.match(carouselStyles, /flex: 0 0 86%/);
  assert.match(carouselStyles, /overflow-x: auto/);
  assert.match(carouselStyles, /scroll-snap-type: x mandatory/);
  assert.match(carouselStyles, /scroll-snap-align: start/);
  assert.match(carouselStyles, /touch-action: pan-x pan-y/);
});

test("Pfeile bewegen exakt eine Karte und besitzen deutsche Labels", () => {
  assert.match(carousel, /scrollToIndex\(activeIndex - 1\)/);
  assert.match(carousel, /scrollToIndex\(activeIndex \+ 1\)/);
  assert.match(carousel, /previousLabel = "Vorherige Belohnung"/);
  assert.match(carousel, /nextLabel = "Nächste Belohnung"/);
  assert.match(carousel, /aria-label=\{previousLabel\}/);
  assert.match(carousel, /aria-label=\{nextLabel\}/);
  assert.match(carouselStyles, /flex: 0 0 44px/);
  assert.match(carouselStyles, /height: 44px/);
});

test("Position ist sichtbar und es gibt keine automatische Rotation", () => {
  assert.match(carousel, /<strong>\{activeIndex \+ 1\}<\/strong> \/ \{items\.length\}/);
  assert.doesNotMatch(carousel, /setInterval|setTimeout/);
});

test("Einzelkarten haben keine Bedienelemente und leere Zustaende bleiben ausserhalb", () => {
  assert.match(carousel, /hasMultipleItems \? \(/);
  assert.match(carouselStyles, /\.premium-horizontal-carousel\.is-single \.premium-horizontal-carousel-viewport/);
  assert.match(portal, /filteredRedemptions\.length \? \([\s\S]*PremiumHorizontalCarousel[\s\S]*\) : \([\s\S]*<EmptyState/);
});

test("Tabs und bestehender Einloesehandler bleiben unveraendert", () => {
  assert.match(portal, />Alle Belohnungen<\/button>/);
  assert.match(portal, />Meine Belohnungen<\/button>/);
  assert.match(portal, /onOpen=\{\(\) => openRewardRedemption\(reward\)\}/);
  assert.match(portal, /startCustomerPointsPresentation\(\{/);
});

test("Tablet und Desktop zeigen mehrere Karten ohne globale Seitenbreite", () => {
  assert.match(carouselStyles, /@media \(min-width: 768px\)[\s\S]*flex-basis: 58%/);
  assert.match(carouselStyles, /@media \(min-width: 1024px\)[\s\S]*flex-basis: 46%/);
  assert.match(carouselStyles, /max-width: 100%/);
});
