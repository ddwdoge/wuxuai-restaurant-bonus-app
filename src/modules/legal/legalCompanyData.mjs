const AUSTRIA_COUNTRY_NAMES = new Set(["at", "austria", "osterreich", "oesterreich", "österreich"]);

export const legalFormSuggestions = [
  "Einzelunternehmen",
  "GmbH",
  "OG",
  "KG",
  "Verein",
];

function clean(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function countryKey(country) {
  return clean(country).toLocaleLowerCase("de-AT");
}

export function isAustriaCountry(country) {
  return AUSTRIA_COUNTRY_NAMES.has(countryKey(country));
}

export function companyRegistrationLabel(country) {
  return isAustriaCountry(country) ? "Firmenbuchnummer (FN)" : "Unternehmensregistrierungsnummer";
}

export function vatIdLabel(country) {
  return isAustriaCountry(country) ? "Umsatzsteuer-ID (UID)" : "Umsatzsteuer-ID";
}

export function normalizeCompanyRegistrationNumber(value, country) {
  const cleaned = clean(value);
  if (!cleaned || !isAustriaCountry(country)) return cleaned;

  const match = cleaned.toUpperCase().match(/^FN\s*([0-9]{1,7})\s*([A-Z])$/);
  return match ? `FN ${match[1]} ${match[2].toLowerCase()}` : cleaned;
}

export function normalizeVatId(value, country) {
  const cleaned = clean(value);
  if (!cleaned) return "";
  if (!isAustriaCountry(country)) return cleaned;
  return cleaned.replace(/[\s.-]+/g, "").toUpperCase();
}

export function optionalCompanyIdentifierHint(kind, value, country) {
  const cleaned = clean(value);
  if (!cleaned || !isAustriaCountry(country)) return null;

  if (kind === "registration") {
    return /^FN\s*[0-9]{1,7}\s*[A-Za-z]$/.test(cleaned)
      ? null
      : "Format bitte prüfen, zum Beispiel FN 123456 a. Die Angabe ist optional.";
  }

  return /^ATU[0-9]{8}$/.test(normalizeVatId(cleaned, country))
    ? null
    : "Format bitte prüfen, zum Beispiel ATU12345678. Die Angabe ist optional.";
}
