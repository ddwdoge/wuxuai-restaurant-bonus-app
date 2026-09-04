import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  formatPlatformMetric,
  getHealthPresentation,
  getOverallHealthPresentation,
  getReferralDurationPresentation,
  getRestaurantStatusLabel,
  getSetupLabel,
} from "../src/modules/platform/platformControlCenterView.mjs";

const page = readFileSync(new URL("../src/modules/platform/PlatformAdminPage.tsx", import.meta.url), "utf8");
const controlCenter = readFileSync(new URL("../src/modules/platform/PlatformRestaurantControlCenter.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("Control Center unterscheidet echte Null von nicht verfügbar", () => {
  assert.equal(formatPlatformMetric({ status: "available", value: 0 }), "0");
  assert.equal(formatPlatformMetric({ status: "available", value: 17 }), "17");
  assert.equal(formatPlatformMetric({ status: "unavailable", value: null }), "–");
  assert.equal(formatPlatformMetric(null), "–");
});

test("Systemzustände werden vollständig und deutsch abgebildet", () => {
  assert.deepEqual(getOverallHealthPresentation("healthy"), { label: "Alles in Ordnung", tone: "success" });
  assert.deepEqual(getOverallHealthPresentation("warning"), { label: "Hinweise vorhanden", tone: "warning" });
  assert.deepEqual(getOverallHealthPresentation("error"), { label: "Problem erkannt", tone: "danger" });
  assert.deepEqual(getOverallHealthPresentation("unknown"), { label: "Status teilweise unbekannt", tone: "neutral" });
  assert.equal(getHealthPresentation("unavailable").label, "Keine Telemetrie");
});

test("Referral-Dauer zeigt 14/7-Vertrag ohne alten 30/15-Standardtext", () => {
  assert.equal(getReferralDurationPresentation(7, "preset"), "7 Tage");
  assert.equal(getReferralDurationPresentation(14, "preset"), "14 Tage");
  assert.equal(getReferralDurationPresentation(28, "preset"), "28 Tage");
  assert.equal(getReferralDurationPresentation(30, "custom"), "Eigener Wert: 30 Tage");
  assert.match(controlCenter, /Einladender 100 %, Freund 50 %, maximal 2×/);
  assert.doesNotMatch(controlCenter, /30\/15/);
});

test("Restaurant- und Setupstatus bleiben verständlich", () => {
  assert.equal(getRestaurantStatusLabel("active"), "Aktiv");
  assert.equal(getRestaurantStatusLabel("draft"), "Inaktiv");
  assert.equal(getRestaurantStatusLabel("suspended"), "Gesperrt");
  assert.equal(getSetupLabel(true), "Setup vollständig");
  assert.equal(getSetupLabel(false), "Setup unvollständig");
});

test("bestehende Detailroute verwendet ausschließlich den Control-Center-Vertrag", () => {
  assert.match(page, /loadPlatformRestaurantControlCenter/);
  assert.doesNotMatch(page, /loadPlatformRestaurantDetail/);
  assert.match(page, /<RestaurantControlCenter/);
});

test("Lifecycle und Vertrag bleiben getrennt und bestätigte Vertragsaktionen laden Serverdaten neu", () => {
  assert.match(controlCenter, /<AppDrawer/);
  assert.match(controlCenter, /<PlatformOperationsPanel/);
  assert.match(controlCenter, /Restaurantbetrieb und Veröffentlichung werden getrennt/);
  assert.doesNotMatch(controlCenter, /Restaurantstatus ändern\?/);
  assert.doesNotMatch(controlCenter, /restaurantStatus:/);
  assert.match(controlCenter, /Abo aktivieren\?/);
  assert.match(controlCenter, /Abo pausieren\?/);
  assert.match(controlCenter, /Testphase verlängern\?/);
  assert.match(page, /await loadData\(selectedRestaurant\.id\)/);
  assert.match(page, /await loadDetail\(selectedRestaurant\.id\)/);
});

test("deferred V1-Verträge werden nicht als fertige Funktionen ausgegeben", () => {
  assert.match(controlCenter, /Manuelle Zahlung · Noch nicht verfügbar/);
  assert.doesNotMatch(controlCenter, /Zahlung manuell bestätigt/);
  assert.match(controlCenter, /V2 · noch nicht aktiviert/);
  assert.match(controlCenter, /Kassa-Aufsteller in V1 nicht aktiv/);
  assert.doesNotMatch(controlCenter, /6-stellig|sechsstell/);
});

test("monatliches Referral-Limit stammt aus dem Control-Center-Vertrag", () => {
  assert.match(controlCenter, /Einladungen pro Kunde \/ Monat/);
  assert.match(controlCenter, /referral\.monthly_invite_limit/);
  assert.match(controlCenter, /Keine Daten verfügbar/);
  assert.doesNotMatch(controlCenter, /monthly_invite_limit \?\? 5/);
});

test("alle operativen Systembereiche und sichere Portalhinweise sind vorhanden", () => {
  for (const label of ["Konto & Vertrag", "Abrechnung", "Freunde einladen & 2× Bonus", "Einlösungen", "Kundenregistrierung", "E-Mail", "Standort & Karte", "Mitarbeiter", "Cron \/ Automatisierungen", "Letzte Aktivitäten", "Technische Details", "Bonusnetzwerk"]) {
    assert.match(controlCenter, new RegExp(label));
  }
  assert.match(controlCenter, /keine Identitätsübernahme/i);
  assert.match(controlCenter, /Anmeldung erforderlich/);
  assert.match(controlCenter, /Interner Test-Tenant/);
});

test("responsive Control-Center-Layout besitzt mobile Einspaltenregeln", () => {
  assert.match(styles, /\.platform-control-columns[\s\S]*grid-template-columns: repeat\(2/);
  assert.match(styles, /@media \(max-width: 820px\)[\s\S]*\.platform-control-columns,[\s\S]*grid-template-columns: 1fr/);
  assert.match(styles, /@media \(max-width: 430px\)[\s\S]*\.platform-admin-shell[\s\S]*padding: 12px/);
});
