import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const onboarding = await readFile(
  new URL("../src/modules/admin/pages/RestaurantOnboarding.tsx", import.meta.url),
  "utf8",
);

test("Onboarding besitzt genau sieben kontextbezogene Hilfen", () => {
  const helpBlock = onboarding.slice(
    onboarding.indexOf("const stepHelp = ["),
    onboarding.indexOf("] as const;", onboarding.indexOf("const stepHelp = [")),
  );
  for (const key of ["configure", "importance", "attention"]) {
    assert.equal((helpBlock.match(new RegExp(`${key}:`, "g")) ?? []).length, 7, `${key} fehlt in einer Hilfe`);
  }
  assert.equal((helpBlock.match(/note:\s*"/g) ?? []).length, 7);
});

test("Hilfedialog verwendet immer den aktuell geöffneten Schritt", () => {
  assert.match(onboarding, /const currentStepHelp = stepHelp\[step\] \?\? stepHelp\[0\]/);
  assert.match(onboarding, /description=\{`Schritt \$\{step \+ 1\}: \$\{steps\[step\]\}`\}/);
  assert.match(onboarding, /currentStepHelp\.configure/);
  assert.match(onboarding, /currentStepHelp\.importance/);
  assert.match(onboarding, /currentStepHelp\.attention/);
  assert.match(onboarding, /currentStepHelp\.note/);
});

test("Hilfedialog bleibt auf drei kurze praktische Fragen begrenzt", () => {
  assert.match(onboarding, /Was richtest du ein\?/);
  assert.match(onboarding, /Warum ist das wichtig\?/);
  assert.match(onboarding, /Worauf solltest du achten\?/);
  assert.doesNotMatch(onboarding, /Wo wird sie später verwendet\?/);
  assert.doesNotMatch(onboarding, /Sichtbarkeit und Verwendung/);
});

test("alle sieben bestehenden Schritte behalten passende Hilfe", () => {
  for (const text of [
    "Mobiltelefonnummer wird bereits bei der Restaurantregistrierung",
    "Logo und Markenfarben",
    "Auf alle Tage übertragen",
    "3, 5, 8 oder 10 Prozent",
    "du musst keine Verteilung einstellen",
    "Gäste- und Mitarbeiter-QR",
    "Einstellungen → Setup & Einrichtung",
  ]) {
    assert.match(onboarding, new RegExp(text));
  }
});

test("Hilfe ist verständlich benannt und die allgemeine Erklärung wurde entfernt", () => {
  assert.match(onboarding, /title="Hilfe zu diesem Schritt"/);
  assert.match(onboarding, /installation-help-label">Hilfe</);
  assert.doesNotMatch(onboarding, /title="So funktioniert's"/);
  assert.doesNotMatch(onboarding, /Die wichtigsten Schritte deines Bonusprogramms/);
  assert.doesNotMatch(onboarding, /Deine Gäste sollen schnell verstehen, warum sie wiederkommen/);
});
