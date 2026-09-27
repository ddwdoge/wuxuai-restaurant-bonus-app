import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const onboarding = readFileSync(new URL("../src/modules/admin/pages/RestaurantOnboarding.tsx", import.meta.url), "utf8");
const legalSettings = readFileSync(new URL("../src/modules/legal/OwnerLegalSettingsPage.tsx", import.meta.url), "utf8");
const verification = readFileSync(new URL("../src/modules/verification/OwnerBusinessVerificationPage.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/modules/verification/owner-business-verification.css", import.meta.url), "utf8");

test("bedingt erforderliche Firmenbuchnummer ist sichtbar als Pflichtfeld markiert", () => {
  assert.match(onboarding, /FormLabel[^>]+optional=\{!commercialRegisterRequired\}[^>]+required=\{commercialRegisterRequired\}/);
  assert.match(onboarding, /aria-required=\{commercialRegisterRequired\}[\s\S]*required=\{commercialRegisterRequired\}/);
  assert.match(legalSettings, /commercialRegisterRequired = profile\.country === "AT"/);
  assert.match(legalSettings, /required=\{key === "commercial_register_number" && commercialRegisterRequired\}/);
});

test("KYB zeigt gespeicherte Angaben und führt Korrekturen gezielt zum Stammdatenfeld", () => {
  for (const target of [
    "legal-profile-country",
    "legal-profile-company_name",
    "legal-profile-street",
    "legal-profile-gisa-number",
    "legal-profile-responsible-person-kyb",
    "legal-profile-commercial_register_number",
  ]) assert.match(verification, new RegExp(target));
  assert.match(verification, /state=\{\{ editTarget: "legal-profile-gisa-number" \}\}/);
  assert.match(legalSettings, /routeEditTarget\.startsWith\("legal-profile-"\)/);
  assert.match(legalSettings, /scrollIntoView/);
  assert.match(legalSettings, /field\.focus/);
  assert.doesNotMatch(verification, /id="business-register-type"/);
});

test("Upload verlangt nur die technische Auswahl und Datei ohne neue KYB-Rechtsregel", () => {
  assert.match(verification, /FormLabel htmlFor="kyb-document-type" required/);
  assert.match(verification, /FormLabel htmlFor="kyb-document-file" required/);
  assert.match(verification, /Legally required evidence and retention periods will be decided separately/);
  assert.doesNotMatch(verification, /Company proof, business authorization and representation proof are required/);
});

test("Zusammenfassung bleibt mobil ohne Seitenüberlauf bedienbar", () => {
  assert.match(styles, /\.kyb-summary-row[^}]*min-width: 0/);
  assert.match(styles, /\.kyb-summary-row p[^}]*overflow-wrap: anywhere/);
  assert.match(styles, /\.kyb-summary-row a[^}]*min-height: 44px/);
  assert.match(styles, /\.owner-business-verification-page \.button[^}]*min-height: 44px/);
  assert.match(styles, /@media \(max-width: 560px\)[\s\S]*\.kyb-summary-row[^}]*flex-direction: column/);
});
