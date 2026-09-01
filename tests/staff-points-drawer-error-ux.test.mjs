import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const staffPortal = await readFile(new URL("../src/modules/staff/StaffTablet.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/modules/staff/staff-premium.css", import.meta.url), "utf8");
const globalStyles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

const executeStart = staffPortal.indexOf("async function executePinAction");
const executeEnd = staffPortal.indexOf("function requestPin", executeStart);
const executePinAction = staffPortal.slice(executeStart, executeEnd);
const drawerStart = staffPortal.indexOf("function renderPinActionFooter");
const drawerEnd = staffPortal.indexOf("\n  return (\n    <main", drawerStart);
const pointsDrawer = staffPortal.slice(drawerStart, drawerEnd);

test("PIN-Drawer besitzt seinen Fehlerzustand statt den Seitenstatus zu verwenden", () => {
  assert.match(staffPortal, /const \[pinActionFeedback, setPinActionFeedback\]/);
  assert.match(executePinAction, /setPinActionFeedback\(classifyPointsActionError/);
  assert.doesNotMatch(executePinAction, /setMessage\(/);
  assert.match(pointsDrawer, /staff-points-drawer-feedback/);
  assert.match(pointsDrawer, /role=\{pinActionFeedback\.kind === "success" \? "status" : "alert"\}/);
});

test("Tageslimit wird ruhig blockiert und nennt den betroffenen Gast", () => {
  assert.match(staffPortal, /normalized\.includes\("buchungslimit"\)/);
  assert.match(staffPortal, /kind: "blocked"/);
  assert.match(staffPortal, /Keine weitere Punktebuchung möglich/);
  assert.match(staffPortal, /Für \$\{customerName\} wurde das heutige Buchungslimit bereits erreicht\./);
  assert.match(pointsDrawer, /pinActionFeedback\?\.kind === "blocked"/);
  assert.match(pointsDrawer, /Anderen Gast wählen/);
  assert.match(pointsDrawer, />Schließen</);
});

test("blockierter Drawer bietet keine scheinbar ausführbare Bestätigung", () => {
  const blockedStart = pointsDrawer.indexOf('pinActionFeedback?.kind === "blocked"');
  const successStart = pointsDrawer.indexOf('pinActionFeedback?.kind === "success"', blockedStart);
  const blockedFooter = pointsDrawer.slice(blockedStart, successStart);
  assert.doesNotMatch(blockedFooter, /Bestätigen|staff-pin-confirmation/);
});

test("falscher Tages-PIN bleibt direkt am Feld und kann erneut eingegeben werden", () => {
  assert.match(staffPortal, /Der Tages-PIN ist nicht korrekt\./);
  assert.match(pointsDrawer, /aria-describedby=\{pinActionFeedback\?\.pinError/);
  assert.match(pointsDrawer, /aria-invalid=\{pinActionFeedback\?\.pinError/);
  assert.match(pointsDrawer, /staff-points-drawer-pin-error/);
  assert.match(pointsDrawer, /const errorId = inScannerDrawer \? "staff-scanner-pin-error" : "staff-pin-error"/);
  assert.match(pointsDrawer, /if \(pinActionFeedback\?\.pinError\) setPinActionFeedback\(null\)/);
});

test("unbekannte Serverfehler werden ohne technische Details sicher dargestellt", () => {
  assert.match(staffPortal, /Punkte konnten nicht gutgeschrieben werden/);
  assert.match(staffPortal, /Bitte prüfe die Verbindung und versuche es erneut\./);
  assert.doesNotMatch(pointsDrawer, /SQLSTATE|RPC|database|token/i);
});

test("Erfolg bleibt bis Fertig im Drawer und zeigt die echte Punktewirkung", () => {
  assert.match(executePinAction, /setPinActionFeedback\(\{ kind: "success", \.\.\.success \}\)/);
  assert.match(pointsDrawer, /Basis/);
  assert.match(pointsDrawer, /× Bonus/);
  assert.match(pointsDrawer, /Gutgeschrieben/);
  assert.match(pointsDrawer, />Fertig</);
  assert.match(staffPortal, /Punkte wurden \$\{pointsPreview\.customer_label\} gutgeschrieben/);
});

test("Drawer hält Gast, Punktestand, Bonus und geplante Punkte sichtbar", () => {
  assert.match(pointsDrawer, /pendingPinAction\.customerName/);
  assert.match(pointsDrawer, /pendingPinAction\.currentPoints/);
  assert.match(pointsDrawer, /pendingPinAction\.boostMultiplier/);
  assert.match(pointsDrawer, /pendingPinAction\.boostExpiresAt/);
  assert.match(pointsDrawer, /pendingPinAction\.intendedPoints/);
});

test("Gastwechsel entfernt Drawer- und Transaktionszustand vollständig", () => {
  const clearStart = staffPortal.indexOf("function resetSelectedCustomerState");
  const clearEnd = staffPortal.indexOf("function formatBoostExpiry", clearStart);
  const clearSelection = staffPortal.slice(clearStart, clearEnd);
  assert.match(clearSelection, /setPendingPinAction\(null\)/);
  assert.match(clearSelection, /setPinActionFeedback\(null\)/);
  assert.match(clearSelection, /setPinDraft\(""\)/);
  assert.match(clearSelection, /setPointsQrReference\(null\)/);
  assert.match(clearSelection, /setPointsPreview\(null\)/);
});

for (const width of [320, 375, 390, 414, 430, 768, 1024]) {
  test(`${width}px: Drawer-Inhalte umbrechen ohne feste Breite oder horizontalen Überlauf`, () => {
    assert.match(styles, /\.staff-points-drawer\s*\{[\s\S]*min-width: 0/);
    assert.match(styles, /\.staff-points-drawer-customer h3\s*\{[\s\S]*overflow-wrap: anywhere/);
    assert.match(styles, /\.staff-points-drawer-feedback p\s*\{[\s\S]*overflow-wrap: anywhere/);
    assert.match(globalStyles, /@media \(max-width: 767px\)[\s\S]*\.app-drawer-footer[\s\S]*grid-template-columns: 1fr/);
  });
}
