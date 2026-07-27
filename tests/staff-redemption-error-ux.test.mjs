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

test("Netzwerkfehler vor und nach Consume werden unterschiedlich behandelt", () => {
  assert.ok(errorMap.includes('phase === "consume" ? "consume_unknown" : "preview_network_error"'));
  assert.ok(errorMap.includes("Einlösung konnte nicht eindeutig bestätigt werden"));
  assert.ok(staffPortal.includes('redemptionErrorKind === "preview_network_error" || redemptionErrorKind === "consume_unknown"'));
  assert.ok(staffPortal.includes("void runRedemptionPreview()"));
  assert.equal(staffPortal.split("consumeRedemptionCode(restaurantId, redemptionCode)").length - 1, 1);
  assert.equal(staffPortal.includes("setTimeout(() => consumeRedemptionCode"), false);
});

test("Fehlerkarten geben keine technischen Details aus und steuern den Fokus", () => {
  assert.ok(staffPortal.includes("staffRedemptionErrorContent[redemptionErrorKind].title"));
  assert.ok(staffPortal.includes("redemptionErrorHeadingRef.current?.focus()"));
  assert.ok(staffPortal.includes("redemptionInputRefs.current[0]?.focus()"));
  assert.ok(staffPortal.includes('event.key !== "Escape"'));
  assert.doesNotMatch(staffPortal, /staffRedemptionErrorContent\[redemptionErrorKind\]\.(?:code|details|hint|message)/);
});

test("Premium-Fehlerzustände bleiben responsiv und berührungsfreundlich", () => {
  assert.ok(styles.includes(".staff-redemption-error"));
  assert.ok(styles.includes("min-height: 52px"));
  assert.ok(styles.includes("max-width: 620px"));
  assert.ok(styles.includes("grid-template-columns: repeat(6, minmax(0, 1fr))"));
});
