import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const onboardingUrl = new URL("../src/modules/admin/pages/RestaurantOnboarding.tsx", import.meta.url);
const onboarding = await readFile(onboardingUrl, "utf8");

test("V1 enthaelt keine Branchenprofile oder neutrale Terminologiekonfiguration", async () => {
  await assert.rejects(access(new URL("../src/config/businessProfiles.mjs", import.meta.url)));
  await assert.rejects(access(new URL("../src/config/productTerminology.ts", import.meta.url)));
  assert.doesNotMatch(onboarding, /PROGRAM_GOAL_OPTIONS|createBonusProgramSuggestion|businessProfile/);
});

test("Willkommensgeschenke bleiben eine Mehrfachauswahl mit mindestens einem Geschenk", () => {
  assert.match(onboarding, /starterRewards:\s*StarterRewardDraft\[\]/);
  assert.match(onboarding, /toggleStarterRewardTemplate/);
  assert.match(onboarding, /starterRewards:\s*\[\s*\.\.\.current\.starterRewards/);
  assert.match(onboarding, /Bitte waehle mindestens ein Willkommensgeschenk\.|Bitte wähle mindestens ein Willkommensgeschenk\./);
  assert.match(onboarding, /Empfohlen: 3–5 Willkommensgeschenke/);
  assert.match(onboarding, /Das System teilt jedem neuen Mitglied automatisch eines davon zu/);
  assert.match(onboarding, /Automatische Geschenkverteilung/);
});

test("Punkteeinloesung verwendet feste Referenzwerte und die V1-Grosszuegigkeitsstufen", () => {
  assert.match(onboarding, /BONUS_REFERENCE_SPEND_EURO\s*=\s*20/);
  assert.match(onboarding, /BONUS_REFERENCE_VISITS\s*=\s*5/);
  assert.doesNotMatch(onboarding, /id="average-bill"/);
  assert.doesNotMatch(onboarding, /id="first-reward-visits"/);
  assert.doesNotMatch(onboarding, /id="first-reward-type"/);
  assert.match(onboarding, /Sparsam:\s*0\.03/);
  assert.match(onboarding, /Normal:\s*0\.05/);
  assert.match(onboarding, /Großzügig:\s*0\.08/);
  assert.match(onboarding, /Premium:\s*0\.1/);
  assert.match(onboarding, /BONUS_REFERENCE_SPEND_EURO \* BONUS_REFERENCE_VISITS/);
  assert.match(onboarding, /Das ist nur ein Rechenbeispiel/);
});

test("Restaurant-V1 bietet die gesperrten Gastro-Kategorien und eigene Geschenke", () => {
  for (const category of ["Getränk", "Dessert", "Vorspeise", "Hauptspeise", "Menü", "Eigene Überraschung"]) {
    assert.match(onboarding, new RegExp(`category: "${category}"`));
  }
});
