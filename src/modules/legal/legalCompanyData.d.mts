export const legalFormSuggestions: readonly string[];
export function isAustriaCountry(country: unknown): boolean;
export function companyRegistrationLabel(country: unknown): string;
export function vatIdLabel(country: unknown): string;
export function normalizeCompanyRegistrationNumber(value: unknown, country: unknown): string;
export function normalizeVatId(value: unknown, country: unknown): string;
export function optionalCompanyIdentifierHint(
  kind: "registration" | "vat",
  value: unknown,
  country: unknown,
): string | null;
