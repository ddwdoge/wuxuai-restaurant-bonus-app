import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [portal, carousel, carouselStyles, customerStyles, offerCard, offerStyles, premiumUi] = await Promise.all([
  readFile(new URL("../src/modules/customer/CustomerPortal.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/modules/customer/components/PremiumHorizontalCarousel.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/modules/customer/components/premium-horizontal-carousel.css", import.meta.url), "utf8"),
  readFile(new URL("../src/modules/customer/customer-premium.css", import.meta.url), "utf8"),
  readFile(new URL("../src/modules/customer/components/RestaurantOfferCard.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/modules/customer/components/restaurant-offer-card.css", import.meta.url), "utf8"),
  readFile(new URL("../src/modules/customer/components/PremiumCustomerUi.tsx", import.meta.url), "utf8"),
]);

test("Angebote und Belohnungen verwenden denselben horizontalen Discovery-Baustein", () => {
  assert.match(portal, /<PremiumHorizontalCarousel[\s\S]{0,180}label="Aktuelles und Angebote"[\s\S]{0,180}nextLabel="Nächstes Angebot"[\s\S]{0,180}previousLabel="Vorheriges Angebot"/);
  assert.match(portal, /<PremiumHorizontalCarousel key=\{rewardFilter\} label="Belohnungen">/);
  assert.doesNotMatch(portal, /className="customer-offer-grid"[\s\S]{0,220}restaurantOffers\.slice\(0, 3\)/);
});

test("native Swipe- und Scroll-Snap-Geometrie zeigt mobil die naechste Karte", () => {
  assert.match(carouselStyles, /flex: 0 0 var\(--customer-card-mobile-width, 83%\)/);
  assert.match(customerStyles, /--customer-card-mobile-width: 83%/);
  assert.match(customerStyles, /--customer-card-gap: 13px/);
  assert.match(carouselStyles, /overflow-x: auto/);
  assert.match(carouselStyles, /scroll-snap-type: x mandatory/);
  assert.match(carouselStyles, /scroll-snap-align: start/);
  assert.match(carouselStyles, /touch-action: pan-x pan-y/);
});

test("Angebote, Punkteeinloesungen und Geschenke verwenden dieselben kompakten Kartentokens", () => {
  assert.match(customerStyles, /--customer-card-radius: 18px/);
  assert.match(customerStyles, /--customer-card-padding: 12px/);
  assert.match(customerStyles, /--customer-card-media-ratio: 16 \/ 9/);
  assert.match(offerCard, /customer-offer-card premium-compact-customer-card/);
  assert.match(premiumUi, /premium-compact-customer-card premium-reward-card/);
  assert.match(offerStyles, /aspect-ratio: var\(--customer-card-media-ratio, 16 \/ 9\)/);
  assert.match(customerStyles, /aspect-ratio: var\(--customer-card-media-ratio\)/);
});

test("Offer-Inhalte bleiben vollstaendig, aber mobil kompakt", () => {
  assert.match(offerCard, /offer\.title/);
  assert.match(offerCard, /offer\.short_description/);
  assert.match(offerCard, /formatRestaurantOfferPeriod\(offer\)/);
  assert.match(offerCard, /formatRestaurantOfferPrice\(offer\.current_price\)/);
  assert.match(offerCard, /offer\.button_label/);
  assert.match(offerStyles, /customer-offer-card-body > p[^{]*\{[^}]*font-size: \.82rem[^}]*-webkit-line-clamp: 2/);
  assert.match(offerStyles, /customer-offer-card-validity-row/);
});

test("Startseiten-Punkteeinloesungen sind mobil kein Zwei-Karten-Raster mehr", () => {
  assert.match(portal, /<PremiumHorizontalCarousel label="Mit Punkten einlösbar">/);
  assert.doesNotMatch(portal, /<div className="premium-reward-grid premium-home-reward-grid">/);
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
