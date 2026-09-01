export const OWNER_AUTH_PATHS = Object.freeze({
  callback: "/auth/callback",
  confirmEmail: "/auth/confirm-email",
  forgotPassword: "/auth/forgot-password",
  updatePassword: "/auth/update-password",
});

const commonPasswords = new Set([
  "12345678",
  "123456789",
  "password",
  "passwort",
  "qwertzui",
  "qwertyui",
  "restaurant",
  "wuxuaibonus",
]);

export function buildOwnerAuthRedirect(origin, path) {
  const normalizedOrigin = typeof origin === "string" ? origin.replace(/\/$/, "") : "";
  if (!normalizedOrigin || !Object.values(OWNER_AUTH_PATHS).includes(path)) {
    throw new Error("Ungültige Weiterleitungsadresse.");
  }
  return `${normalizedOrigin}${path}`;
}

export function isOwnerEmailConfirmed(user) {
  return Boolean(user?.email_confirmed_at);
}

export function validateOwnerPassword(password, confirmation) {
  if (typeof password !== "string" || password.length < 8) {
    return { valid: false, message: "Das Passwort muss mindestens 8 Zeichen lang sein." };
  }

  const normalized = password.trim().toLowerCase();
  if (
    commonPasswords.has(normalized)
    || /^(.)\1+$/.test(password)
    || /^\d+$/.test(password)
  ) {
    return { valid: false, message: "Bitte wähle ein stärkeres, nicht leicht erratbares Passwort." };
  }

  if (typeof confirmation === "string" && password !== confirmation) {
    return { valid: false, message: "Die beiden Passwörter stimmen nicht überein." };
  }

  return { valid: true, message: null };
}

export function classifyOwnerAuthError(error) {
  const status = Number(error?.status ?? 0);
  const code = typeof error?.code === "string" ? error.code.toLowerCase() : "";
  const message = typeof error?.message === "string" ? error.message.toLowerCase() : "";
  const combined = `${code} ${message}`;

  if (status === 429 || combined.includes("rate limit") || combined.includes("too many requests")) {
    return "rate_limit";
  }
  if (combined.includes("email not confirmed") || combined.includes("email_not_confirmed")) {
    return "email_unconfirmed";
  }
  if (
    combined.includes("weak password")
    || combined.includes("weak_password")
    || combined.includes("password should")
  ) {
    return "weak_password";
  }
  if (
    combined.includes("invalid login credentials")
    || combined.includes("invalid_credentials")
  ) {
    return "invalid_credentials";
  }
  if (
    combined.includes("expired")
    || combined.includes("otp_expired")
    || combined.includes("invalid token")
    || combined.includes("bad_code_verifier")
  ) {
    return "expired_link";
  }
  if (status >= 500) return "server";
  if (combined.includes("network") || combined.includes("fetch")) return "network";
  return "unknown";
}

export function ownerAuthErrorMessage(error, context = "general") {
  const category = classifyOwnerAuthError(error);

  if (category === "rate_limit") {
    return "Bitte warte einen Moment, bevor du es erneut versuchst.";
  }
  if (category === "email_unconfirmed") {
    return "Bitte bestätige zuerst deine E-Mail-Adresse.";
  }
  if (category === "weak_password") {
    return "Bitte wähle ein stärkeres Passwort mit mindestens 8 Zeichen.";
  }
  if (category === "invalid_credentials") {
    return "E-Mail-Adresse oder Passwort ist nicht korrekt.";
  }
  if (category === "expired_link") {
    return context === "recovery"
      ? "Dieser Link zum Zurücksetzen des Passworts ist ungültig oder abgelaufen."
      : "Dieser Bestätigungslink ist ungültig oder abgelaufen.";
  }
  if (category === "network") {
    return "Die Verbindung konnte nicht hergestellt werden. Bitte versuche es erneut.";
  }
  if (category === "server") {
    return "Der Vorgang konnte gerade nicht abgeschlossen werden. Bitte versuche es später erneut.";
  }
  return "Der Vorgang konnte nicht abgeschlossen werden. Bitte versuche es erneut.";
}

export function hasRecoveryIntent(locationLike) {
  const search = new globalThis.URLSearchParams(locationLike?.search ?? "");
  const hash = new globalThis.URLSearchParams((locationLike?.hash ?? "").replace(/^#/, ""));
  return search.get("flow") === "recovery" || search.get("type") === "recovery" || hash.get("type") === "recovery";
}

export function hasAuthCallbackPayload(locationLike) {
  const search = new globalThis.URLSearchParams(locationLike?.search ?? "");
  const hash = new globalThis.URLSearchParams((locationLike?.hash ?? "").replace(/^#/, ""));
  return Boolean(
    search.get("code")
    || search.get("error")
    || search.get("error_code")
    || hash.get("access_token")
    || hash.get("error")
    || hash.get("error_code")
  );
}
