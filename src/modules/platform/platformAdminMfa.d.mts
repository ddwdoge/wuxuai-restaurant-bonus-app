export type PlatformMfaMode = "authorized" | "challenge" | "enroll";

export function hasTotpAuthenticationMethod(
  methods: Array<string | { method?: string; timestamp?: number }> | null | undefined,
): boolean;
export function platformAdminMfaMode(input: {
  currentLevel: string | null;
  currentAuthenticationMethods: Array<string | { method?: string; timestamp?: number }> | null | undefined;
  verifiedTotpFactors: Array<{ id: string }> | null | undefined;
}): PlatformMfaMode;
export function isPlatformSessionProofCurrent(
  checkedAccessToken: string | null | undefined,
  currentAccessToken: string | null | undefined,
): boolean;
export function normalizeTotpCode(value: unknown): string;
export function latestVerifiedTotpFactor<T extends { id: string; updated_at?: string }>(factors: T[] | null | undefined): T | null;
export type TotpFactor = { id: string; status?: string; friendly_name?: string; created_at?: string; updated_at?: string };
export function verifiedTotpFactors<T extends TotpFactor>(factors: T[] | null | undefined): T[];
export function totpFactorLabel(factor: TotpFactor, index?: number): string;
export function nextTotpDeviceName(factors: TotpFactor[] | null | undefined): string;
export function canRemoveTotpFactor(factors: TotpFactor[] | null | undefined, targetFactorId: string, proofFactorId: string): boolean;
