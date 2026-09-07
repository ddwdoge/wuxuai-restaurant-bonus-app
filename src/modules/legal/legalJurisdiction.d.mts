export const LEGAL_CONTENT_NOT_AVAILABLE: "LEGAL_CONTENT_NOT_AVAILABLE";
export function normalizeLegalCountry(value: unknown): string | null;
export function resolveLegalJurisdiction(input?: {
  organizationLegalCountry?: unknown;
  addressSource?: unknown;
  addressSourceBranchCountry?: unknown;
  primaryBranchCountry?: unknown;
}):
  | { status: "available"; country: string; source: string }
  | { status: "unavailable"; country: null; source: null; reason: "LEGAL_CONTENT_NOT_AVAILABLE" };
export function resolveLegalDocumentVersion(input: {
  versions?: Array<{ language: string; legal_country: string; [key: string]: unknown }>;
  legalCountry?: unknown;
  requestedLanguage?: unknown;
}):
  | { status: "available"; version: Record<string, unknown>; language: string; usedFallback: boolean }
  | { status: "unavailable"; version: null; reason: "LEGAL_CONTENT_NOT_AVAILABLE" };
