import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CUSTOMER_PRESENTATION_MESSAGES } from "../src/shared/i18n/customerPresentationMessages.mjs";
import { customerPresentationText } from "../src/modules/customer/customerRewardPresentation.mjs";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [portal, finder, finderMap, finderCss, switcher, switcherCss, customerCss, qrConfig] = await Promise.all([
  read("../src/modules/customer/CustomerPortal.tsx"),
  read("../src/modules/customer/PartnerRestaurantFinderPage.tsx"),
  read("../src/modules/customer/PartnerRestaurantMap.tsx"),
  read("../src/modules/customer/partner-restaurant-finder.css"),
  read("../src/modules/customer/components/CustomerRestaurantSwitcher.tsx"),
  read("../src/modules/customer/components/customer-restaurant-switcher.css"),
  read("../src/modules/customer/customer-premium.css"),
  read("../src/shared/lib/operationalQr.mjs"),
]);

const languages = ["de", "en", "fr", "it", "es", "zh", "ko"];
const blockBKeys = [
  "pointsValidityMonths",
  "pointsValidityTerms",
  "accountQuickIntro",
  "finderResults",
  "finderDistance",
  "finderLastVisit",
  "finderNoVisit",
  "finderBonusMember",
  "finderWelcomeAvailable",
  "finderRewardsAvailable",
  "finderNearReward",
  "finderVisited",
  "finderNotVisited",
  "switcherDescription",
  "switcherSwitching",
  "switcherLoading",
  "switcherLoadError",
  "retry",
  "switcherRestaurantsHeading",
  "switcherSearchLabel",
  "switcherSearchPlaceholder",
  "switcherEmpty",
  "switcherSwitchError",
  "switcherDiscover",
  "mapZoomIn",
  "mapZoomOut",
  "mapClosed",
  "mapReward",
  "mapNearReward",
  "mapPointsAvailable",
  "mapRegistered",
  "mapPartner",
  "mapCurrentContext",
  "mapUserLocation",
  "mapContributors",
  "mapLoadError",
  "detailAria",
  "detailClose",
  "detailMember",
  "detailNoMember",
  "detailPoints",
  "detailVisits",
  "detailRewards",
  "detailAvailable",
  "detailOpen",
  "detailJoin",
  "detailDirections",
  "detailCurrentOffer",
  "detailOfferView",
  "detailJoinNote",
  "restaurantDetailDescription",
  "detailTitle",
  "detailCoverAlt",
  "detailCoverUnavailable",
  "detailLogoAlt",
  "openingTodayClosed",
  "openingUnavailable",
  "openingOpensAt",
  "openingOpenUntil",
  "openingLunchBreakUntil",
  "openingTodaySingle",
  "openingTodaySplit",
];

test("Block-B-Inventur bleibt auf bestehende Customer-Routen und gemeinsame Drawer begrenzt", () => {
  for (const contract of [
    /\/customer\/restaurants/,
    /setAccountSheet\("qr"\)/,
    /handleCreateReferralLink/,
    /premium-account-grid/,
    /<AppDrawer/,
  ]) assert.match(`${portal}\n${finder}\n${switcher}`, contract);
  assert.doesNotMatch(`${portal}\n${finder}\n${switcher}`, /service_role|alter table|create policy|create migration/i);
});

test("Block-B-Systemtexte besitzen in allen sieben Sprachen vollständige explizite Verträge", () => {
  const referenceKeys = Object.keys(CUSTOMER_PRESENTATION_MESSAGES.de).sort();
  for (const language of languages) {
    assert.deepEqual(Object.keys(CUSTOMER_PRESENTATION_MESSAGES[language]).sort(), referenceKeys);
    for (const key of blockBKeys) {
      const fullKey = `customer.presentation.${key}`;
      assert.equal(typeof CUSTOMER_PRESENTATION_MESSAGES[language][fullKey], "string", `${language}: ${fullKey}`);
      assert.notEqual(CUSTOMER_PRESENTATION_MESSAGES[language][fullKey], fullKey);
    }
  }
});

test("Account-Hinweis und Punktegültigkeit folgen ohne deutschen Runtime-Fallback der aktiven Sprache", () => {
  assert.match(portal, /ct\("pointsValidityMonths", \{ count: pointsValidityMonths \}\)/);
  assert.match(portal, /ct\("pointsValidityTerms"\)/);
  assert.match(portal, /subtitle=\{ct\("accountQuickIntro"\)\}/);
  for (const language of languages.filter((language) => language !== "de")) {
    assert.doesNotMatch(customerPresentationText("pointsValidityTerms", language), /Punkte|Teilnahmebedingungen/);
    assert.doesNotMatch(customerPresentationText("accountQuickIntro", language), /Schnell|Bereichen/);
  }
});

test("Discovery lokalisiert dynamische Zähler, Distanz und Zeit ohne Restauranttexte umzuschreiben", () => {
  for (const key of ["finderResults", "finderDistance", "finderLastVisit", "finderNoVisit", "finderNearReward"]) {
    assert.match(finder, new RegExp(`customerPresentationText\\(\"${key}\", language`));
  }
  assert.match(finder, /formatLocaleDate\(value, language/);
  assert.match(finder, /formatLocaleNumber\(/);
  for (const field of ["location.name", "locationAddress\(location\)", "location.short_description", "reward.title", "currentOffer.title", "currentOffer.short_description"]) {
    assert.match(finder, new RegExp(`data-i18n-skip=\"true\"[^>]*>\\{${field.replace(/[()]/g, "\\$&")}`));
  }
  for (const key of ["detailAria", "detailClose", "detailPoints", "detailVisits", "detailRewards", "detailOpen", "detailJoin", "detailDirections", "detailOfferView", "detailJoinNote", "restaurantDetailDescription", "detailTitle"]) {
    assert.match(finder, new RegExp(`(?:text|customerPresentationText)\\(\"${key}\"`));
  }
  assert.doesNotMatch(finder, /aria-label=\"Restaurantdetails schließen\"|>Restaurant öffnen<|>Bonusprogramm beitreten<|>Route starten<|>Angebot ansehen</);
  for (const key of ["mapZoomIn", "mapZoomOut", "mapClosed", "mapReward", "mapNearReward", "mapPointsAvailable", "mapRegistered", "mapPartner", "mapCurrentContext", "mapUserLocation", "mapContributors", "mapLoadError"]) {
    assert.match(finderMap, new RegExp(`\"${key}\"`));
  }
  assert.doesNotMatch(finderMap, /Noch nicht besucht|Partnerlokal|Aktuell geschlossen|Dein Standort|Mitwirkende/);
  for (const key of ["detailCoverAlt", "detailCoverUnavailable", "detailLogoAlt", "openingTodayClosed", "openingUnavailable", "openingOpensAt", "openingOpenUntil", "openingLunchBreakUntil", "openingTodaySingle", "openingTodaySplit"]) {
    assert.match(finder, new RegExp(`"${key}"`));
  }
  assert.match(finder, /function openingStatusPresentation/);
  assert.match(finder, /RestaurantLogoImage alt=\{text\("detailLogoAlt", \{ name: location\.name \}\)\}/);
  assert.doesNotMatch(finder, /\{location\.opening_status\.message\}/);
});

test("Restaurantdetail zeigt die primäre Aktion vor sekundären Angebotsdetails", () => {
  const recommendation = finder.indexOf('className="partner-recommendation"');
  const actions = finder.indexOf('className="partner-detail-actions"', recommendation);
  const offer = finder.indexOf('className="partner-current-offer"', recommendation);
  assert.ok(recommendation >= 0 && actions > recommendation && offer > actions);
  assert.match(finderCss, /partner-detail-actions \.premium-button[^}]*min-height: 48px/);
});

test("Restaurantwechsel-Drawer ist inhaltsgetrieben und behält sichere Scrollgrenzen", () => {
  assert.match(switcherCss, /:has\(\.customer-restaurant-switcher\) \{ height: auto; max-height: min\(76dvh, 680px\)/);
  assert.match(switcherCss, /customer-restaurant-switcher-list[^}]*max-height: min\(46dvh, 430px\)[^}]*overflow-y: auto/);
  assert.match(switcherCss, /customer-restaurant-switcher-row[^}]*min-height: 64px/);
  assert.match(switcher, /openCustomerAccountMembership\(membership\)/);
  for (const key of [
    "close",
    "restaurantSwitch",
    "switcherDescription",
    "switcherLoading",
    "switcherLoadError",
    "switcherEmpty",
    "switcherDiscover",
  ]) assert.match(switcher, new RegExp(`ct\\("${key}"\\)`));
  assert.doesNotMatch(switcher, />\s*(?:Restaurant wechseln|Wähle eines deiner Restaurants|Deine Restaurants|Erneut versuchen|Neues Restaurant entdecken)\s*</);
});

test("Persönlicher QR bleibt responsiv im scanbaren 240–280-px-Vertrag", () => {
  assert.match(qrConfig, /screenSize: 270/);
  assert.match(portal, /<QRCodeSVG value=\{portalUrl\} size=\{256\} level="M"/);
  assert.match(customerCss, /\.premium-qr-frame > svg \{[^}]*height: auto[^}]*max-width: 100%[^}]*width: min\(270px, 100%\)/s);
  assert.match(customerCss, /premium-account-qr[^}]*justify-items: center/);
});

test("Block-B-Darstellung verwendet weder CSS-Zoom noch Seiten-Skalierung", () => {
  assert.doesNotMatch(`${finderCss}\n${switcherCss}`, /\bzoom\s*:|transform\s*:\s*scale\(/);
  assert.match(finderCss, /partner-finder-shell[^}]*overflow-x: hidden/);
  assert.match(finderCss, /padding-bottom: calc\(18px \+ env\(safe-area-inset-bottom\)\)/);
});
