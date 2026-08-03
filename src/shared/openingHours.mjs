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
  const dateValue = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Vienna",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return { date: dateValue, dayKey: weekdayMap[values.weekday], time: `${values.hour}:${values.minute}` };
}

function dateMatches(entries, date) {
  return Array.isArray(entries) && entries.some((entry) => {
    if (typeof entry === "string") return entry.trim() === date;
    return entry && typeof entry === "object" && (entry.date === date || entry.day === date);
  });
}

function specialOpeningDay(entries, date) {
  if (!Array.isArray(entries)) return null;
  const entry = entries.find((candidate) => candidate && typeof candidate === "object" && (candidate.date === date || candidate.day === date));
  return entry?.opening_hours ?? entry?.hours ?? null;
}

export function partnerOpeningStatus(value, date = new Date(), specialDays = [], holidays = []) {
  const now = viennaNowParts(date);
  if (dateMatches(holidays, now.date)) {
    return { isOpen: false, state: "closed", message: "Heute geschlossen", todayHours: "Heute geschlossen" };
  }

  const override = specialOpeningDay(specialDays, now.date);
  const schedule = override && typeof override === "object" ? { [now.dayKey]: override } : value;
  if (!schedule || typeof schedule !== "object") {
    return { isOpen: false, state: "unknown", message: "Öffnungszeiten nicht verfügbar", todayHours: null };
  }

  const day = schedule[now.dayKey];
  if (!day?.enabled) return { isOpen: false, state: "closed", message: "Heute geschlossen", todayHours: "Heute geschlossen" };
  if (!day.open || !day.close) return { isOpen: false, state: "unknown", message: "Öffnungszeiten nicht verfügbar", todayHours: null };

  const twoBlocks = Boolean(day.lunchBreakEnabled && day.secondOpen && day.secondClose);
  const todayHours = twoBlocks
    ? `Heute ${day.open}–${day.close} und ${day.secondOpen}–${day.secondClose} Uhr`
    : `Heute ${day.open}–${day.close} Uhr`;

  if (now.time < day.open) {
    return { isOpen: false, state: "opens_later", message: `Öffnet um ${day.open}`, todayHours };
  }

  if (twoBlocks) {
    const breakStart = day.lunchBreakStart || day.close;
    const breakEnd = day.lunchBreakEnd || day.secondOpen;
    if (now.time >= day.open && now.time < day.close) {
      return { isOpen: true, state: "open", message: `Jetzt geöffnet · Schließt um ${day.close}`, todayHours };
    }
    if (now.time >= breakStart && now.time < breakEnd) {
      return { isOpen: false, state: "lunch_break", message: `Momentan Mittagspause – wieder geöffnet ab ${day.secondOpen}`, todayHours };
    }
    if (now.time >= day.secondOpen && now.time < day.secondClose) {
      return { isOpen: true, state: "open", message: `Jetzt geöffnet · Schließt um ${day.secondClose}`, todayHours };
    }
    return { isOpen: false, state: "closed", message: "Heute geschlossen", todayHours };
  }

  if (now.time < day.close) {
    return { isOpen: true, state: "open", message: `Jetzt geöffnet · Schließt um ${day.close}`, todayHours };
  }
  return { isOpen: false, state: "closed", message: "Heute geschlossen", todayHours };
}

export function todayOpeningHours(value, date = new Date()) {
  const status = partnerOpeningStatus(value, date);
  return status.state === "lunch_break" ? status.message : status.todayHours;
}
