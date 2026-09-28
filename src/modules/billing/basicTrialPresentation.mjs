const VIENNA_TIME_ZONE = "Europe/Vienna";

export function formatViennaDateTime(value) {
  if (!value) return "Nicht gesetzt";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Nicht gesetzt";
  return new Intl.DateTimeFormat("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: VIENNA_TIME_ZONE,
    timeZoneName: "short",
  }).format(date);
}

export function basicTrialDurationLabel(calendarMonths) {
  if (calendarMonths === 1) return "Ein Kalendermonat";
  if (calendarMonths === 3) return "Drei Kalendermonate";
  return "Nicht gesetzt";
}
