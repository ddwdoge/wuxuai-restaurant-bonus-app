export const CUSTOMER_PHONE_COUNTRIES = Object.freeze([
  { code: "+43", label: "Österreich" },
  { code: "+49", label: "Deutschland" },
  { code: "+41", label: "Schweiz" },
  { code: "+39", label: "Italien" },
  { code: "+420", label: "Tschechien" },
  { code: "+421", label: "Slowakei" },
  { code: "+36", label: "Ungarn" },
  { code: "+386", label: "Slowenien" },
  { code: "+385", label: "Kroatien" },
]);

const supportedCountryCodes = new Set(CUSTOMER_PHONE_COUNTRIES.map(({ code }) => code));
const allowedLocalFormatting = /^[\d\s()-]*$/;

export function normalizeCustomerLocalPhoneInput(value) {
  const raw = typeof value === "string" ? value.trimStart() : "";
  if (!allowedLocalFormatting.test(raw)) return raw;
  const compact = raw.replace(/[\s()-]/g, "");
  if (compact.startsWith("00")) return compact;
  return compact.length > 1 && compact.startsWith("0") ? compact.slice(1) : compact;
}

export function customerPhoneValidation(countryCode, localNumber) {
  const normalizedCountryCode = typeof countryCode === "string" ? countryCode.trim() : "";
  const rawLocalNumber = typeof localNumber === "string" ? localNumber.trim() : "";

  if (!supportedCountryCodes.has(normalizedCountryCode)) {
    return { e164: null, error: "Bitte wähle eine gültige Landesvorwahl." };
  }
  if (!rawLocalNumber) {
    return { e164: null, error: "Bitte gib deine Telefonnummer ein." };
  }
  if (rawLocalNumber.startsWith("+") || rawLocalNumber.startsWith("00")) {
    return { e164: null, error: "Bitte gib im Telefonnummernfeld nur die lokale Nummer ohne Landescode ein." };
  }
  if (!allowedLocalFormatting.test(rawLocalNumber)) {
    return { e164: null, error: "Bitte verwende nur Ziffern, Leerzeichen, Bindestriche oder Klammern." };
  }

  let compact = rawLocalNumber.replace(/[\s()-]/g, "");
  if (compact.startsWith("0")) compact = compact.slice(1);
  const countryDigits = normalizedCountryCode.slice(1);
  if (compact.startsWith(countryDigits) && compact.length > countryDigits.length + 6) {
    return { e164: null, error: "Bitte gib im Telefonnummernfeld nur die lokale Nummer ohne Landescode ein." };
  }

  const e164 = `${normalizedCountryCode}${compact}`;
  if (!/^\+[1-9]\d{7,14}$/.test(e164)) {
    return { e164: null, error: "Bitte gib eine plausible Telefonnummer ein." };
  }
  return { e164, error: null };
}

export function normalizeCustomerPhoneParts(countryCode, localNumber) {
  return customerPhoneValidation(countryCode, localNumber).e164;
}

export function splitCustomerPhone(value) {
  const normalized = normalizeCustomerPhone(value);
  if (!normalized) return { countryCode: "+43", localNumber: "" };
  const country = [...CUSTOMER_PHONE_COUNTRIES]
    .sort((a, b) => b.code.length - a.code.length)
    .find(({ code }) => normalized.startsWith(code));
  if (!country) return { countryCode: "+43", localNumber: "" };
  return { countryCode: country.code, localNumber: normalized.slice(country.code.length) };
}

export function normalizeCustomerPhone(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || !/^[\d+\s()-]+$/.test(raw)) return null;
  let compact = raw.replace(/[\s()-]/g, "");
  if (compact.startsWith("00")) compact = `+${compact.slice(2)}`;
  if (/^0\d+$/.test(compact)) compact = `+43${compact.slice(1)}`;
  if (/^43\d+$/.test(compact)) compact = `+${compact}`;
  if (/^\d+$/.test(compact)) compact = `+43${compact}`;
  if (!/^\+[1-9]\d{7,14}$/.test(compact)) return null;
  return CUSTOMER_PHONE_COUNTRIES.some(({ code }) => compact.startsWith(code)) ? compact : null;
}
