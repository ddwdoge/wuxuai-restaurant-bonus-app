import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const onboarding = await readFile(new URL("../src/modules/admin/pages/RestaurantOnboarding.tsx", import.meta.url), "utf8");
const registration = await readFile(new URL("../src/modules/auth/RegisterPage.tsx", import.meta.url), "utf8");
const activation = await readFile(new URL("../src/modules/onboarding/pilotOnboardingService.ts", import.meta.url), "utf8");

test("Owner bearbeitet keine technischen Referenzannahmen im Onboarding", () => {
  assert.match(onboarding, /BONUS_REFERENCE_SPEND_EURO\s*=\s*20/);
  assert.match(onboarding, /BONUS_REFERENCE_VISITS\s*=\s*5/);
  assert.doesNotMatch(onboarding, /id="average-bill"|id="first-reward-visits"|id="first-reward-type"/);
  assert.match(onboarding, /nur ein Rechenbeispiel/);
});

test("kanonische Rueckgabequoten und Persistenz bleiben erhalten", () => {
  assert.match(onboarding, /Sparsam:\s*0\.03/);
  assert.match(onboarding, /Normal:\s*0\.05/);
  assert.match(onboarding, /Großzügig:\s*0\.08/);
  assert.match(onboarding, /Premium:\s*0\.1/);
  assert.match(onboarding, /redemptionReturnRate:\s*bonus\.returnRate/);
  assert.match(activation, /redemption_return_rate:\s*input\.redemptionReturnRate/);
  assert.match(activation, /shouldSkipCompletedOnboarding\(existingRestaurant\.onboarding_status\)/);
});

test("optionale Mobiltelefonnummer ist international nutzbar und aktiviert kein SMS", () => {
  assert.match(registration, /label="Mobiltelefonnummer \(empfohlen\)"/);
  assert.match(registration, /hint="Empfohlen für zukünftige SMS-Benachrichtigungen\."/);
  assert.match(registration, /autoComplete="tel"/);
  assert.match(registration, /optional/);
  assert.match(registration, /type="tel"/);
  assert.doesNotMatch(registration, /pattern=|sendSms|smsProvider|marketingConsent/);
});
