import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const staffPortal = readFileSync(new URL("../src/modules/staff/StaffTablet.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/modules/staff/staff-premium.css", import.meta.url), "utf8");
const navStart = staffPortal.indexOf('<nav aria-label="Mitarbeiter-Navigation"');
const navEnd = staffPortal.indexOf("</nav>", navStart);
const nav = staffPortal.slice(navStart, navEnd);

test("Bottom Navigation enthält genau die fünf V1-Schnellzugriffe", () => {
  assert.equal((nav.match(/<button/g) ?? []).length, 5);
  for (const label of ["Start", "QR scannen", "Tages-PIN", "Gast suchen", "Mehr"]) {
    assert.match(nav, new RegExp(label));
  }
  assert.doesNotMatch(nav, /Code prüfen|Einlösecode/);
});

test("Schnellzugriffe verwenden bestehende Staff-Funktionen", () => {
  assert.match(nav, /openStaffView\("home"\)/);
  assert.match(nav, /startQrScanner\(\)/);
  assert.match(nav, /setPinDetailOpen\(true\)/);
  assert.match(nav, /openStaffView\("search"\)/);
  assert.match(nav, /setMoreOpen\(true\)/);
});

test("Aktive Zustände und Scanner-Rückkehr sind eindeutig", () => {
  assert.match(nav, /aria-current=/);
  assert.match(nav, /className=\{scannerOpen \? "active staff-premium-nav-scan"/);
  assert.match(staffPortal, /scannerReturnViewRef\.current = view/);
  assert.match(staffPortal, /openStaffView\(scannerReturnViewRef\.current\)/);
  assert.match(staffPortal, /onClose=\{dismissScanner\}/);
});

test("Fünf gleich breite Touchziele passen ohne horizontalen Nav-Scroll", () => {
  assert.match(styles, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(styles, /min-height: 54px/);
  assert.match(styles, /min-width: 0/);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
  assert.doesNotMatch(styles, /\.staff-premium-bottom-nav[\s\S]{0,400}overflow-x:\s*(?:auto|scroll)/);
});

for (const width of [320, 360, 375, 390, 393, 414, 430, 768, 1024]) {
  test(`${width}px behält alle Schnellzugriffe in einer Zeile`, () => {
    assert.match(styles, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
    assert.match(styles, /@media \(max-width: 390px\)[\s\S]*staff-premium-nav-label-short/);
    assert.match(styles, /width: min\(520px, calc\(100vw - 40px\)\)/);
  });
}
