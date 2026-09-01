import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const portal = readFileSync(new URL("../src/modules/customer/CustomerPortal.tsx", import.meta.url), "utf8");
const carousel = readFileSync(new URL("../src/modules/customer/components/PremiumHorizontalCarousel.tsx", import.meta.url), "utf8");

const homeSection = portal.slice(
  portal.indexOf('title="Mit Punkten einlösbar"'),
  portal.indexOf("{activeWelcomeGift || activeBirthdayGift"),
);

test("Customer Home entfernt ausschließlich die künstliche Zwei-Belohnungen-Grenze", () => {
  assert.doesNotMatch(portal, /previewRedemptions|pointRedemptions\.slice\(0,\s*2\)/);
  assert.match(homeSection, /pointRedemptions\.length/);
  assert.match(homeSection, /pointRedemptions\.map\(\(reward\)/);
});

test("Home verwendet die bereits aktive, sichtbare und restaurantbezogene Reward-Liste", () => {
  assert.match(portal, /visibleRewards[\s\S]*offer\.active[\s\S]*offer\.status !== "redeemed"[\s\S]*offer\.status !== "redemption_started"/);
  assert.match(portal, /pointRedemptions = visibleRewards\.filter\(\(offer\) => offer\.source === "reward" && !offer\.is_starter_reward\)/);
  assert.match(portal, /setRewards\(data\.offers\)/);
  assert.match(portal, /loadPortalForRestaurant\(\{[\s\S]*restaurantSlug/);
});

test("ein Request speist Home, Zähler und Karten ohne Reward-N-plus-eins", () => {
  assert.equal((portal.match(/setRewards\(data\.offers\)/g) ?? []).length, 1);
  assert.doesNotMatch(homeSection, /loadCustomerPortalData|loadReward|supabase\.|\.rpc\(/);
  assert.match(carousel, /const items = Children\.toArray\(children\)/);
  assert.match(carousel, /\{activeIndex \+ 1\}<\/strong> \/ \{items\.length\}/);
});

test("Carousel-Vertrag skaliert von einer bis zwanzig Karten ohne vertikales Stapeln", () => {
  for (const count of [1, 2, 3, 6, 10, 20]) {
    const items = Array.from({ length: count }, (_, index) => `reward-${index + 1}`);
    assert.equal(items.length, count);
    assert.equal(items.at(-1), `reward-${count}`);
  }
  assert.match(carousel, /hasMultipleItems = items\.length > 1/);
  assert.match(carousel, /hasMultipleItems \? \(/);
  assert.match(carousel, /items\.map\(\(item, index\)/);
});

test("Alle ansehen und bestehender Detail-/Einlöseflow bleiben erhalten", () => {
  assert.match(portal, /action=\{pointRedemptions\.length > 2 \?[\s\S]{0,220}>Alle ansehen<\/button>/);
  assert.match(homeSection, /openRewardRedemption\(reward\)/);
  assert.match(portal, /startCustomerPointsPresentation\(\{/);
  assert.match(portal, />Alle Belohnungen<\/button>/);
  assert.match(portal, />Meine Belohnungen<\/button>/);
});

test("Restaurantwechsel ersetzt den Portal-State statt Kataloge zu vermischen", () => {
  assert.match(portal, /setRewards\(\[\]\)/);
  assert.match(portal, /\}, \[activeToken, activeTokenSource, customerToken, refreshToken, reloadLegalCenter, restaurantSlug, storedCustomerToken\]\)/);
  assert.doesNotMatch(portal, /setRewards\(\(current\) => \[\.\.\.current, \.\.\.data\.offers\]\)/);
});
