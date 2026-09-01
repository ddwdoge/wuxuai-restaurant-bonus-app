import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolveOwnerDashboardRecommendation } from "../src/modules/admin/ownerDashboardRecommendation.mjs";
import {
  hasUsablePublishedOffer,
  hasUsableStaffAccess,
  isAuthoritativePublicationReady,
  isOfferSetupReady,
  isQrSetupReady,
} from "../src/modules/admin/ownerDashboardSetupStatus.mjs";

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

test("jeder einzelne fehlende Gate liefert exakt den ersten offenen Setup-Schritt", () => {
  const cases = [
    ["publication_location_incomplete", { publicationStatus: { ready: false } }],
    ["setup_points_redemption", { rewardStatus: { pointsRedemptionReady: false, birthdayPoolReady: true } }],
    ["setup_first_offer", { offerStatus: { ready: false } }],
    ["setup_birthday_gift_pool", { rewardStatus: { pointsRedemptionReady: true, birthdayPoolReady: false } }],
    ["setup_qr_center", { qrStatus: { ready: false } }],
    ["setup_staff_access", { staffStatus: { ready: false } }],
  ];
  for (const [expectedId, overrides] of cases) {
    assert.equal(resolveOwnerDashboardRecommendation(readyInput(overrides)).id, expectedId);
  }
});

test("vollständige Einrichtung blendet den Assistenten ohne erfundene Empfehlung aus", () => {
  const result = resolveOwnerDashboardRecommendation(readyInput());
  assert.equal(result, null);
});

test("veröffentlichte zukünftige und zeitlich eingeschränkte Angebote erfüllen den Setup-Vertrag", () => {
  const now = Date.parse("2026-09-01T10:00:00Z");
  const future = { status: "PUBLISHED", is_active: true, valid_from: "2026-09-05T10:00:00Z", valid_to: "2026-09-10T10:00:00Z" };
  const weekday = { status: "PUBLISHED", is_active: true, valid_to: "2026-09-10T10:00:00Z", weekdays: [6, 7] };
  const timed = { status: "PUBLISHED", is_active: true, valid_to: "2026-09-10T10:00:00Z", time_from: "18:00", time_to: "22:00" };
  assert.equal(isOfferSetupReady(future, now), true);
  assert.equal(isOfferSetupReady(weekday, now), true);
  assert.equal(isOfferSetupReady(timed, now), true);
  assert.equal(hasUsablePublishedOffer([future, weekday, timed], now), true);
});

test("Entwurf, deaktiviertes und abgelaufenes Angebot erfüllen Setup nicht", () => {
  const now = Date.parse("2026-09-01T10:00:00Z");
  assert.equal(isOfferSetupReady({ status: "DRAFT", is_active: true, valid_to: "2026-09-10T10:00:00Z" }, now), false);
  assert.equal(isOfferSetupReady({ status: "PUBLISHED", is_active: false, valid_to: "2026-09-10T10:00:00Z" }, now), false);
  assert.equal(isOfferSetupReady({ status: "PUBLISHED", is_active: true, valid_to: "2026-08-31T10:00:00Z" }, now), false);
});

test("Publikation, QR und Staff verwenden ihre vollständigen autoritativen Gates", () => {
  assert.equal(isAuthoritativePublicationReady({ restaurantActive: true, registrationAllowed: true, publicDiscoveryReady: true }), true);
  assert.equal(isAuthoritativePublicationReady({ restaurantActive: true, registrationAllowed: false, publicDiscoveryReady: true }), false);
  assert.equal(isAuthoritativePublicationReady({ restaurantActive: true, registrationAllowed: true, publicDiscoveryReady: false }), false);
  assert.equal(isQrSetupReady({ status: "active", slug: "wuxuai-bonus" }), true);
  assert.equal(isQrSetupReady({ status: "active", slug: "" }), false);
  assert.equal(isQrSetupReady({ status: "inactive", slug: "wuxuai-bonus" }), false);
  assert.equal(hasUsableStaffAccess([{ status: "active" }]), true);
  assert.equal(hasUsableStaffAccess([{ status: "invited" }, { status: "suspended" }]), false);
  assert.equal(hasUsableStaffAccess([]), false);
});

test("Action Center erscheint nach vollständigem Setup nur für objektive Punktewarnung", () => {
  const result = resolveOwnerDashboardRecommendation(readyInput({ actionStatus: { pointAnomalyOpen: true } }));
  assert.equal(result.id, "action_point_anomaly");
  assert.equal(result.category, "action");
  assert.equal(result.ctaLabel, "Prüfen");
});

test("kritische Publikation bleibt vor Action-Center-Warnungen", () => {
  const result = resolveOwnerDashboardRecommendation(readyInput({
    legalStatus: { status: "red", reason: "Dokumente fehlen." },
    actionStatus: { pointAnomalyOpen: true },
  }));
  assert.equal(result.id, "publication_legal_readiness");
});

test("Dashboard zeigt genau eine aufgelöste Empfehlung und direkte bestehende Ziele", () => {
  assert.equal((dashboard.match(/resolveOwnerDashboardRecommendation\(/g) ?? []).length, 1);
  assert.ok(dashboard.indexOf("dashboard-recommendation-card") < dashboard.indexOf("dashboard-kpi-grid"));
  assert.doesNotMatch(dashboard, /<section className="card dashboard-point-anomaly"/);
  for (const href of ["/admin/settings/standort", "/admin/rewards", "/admin/offers", "/admin/welcome-gifts", "/admin/qr", "/admin/staff"]) {
    assert.match(resolverSource, new RegExp(href.replaceAll("/", "\\/")));
  }
});

test("Setup-Daten bleiben tenantgebunden und verwenden objektive Zustände", () => {
  assert.match(setupService, /\.eq\("restaurant_id", restaurantId\)/);
  assert.match(setupService, /is_discoverable/);
  assert.match(setupService, /latitude/);
  assert.match(setupService, /loadRestaurantOffers\(restaurantId\)/);
  assert.match(setupService, /loadOwnerStaffMembers\(restaurantId\)/);
  assert.doesNotMatch(setupService, /from\("staff_members"\)/);
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
