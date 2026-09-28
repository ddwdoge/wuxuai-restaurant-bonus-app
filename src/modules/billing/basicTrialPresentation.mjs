const VIENNA_TIME_ZONE = "Europe/Vienna";

function viennaDateTimeParts(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
    timeZone: VIENNA_TIME_ZONE,
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value: partValue }) => [type, Number(partValue)]));
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

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

export function inferTrialCalendarMonths(startValue, endValue) {
  const start = viennaDateTimeParts(startValue);
  const end = viennaDateTimeParts(endValue);
  if (!start || !end) return null;
  const calendarMonths = (end.year * 12 + end.month) - (start.year * 12 + start.month);
  if (calendarMonths !== 1 && calendarMonths !== 3) return null;

  const daysInEndMonth = new Date(Date.UTC(end.year, end.month, 0)).getUTCDate();
  const expectedEndDay = Math.min(start.day, daysInEndMonth);
  const sameLocalTime = start.hour === end.hour && start.minute === end.minute && start.second === end.second;
  return end.day === expectedEndDay && sameLocalTime ? calendarMonths : null;
}

export function hasLegacyUtcCalendarBoundary(startValue, endValue) {
  const start = viennaDateTimeParts(startValue);
  const end = viennaDateTimeParts(endValue);
  const startDate = new Date(startValue);
  const endDate = new Date(endValue);
  if (!start || !end || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return false;

  const calendarMonths = (end.year * 12 + end.month) - (start.year * 12 + start.month);
  if (calendarMonths !== 1 && calendarMonths !== 3) return false;
  const daysInEndMonth = new Date(Date.UTC(end.year, end.month, 0)).getUTCDate();
  const sameLocalTime = start.hour === end.hour && start.minute === end.minute && start.second === end.second;
  const sameUtcTime = startDate.getUTCHours() === endDate.getUTCHours()
    && startDate.getUTCMinutes() === endDate.getUTCMinutes()
    && startDate.getUTCSeconds() === endDate.getUTCSeconds();
  return end.day === Math.min(start.day, daysInEndMonth) && !sameLocalTime && sameUtcTime;
}
