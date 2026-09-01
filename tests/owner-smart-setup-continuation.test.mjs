import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ownerSmartSetupLaunchState,
  ownerSmartSetupSuccessState,
  readOwnerSmartSetupLaunchState,
  readOwnerSmartSetupSuccessState,
} from "../src/modules/admin/ownerSmartSetupContinuation.mjs";
import { resolveOwnerDashboardRecommendation } from "../src/modules/admin/ownerDashboardRecommendation.mjs";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const dashboard = await read("../src/modules/admin/pages/AdminDashboard.tsx");
const settings = await read("../src/modules/admin/pages/SettingsPage.tsx");
const rewards = await read("../src/modules/admin/pages/RewardsPage.tsx");
const offers = await read("../src/modules/admin/pages/RestaurantOffersPage.tsx");
const gifts = await read("../src/modules/admin/pages/WelcomeGiftsPage.tsx");
const staff = await read("../src/modules/admin/pages/StaffPage.tsx");
const legal = await read("../src/modules/legal/OwnerLegalSettingsPage.tsx");
const styles = await read("../src/styles.css");
const adminStyles = await read("../src/modules/admin/admin-premium.css");

test("nur zentrale Empfehlungen erzeugen einen Smart-Setup-Startkontext", () => {
  const state = ownerSmartSetupLaunchState("setup_points_redemption");
  assert.deepEqual(readOwnerSmartSetupLaunchState(state), { recommendationId: "setup_points_redemption" });
  assert.equal(ownerSmartSetupLaunchState("frei-erfunden"), null);
  assert.equal(readOwnerSmartSetupLaunchState({ ownerSmartSetup: { source: "fremd", recommendationId: "setup_points_redemption" } }), null);
});

test("Erfolgsmeldungen sind fest definiert und nicht aus Router-Freitext", () => {
  const state = ownerSmartSetupSuccessState("location_saved");
  assert.deepEqual(readOwnerSmartSetupSuccessState(state), { code: "location_saved", message: "Standort gespeichert." });
  assert.equal(ownerSmartSetupSuccessState("fremd"), null);
  assert.equal(readOwnerSmartSetupSuccessState({ ownerSmartSetupSuccess: { source: "owner-smart-setup-assistant", code: "fremd" } }), null);
});

test("Dashboard startet den Kontext, verbraucht Erfolg einmalig und rehydriert den zentralen Resolver", () => {
  assert.match(dashboard, /state=\{ownerSmartSetupLaunchState\(recommendation\.id\)\}/);
  assert.match(dashboard, /readOwnerSmartSetupSuccessState\(location\.state\)/);
  assert.match(dashboard, /navigate\(location\.pathname, \{ replace: true, state: null \}\)/);
  assert.match(dashboard, /className="status-message" role="status"/);
  assert.match(dashboard, /loadDashboardSetupStatus\(activeRestaurant\.id, activeRestaurant\.slug\)/);
  assert.equal((dashboard.match(/resolveOwnerDashboardRecommendation\(/g) ?? []).length, 1);
});

test("Erfolgsmeldung und Dashboard bleiben im gesamten Mobile-Gate ohne Überlauf", () => {
  assert.match(styles, /\.status-message\s*\{[\s\S]*border-radius:[\s\S]*padding:/);
  assert.match(adminStyles, /\.premium-dashboard\s*\{[\s\S]*min-width: 0;[\s\S]*overflow-x: hidden;/);
  assert.match(adminStyles, /@media \(max-width: 430px\)[\s\S]*\.premium-owner-shell \.dashboard-recommendation[\s\S]*min-height: 48px/);
});

test("bestätigte Standort- und Legal-Saves führen nur über den aktiven Kontext zurück", () => {
  assert.match(settings, /setStatus\("Standort für die Restaurantsuche gespeichert\."\);\s*smartSetup\.complete\("location_saved"\)/);
  assert.match(legal, /setMessage\("Die geprüften Dokumentversionen wurden veröffentlicht\."\);\s*smartSetup\.complete\("legal_published"\)/);
  assert.doesNotMatch(settings, /catch[\s\S]{0,300}smartSetup\.complete/);
});

test("Reward und nur veröffentlichte Offers schließen ihren Setup-Schritt ab", () => {
  assert.match(rewards, /setStatus\(wasEditing[\s\S]{0,180}smartSetup\.complete\("reward_saved"\)/);
  assert.match(offers, /if \(action === "PUBLISH"\) smartSetup\.complete\("offer_published"\)/);
  assert.doesNotMatch(offers.match(/async function saveForm[\s\S]*?async function runAction/)?.[0] ?? "", /smartSetup\.complete/);
});

test("Birthday und Staff schließen nur objektiv fertige Zustände ab", () => {
  assert.match(gifts, /saved\.active && saved\.birthday_pool_enabled/);
  assert.match(gifts, /updated\.active && updated\.birthday_pool_enabled/);
  assert.match(staff, /await refreshMembers\(\);\s*smartSetup\.complete\("staff_access_saved"\)/);
  assert.match(staff, /action\.action === "reactivate"/);
});

test("Prioritätsauflösung überspringt bereits fertige Schritte und endet im Betriebsmodus", () => {
  const base = {
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
  };
  assert.equal(resolveOwnerDashboardRecommendation(base), null);
  assert.equal(resolveOwnerDashboardRecommendation({ ...base, offerStatus: { ready: false } }).id, "setup_first_offer");
});
