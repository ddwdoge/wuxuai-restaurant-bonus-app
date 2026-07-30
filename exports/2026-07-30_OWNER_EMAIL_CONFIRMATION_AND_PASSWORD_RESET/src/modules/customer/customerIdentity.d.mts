export const CUSTOMER_PHONE_COUNTRIES: readonly Readonly<{ code: string; label: string }>[];
export function normalizeCustomerLocalPhoneInput(value: unknown): string;
export function customerPhoneValidation(countryCode: unknown, localNumber: unknown): { e164: string | null; error: string | null };
export function normalizeCustomerPhoneParts(countryCode: unknown, localNumber: unknown): string | null;
export function splitCustomerPhone(value: unknown): { countryCode: string; localNumber: string };
export function normalizeCustomerPhone(value: unknown): string | null;
