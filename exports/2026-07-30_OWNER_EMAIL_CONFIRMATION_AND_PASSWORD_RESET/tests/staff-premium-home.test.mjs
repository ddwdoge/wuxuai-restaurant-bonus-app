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

test("Einlösecode wird als sechsstellige Premium-Eingabe geführt", () => {
  assert.match(staffPortal, /Array\(6\)\.fill\(""\)/);
  assert.match(staffPortal, /Ziffer \$\{index \+ 1\} des Einlösecodes/);
  assert.match(staffPortal, /inputMode="numeric"/);
  assert.match(staffPortal, /autoFocus=\{index === 0\}/);
  assert.match(staffPortal, /handleRedemptionKeyDown/);
  assert.match(staffPortal, /handleRedemptionPaste/);
  assert.match(styles, /grid-template-columns: repeat\(6, minmax\(0, 1fr\)\)/);
});

test("Code wird serverseitig geprüft, bevor der atomare Verbrauch möglich ist", () => {
  const previewIndex = staffPortal.indexOf("inspectRedemptionCode(restaurantId, redemptionCode)");
  const consumeIndex = staffPortal.indexOf("consumeRedemptionCode(restaurantId, redemptionCode)");
  assert.ok(previewIndex > -1 && consumeIndex > previewIndex);
  assert.match(staffPortal, /setRedemptionStep\("preview"\)/);
  assert.match(staffPortal, /Erst die folgende Bestätigung verbraucht den Code/);
  assert.match(staffPortal, /Code gültig/);
  assert.match(staffPortal, /redemptionPreview\.title/);
  assert.match(staffPortal, /redemptionPreview\.expires_at/);
  assert.match(staffPortal, /disabled=\{checkingRedemptionCode\}/);
  assert.match(staffPortal, /Einlösung wird bestätigt …/);
});

test("Zurück aus der Vorschau verbraucht den Code nicht", () => {
  assert.match(staffPortal, /setRedemptionPreview\(null\); setRedemptionStep\("entry"\)/);
  assert.equal((staffPortal.match(/consumeRedemptionCode\(restaurantId, redemptionCode\)/g) ?? []).length, 1);
});

test("Desktop-Staff-Workspace und Bottom-Navigation sind ohne Sidebar-Offset zentriert", () => {
  assert.match(styles, /width: min\(calc\(100% - 32px\), 980px\)/);
  assert.match(styles, /left: 50%/);
  assert.match(styles, /transform: translateX\(-50%\)/);
  assert.doesNotMatch(styles, /margin-left:\s*(?:var\(--admin|2[4-9][0-9]px|3[0-9]{2}px)/);
});

test("Vollständiger Einlösecode wird weder protokolliert noch gespeichert", () => {
  assert.doesNotMatch(staffPortal, /localStorage[^\n]*redemption/i);
  assert.doesNotMatch(staffPortal, /sessionStorage[^\n]*redemption/i);
  assert.doesNotMatch(staffPortal, /console\.(?:log|info|debug)\([^\n]*redemptionCode/);
});
