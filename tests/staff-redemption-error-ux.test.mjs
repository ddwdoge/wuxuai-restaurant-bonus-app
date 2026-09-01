import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const staffPortal = readFileSync(new URL("../src/modules/staff/StaffTablet.tsx", import.meta.url), "utf8");
const errorMap = readFileSync(new URL("../src/modules/staff/staffRedemptionError.ts", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/modules/staff/staff-premium.css", import.meta.url), "utf8");

test("fremder und unbekannter Code bleiben derselbe neutrale Zustand", () => {
  assert.ok(errorMap.includes('code === "P0001" && message === "einlösecode ist nicht gültig."'));
  assert.ok(errorMap.includes('title: "Code nicht gefunden"'));
  assert.doesNotMatch(errorMap, /gehört zu einem anderen Restaurant|falsches Restaurant/i);
  assert.doesNotMatch(staffPortal, /gehört zu einem anderen Restaurant|falsches Restaurant/i);
});

test("eindeutige Serverantworten erhalten eigene sichere Zustände", () => {
  assert.ok(errorMap.includes('message === "einlösecode wurde bereits verwendet."'));
  assert.ok(errorMap.includes('message === "einlösecode ist abgelaufen."'));
  assert.ok(errorMap.includes('return "unavailable"'));
  assert.ok(errorMap.includes('return "unauthorized"'));
  assert.ok(errorMap.includes("Diese Belohnung wurde bereits eingelöst"));
  assert.ok(errorMap.includes("Dieser Code ist abgelaufen"));
  assert.ok(errorMap.includes("Belohnung derzeit nicht verfügbar"));
  assert.ok(errorMap.includes("Keine Berechtigung"));
  assert.doesNotMatch(errorMap, /wurde vom Restaurant deaktiviert/);
});

test("Legacy-Netzwerkfehler bleiben klassifiziert ohne primäre Consume-UX", () => {
  assert.ok(errorMap.includes('phase === "consume" ? "consume_unknown" : "preview_network_error"'));
  assert.ok(errorMap.includes("Einlösung konnte nicht eindeutig bestätigt werden"));
  assert.equal(staffPortal.includes("runRedemptionPreview"), false);
  assert.equal(staffPortal.includes("consumeRedemptionCode"), false);
  assert.equal(staffPortal.includes("setTimeout(() => consumeRedemptionCode"), false);
});

test("Legacy-Fehlertexte geben keine technischen Details aus", () => {
  assert.match(errorMap, /title: "Code nicht gefunden"/);
  assert.match(errorMap, /title: "Etwas ist schiefgegangen"/);
  assert.doesNotMatch(errorMap, /stack|postgres|sqlstate|details:/i);
  assert.doesNotMatch(staffPortal, /staffRedemptionErrorContent|redemptionErrorHeadingRef|redemptionInputRefs/);
});

test("Premium-Fehlerzustände bleiben responsiv und berührungsfreundlich", () => {
  assert.ok(styles.includes(".staff-redemption-error"));
  assert.ok(styles.includes("min-height: 52px"));
  assert.ok(styles.includes("max-width: 620px"));
  assert.ok(styles.includes("grid-template-columns: repeat(6, minmax(0, 1fr))"));
});
