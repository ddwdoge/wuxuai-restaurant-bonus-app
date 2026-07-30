import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("gemeinsames Pflichtlabel ist sichtbar und für Screenreader benannt", () => {
  const source = read("../src/shared/components/FormLabel.tsx");
  assert.match(source, /required-field-marker/);
  assert.match(source, /Pflichtfeld/);
  assert.match(source, /Mit .* gekennzeichnete Felder sind Pflichtfelder/);
});

test("öffentliche Pflichtfelder leiten required und aria-required weiter", () => {
  const source = read("../src/modules/public/PublicPageComponents.tsx");
  assert.match(source, /required=\{Boolean\(inputProps\.required\)\}/);
  assert.match(source, /aria-required=\{inputProps\.required \? true : undefined\}/);
});

test("Kundenregistrierung kennzeichnet nur Pflichtangaben verpflichtend", () => {
  const source = read("../src/modules/customer/CustomerPortal.tsx");
  assert.match(source, /FormLabel htmlFor="guest-first-name" required/);
  assert.match(source, /FormLabel htmlFor="guest-birthday" optional/);
  assert.match(source, /CustomerPhoneField[\s\S]*required/);
  assert.match(source, /termsAccepted[\s\S]*required type="checkbox"/);
  assert.match(source, /privacyAcknowledged[\s\S]*required type="checkbox"/);
});

test("Öffnungszeiten verwenden Pflichtlabels nur an geöffneten Zeitblöcken", () => {
  const source = read("../src/shared/components/OpeningHoursEditor.tsx");
  assert.match(source, /FormLabel htmlFor=\{id\} required/);
  assert.match(source, /required type="time"/);
  assert.match(source, /value\.enabled \?/);
  assert.match(source, /Mittagspause hinzufügen/);
  assert.match(source, /Wir haben eine passende Mittagspause vorgeschlagen/);
  assert.match(source, /Die Öffnungszeit wurde geändert\. Bitte prüfe die Mittagspause\./);
  assert.match(source, /close: value\.secondClose \|\| value\.close/);
});
