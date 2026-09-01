export function viennaCalendarDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Vienna",
    year: "numeric",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function safeLegalRpcError(error) {
  if (!error || typeof error !== "object") {
    return { code: "UNKNOWN", message: "Unbekannter Fehler", details: null, hint: null };
  }
  return {
    code: "code" in error ? String(error.code ?? "UNKNOWN") : "UNKNOWN",
    message: "message" in error ? String(error.message ?? "Unbekannter Fehler") : "Unbekannter Fehler",
    details: "details" in error && error.details ? String(error.details) : null,
    hint: "hint" in error && error.hint ? String(error.hint) : null,
  };
}

export function onboardingCompletionErrorMessage(error) {
  const safe = safeLegalRpcError(error);
  if (safe.code === "42501" || /NOT_AUTHORIZED/.test(safe.message)) {
    return "Du darfst dieses Restaurant nicht veröffentlichen.";
  }
  if (/CONFIRMATION_REQUIRED/.test(safe.message)) {
    return "Bitte bestätige die Veröffentlichung der vorbereiteten Dokumente.";
  }
  if (/REQUIRED_DOCUMENTS_MISSING|DRAFTS_MISSING|PACKAGE_INCOMPLETE/.test(safe.message)) {
    return "Das rechtliche Dokumentpaket ist noch nicht vollständig. Bitte versuche es erneut.";
  }
  if (/DRAFT_INVALID|READINESS_FAILED/.test(safe.message)) {
    return "Das rechtliche Dokumentpaket konnte nicht freigegeben werden. Bitte prüfe deine Angaben und versuche es erneut.";
  }
  return "Das Restaurant konnte noch nicht gestartet werden. Bitte versuche es erneut.";
}
