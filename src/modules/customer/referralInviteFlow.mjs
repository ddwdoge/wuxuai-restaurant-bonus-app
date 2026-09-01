export function safeReferralFirstName(value) {
  const firstName = typeof value === "string" ? value.trim() : "";
  return /^[\p{L}][\p{L}' -]{0,39}$/u.test(firstName) ? firstName : null;
}

export function referralInvitationTitle(value) {
  const firstName = safeReferralFirstName(value);
  return firstName ? `${firstName} lädt dich ein` : "Ein Freund lädt dich ein";
}

export function createReferralCreationToken(cryptoSource = globalThis.crypto) {
  if (!cryptoSource?.getRandomValues) {
    throw new Error("Einladung kann auf diesem Gerät nicht sicher erstellt werden.");
  }
  const bytes = new Uint8Array(32);
  cryptoSource.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
