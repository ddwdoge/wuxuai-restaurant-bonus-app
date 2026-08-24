export function safeReferralFirstName(value) {
  const firstName = typeof value === "string" ? value.trim() : "";
  return /^[\p{L}][\p{L}' -]{0,39}$/u.test(firstName) ? firstName : null;
}

export function referralInvitationTitle(value) {
  const firstName = safeReferralFirstName(value);
  return firstName ? `${firstName} lädt dich ein` : "Ein Freund lädt dich ein";
}
