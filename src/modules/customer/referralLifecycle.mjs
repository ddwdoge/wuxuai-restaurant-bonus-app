const viennaDateTimeFormatter = new Intl.DateTimeFormat("de-AT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Vienna",
});

export function formatReferralBoostExpiry(activeUntil) {
  const timestamp = new Date(activeUntil);
  return Number.isFinite(timestamp.getTime()) ? viennaDateTimeFormatter.format(timestamp) : "";
}

export function formatReferralBoostRemaining(activeUntil, nowMs = Date.now()) {
  const remainingMs = new Date(activeUntil).getTime() - nowMs;
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return "Boost abgelaufen";

  const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60_000));
  if (remainingMinutes >= 48 * 60) {
    const days = Math.ceil(remainingMinutes / (24 * 60));
    return `Noch ${days} Tage`;
  }

  if (remainingMinutes >= 24 * 60) return "Noch 1 Tag";

  const hours = Math.floor(remainingMinutes / 60);
  const minutes = remainingMinutes % 60;
  if (hours === 0) return `Noch ${minutes} Min.`;
  if (minutes === 0) return `Noch ${hours} Std.`;
  return `Noch ${hours} Std. ${minutes} Min.`;
}
