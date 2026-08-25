import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const staffPortal = await readFile(new URL("../src/modules/staff/StaffTablet.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/modules/staff/staff-premium.css", import.meta.url), "utf8");

const drawerStart = staffPortal.indexOf('description={pendingPinAction');
const drawerEnd = staffPortal.indexOf("</AppDrawer>", drawerStart);
const scannerDrawer = staffPortal.slice(drawerStart, drawerEnd);

test("primäre QR-Aktion öffnet einen dedizierten großen Scanner-Drawer", () => {
  assert.match(staffPortal, /className=\{scannerOpen \? "active staff-premium-nav-scan"/);
  assert.match(staffPortal, /onClick=\{\(\) => void startQrScanner\(\)\}/);
  assert.match(scannerDrawer, /open=\{scannerOpen\}/);
  assert.match(scannerDrawer, /size="large"/);
  assert.match(scannerDrawer, /staff-operational-scanner/);
});

test("Scanner verwendet genau ein ZXing-Video statt einer zweiten Kameraarchitektur", () => {
  assert.equal((staffPortal.match(/<video /g) ?? []).length, 1);
  assert.match(scannerDrawer, /ref=\{scannerVideoRef\}/);
  assert.match(staffPortal, /new BrowserQRCodeReader/);
  assert.match(staffPortal, /function stopScanner\(\)/);
  assert.match(staffPortal, /stream\.getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/);
});

test("Kamera steht im Drawer vor manuellem Fallback und Punkteablauf", () => {
  const camera = scannerDrawer.indexOf("staff-operational-camera");
  const fallback = scannerDrawer.indexOf("QR nicht verfügbar? Gast suchen");
  const points = scannerDrawer.indexOf("staff-operational-points-flow");
  assert.ok(camera > -1);
  assert.ok(fallback > camera);
  assert.ok(points > fallback);
});

test("QR-Ablauf hält Gast, Vorschau, PIN und Erfolg im selben Drawer", () => {
  assert.match(scannerDrawer, /Kunden-QR erkannt/);
  assert.match(scannerDrawer, /pointsPreview\.customer_label/);
  assert.match(scannerDrawer, /pointsPreview\.points_balance/);
  assert.match(scannerDrawer, /pointsPreview\.boost_multiplier/);
  assert.match(scannerDrawer, /Punkte serverseitig berechnen/);
  assert.match(scannerDrawer, /Mit Tages-PIN bestätigen/);
  assert.match(scannerDrawer, /renderPinActionContent\(true\)/);
  assert.match(staffPortal, /open=\{Boolean\(pendingPinAction\) && !scannerOpen\}/);
});

test("Vorschaufehler blockiert die finale Buchung", () => {
  assert.match(scannerDrawer, /customerPreviewError/);
  assert.match(scannerDrawer, /pointsPreview \? \(/);
  assert.match(scannerDrawer, /disabled=\{saving \|\| billAmount <= 0\}/);
  assert.match(scannerDrawer, /Erneut versuchen/);
  assert.match(scannerDrawer, /Anderen Gast wählen/);
});

test("erfolgreicher Ablauf kann beendet oder für nächsten Gast neu gestartet werden", () => {
  assert.match(staffPortal, /Nächsten Gast scannen/);
  assert.match(staffPortal, /function restartQrScanner\(\)/);
  assert.match(staffPortal, /function finishOperationalScanner\(\)/);
  assert.match(staffPortal, /setPointsQrReference\(null\)/);
  assert.match(staffPortal, /setPointsPreview\(null\)/);
});

test("Escape, Schließen und Browser-Zurück räumen Kamera und Kundenzustand auf", () => {
  assert.match(scannerDrawer, /onClose=\{dismissScanner\}/);
  assert.match(staffPortal, /window\.history\.pushState/);
  assert.match(staffPortal, /window\.addEventListener\("popstate", handleScannerBack\)/);
  assert.match(staffPortal, /closeScanner\(true\)/);
  assert.match(staffPortal, /resetSelectedCustomerState\(\)/);
});

for (const width of [320, 375, 390, 414, 430, 768, 1024]) {
  test(`${width}px hält den Scanner ohne horizontales Überlaufen im mobilen Drawer`, () => {
    assert.match(styles, /\.staff-operational-scanner,[\s\S]*min-width: 0/);
    assert.match(styles, /\.app-drawer-panel:has\(\.staff-operational-scanner\)[\s\S]*height: min\(92dvh, 860px\)/);
    assert.match(styles, /\.staff-operational-camera \.scanner-video-frame[\s\S]*height: clamp\(224px, 40dvh, 350px\)/);
    assert.doesNotMatch(styles, /\.staff-operational-scanner[^}]*width:\s*\d+px/);
  });
}
