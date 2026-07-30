export type StaffRedemptionErrorKind =
  | "not_found"
  | "already_used"
  | "expired"
  | "unavailable"
  | "unauthorized"
  | "preview_network_error"
  | "consume_unknown"
  | "generic_error";

export type StaffRedemptionErrorContent = {
  eyebrow: string;
  title: string;
  text: string;
  primaryAction: string;
  secondaryAction?: string;
  tone: "danger" | "warning" | "neutral";
};

type ErrorLike = {
  code?: unknown;
  message?: unknown;
  status?: unknown;
};

function readError(error: unknown) {
  const errorLike = typeof error === "object" && error !== null ? error as ErrorLike : null;
  const message = error instanceof Error
    ? error.message
    : typeof errorLike?.message === "string"
      ? errorLike.message
      : "";

  return {
    code: typeof errorLike?.code === "string" ? errorLike.code : "",
    message: message.trim().toLowerCase(),
    status: typeof errorLike?.status === "number" ? errorLike.status : null,
  };
}

function isNetworkFailure(error: unknown, message: string) {
  if (error instanceof TypeError) return true;

  return new Set([
    "failed to fetch",
    "typeerror: failed to fetch",
    "fetch failed",
    "load failed",
    "networkerror when attempting to fetch resource.",
  ]).has(message);
}

export function classifyStaffRedemptionError(
  error: unknown,
  phase: "preview" | "consume",
): StaffRedemptionErrorKind {
  const { code, message, status } = readError(error);

  if (isNetworkFailure(error, message)) {
    return phase === "consume" ? "consume_unknown" : "preview_network_error";
  }

  if (
    code === "42501"
    || code === "PGRST301"
    || status === 401
    || status === 403
    || message === "nicht berechtigt."
    || message === "mitarbeitersitzung ist nicht gültig."
  ) {
    return "unauthorized";
  }

  if (message === "einlösecode wurde bereits verwendet.") return "already_used";
  if (message === "einlösecode ist abgelaufen.") return "expired";

  if (new Set([
    "einlösecode ist nicht mehr verfügbar.",
    "punkteeinlösung ist nicht mehr verfügbar.",
    "diese punkteeinlösung ist nicht mehr verfügbar.",
    "geschenk ist nicht mehr verfügbar.",
    "dieses geschenk ist nicht mehr verfügbar.",
  ]).has(message)) {
    return "unavailable";
  }

  if (code === "P0001" && message === "einlösecode ist nicht gültig.") return "not_found";
  if (message === "einlösecode ist nicht gültig.") return "not_found";

  return "generic_error";
}

export const staffRedemptionErrorContent: Record<StaffRedemptionErrorKind, StaffRedemptionErrorContent> = {
  not_found: {
    eyebrow: "Code nicht zugeordnet",
    title: "Code nicht gefunden",
    text: "Bitte prüfe, ob alle sechs Ziffern korrekt eingegeben wurden.",
    primaryAction: "Code erneut eingeben",
    tone: "danger",
  },
  already_used: {
    eyebrow: "Bereits verwendet",
    title: "Diese Belohnung wurde bereits eingelöst",
    text: "Der Einlösecode kann kein zweites Mal verwendet werden.",
    primaryAction: "Nächsten Code prüfen",
    tone: "neutral",
  },
  expired: {
    eyebrow: "Gültigkeit beendet",
    title: "Dieser Code ist abgelaufen",
    text: "Bitte den Gast, die Belohnung im Kundenportal erneut zu öffnen.",
    primaryAction: "Code erneut eingeben",
    secondaryAction: "Zur Startseite",
    tone: "warning",
  },
  unavailable: {
    eyebrow: "Derzeit nicht möglich",
    title: "Belohnung derzeit nicht verfügbar",
    text: "Diese Belohnung kann momentan nicht eingelöst werden.",
    primaryAction: "Anderen Code prüfen",
    tone: "warning",
  },
  unauthorized: {
    eyebrow: "Zugriff geschützt",
    title: "Keine Berechtigung",
    text: "Du darfst diese Einlösung mit deinem aktuellen Zugang nicht durchführen.",
    primaryAction: "Zur Startseite",
    tone: "danger",
  },
  preview_network_error: {
    eyebrow: "Verbindung unterbrochen",
    title: "Code konnte nicht geprüft werden",
    text: "Bitte kontrolliere die Verbindung und versuche es erneut.",
    primaryAction: "Erneut versuchen",
    secondaryAction: "Abbrechen",
    tone: "warning",
  },
  consume_unknown: {
    eyebrow: "Status wird erneut geprüft",
    title: "Einlösung konnte nicht eindeutig bestätigt werden",
    text: "Prüfe den Code erneut, bevor du eine weitere Bestätigung versuchst.",
    primaryAction: "Status erneut prüfen",
    secondaryAction: "Zur Startseite",
    tone: "warning",
  },
  generic_error: {
    eyebrow: "Vorgang unterbrochen",
    title: "Etwas ist schiefgegangen",
    text: "Bitte versuche es erneut oder wende dich an den Restaurantbesitzer.",
    primaryAction: "Code erneut eingeben",
    secondaryAction: "Zur Startseite",
    tone: "neutral",
  },
};
