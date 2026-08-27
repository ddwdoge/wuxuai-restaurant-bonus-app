import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(
  new URL("../src/modules/admin/pages/LoyaltyPage.tsx", import.meta.url),
  "utf8",
);
const service = readFileSync(
  new URL("../src/modules/loyalty/loyaltyService.ts", import.meta.url),
  "utf8",
);
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("Owner-Bonusprogramm zeigt nur die freigegebene Referral-Konfiguration", () => {
  assert.match(page, /<h1>Bonusprogramm<\/h1>/);
  assert.match(page, /Freunde einladen & 2× Bonus/);
  assert.match(page, /Freundschaftsbonus aktiv/);
  assert.match(page, /referralBonusDurationPresets\.map/);
  assert.match(page, /Eigener Wert/);
  assert.match(page, /referral-monthly-invite-limit/);
  assert.match(page, /saveReferralBonusSettings/);
});

test("Legacy-Modus und Regelverwaltung sind aus der Owner-Seite entfernt", () => {
  assert.doesNotMatch(page, />Modus</);
  assert.doesNotMatch(page, /Bonusmodus/);
  assert.doesNotMatch(page, /Euro pro Punkt/);
  assert.doesNotMatch(page, /Einlösequote/);
  assert.doesNotMatch(page, /Stempel bis Punkteeinlösung/);
  assert.doesNotMatch(page, /Regel speichern/);
  assert.doesNotMatch(page, /Regel hinzufügen/);
  assert.doesNotMatch(page, /Aktive Regeln/);
  assert.doesNotMatch(page, /Vorlagen für Bonstufen/);
  assert.doesNotMatch(page, /loyaltyModeLabels/);
  assert.doesNotMatch(page, /loadLoyaltyRules/);
  assert.doesNotMatch(page, /saveLoyaltyRule/);
  assert.doesNotMatch(page, /saveLoyaltySettings/);
  assert.doesNotMatch(page, /setLoyaltyRuleActive/);
});

test("Legacy-Backend bleibt für bestehende Punkteverträge erhalten", () => {
  assert.match(service, /export async function saveLoyaltySettings/);
  assert.match(service, /export async function loadLoyaltyRules/);
  assert.match(service, /export async function saveLoyaltyRule/);
  assert.match(service, /export async function setLoyaltyRuleActive/);
});

test("Referral-Inhalt folgt direkt auf den Seitenkopf und bleibt mobil einspaltig", () => {
  assert.match(page, /<\/header>\s*<section\s+className="card referral-bonus-settings"/);
  assert.doesNotMatch(page, /style=\{\{ marginTop:/);
  assert.match(styles, /\.referral-bonus-settings\s*\{[\s\S]*max-width:\s*920px/);
  assert.match(styles, /@media \(max-width: 699px\)[\s\S]*\.referral-bonus-fields\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(styles, /\.referral-bonus-settings \.button\s*\{[\s\S]*min-height:\s*48px[\s\S]*width:\s*100%/);
});
