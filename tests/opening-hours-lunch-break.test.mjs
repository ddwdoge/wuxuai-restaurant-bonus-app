import assert from "node:assert/strict";
import test from "node:test";
import { normalizeOpeningDay, todayOpeningHours, validateOpeningDay } from "../src/shared/openingHours.mjs";

const fallback = { enabled: false, open: "11:00", close: "22:00" };

test("neue Standardtage behalten den aktivierten Fallback", () => {
  const day = normalizeOpeningDay(null, { enabled: true, open: "11:00", close: "22:00" });
  assert.equal(day.enabled, true);
  assert.equal(day.open, "11:00");
  assert.equal(day.close, "22:00");
});

test("bestehende Öffnungszeiten ohne Pause bleiben kompatibel", () => {
  const day = normalizeOpeningDay({ enabled: true, open: "09:00", close: "18:00" }, fallback);
  assert.equal(day.lunchBreakEnabled, false);
  assert.equal(validateOpeningDay(day), null);
});

test("maximal zwei gültige Öffnungsblöcke mit Mittagspause werden akzeptiert", () => {
  const day = normalizeOpeningDay({
    enabled: true,
    open: "09:00",
    close: "12:00",
    lunchBreakEnabled: true,
    lunchBreakStart: "12:00",
    lunchBreakEnd: "14:00",
    secondOpen: "14:00",
    secondClose: "18:00",
  }, fallback);
  assert.equal(validateOpeningDay(day), null);
});

test("überlappende Pause und erster Öffnungsblock werden blockiert", () => {
  const day = normalizeOpeningDay({ enabled: true, open: "09:00", close: "13:00", lunchBreakEnabled: true, lunchBreakStart: "12:00", lunchBreakEnd: "14:00", secondOpen: "14:00", secondClose: "18:00" }, fallback);
  assert.match(validateOpeningDay(day), /nicht überlappen/);
});

test("zweiter Öffnungsblock vor Ende der Pause wird blockiert", () => {
  const day = normalizeOpeningDay({ enabled: true, open: "09:00", close: "12:00", lunchBreakEnabled: true, lunchBreakStart: "12:00", lunchBreakEnd: "14:00", secondOpen: "13:30", secondClose: "18:00" }, fallback);
  assert.match(validateOpeningDay(day), /nach der Mittagspause/);
});

test("geschlossene Tage verlangen keine Zeiten", () => {
  const day = normalizeOpeningDay({ enabled: false, open: "", close: "", lunchBreakEnabled: true }, fallback);
  assert.equal(validateOpeningDay(day), null);
});

test("Kundenhinweis zeigt beide Öffnungsblöcke", () => {
  const hours = { thu: { enabled: true, open: "09:00", close: "12:00", lunchBreakEnabled: true, lunchBreakStart: "12:00", lunchBreakEnd: "14:00", secondOpen: "14:00", secondClose: "18:00" } };
  assert.equal(todayOpeningHours(hours, new Date("2026-07-30T08:00:00Z")), "Heute 09:00–12:00 und 14:00–18:00 Uhr");
});

test("Kundenhinweis meldet die aktuelle Mittagspause in Europe/Vienna", () => {
  const hours = { thu: { enabled: true, open: "09:00", close: "12:00", lunchBreakEnabled: true, lunchBreakStart: "12:00", lunchBreakEnd: "14:00", secondOpen: "14:00", secondClose: "18:00" } };
  assert.equal(todayOpeningHours(hours, new Date("2026-07-30T11:00:00Z")), "Momentan Mittagspause – wieder geöffnet ab 14:00");
});
