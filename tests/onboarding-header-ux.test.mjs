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
  assert.match(onboarding, /<h2 id="onboarding-progress-title">\{stepTitles\[step\]\}<\/h2>/);
  assert.doesNotMatch(onboarding, /<h2>\{stepTitles\[\d\]\}<\/h2>/);
  assert.match(onboarding, /\{progressPercent\} % abgeschlossen/);
  assert.match(onboarding, /role="progressbar"/);
  assert.match(onboarding, /aria-valuenow=\{progressPercent\}/);
});

test("Fortschritt ist die einzige Step-Navigation", () => {
  assert.doesNotMatch(onboarding, /className="setup-steps"/);
  assert.doesNotMatch(onboarding, /activeStepRef/);
  assert.doesNotMatch(styles, /\.setup-steps|\.setup-step(?:[\s.{:#]|$)/);
  assert.match(onboarding, /<section className="onboarding-progress"[\s\S]*<section className="onboarding-layout">/);
});

test("Mobile Header bleibt kompakt und ohne zweite Navigationsleiste", () => {
  const mobile = styles.slice(styles.indexOf("@media (max-width: 699px)"));
  assert.match(mobile, /\.setup-shell \{[\s\S]*overflow-x: hidden/);
  assert.match(mobile, /\.installation-header-actions \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) 48px 48px/);
  assert.match(mobile, /\.installation-help-label \{[\s\S]*display: none/);
  assert.match(mobile, /\.onboarding-progress \{[\s\S]*padding: 12px 0/);
  assert.match(mobile, /\.onboarding-layout \{[\s\S]*margin-top: 14px/);
  assert.match(mobile, /\.wizard-footer \.button \{[\s\S]*min-height: 48px/);
});

test("Tablet und Desktop behalten sichere Touchflächen", () => {
  assert.match(styles, /\.setup-shell \.tenant-switcher-field \.select \{[\s\S]*min-height: 44px/);
  assert.match(styles, /\.setup-shell \.wizard-footer \.button \{[\s\S]*min-height: 44px/);
});

test("Abschlussinhalt beginnt direkt nach dem kompakten Fortschrittsbereich", () => {
  assert.match(onboarding, /"Herzlichen Glückwunsch! Dein Restaurant ist startklar\."/);
  assert.match(onboarding, /step === 6[\s\S]*className="wizard-screen onboarding-completion-screen"/);
  assert.match(styles, /\.onboarding-layout \{[\s\S]*margin-top: 20px/);
  assert.match(styles, /\.onboarding-completion-screen \{[\s\S]*padding-top: 18px/);
});
