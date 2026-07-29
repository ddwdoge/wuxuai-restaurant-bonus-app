import { normalizeCustomerPhoneParts } from "./customerIdentity.mjs";

export const emptyCustomerRegistrationForm = Object.freeze({
  firstName: "",
  phoneCountryCode: "+43",
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

export function isValidCustomerPhone(countryCode, localNumber) {
  return Boolean(normalizeCustomerPhoneParts(countryCode, localNumber));
}

export function customerRegistrationCanSubmit(form, legalReady) {
  return Boolean(
    legalReady
    && isValidCustomerFirstName(form.firstName)
    && isValidCustomerPhone(form.phoneCountryCode, form.phone)
    && form.termsAccepted
    && form.privacyAcknowledged,
  );
}
