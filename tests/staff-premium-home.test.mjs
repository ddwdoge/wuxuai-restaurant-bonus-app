import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const staffPortal = readFileSync(new URL("../src/modules/staff/StaffTablet.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/modules/staff/staff-premium.css", import.meta.url), "utf8");

test("Mitarbeiter-Startseite verwendet vorhandene sichere Datenflüsse", () => {
  assert.match(staffPortal, /loadTodayRestaurantPin\(restaurantId\)/);
  assert.match(staffPortal, /loadStaffDailyActivity\(restaurantId\)/);
  assert.match(staffPortal, /consumeRedemptionCode\(restaurantId, redemptionCode\)/);
  assert.match(staffPortal, /applyStaffLoyaltyAction\(\{/);
  assert.doesNotMatch(staffPortal, /console\.(?:log|info|debug)\([^\n]*(?:todayPin|pinDraft|redemptionCode)/);
});

test("Premium-Startseite zeigt Tages-PIN, Hauptaktion und echte Tagesübersicht", () => {
  assert.match(staffPortal, /Heutige Tages-PIN/);
  assert.match(staffPortal, /Einlösecode prüfen/);
  assert.match(staffPortal, /Einlösungen heute/);
  assert.match(staffPortal, /Bonuspunkte heute/);
  assert.match(staffPortal, /Heute noch keine Aktivität/);
});

test("Mitarbeiter-Navigation bleibt auf vier klare Ziele begrenzt", () => {
  assert.match(staffPortal, /aria-label="Mitarbeiter-Navigation"/);
  assert.match(staffPortal, />Start</);
  assert.match(staffPortal, />Code prüfen</);
  assert.match(staffPortal, />Tages-PIN</);
  assert.match(staffPortal, />Mehr</);
  assert.match(staffPortal, /<AppDrawer/);
});

test("Premium-Styles schützen Mobile-Layout, Safe Area und Touchflächen", () => {
  assert.match(styles, /--staff-gold: #bf8f36/);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
  assert.match(styles, /min-height: 44px/);
  assert.match(styles, /overflow-x: clip/);
  assert.match(styles, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(min-width: 700px\)/);
  assert.match(styles, /@media \(min-width: 1024px\)/);
});
