import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const onboarding = await readFile(
  new URL("../src/modules/admin/pages/RestaurantOnboarding.tsx", import.meta.url),
  "utf8",
);
const adminLayout = await readFile(
  new URL("../src/modules/admin/AdminLayout.tsx", import.meta.url),
  "utf8",
);
const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

test("Onboarding bündelt Restaurantauswahl, Hilfe und Account in einem ruhigen Hauptheader", () => {
  assert.match(adminLayout, /onboardingRestaurantAction: <TenantSwitcher \/>/);
  assert.match(adminLayout, /onboardingAccountAction: profileMenu/);
  assert.match(onboarding, /className="installation-header"[\s\S]*Restaurant einrichten[\s\S]*Willkommen![\s\S]*Gleich bereit für deine Gäste\./);

  const actions = onboarding.slice(
    onboarding.indexOf('className="installation-header-actions"'),
    onboarding.indexOf("</header>", onboarding.indexOf('className="installation-header-actions"')),
  );
  assert.ok(actions.indexOf("onboardingRestaurantAction") < actions.indexOf("installation-help-action"));
  assert.ok(actions.indexOf("installation-help-action") < actions.indexOf("onboardingAccountAction"));
});

test("Fortschritt besitzt klare Texte und eine zugängliche Prozentanzeige", () => {
  assert.match(onboarding, /Schritt \{step \+ 1\} von \{steps\.length\}/);
  assert.match(onboarding, /\{steps\[step\]\}/);
  assert.match(onboarding, /\{progressPercent\} % abgeschlossen/);
  assert.match(onboarding, /role="progressbar"/);
  assert.match(onboarding, /aria-valuenow=\{progressPercent\}/);
});

test("Step-Navigation zeigt sieben gleichmäßige Zustände mit Haken", () => {
  assert.match(onboarding, /<ol className="setup-steps"/);
  assert.match(onboarding, /index < step \? <Check size=\{14\}/);
  assert.match(styles, /\.setup-steps \{[\s\S]*grid-template-columns: repeat\(7, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.setup-step \{[\s\S]*height: 72px/);
  assert.match(styles, /\.setup-step-label \{[\s\S]*-webkit-line-clamp: 2/);
  assert.match(styles, /\.setup-step-label \{[\s\S]*hyphens: none/);
  assert.doesNotMatch(styles, /\.setup-step-label \{[\s\S]{0,240}overflow-wrap: anywhere/);
});

test("Mobile Header bleibt gestapelt und die Step-Leiste scrollt nur intern", () => {
  const mobile = styles.slice(styles.indexOf("@media (max-width: 699px)"));
  assert.match(onboarding, /activeStepRef\.current/);
  assert.match(onboarding, /scrollIntoView\(\{ behavior: "smooth", block: "nearest", inline: "center" \}\)/);
  assert.match(mobile, /\.setup-shell \{[\s\S]*overflow-x: hidden/);
  assert.match(mobile, /\.installation-header-actions \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) 56px/);
  assert.match(mobile, /\.installation-header-actions \.tenant-switcher \{[\s\S]*grid-column: 1 \/ -1/);
  assert.match(mobile, /\.setup-steps \{[\s\S]*overflow-x: auto/);
  assert.match(mobile, /\.wizard-footer \.button \{[\s\S]*min-height: 48px/);
});

test("Tablet zeigt lange Step-Titel ohne kleinere Schrift und mit sicheren Touchflächen", () => {
  const tablet = styles.slice(
    styles.indexOf("@media (max-width: 1023px)"),
    styles.indexOf("@media (max-width: 820px)"),
  );
  assert.match(tablet, /\.setup-steps \{[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.setup-shell \.tenant-switcher-field \.select \{[\s\S]*min-height: 44px/);
  assert.match(styles, /\.setup-shell \.wizard-footer \.button \{[\s\S]*min-height: 44px/);
});

test("Abschlussinhalt bleibt klar von der Navigation getrennt", () => {
  assert.match(onboarding, /"Herzlichen Glückwunsch! Dein Restaurant ist startklar\."/);
  assert.match(onboarding, /step === 6[\s\S]*className="wizard-screen onboarding-completion-screen"[\s\S]*stepTitles\[6\]/);
  assert.match(styles, /\.setup-steps \{[\s\S]*margin-bottom: 28px/);
  assert.match(styles, /\.onboarding-completion-screen \{[\s\S]*padding-top: 18px/);
});
