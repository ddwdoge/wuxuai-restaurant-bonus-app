export const consentTypes: string[];
export const participationTermFields: string[];
export function termsAreComplete(content: Record<string, unknown>): boolean;
export function marketingMessageAllowed(category: string, channel: string, consents: Array<{ consent_type: string; status: string }>): boolean;
export function legalReadiness(profile: Record<string, unknown>, terms: Record<string, unknown>, privacyText: string): { imprintComplete: boolean; termsComplete: boolean; privacyComplete: boolean };
export function canPubliclyActivate(readiness: { operational_ready?: boolean; legal_ready?: boolean; security_ready?: boolean }): boolean;
export function csvCell(value: unknown): string;
export function accountingRowsToCsv(rows: Array<Record<string, unknown>>): string;
