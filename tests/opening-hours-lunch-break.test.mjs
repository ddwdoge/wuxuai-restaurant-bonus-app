import assert from "node:assert/strict";
import test from "node:test";
import {
  copyOpeningDayToDays,
  normalizeOpeningDay,
  openingDaysDiffer,
  partnerOpeningStatus,
  suggestLunchBreak,
  todayOpeningHours,
  validateOpeningDay,
} from "../src/shared/openingHours.mjs";

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

test("11:00 bis 22:00 schlägt die restauranttypische Pause 14:00 bis 17:00 vor", () => {
  assert.deepEqual(suggestLunchBreak("11:00", "22:00"), {
    firstBlockEnd: "14:00",
    breakStart: "14:00",
    breakEnd: "17:00",
    secondBlockStart: "17:00",
  });
});

test("10:00 bis 20:00 erzeugt einen mittigen sinnvollen Vorschlag", () => {
  assert.deepEqual(suggestLunchBreak("10:00", "20:00"), {
    firstBlockEnd: "14:00",
    breakStart: "14:00",
    breakEnd: "16:30",
    secondBlockStart: "16:30",
  });
});

test("11:30 bis 23:00 schlägt 14:30 bis 17:30 vor", () => {
  assert.deepEqual(suggestLunchBreak("11:30", "23:00"), {
    firstBlockEnd: "14:30",
    breakStart: "14:30",
    breakEnd: "17:30",
    secondBlockStart: "17:30",
  });
});

test("kurze Öffnungszeiten erzeugen keine automatische Pause", () => {
  assert.equal(suggestLunchBreak("11:00", "16:00"), null);
});

test("ein gültiger globaler Pausenstandard kann bevorzugt werden", () => {
  assert.deepEqual(suggestLunchBreak("09:00", "21:00", { start: "13:30", end: "16:00" }), {
    firstBlockEnd: "13:30",
    breakStart: "13:30",
    breakEnd: "16:00",
    secondBlockStart: "16:00",
  });
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
  assert.match(validateOpeningDay(day), /direkt nach dem ersten Öffnungsblock/);
});

test("zweiter Öffnungsblock vor Ende der Pause wird blockiert", () => {
  const day = normalizeOpeningDay({ enabled: true, open: "09:00", close: "12:00", lunchBreakEnabled: true, lunchBreakStart: "12:00", lunchBreakEnd: "14:00", secondOpen: "13:30", secondClose: "18:00" }, fallback);
  assert.match(validateOpeningDay(day), /direkt nach der Mittagspause/);
});

test("beide Öffnungsblöcke müssen mindestens 90 Minuten lang bleiben", () => {
  const day = normalizeOpeningDay({ enabled: true, open: "12:45", close: "14:00", lunchBreakEnabled: true, lunchBreakStart: "14:00", lunchBreakEnd: "17:00", secondOpen: "17:00", secondClose: "22:00" }, fallback);
  assert.match(validateOpeningDay(day), /mindestens 90 Minuten/);
});

test("gespeicherte manuelle Pausenwerte werden beim Reload unverändert normalisiert", () => {
  const stored = { enabled: true, open: "09:30", close: "13:30", lunchBreakEnabled: true, lunchBreakStart: "13:30", lunchBreakEnd: "16:15", secondOpen: "16:15", secondClose: "21:45" };
  assert.deepEqual(normalizeOpeningDay(stored, fallback), stored);
});

test("geschlossene Tage verlangen keine Zeiten", () => {
  const day = normalizeOpeningDay({ enabled: false, open: "", close: "", lunchBreakEnabled: true }, fallback);
  assert.equal(validateOpeningDay(day), null);
});

test("Montag wird mit der vollständigen Tageskonfiguration auf Dienstag bis Sonntag kopiert", () => {
  const monday = normalizeOpeningDay({
    enabled: true,
    open: "11:00",
    close: "14:00",
    lunchBreakEnabled: true,
    lunchBreakStart: "14:00",
    lunchBreakEnd: "17:00",
    secondOpen: "17:00",
    secondClose: "22:00",
  }, fallback);
  const hours = Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((key) => [
    key,
    key === "mon" ? monday : normalizeOpeningDay(null, fallback),
  ]));
  const copied = copyOpeningDayToDays(hours, "mon", ["tue", "wed", "thu", "fri", "sat", "sun"]);

  for (const day of ["tue", "wed", "thu", "fri", "sat", "sun"]) {
    assert.deepEqual(copied[day], monday);
    assert.notEqual(copied[day], copied.mon);
  }
});

test("ein geschlossener Montag schließt beim Kopieren alle Tage", () => {
  const closed = normalizeOpeningDay({ enabled: false, open: "", close: "" }, fallback);
  const open = normalizeOpeningDay({ enabled: true, open: "11:00", close: "22:00" }, fallback);
  const hours = { mon: closed, tue: open, wed: open, thu: open, fri: open, sat: open, sun: open };
  const copied = copyOpeningDayToDays(hours, "mon", ["tue", "wed", "thu", "fri", "sat", "sun"]);

  assert.equal(Object.values(copied).every((day) => day.enabled === false), true);
});

test("ein Tag bleibt nach dem Kopieren unabhängig bearbeitbar", () => {
  const open = normalizeOpeningDay({ enabled: true, open: "11:00", close: "22:00" }, fallback);
  const hours = { mon: open, tue: open, wed: open, thu: open, fri: open, sat: open, sun: open };
  const copied = copyOpeningDayToDays(hours, "mon", ["tue", "wed", "thu", "fri", "sat", "sun"]);
  const edited = { ...copied, sun: { ...copied.sun, enabled: false } };

  assert.equal(edited.sun.enabled, false);
  assert.equal(edited.sat.enabled, true);
  assert.equal(edited.mon.enabled, true);
});

test("abweichende Zielzeiten werden für die Überschreibbestätigung erkannt", () => {
  const monday = normalizeOpeningDay({ enabled: true, open: "11:00", close: "22:00" }, fallback);
  const sunday = normalizeOpeningDay({ enabled: false, open: "12:00", close: "21:00" }, fallback);
  assert.equal(openingDaysDiffer({ mon: monday, sun: sunday }, "mon", ["sun"]), true);
  assert.equal(openingDaysDiffer({ mon: monday, sun: { ...monday } }, "mon", ["sun"]), false);
});

test("Kundenhinweis zeigt beide Öffnungsblöcke", () => {
  const hours = { thu: { enabled: true, open: "09:00", close: "12:00", lunchBreakEnabled: true, lunchBreakStart: "12:00", lunchBreakEnd: "14:00", secondOpen: "14:00", secondClose: "18:00" } };
  assert.equal(todayOpeningHours(hours, new Date("2026-07-30T08:00:00Z")), "Heute 09:00–12:00 und 14:00–18:00 Uhr");
});

test("Kundenhinweis meldet die aktuelle Mittagspause in Europe/Vienna", () => {
  const hours = { thu: { enabled: true, open: "09:00", close: "12:00", lunchBreakEnabled: true, lunchBreakStart: "12:00", lunchBreakEnd: "14:00", secondOpen: "14:00", secondClose: "18:00" } };
  assert.equal(todayOpeningHours(hours, new Date("2026-07-30T11:00:00Z")), "Momentan Mittagspause – wieder geöffnet ab 14:00");
});

test("Finder unterscheidet geöffnet, Mittagspause und geschlossen in Europe/Vienna", () => {
  const hours = { thu: { enabled: true, open: "09:00", close: "12:00", lunchBreakEnabled: true, lunchBreakStart: "12:00", lunchBreakEnd: "14:00", secondOpen: "14:00", secondClose: "18:00" } };
  assert.deepEqual(partnerOpeningStatus(hours, new Date("2026-07-30T08:00:00Z")), {
    isOpen: true,
    state: "open",
    message: "Jetzt geöffnet · Schließt um 12:00",
    todayHours: "Heute 09:00–12:00 und 14:00–18:00 Uhr",
  });
  assert.equal(partnerOpeningStatus(hours, new Date("2026-07-30T11:00:00Z")).state, "lunch_break");
  assert.equal(partnerOpeningStatus(hours, new Date("2026-07-30T17:30:00Z")).state, "closed");
});

test("strukturierter Feiertag schließt das Lokal", () => {
  const hours = { thu: { enabled: true, open: "09:00", close: "18:00" } };
  const status = partnerOpeningStatus(hours, new Date("2026-07-30T08:00:00Z"), [], ["2026-07-30"]);
  assert.equal(status.isOpen, false);
  assert.equal(status.message, "Heute geschlossen");
});
