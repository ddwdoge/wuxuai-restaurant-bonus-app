export const emptyCustomerRegistrationForm = Object.freeze({
  firstName: "",
  phone: "",
  birthday: "",
  termsAccepted: false,
  privacyAcknowledged: false,
  marketingPush: false,
  marketingSms: false,
  marketingEmail: false,
  birthdayProcessing: false,
});

export function isValidCustomerFirstName(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized.length <= 80 && /^[\p{L}][\p{L}\p{M}' -]*$/u.test(normalized);
}

export function isValidCustomerPhone(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!/^[+\d][\d\s()/.-]*$/.test(normalized)) return false;
  const digitCount = normalized.replace(/\D/g, "").length;
  return digitCount >= 7 && digitCount <= 15;
}

export function customerRegistrationCanSubmit(form, legalReady) {
  return Boolean(
    legalReady
    && isValidCustomerFirstName(form.firstName)
    && isValidCustomerPhone(form.phone)
    && form.termsAccepted
    && form.privacyAcknowledged
    && (!form.birthday || form.birthdayProcessing),
  );
}
