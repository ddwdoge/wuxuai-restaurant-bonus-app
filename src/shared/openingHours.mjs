export const openingDayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function normalizeOpeningDay(value, fallback) {
  const input = value && typeof value === "object" ? value : {};
  return {
    ...fallback,
    ...input,
    enabled: typeof input.enabled === "boolean" ? input.enabled : Boolean(fallback.enabled),
    lunchBreakEnabled: Boolean(input.lunchBreakEnabled),
    lunchBreakStart: typeof input.lunchBreakStart === "string" ? input.lunchBreakStart : "14:00",
    lunchBreakEnd: typeof input.lunchBreakEnd === "string" ? input.lunchBreakEnd : "17:00",
    secondOpen: typeof input.secondOpen === "string" ? input.secondOpen : "17:00",
    secondClose: typeof input.secondClose === "string" ? input.secondClose : fallback.close,
  };
}

export function validateOpeningDay(day) {
  if (!day.enabled) return null;
  if (!day.open || !day.close) return "Bitte fülle beide Pflichtzeiten aus.";
  if (day.open >= day.close) return "Die erste Öffnungszeit muss vor ihrem Ende liegen.";
  if (!day.lunchBreakEnabled) return null;
  if (!day.lunchBreakStart || !day.lunchBreakEnd || !day.secondOpen || !day.secondClose) {
    return "Bitte fülle alle Pflichtzeiten für die Mittagspause aus.";
  }
  if (day.close > day.lunchBreakStart) return "Die Mittagspause darf den ersten Öffnungsblock nicht überlappen.";
  if (day.lunchBreakStart >= day.lunchBreakEnd) return "Das Ende der Mittagspause muss nach ihrem Beginn liegen.";
  if (day.lunchBreakEnd > day.secondOpen) return "Der zweite Öffnungsblock muss nach der Mittagspause beginnen.";
  if (day.secondOpen >= day.secondClose) return "Die zweite Öffnungszeit muss vor ihrem Ende liegen.";
  return null;
}

function viennaNowParts(date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Vienna",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekdayMap = { Sun: "sun", Mon: "mon", Tue: "tue", Wed: "wed", Thu: "thu", Fri: "fri", Sat: "sat" };
  return { dayKey: weekdayMap[values.weekday], time: `${values.hour}:${values.minute}` };
}

export function todayOpeningHours(value, date = new Date()) {
  if (!value || typeof value !== "object") return null;
  const { dayKey, time } = viennaNowParts(date);
  const day = value[dayKey];
  if (!day?.enabled) return "Heute geschlossen";
  if (!day.open || !day.close) return null;

  if (day.lunchBreakEnabled && day.secondOpen && day.secondClose) {
    if (day.lunchBreakStart && day.lunchBreakEnd && time >= day.lunchBreakStart && time < day.lunchBreakEnd) {
      return `Momentan Mittagspause – wieder geöffnet ab ${day.secondOpen}`;
    }
    return `Heute ${day.open}–${day.close} und ${day.secondOpen}–${day.secondClose} Uhr`;
  }

  return `Heute ${day.open}–${day.close} Uhr`;
}
