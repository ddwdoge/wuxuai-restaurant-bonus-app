import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const staffPortal = await readFile(new URL("../src/modules/staff/StaffTablet.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/modules/staff/staff-premium.css", import.meta.url), "utf8");

const flowStart = staffPortal.indexOf('{view !== "home" ? <section className="staff-customer-flow">');
const pointsStart = staffPortal.indexOf('{view === "earn" ?', flowStart);
const customerFlow = staffPortal.slice(flowStart, pointsStart);

test("erkannter oder leerer Gast steht vor Suche und Punkteformular", () => {
  const contextCard = customerFlow.indexOf("staff-customer-context-card");
  const searchCard = customerFlow.indexOf("staff-customer-search-card");
  assert.ok(contextCard > -1);
  assert.ok(contextCard < searchCard);
  assert.ok(searchCard < pointsStart);
  assert.match(customerFlow, /Gast erkannt/);
  assert.match(customerFlow, /Kein Gast gewählt/);
  assert.match(customerFlow, /Bitte QR scannen oder Gast suchen\./);
});

test("QR und manuelle Suche verwenden dieselbe obere Kundenkarte", () => {
  assert.match(staffPortal, /function selectCustomer\(customerId: string, nextView: StaffView = "earn"\)/);
  assert.match(customerFlow, /pointsQrReference \?/);
  assert.match(customerFlow, /Kunden-QR erkannt/);
  assert.match(customerFlow, /recognizedCustomerName/);
  assert.match(customerFlow, /recognizedPointsBalance/);
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

for (const width of [375, 390, 414, 430]) {
  test(`${width}px priorisiert die Kundenkarte ohne horizontales Raster`, () => {
    const contextRuleStart = styles.indexOf(".staff-customer-context-card {");
    const contextRuleEnd = styles.indexOf("}", contextRuleStart);
    const contextRule = styles.slice(contextRuleStart, contextRuleEnd);
    assert.match(styles, /\.staff-customer-flow\s*\{[\s\S]*grid[\s\S]*min-width: 0/);
    assert.match(styles, /@media \(max-width: 430px\)[\s\S]*\.staff-customer-search-actions[\s\S]*grid-template-columns: 1fr/);
    assert.doesNotMatch(contextRule, /min-height/);
  });
}
