import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const staffPortal = readFileSync(new URL("../src/modules/staff/StaffTablet.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/modules/staff/staff-premium.css", import.meta.url), "utf8");

test("Mitarbeiter-Startseite verwendet vorhandene sichere Datenflüsse", () => {
  assert.match(staffPortal, /loadTodayRestaurantPin\(restaurantId\)/);
  assert.match(staffPortal, /loadStaffDailyActivity\(restaurantId\)/);
  assert.match(staffPortal, /applyStaffLoyaltyAction\(\{/);
  assert.doesNotMatch(staffPortal, /console\.(?:log|info|debug)\([^\n]*(?:todayPin|pinDraft)/);
});

test("Premium-Startseite zeigt Tages-PIN und echte Tagesübersicht ohne Codeprüfung", () => {
  assert.match(staffPortal, /Heutige Tages-PIN/);
  assert.match(staffPortal, /Einlösungen heute/);
  assert.match(staffPortal, /Bonuspunkte heute/);
  assert.match(staffPortal, /Heute noch keine Aktivität/);
  assert.doesNotMatch(staffPortal, /Einlösecode prüfen|Code prüfen|Sechsstelliger Einlösecode/);
});

test("Mitarbeiter-Navigation bleibt auf drei klare V1-Ziele begrenzt", () => {
  assert.match(staffPortal, /aria-label="Mitarbeiter-Navigation"/);
  assert.match(staffPortal, />Start</);
  assert.match(staffPortal, />Tages-PIN</);
  assert.match(staffPortal, />Mehr</);
  assert.match(staffPortal, /<AppDrawer/);
});

test("Premium-Styles schützen Mobile-Layout, Safe Area und Touchflächen", () => {
  assert.match(styles, /--staff-gold: #bf8f36/);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
  assert.match(styles, /min-height: 44px/);
  assert.match(styles, /overflow-x: clip/);
  assert.match(styles, /\.staff-premium-bottom-nav[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(min-width: 700px\)/);
  assert.match(styles, /@media \(min-width: 1024px\)/);
});

test("Historische Code-RPCs sind nicht mehr in der primären Staff-UX verdrahtet", () => {
  assert.doesNotMatch(staffPortal, /inspectRedemptionCode|consumeRedemptionCode|redemptionDigits|redemptionCode/);
  assert.doesNotMatch(staffPortal, /StaffView = [^\n]*redeem/);
});

test("Desktop-Staff-Workspace und Bottom-Navigation sind ohne Sidebar-Offset zentriert", () => {
  assert.match(styles, /width: min\(calc\(100% - 32px\), 980px\)/);
  assert.match(styles, /left: 50%/);
  assert.match(styles, /transform: translateX\(-50%\)/);
  assert.doesNotMatch(styles, /margin-left:\s*(?:var\(--admin|2[4-9][0-9]px|3[0-9]{2}px)/);
});

test("Staff-Portal speichert keine Einlösungscodes", () => {
  assert.doesNotMatch(staffPortal, /localStorage[^\n]*redemption|sessionStorage[^\n]*redemption/i);
});
