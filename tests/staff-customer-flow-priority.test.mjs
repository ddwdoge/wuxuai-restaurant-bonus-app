import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const staffPortal = await readFile(new URL("../src/modules/staff/StaffTablet.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/modules/staff/staff-premium.css", import.meta.url), "utf8");

const flowStart = staffPortal.indexOf('{view !== "home" ? <section className="staff-customer-flow">');
const statusStart = staffPortal.indexOf("staff-customer-flow-status", flowStart);
const contextStart = staffPortal.indexOf("staff-customer-context-card", statusStart);
const pointsStart = staffPortal.indexOf('{view === "earn" && !customerPreviewError ?', flowStart);
const searchStart = staffPortal.indexOf("staff-customer-search-card", pointsStart);
const flowEnd = staffPortal.indexOf("</section> : null}", searchStart);
const customerFlow = staffPortal.slice(flowStart, flowEnd);

test("aktiver Kundenflow folgt Status, Gast, Punkte und erst danach Suche", () => {
  assert.ok(flowStart > -1);
  assert.ok(statusStart > flowStart);
  assert.ok(contextStart > statusStart);
  assert.ok(pointsStart > contextStart);
  assert.ok(searchStart > pointsStart);
  assert.match(customerFlow, /Gast erkannt/);
  assert.match(customerFlow, /Kein Gast gewählt/);
  assert.match(customerFlow, /Bitte QR scannen oder Gast suchen\./);
});

test("aktive Rueckmeldungen stehen im Kundenflow und nicht unter den Drawern", () => {
  assert.match(customerFlow, /customerStatusMessage/);
  assert.match(customerFlow, /aria-live=\{customerStatusIsError \? "assertive" : "polite"\}/);
  assert.match(customerFlow, /role=\{customerStatusIsError \? "alert" : "status"\}/);
  assert.match(staffPortal, /view === "home" && message/);
});

test("QR und manuelle Suche verwenden dieselbe obere Kundenkarte", () => {
  assert.match(staffPortal, /function selectCustomer\(customerId: string, nextView: StaffView = "earn"\)/);
  assert.match(customerFlow, /pointsQrReference \?/);
  assert.match(customerFlow, /Kunden-QR erkannt/);
  assert.match(customerFlow, /recognizedCustomerName/);
  assert.match(customerFlow, /recognizedPointsBalance/);
});

test("QR-Vorschau zeigt einen expliziten Ladezustand vor der sicheren Kundenkarte", () => {
  assert.match(customerFlow, /Kundendaten werden geladen …/);
  assert.match(customerFlow, /sicheren serverseitigen Punkte-Vorschau/);
  assert.match(customerFlow, /Punkte für \$\{recognizedCustomerName\} vergeben/);
});

test("fehlgeschlagene Vorschau sperrt den Punktebereich und bietet Suche oder Retry", () => {
  assert.match(staffPortal, /setCustomerPreviewError\(nextError\)/);
  assert.match(customerFlow, /view === "earn" && !customerPreviewError/);
  assert.match(customerFlow, /Gast konnte nicht sicher geladen werden/);
  assert.match(customerFlow, /Erneut versuchen/);
  assert.ok(searchStart > pointsStart);
});

test("Gastwechsel löscht nur die aktuelle Auswahl und öffnet erneut die Suche", () => {
  const clearStart = staffPortal.indexOf("function clearSelectedCustomer");
  const clearEnd = staffPortal.indexOf("function formatBoostExpiry", clearStart);
  const clearSelection = staffPortal.slice(clearStart, clearEnd);
  assert.match(clearSelection, /setSelectedCustomerId\(""\)/);
  assert.match(clearSelection, /setPointsQrReference\(null\)/);
  assert.match(clearSelection, /setPointsPreview\(null\)/);
  assert.match(clearSelection, /setView\("search"\)/);
  assert.match(customerFlow, /Anderen Gast wählen/);
});

test("2x Status erscheint in der obersten Karte sobald die sichere Vorschau ihn liefert", () => {
  assert.match(customerFlow, /pointsPreview\?\.boost_multiplier/);
  assert.match(customerFlow, /× Bonus aktiv/);
  assert.match(customerFlow, /boostRemainingDays/);
  assert.match(customerFlow, /formatBoostExpiry/);
});

test("Punktebereich bleibt ohne Kundenkontext deaktiviert und Tages-PIN unverändert", () => {
  assert.match(staffPortal, /aria-disabled=\{!hasCustomerContext\}/);
  assert.match(staffPortal, /disabled=\{!selectedCustomer\}/g);
  assert.match(staffPortal, /Mit Tages-PIN bestätigen/);
  assert.match(staffPortal, /confirmRestaurantControlledPreview/);
  assert.match(staffPortal, /loadTodayRestaurantPin\(restaurantId\)/);
});

for (const width of [320, 375, 390, 414, 430, 768, 1024]) {
  test(`${width}px priorisiert Status, Kundenkarte und Punkte ohne horizontales Raster`, () => {
    const contextRuleStart = styles.indexOf(".staff-customer-context-card {");
    const contextRuleEnd = styles.indexOf("}", contextRuleStart);
    const contextRule = styles.slice(contextRuleStart, contextRuleEnd);
    assert.match(styles, /\.staff-customer-flow\s*\{[\s\S]*grid[\s\S]*min-width: 0/);
    assert.match(styles, /\.staff-customer-flow-status\s*\{[\s\S]*min-width: 0/);
    assert.match(styles, /\.staff-customer-flow-status strong\s*\{[\s\S]*overflow-wrap: anywhere/);
    assert.match(styles, /@media \(max-width: 430px\)[\s\S]*\.staff-customer-search-actions[\s\S]*grid-template-columns: 1fr/);
    assert.doesNotMatch(contextRule, /min-height/);
  });
}
