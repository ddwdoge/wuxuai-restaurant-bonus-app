import { normalizeUiLanguage } from "../../shared/i18n/language.mjs";

const COUNTRY_ALIASES = new Map([
  ["AUSTRIA", "AT"],
  ["ÖSTERREICH", "AT"],
]);

export const LEGAL_CONTENT_NOT_AVAILABLE = "LEGAL_CONTENT_NOT_AVAILABLE";

export function normalizeLegalCountry(value) {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (/^[A-Z]{2}$/.test(normalized)) return normalized;
  return COUNTRY_ALIASES.get(normalized) ?? null;
}

export function resolveLegalJurisdiction({ organizationLegalCountry, addressSource, addressSourceBranchCountry, primaryBranchCountry } = {}) {
  const sourceCandidates = addressSource === "restaurant"
    ? [[addressSourceBranchCountry, "address_source_branch"], [primaryBranchCountry, "primary_branch"]]
    : [[organizationLegalCountry, "organization_legal_profile"]];

  for (const [candidate, source] of sourceCandidates) {
    const country = normalizeLegalCountry(candidate);
    if (country) return { status: "available", country, source };
  }
  return { status: "unavailable", country: null, source: null, reason: LEGAL_CONTENT_NOT_AVAILABLE };
}

export function resolveLegalDocumentVersion({ versions = [], legalCountry, requestedLanguage }) {
  const country = normalizeLegalCountry(legalCountry);
  if (!country) return { status: "unavailable", version: null, reason: LEGAL_CONTENT_NOT_AVAILABLE };

  const language = normalizeUiLanguage(requestedLanguage);
  const sameCountry = versions.filter((version) => normalizeLegalCountry(version.legal_country) === country);
  const exact = sameCountry.find((version) => normalizeUiLanguage(version.language, "") === language);
  const english = sameCountry.find((version) => normalizeUiLanguage(version.language, "") === "en");
  const version = exact ?? english ?? null;
  return version
    ? { status: "available", version, language: normalizeUiLanguage(version.language), usedFallback: version !== exact }
    : { status: "unavailable", version: null, reason: LEGAL_CONTENT_NOT_AVAILABLE };
}
