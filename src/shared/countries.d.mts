export type CountryOption = Readonly<{
  code: string;
  label: string;
  searchText: string;
}>;

export const ISO_ALPHA_2_COUNTRY_CODES: readonly string[];
export function isIsoAlpha2CountryCode(value: unknown): boolean;
export function getCountryOptions(locale?: string): readonly CountryOption[];
export function countryNameForCode(code: unknown, locale?: string): string;
export function filterCountryOptions(locale: string | undefined, query: unknown, limit?: number): readonly CountryOption[];
