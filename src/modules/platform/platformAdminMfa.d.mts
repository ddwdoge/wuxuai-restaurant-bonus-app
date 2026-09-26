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
