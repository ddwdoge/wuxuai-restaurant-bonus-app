import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { selectCustomerHomeGifts } from "../src/modules/customer/customerGiftPresentation.mjs";

const portal = readFileSync(new URL("../src/modules/customer/CustomerPortal.tsx", import.meta.url), "utf8");
const carousel = readFileSync(new URL("../src/modules/customer/components/PremiumHorizontalCarousel.tsx", import.meta.url), "utf8");

const giftSection = portal.slice(
  portal.indexOf("{activeGifts.length ? ("),
  portal.indexOf("<PremiumCard className={`premium-boost-card"),
);

test("Customer Home leitet alle aktiven Geschenkzuweisungen aus der kanonischen Reward-Antwort ab", () => {
  assert.match(portal, /activeGifts = useMemo\([\s\S]*selectCustomerHomeGifts\(rewards\)/);
  assert.doesNotMatch(giftSection, /activeWelcomeGift|activeBirthdayGift/);
  assert.doesNotMatch(giftSection, /\.find\(|\.slice\(0,\s*1\)/);
  assert.match(giftSection, /activeGifts\.map\(\(gift\)/);
});

test("Birthday, Welcome und weitere Geschenktypen werden deterministisch geordnet", () => {
  const base = { active: true, is_starter_reward: true, status: "unlocked" };
  const gifts = selectCustomerHomeGifts([
    { ...base, id: "other", gift_type: "legacy", valid_until: "2026-09-01" },
    { ...base, id: "welcome-b", gift_type: "welcome", valid_until: "2026-09-10" },
    { ...base, id: "birthday", gift_type: "birthday", valid_until: "2026-09-20" },
    { ...base, id: "welcome-a", gift_type: "welcome", valid_until: "2026-09-05" },
  ]);

  assert.deepEqual(gifts.map((gift) => gift.id), ["birthday", "welcome-a", "welcome-b", "other"]);
});

test("Welcome-only Birthday-only beide und leer ergeben exakt die erwartete Kartenanzahl", () => {
  const base = { active: true, is_starter_reward: true, status: "unlocked" };
  const welcome = { ...base, id: "welcome", gift_type: "welcome" };
  const birthday = { ...base, id: "birthday", gift_type: "birthday" };

  assert.equal(selectCustomerHomeGifts([welcome]).length, 1);
  assert.equal(selectCustomerHomeGifts([birthday]).length, 1);
  assert.equal(selectCustomerHomeGifts([welcome, birthday]).length, 2);
  assert.equal(selectCustomerHomeGifts([]).length, 0);
});

test("verbrauchte abgelaufene gestartete und inaktive Geschenke erscheinen nicht aktiv", () => {
  const base = { is_starter_reward: true, gift_type: "welcome" };
  const gifts = selectCustomerHomeGifts([
    { ...base, id: "active", active: true, status: "unlocked" },
    { ...base, id: "redeemed", active: true, status: "redeemed" },
    { ...base, id: "started", active: true, status: "redemption_started" },
    { ...base, id: "expired", active: true, status: "expired" },
    { ...base, id: "inactive", active: false, status: "unlocked" },
    { id: "points", active: true, is_starter_reward: false, status: "unlocked" },
  ]);

  assert.deepEqual(gifts.map((gift) => gift.id), ["active"]);
});

test("mehrere Geschenke verwenden den bestehenden Swipe-Carousel mit echter Positionsanzeige", () => {
  assert.match(giftSection, /<PremiumHorizontalCarousel[\s\S]*label="Deine Geschenke"[\s\S]*nextLabel="Nächstes Geschenk"[\s\S]*previousLabel="Vorheriges Geschenk"/);
  assert.match(carousel, /<strong>\{activeIndex \+ 1\}<\/strong> \/ \{items\.length\}/);
  assert.match(carousel, /const hasMultipleItems = items\.length > 1/);
  assert.doesNotMatch(carousel, /setInterval|autoPlay|autoplay/i);
});

test("jede Karte behaelt ihren bestehenden Detail- und Einloesehandler", () => {
  assert.match(giftSection, /openRewardRedemption\(gift\)/);
  assert.match(giftSection, /rewardState\(gift, nowMs, activeRedemptionCode, activePointsPresentation\)/);
  assert.match(giftSection, /rewardStatusText\(gift, state\)/);
  assert.doesNotMatch(giftSection, /redeemCustomerReward|startCustomerPointsPresentation|setRewards/);
});

test("Startseite kommuniziert ein oder mehrere Geschenke ohne Singular-Annahme", () => {
  assert.match(giftSection, /title="Deine Geschenke"/);
  assert.match(giftSection, /activeGifts\.length === 1/);
  assert.match(giftSection, /\$\{activeGifts\.length\} persönliche Vorteile/);
});
