export const openingDayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function parseTime(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function formatTime(value) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function roundedToHalfHour(value) {
  return Math.round(value / 30) * 30;
}

export function suggestLunchBreak(openingStart, openingEnd, standardBreak = null) {
  const start = parseTime(openingStart);
  const end = parseTime(openingEnd);
  if (start === null || end === null || end - start < 8 * 60) return null;

  const standardStart = standardBreak ? parseTime(standardBreak.start) : null;
  const standardEnd = standardBreak ? parseTime(standardBreak.end) : null;
  if (
    standardStart !== null
    && standardEnd !== null
    && standardStart - start >= 90
    && standardEnd > standardStart
    && end - standardEnd >= 90
  ) {
    return {
      firstBlockEnd: formatTime(standardStart),
      breakStart: formatTime(standardStart),
      breakEnd: formatTime(standardEnd),
      secondBlockStart: formatTime(standardEnd),
    };
  }

  const duration = end - start;
  const breakDuration = duration >= 11 * 60 ? 180 : duration >= 10 * 60 ? 150 : 120;
  const restaurantTypicalStart = start >= 10 * 60 + 30 && start <= 12 * 60 && duration >= 10 * 60;
  const proposedStart = restaurantTypicalStart
    ? start + 180
    : roundedToHalfHour(start + (duration - breakDuration) / 2);
  const proposedEnd = proposedStart + breakDuration;

  if (proposedStart - start < 90 || end - proposedEnd < 90) return null;

  return {
    firstBlockEnd: formatTime(proposedStart),
    breakStart: formatTime(proposedStart),
    breakEnd: formatTime(proposedEnd),
    secondBlockStart: formatTime(proposedEnd),
  };
}

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
  const firstOpen = parseTime(day.open);
  const firstClose = parseTime(day.close);
  if (firstOpen === null || firstClose === null) return "Bitte gib gültige Uhrzeiten ein.";
  if (firstOpen >= firstClose) return "Die erste Öffnungszeit muss vor ihrem Ende liegen.";
  if (!day.lunchBreakEnabled) return null;
  if (!day.lunchBreakStart || !day.lunchBreakEnd || !day.secondOpen || !day.secondClose) {
    return "Bitte fülle alle Pflichtzeiten für die Mittagspause aus.";
  }
  const breakStart = parseTime(day.lunchBreakStart);
  const breakEnd = parseTime(day.lunchBreakEnd);
  const secondOpen = parseTime(day.secondOpen);
  const secondClose = parseTime(day.secondClose);
  if ([breakStart, breakEnd, secondOpen, secondClose].some((value) => value === null)) return "Bitte gib gültige Uhrzeiten ein.";
  if (day.close !== day.lunchBreakStart) return "Die Mittagspause muss direkt nach dem ersten Öffnungsblock beginnen.";
  if (breakStart >= breakEnd) return "Das Ende der Mittagspause muss nach ihrem Beginn liegen.";
  if (day.lunchBreakEnd !== day.secondOpen) return "Der zweite Öffnungsblock muss direkt nach der Mittagspause beginnen.";
  if (secondOpen >= secondClose) return "Die zweite Öffnungszeit muss vor ihrem Ende liegen.";
  if (firstClose - firstOpen < 90 || secondClose - secondOpen < 90) return "Vor und nach der Mittagspause müssen mindestens 90 Minuten Öffnungszeit bleiben.";
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
