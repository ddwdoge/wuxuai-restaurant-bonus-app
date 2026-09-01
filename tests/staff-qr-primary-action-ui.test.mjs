import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const staffPortal = readFileSync("src/modules/staff/StaffTablet.tsx", "utf8");
const styles = readFileSync("src/modules/staff/staff-premium.css", "utf8");

const homeStart = staffPortal.indexOf('{view === "home" ?');
const homeEnd = staffPortal.indexOf('{view !== "home" ?', homeStart);
const home = staffPortal.slice(homeStart, homeEnd);
const scannerStart = staffPortal.indexOf("async function startQrScanner");
const scannerEnd = staffPortal.indexOf("function closeScanner", scannerStart);
const scanner = staffPortal.slice(scannerStart, scannerEnd);
const cameraStart = staffPortal.indexOf("async function activateQrScannerCamera");
const cameraEnd = staffPortal.indexOf("async function startQrScanner", cameraStart);
const camera = staffPortal.slice(cameraStart, cameraEnd);

test("Kunden-QR ist die erste Hauptaktion vor Tages-PIN KPIs und Gast-Suche", () => {
  const qrIndex = home.indexOf('id="staff-scan-title"');
  const pinIndex = home.indexOf('className="staff-premium-pin-card"');
  const activityIndex = home.indexOf('id="staff-activity-title"');
  const quickIndex = home.indexOf('id="staff-quick-title"');
  assert.ok(qrIndex > -1);
  assert.ok(qrIndex < pinIndex);
  assert.ok(pinIndex < activityIndex);
  assert.ok(activityIndex < quickIndex);
});

test("Primary CTA verwendet ausschließlich den bestehenden Scanner-Handler", () => {
  assert.match(home, /className="staff-premium-scan-button"[\s\S]*onClick=\{\(\) => void startQrScanner\(\)\}/);
  assert.match(scanner, /activateQrScannerCamera\(\)/);
  assert.match(camera, /navigator\.mediaDevices\?\.getUserMedia/);
  assert.match(camera, /BrowserQRCodeReader/);
  assert.match(camera, /decodeFromConstraints/);
  assert.match(camera, /handleScannerValue\(rawValue\)/);
  assert.match(staffPortal, /previewRestaurantControlledPoints/);
  assert.match(staffPortal, /confirmRestaurantControlledPoints/);
});

test("Scannerstart ist gegen Mehrfachauslösung geschützt und zeigt Ladefeedback", () => {
  assert.match(scanner, /scannerLaunchPendingRef\.current \|\| scannerOpen/);
  assert.match(scanner, /scannerLaunchPendingRef\.current = true/);
  assert.match(home, /disabled=\{scannerStarting \|\| scannerOpen\}/);
  assert.match(home, /Scanner wird geöffnet …/);
});

test("Tages-PIN bleibt aus der bestehenden Quelle vierstellig und bis 23:59 sichtbar", () => {
  assert.match(staffPortal, /loadTodayRestaurantPin\(restaurantId\)/);
  assert.match(home, /Heutige Tages-PIN/);
  assert.match(home, /todayPin\.pin_code\.split\(""\)/);
  assert.match(home, /Gültig bis 23:59/);
  assert.match(styles, /\.staff-premium-pin-code[\s\S]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
});

test("PIN ist sekundär kompakt und QR bleibt visuell primär", () => {
  const pinCss = styles.slice(styles.indexOf(".staff-premium-pin-card {"), styles.indexOf(".staff-premium-pin-card:focus-visible"));
  const scanCss = styles.slice(styles.indexOf(".staff-premium-scan-hero {"), styles.indexOf(".staff-premium-scan-icon"));
  assert.match(pinCss, /background: #fff/);
  assert.match(pinCss, /min-height: 0/);
  assert.doesNotMatch(pinCss, /linear-gradient|#[01]{3,6}/);
  assert.match(scanCss, /linear-gradient/);
  assert.match(scanCss, /box-shadow/);
});

test("Heute-KPIs und Gast-Suche bleiben unverändert verfügbar", () => {
  assert.match(home, /Einlösungen heute/);
  assert.match(home, /Bonuspunkte heute/);
  assert.match(home, /openStaffView\("search"\)/);
  assert.match(home, /Gast suchen/);
  assert.match(staffPortal, /loadStaffDailyActivity\(restaurantId\)/);
});

test("Bottom Navigation bietet fünf direkte V1-Ziele", () => {
  assert.match(staffPortal, /aria-label="Mitarbeiter-Navigation"/);
  assert.match(staffPortal, />Start</);
  assert.match(staffPortal, /QR scannen/);
  assert.match(staffPortal, />Tages-PIN</);
  assert.match(staffPortal, /Gast suchen/);
  assert.match(staffPortal, />Mehr</);
  assert.match(styles, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
});

for (const width of [320, 375, 390, 414, 430, 768, 1024]) {
  test(`${width}px nutzt flexible Breiten ohne horizontalen Überlauf`, () => {
    assert.match(styles, /overflow-x: clip/);
    assert.match(styles, /width: min\(calc\(100% - 32px\), 980px\)/);
    assert.match(styles, /\.staff-premium-priority-grid[\s\S]*min-width: 0/);
    assert.match(styles, /\.staff-premium-scan-button[\s\S]*min-height: 52px/);
    assert.match(styles, /@media \(min-width: 700px\)[\s\S]*grid-template-columns: minmax\(0, 1\.35fr\) minmax\(300px, 0\.85fr\)/);
  });
}

test("QR-Aktion und PIN sind für Tastatur und Screenreader eindeutig", () => {
  assert.match(home, /aria-label="Kunden-QR-Code scannen und Punkte gutschreiben"/);
  assert.match(home, /aria-label="Details zur heutigen Tages-PIN öffnen"/);
  assert.match(styles, /button:focus-visible/);
  assert.match(styles, /min-height: 52px/);
});
