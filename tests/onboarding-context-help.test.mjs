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
  assert.equal((helpBlock.match(/sentences:\s*\[/g) ?? []).length, 7);
  assert.equal((helpBlock.match(/note:\s*"/g) ?? []).length, 7);
});

test("Hilfedialog verwendet immer den aktuell geöffneten Schritt", () => {
  assert.match(onboarding, /const currentStepHelp = stepHelp\[step\] \?\? stepHelp\[0\]/);
  assert.match(onboarding, /description=\{`Schritt \$\{step \+ 1\}: \$\{steps\[step\]\}`\}/);
  assert.match(onboarding, /currentStepHelp\.sentences\.map/);
  assert.match(onboarding, /currentStepHelp\.note/);
});

test("Hilfe ist verständlich benannt und die allgemeine Erklärung wurde entfernt", () => {
  assert.match(onboarding, /title="Hilfe zu diesem Schritt"/);
  assert.match(onboarding, /installation-help-label">Hilfe</);
  assert.doesNotMatch(onboarding, /title="So funktioniert's"/);
  assert.doesNotMatch(onboarding, /Die wichtigsten Schritte deines Bonusprogramms/);
  assert.doesNotMatch(onboarding, /Deine Gäste sollen schnell verstehen, warum sie wiederkommen/);
});
