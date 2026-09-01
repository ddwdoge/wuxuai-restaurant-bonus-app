import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolveOwnerSetupAreas } from "../src/modules/admin/ownerDashboardRecommendation.mjs";
import {
  ownerSetupOverviewLaunchState,
  ownerSetupOverviewSuccessState,
  readOwnerSetupOverviewLaunchState,
  readOwnerSetupOverviewSuccessState,
} from "../src/modules/admin/ownerSmartSetupContinuation.mjs";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const overview = await read("../src/modules/admin/pages/OwnerSetupOverviewPage.tsx");
const settings = await read("../src/modules/admin/pages/SettingsPage.tsx");
const app = await read("../src/app/App.tsx");
const continuation = await read("../src/modules/admin/useOwnerSmartSetupContinuation.ts");
const styles = await read("../src/styles.css");

function setupInput(overrides = {}) {
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

test("Setup-Uebersicht bildet 0/6, 3/6 und 6/6 aus realem Zustand ab", () => {
  const none = resolveOwnerSetupAreas(setupInput({
    restaurantStatus: { active: false },
    rewardStatus: { pointsRedemptionReady: false, birthdayPoolReady: false },
    offerStatus: { ready: false },
    qrStatus: { ready: false },
    staffStatus: { ready: false },
  }));
  assert.equal(none.filter((area) => area.ready).length, 0);

  const three = resolveOwnerSetupAreas(setupInput({
    offerStatus: { ready: false },
    qrStatus: { ready: false },
    staffStatus: { ready: false },
  }));
  assert.equal(three.filter((area) => area.ready).length, 3);
  assert.equal(resolveOwnerSetupAreas(setupInput()).filter((area) => area.ready).length, 6);
});

test("Publikation verwendet E-Mail, Onboarding, Legal, Restaurant und Discovery gemeinsam", () => {
  for (const overrides of [
    { emailStatus: { confirmed: false } },
    { onboardingStatus: "draft" },
    { legalStatus: { status: "yellow" } },
    { restaurantStatus: { active: false } },
    { publicationStatus: { ready: false } },
  ]) {
    assert.equal(resolveOwnerSetupAreas(setupInput(overrides))[0].ready, false);
  }
});

test("Settings bietet die persistente Route und alle sechs bestehenden Ziele", () => {
  assert.match(settings, /title="Setup & Einrichtung"/);
  assert.match(settings, /to="\/admin\/settings\/setup"/);
  assert.match(app, /path="settings\/setup"/);
  for (const href of ["/admin/settings/standort", "/admin/rewards", "/admin/offers", "/admin/welcome-gifts", "/admin/qr", "/admin/staff"]) {
    assert.match(overview, new RegExp(href.replaceAll("/", "\\/")));
  }
});

test("Uebersicht laedt denselben tenantgebundenen Setup- und Legal-Zustand", () => {
  assert.match(overview, /loadRestaurantLegalSetup\(activeRestaurant\.id\)/);
  assert.match(overview, /loadDashboardSetupStatus\(activeRestaurant\.id, activeRestaurant\.slug\)/);
  assert.match(overview, /resolveOwnerSetupAreas\(/);
  assert.match(overview, /isAuthoritativePublicationReady\(/);
  assert.match(overview, /isQrSetupReady\(activeRestaurant\)/);
  assert.doesNotMatch(overview, /setup_completed|Als erledigt markieren|type="checkbox"/);
});

test("Setup-Uebersicht besitzt einen eigenen validierten Rueckkehrkontext", () => {
  const launch = ownerSetupOverviewLaunchState("setup_first_offer");
  assert.deepEqual(readOwnerSetupOverviewLaunchState(launch), { recommendationId: "setup_first_offer" });
  assert.equal(ownerSetupOverviewLaunchState("erfunden"), null);
  const success = ownerSetupOverviewSuccessState("offer_published");
  assert.deepEqual(readOwnerSetupOverviewSuccessState(success), { code: "offer_published", message: "Angebot veröffentlicht." });
  assert.match(continuation, /navigate\("\/admin\/settings\/setup", \{ replace: true, state \}\)/);
  assert.match(continuation, /navigate\("\/admin", \{ replace: true, state \}\)/);
});

test("Mobile Liste bleibt kompakt, umbruchfaehig und mindestens 44px bedienbar", () => {
  assert.match(styles, /\.owner-setup-row\s*\{[\s\S]*min-height: 72px/);
  assert.match(styles, /\.owner-setup-row-icon\s*\{[\s\S]*height: 44px[\s\S]*width: 44px/);
  assert.match(styles, /@media \(max-width: 600px\)[\s\S]*\.owner-setup-row-status[\s\S]*white-space: normal/);
  assert.match(styles, /\.owner-setup-overview\s*\{[\s\S]*min-width: 0/);
});
