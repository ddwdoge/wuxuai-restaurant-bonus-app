export type CountryReadinessCheck = { key: string; status: string; valid_until?: string | null; document_version_refs?: string[]; updated_at?: string };
export type CountryReadiness = { ready: boolean; checks: CountryReadinessCheck[] };
export const COUNTRY_READINESS_KEYS: readonly string[];
export function countryReadinessStatus(check?: CountryReadinessCheck, now?: number): 'ready' | 'open' | 'not_configured' | 'expired';
export function canActivateCountry(country: {currency_code?: string | null; readiness?: CountryReadiness}, now?: number): boolean;
