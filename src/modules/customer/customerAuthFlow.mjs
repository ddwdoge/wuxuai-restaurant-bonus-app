export function validateCustomerPassword(password) {
  if (typeof password !== "string" || password.length < 8) {
    return { valid: false, message: "Das Passwort muss mindestens 8 Zeichen lang sein." };
  }
  return { valid: true, message: null };
}

export function customerPasswordConfirmationError(password, confirmation, showError) {
  if (!showError) return null;
  if (!confirmation) return "Bitte bestätige dein Passwort.";
  if (password !== confirmation) return "Passwörter stimmen nicht überein.";
  return null;
}

export function isCustomerPasswordConfirmationValid(password, confirmation) {
  return validateCustomerPassword(password).valid
    && typeof confirmation === "string"
    && confirmation.length > 0
    && password === confirmation;
}

export function classifyCustomerSignUpResult(data) {
  if (data?.session?.user?.email_confirmed_at) return "confirmed";

  const user = data?.user;
  if (!user) return "failed";

  if (Array.isArray(user.identities) && user.identities.length === 0) {
    return "existing_or_obfuscated";
  }

  if (user.confirmation_sent_at) return "confirmation_required";
  return "failed";
}

export function classifyCustomerAuthError(error) {
  const status = Number(error?.status ?? 0);
  const code = typeof error?.code === "string" ? error.code.toLowerCase() : "";
  const message = typeof error?.message === "string" ? error.message.toLowerCase() : "";
  const combined = `${code} ${message}`;

  if (status === 429 || combined.includes("rate limit") || combined.includes("too many requests")) {
    return "rate_limit";
  }
  if (combined.includes("invalid login") || combined.includes("invalid_credentials")) {
    return "invalid_credentials";
  }
  if (combined.includes("email not confirmed") || combined.includes("email_not_confirmed")) {
    return "email_unconfirmed";
  }
  if (combined.includes("invalid email") || combined.includes("email_address_invalid")) {
    return "invalid_email";
  }
  if (combined.includes("weak password") || combined.includes("password should")) {
    return "weak_password";
  }
  if (status >= 500) return "server";
  if (combined.includes("network") || combined.includes("fetch") || combined.includes("timeout")) {
    return "network";
  }
  return "unknown";
}

export function customerAuthErrorMessage(error, context = "signup") {
  const category = classifyCustomerAuthError(error);
  if (category === "rate_limit") {
    return context === "resend"
      ? "Bitte warte kurz, bevor du eine neue Bestätigungs-E-Mail anforderst."
      : "Bitte warte kurz, bevor du es erneut versuchst.";
  }
  if (category === "invalid_credentials") return "E-Mail-Adresse oder Passwort sind nicht korrekt.";
  if (category === "email_unconfirmed") return "Bitte bestätige zuerst deine E-Mail-Adresse.";
  if (category === "invalid_email") return "Bitte gib eine gültige E-Mail-Adresse ein.";
  if (category === "weak_password") return "Bitte wähle ein Passwort mit mindestens 8 Zeichen.";
  if (category === "network") return "Die Verbindung konnte nicht hergestellt werden. Bitte versuche es erneut.";
  if (category === "server") return "Der Vorgang konnte gerade nicht abgeschlossen werden. Bitte versuche es später erneut.";
  if (context === "resend") {
    return "Die E-Mail konnte gerade nicht angefordert werden. Bitte warte kurz und versuche es erneut.";
  }
  if (context === "login") {
    return "Anmeldung konnte nicht abgeschlossen werden. Bitte versuche es erneut.";
  }
  return "Registrierung konnte nicht abgeschlossen werden. Bitte versuche es erneut.";
}
