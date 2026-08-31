import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const actionSource = readFileSync(new URL("../src/shared/components/OpeningHoursCopyAction.tsx", import.meta.url), "utf8");
const onboardingSource = readFileSync(new URL("../src/modules/admin/pages/RestaurantOnboarding.tsx", import.meta.url), "utf8");
const settingsSource = readFileSync(new URL("../src/modules/admin/pages/SettingsPage.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("die gemeinsame Kopieraktion besitzt Button, verständliche Beschriftung und Statusfeedback", () => {
  assert.match(actionSource, /<button[\s\S]*type="button"/);
  assert.match(actionSource, /Auf alle Tage übertragen/);
  assert.match(actionSource, /Bestehende Zeiten für die anderen Tage überschreiben\?/);
  assert.match(actionSource, /Zeiten wurden auf alle Tage übertragen\./);
  assert.match(actionSource, /role="status"/);
});

test("Onboarding und Einstellungen verwenden dieselbe Kopieraktion mit Montag als Quelle", () => {
  for (const source of [onboardingSource, settingsSource]) {
    assert.match(source, /<OpeningHoursCopyAction/);
    assert.match(source, /sourceKey="mon"/);
    assert.match(source, /destinationKeys=\{weekdays\.slice\(1\)/);
  }
});

test("Onboarding hält kopierte Zeiten bis Weiter aus dem Entwurfs-Autosave heraus", () => {
  assert.match(onboardingSource, /pendingOpeningHours/);
  assert.match(onboardingSource, /!activeRestaurant\?\.id \|\| pendingOpeningHours/);
  assert.match(onboardingSource, /persistDraftSnapshot\(nextStep, effectiveForm\)/);
  assert.match(onboardingSource, /if \(step === 2\) setPendingOpeningHours\(null\)/);
});

test("mobile Kopier- und Bestätigungsaktionen haben mindestens 44 Pixel und volle Breite", () => {
  assert.match(styles, /\.opening-hours-copy-button[\s\S]*min-height: 44px/);
  assert.match(styles, /@media \(max-width: 430px\)[\s\S]*\.opening-hours-copy-button[\s\S]*width: 100%/);
});
