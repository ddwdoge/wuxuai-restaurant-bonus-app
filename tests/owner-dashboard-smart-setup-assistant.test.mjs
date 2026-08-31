import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolveOwnerDashboardRecommendation } from "../src/modules/admin/ownerDashboardRecommendation.mjs";

const dashboard = await readFile(new URL("../src/modules/admin/pages/AdminDashboard.tsx", import.meta.url), "utf8");
const setupService = await readFile(new URL("../src/modules/admin/dashboardNoticeService.ts", import.meta.url), "utf8");
const welcomeGifts = await readFile(new URL("../src/modules/admin/pages/WelcomeGiftsPage.tsx", import.meta.url), "utf8");
const onboardingService = await readFile(new URL("../src/modules/onboarding/pilotOnboardingService.ts", import.meta.url), "utf8");
const resolverSource = await readFile(new URL("../src/modules/admin/ownerDashboardRecommendation.mjs", import.meta.url), "utf8");

function readyInput(overrides = {}) {
  return {
    restaurantStatus: { active: true },
    onboardingStatus: "completed",
    legalStatus: { status: "green" },
    publicationStatus: { ready: true },
    rewardStatus: { pointsRedemptionReady: true, birthdayPoolReady: true },
    offerStatus: { ready: true },
    qrStatus: { ready: true },
    staffStatus: { ready: true },
    emailStatus: { confirmed: true },
    statusLoadFailed: false,
    ...overrides,
  };
}

test("Publikation bleibt vor allen weiteren Empfehlungen", () => {
  const result = resolveOwnerDashboardRecommendation(readyInput({
    publicationStatus: { ready: false },
    rewardStatus: { pointsRedemptionReady: false, birthdayPoolReady: false },
    offerStatus: { ready: false },
    staffStatus: { ready: false },
  }));
  assert.equal(result.title, "Restaurant veröffentlichen");
  assert.equal(result.ctaHref, "/admin/settings/standort");
});

test("Legal Readiness verwendet denselben Publikationsschritt und führt zum Legal Center", () => {
  const result = resolveOwnerDashboardRecommendation(readyInput({ legalStatus: { status: "red", reason: "Dokumente fehlen." } }));
  assert.equal(result.title, "Restaurant veröffentlichen");
  assert.equal(result.description, "Dokumente fehlen.");
  assert.equal(result.ctaHref, "/admin/legal");
});

test("nach Veröffentlichung folgen Punkteeinlösung und Angebot in dieser Reihenfolge", () => {
  const reward = resolveOwnerDashboardRecommendation(readyInput({
    rewardStatus: { pointsRedemptionReady: false, birthdayPoolReady: false },
    offerStatus: { ready: false },
  }));
  assert.equal(reward.title, "Erste Punkteeinlösung erstellen");
  const offer = resolveOwnerDashboardRecommendation(readyInput({ offerStatus: { ready: false } }));
  assert.equal(offer.title, "Erstes Angebot veröffentlichen");
});

test("danach folgen Geburtstag, QR und Mitarbeiterzugang", () => {
  const birthday = resolveOwnerDashboardRecommendation(readyInput({ rewardStatus: { pointsRedemptionReady: true, birthdayPoolReady: false } }));
  assert.equal(birthday.id, "setup_birthday_gift_pool");
  const qr = resolveOwnerDashboardRecommendation(readyInput({ qrStatus: { ready: false }, staffStatus: { ready: false } }));
  assert.equal(qr.id, "setup_qr_center");
  const staff = resolveOwnerDashboardRecommendation(readyInput({ staffStatus: { ready: false } }));
  assert.equal(staff.id, "setup_staff_access");
});

test("vollständige Einrichtung wechselt deterministisch in den Betriebsmodus", () => {
  const result = resolveOwnerDashboardRecommendation(readyInput());
  assert.equal(result.id, "operational_new_offer");
  assert.equal(result.title, "Neues Angebot erstellen");
});

test("Dashboard zeigt genau eine aufgelöste Empfehlung und direkte bestehende Ziele", () => {
  assert.equal((dashboard.match(/resolveOwnerDashboardRecommendation\(/g) ?? []).length, 1);
  for (const href of ["/admin/settings/standort", "/admin/rewards", "/admin/offers", "/admin/welcome-gifts", "/admin/qr", "/admin/staff"]) {
    assert.match(resolverSource, new RegExp(href.replaceAll("/", "\\/")));
  }
});

test("Setup-Daten bleiben tenantgebunden und verwenden objektive Zustände", () => {
  assert.match(setupService, /\.eq\("restaurant_id", restaurantId\)/);
  assert.match(setupService, /is_discoverable/);
  assert.match(setupService, /latitude/);
  assert.match(setupService, /loadRestaurantOffers\(restaurantId\)/);
  assert.match(setupService, /staff_members/);
  assert.doesNotMatch(setupService, /customer_profiles|customer_name|phone_number|birth_date/i);
});

test("neue Welcome Gifts starten im Birthday-Pool und der Owner kann sie deaktivieren", () => {
  assert.match(welcomeGifts, /birthdayPoolEnabled: true/);
  assert.match(welcomeGifts, /Für Geburtstagsgeschenke verwenden/);
  assert.match(welcomeGifts, /birthdayPoolEnabled: event\.target\.checked/);
});

test("Onboarding aktiviert nur neue Starter Gifts und bewahrt vorhandene Entscheidungen", () => {
  assert.match(onboardingService, /birthday_pool_enabled: existingReward[\s\S]*Boolean\(existingReward\.birthday_pool_enabled\)[\s\S]*: true/);
  assert.doesNotMatch(onboardingService, /update\(\{[^}]*birthday_pool_enabled: true/);
});
