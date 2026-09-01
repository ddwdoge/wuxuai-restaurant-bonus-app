import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const portal = read("../src/modules/customer/CustomerPortal.tsx");
const carousel = read("../src/modules/customer/components/PremiumHorizontalCarousel.tsx");
const carouselStyles = read("../src/modules/customer/components/premium-horizontal-carousel.css");
const offerCard = read("../src/modules/customer/components/RestaurantOfferCard.tsx");
const offerService = read("../src/modules/offers/restaurantOfferService.ts");

const offerHomeSection = portal.slice(
  portal.indexOf('{restaurantOffers.length ? ('),
  portal.indexOf('<section className="premium-content-section" aria-label="Deine Vorteile">'),
);
const offerLoadEffect = portal.slice(
  portal.indexOf('if (!isUsableRestaurantSlug(restaurantSlug)) {\n      setRestaurantOffers([]);', portal.indexOf('setRestaurantOffers(nextOffers)') - 1000),
  portal.indexOf('function openRestaurantOffer'),
);

test("Customer Home lädt den vollständigen autoritativen Angebotskatalog", () => {
  assert.match(offerLoadEffect, /loadPublicRestaurantOffers\(restaurantSlug, 100\)/);
  assert.match(offerService, /input_limit: limit/);
  assert.doesNotMatch(offerLoadEffect, /loadPublicRestaurantOffers\(restaurantSlug, [1-9]\)/);
  assert.doesNotMatch(offerHomeSection, /restaurantOffers\.slice\(/);
  assert.match(offerHomeSection, /restaurantOffers\.map\(\(offer\)/);
});

test("ein bis zwanzig sichtbare Angebote bleiben vollständig horizontal erreichbar", () => {
  for (const count of [1, 2, 3, 4, 7, 10, 20]) {
    const offers = Array.from({ length: count }, (_, index) => `offer-${index + 1}`);
    assert.equal(offers.length, count);
    assert.equal(offers.at(-1), `offer-${count}`);
  }
  assert.match(carousel, /const items = Children\.toArray\(children\)/);
  assert.match(carousel, /items\.map\(\(item, index\)/);
  assert.match(carousel, /<strong>\{activeIndex \+ 1\}<\/strong> \/ \{items\.length\}/);
});

test("Einzel- und Leerzustand bleiben kompakt ohne künstliche Bedienelemente", () => {
  assert.match(offerHomeSection, /restaurantOffers\.length \? \(/);
  assert.match(carousel, /hasMultipleItems = items\.length > 1/);
  assert.match(carousel, /if \(!items\.length\) return null/);
  assert.match(carousel, /\{hasMultipleItems \? \(/);
});

test("Restaurantwechsel entfernt alte Angebote vor dem neuen Katalog", () => {
  const clearIndex = offerLoadEffect.indexOf("setRestaurantOffers([])", offerLoadEffect.indexOf("if (!isUsableRestaurantSlug") + 1);
  const loadIndex = offerLoadEffect.indexOf("loadPublicRestaurantOffers(restaurantSlug, 100)");
  assert.ok(clearIndex > -1 && clearIndex < loadIndex);
  assert.match(offerLoadEffect, /setSelectedRestaurantOffer\(null\)/);
  assert.match(offerLoadEffect, /\}, \[restaurantSlug, refreshToken\]\)/);
});

test("bestehender Carousel-, Detail- und Smart-Media-Vertrag bleibt erhalten", () => {
  assert.match(offerHomeSection, /<PremiumHorizontalCarousel[\s\S]*nextLabel="Nächstes Angebot"[\s\S]*previousLabel="Vorheriges Angebot"/);
  assert.match(carouselStyles, /overflow-x: auto/);
  assert.match(carouselStyles, /scroll-snap-type: x mandatory/);
  assert.match(carouselStyles, /flex: 0 0 var\(--customer-card-mobile-width, 83%\)/);
  assert.match(offerCard, /onClick=\{onOpen\}/);
  assert.match(offerCard, /SmartMediaFrame/);
  assert.match(offerCard, /mediaPresentationFromRecord/);
  assert.doesNotMatch(carousel, /setInterval|setTimeout/);
});
