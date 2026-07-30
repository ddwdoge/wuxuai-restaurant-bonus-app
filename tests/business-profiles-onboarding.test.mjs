import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  BUSINESS_PROFILES,
  BUSINESS_TYPE_OPTIONS,
  DEFAULT_POINTS_PER_EURO,
  GENEROSITY_OPTIONS,
  createBonusProgramSuggestion,
  getBusinessProfile,
  isKnownBusinessType,
  isProfileWelcomeGiftKey,
  reconcileBusinessProfileSelections,
} from "../src/config/businessProfiles.mjs";
import { REDEMPTION_RATE_PERCENT_OPTIONS } from "../src/modules/loyalty/redemptionRate.mjs";

const onboarding = readFileSync(new URL("../src/modules/admin/pages/RestaurantOnboarding.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("Branchenauswahl enthält exakt die elf freigegebenen V1-Profile", () => {
  assert.deepEqual(BUSINESS_TYPE_OPTIONS.map((option) => option.label), [
    "Restaurant", "Café", "Bäckerei", "Bubble Tea", "Eisdiele", "Einzelhandel",
    "Friseursalon", "Kosmetikstudio", "Fitnessstudio", "Dienstleistung", "Sonstiges",
  ]);
  assert.equal(getBusinessProfile("Café").key, "cafe");
  assert.equal(getBusinessProfile("Unbekannte Bestandsbranche").key, "other");
  assert.equal(isKnownBusinessType("Unbekannte Bestandsbranche"), false);
});

test("Restaurant zeigt nur passende Geschenk- und Belohnungsoptionen", () => {
  const profile = BUSINESS_PROFILES.restaurant;
  assert.ok(profile.welcomeGiftOptions.some((option) => option.label === "Gratis Dessert"));
  assert.ok(profile.redemptionCategories.includes("Hauptspeise"));
  assert.ok(profile.welcomeGiftOptions.some((option) => option.key === "custom"));
});

test("Café zeigt keine Hauptspeise und Einzelhandel kein Dessert", () => {
  assert.equal(BUSINESS_PROFILES.cafe.redemptionCategories.includes("Hauptspeise"), false);
  assert.equal(BUSINESS_PROFILES.retail.redemptionCategories.includes("Dessert"), false);
  assert.ok(BUSINESS_PROFILES.cafe.welcomeGiftOptions.some((option) => option.label === "Gratis Kaffee"));
  assert.ok(BUSINESS_PROFILES.retail.welcomeGiftOptions.some((option) => option.label === "Einkaufsgutschein"));
});

test("Friseursalon zeigt keine Kaffeeoption und Sonstiges bleibt generisch", () => {
  assert.equal(BUSINESS_PROFILES.hair_salon.welcomeGiftOptions.some((option) => /Kaffee/.test(option.label)), false);
  assert.deepEqual(BUSINESS_PROFILES.other.redemptionCategories, ["Leistung", "Produkt", "Gutschein", "Prozent-Rabatt", "Eigene Belohnung"]);
});

test("Branchenwechsel behält gültige Werte und setzt ungültige kontrolliert zurück", () => {
  assert.deepEqual(reconcileBusinessProfileSelections({
    businessType: "Café",
    welcomeGiftKey: "gratis-kaffee",
    rewardCategory: "Gebäck",
  }), { welcomeGiftKey: "gratis-kaffee", rewardCategory: "Gebäck", changed: false });

  assert.deepEqual(reconcileBusinessProfileSelections({
    businessType: "Einzelhandel",
    welcomeGiftKey: "gratis-kaffee",
    rewardCategory: "Dessert",
  }), { welcomeGiftKey: "", rewardCategory: "", changed: true });

  assert.deepEqual(reconcileBusinessProfileSelections({
    businessType: "Einzelhandel",
    welcomeGiftKey: "custom",
    rewardCategory: "Eigene Belohnung",
  }), { welcomeGiftKey: "custom", rewardCategory: "Eigene Belohnung", changed: false });

  assert.equal(isProfileWelcomeGiftKey("gratis-kaffee"), true);
  assert.equal(isProfileWelcomeGiftKey("individuelles-bestandsgeschenk"), false);
});

test("alle vier Großzügigkeitsstufen erzeugen deterministische Vorschläge", () => {
  assert.deepEqual(GENEROSITY_OPTIONS.map((option) => option.label), ["Sparsam", "Standard", "Großzügig", "Premium"]);
  for (const option of GENEROSITY_OPTIONS) {
    const suggestion = createBonusProgramSuggestion({
      businessType: "Café",
      generosity: option.key,
      averagePurchase: 18,
      pointsPerEuro: DEFAULT_POINTS_PER_EURO,
    });
    assert.equal(suggestion.businessProfileKey, "cafe");
    assert.ok(suggestion.welcomeGift);
    assert.ok(suggestion.rewardTitle);
    assert.ok(suggestion.requiredPoints > 0);
  }
  const standard = createBonusProgramSuggestion({ businessType: "Café", generosity: "standard", averagePurchase: 18 });
  assert.equal(standard.welcomeGift.label, "Gratis Kaffee");
  assert.equal(standard.rewardTitle, "Gratis Gebäck");
  assert.equal(standard.redemptionRatePercent, 3);
  assert.equal(standard.pointsPerEuro, 10);
});

test("Assistent verwendet die zentrale Punkteformel und Einlösequote 1 bis 10 Prozent", () => {
  assert.deepEqual(REDEMPTION_RATE_PERCENT_OPTIONS, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const suggestion = createBonusProgramSuggestion({
    businessType: "Restaurant",
    generosity: "standard",
    averagePurchase: 20,
    pointsPerEuro: 10,
    redemptionRatePercent: 3,
  });
  assert.equal(suggestion.requiredPoints, Math.ceil(suggestion.estimatedValue / 0.03 * 10));
});

test("Onboarding nutzt Dropdowns, Bestätigung und erhält individuelle Bestandswerte", () => {
  assert.match(onboarding, /<option value="">Branche auswählen<\/option>/);
  assert.match(onboarding, /Willkommensgeschenk auswählen/);
  assert.match(onboarding, /Wie sollen Punkte eingelöst werden\?/);
  assert.match(onboarding, /Belohnungskategorie/);
  assert.match(onboarding, /Vorschlag übernehmen/);
  assert.match(onboarding, /Einstellungen bestätigen/);
  assert.match(onboarding, /isIndividualStarterReward\(reward\)/);
  assert.doesNotMatch(onboarding, /template-selection-grid/);
});

test("Dropdowns und Assistent bleiben mobil berührungsfreundlich und ohne starre Breite", () => {
  assert.match(styles, /premium-business-select[\s\S]*min-height: 48px/);
  assert.match(styles, /@media \(max-width: 699px\)[\s\S]*business-assistant-summary[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(styles, /business-assistant-actions \.button[\s\S]*min-height: 48px/);
  assert.doesNotMatch(styles, /business-assistant-card[^}]*width:\s*[5-9][0-9]{2}px/);
});
