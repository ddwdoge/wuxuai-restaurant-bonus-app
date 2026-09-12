export const COUNTRY_READINESS_KEYS = Object.freeze([
  'legal', 'privacy', 'tax', 'billing', 'stripe', 'translation', 'technical_smoke', 'required_documents',
]);

export function countryReadinessStatus(check, now = Date.now()) {
  if (!check) return 'not_configured';
  if (check.valid_until && (!Number.isFinite(Date.parse(check.valid_until)) || Date.parse(check.valid_until) <= now)) return 'expired';
  return ['ready', 'open', 'not_configured', 'expired'].includes(check.status) ? check.status : 'not_configured';
}

export function canActivateCountry(country, now = Date.now()) {
  return country?.readiness?.ready === true && /^[A-Z]{3}$/.test(country.currency_code ?? '') &&
    COUNTRY_READINESS_KEYS.every(key => {
      const check = country.readiness.checks?.find(item => item.key === key);
      return countryReadinessStatus(check, now) === 'ready' &&
        (key !== 'required_documents' || (Array.isArray(check.document_version_refs) && check.document_version_refs.length > 0 &&
          check.document_version_refs.every(ref => typeof ref === 'string' && ref.trim().length > 0)));
    });
}
