export type OwnerSmartSetupSuccessCode =
  | "location_saved"
  | "reward_saved"
  | "offer_published"
  | "birthday_pool_saved"
  | "staff_access_saved"
  | "legal_published"
  | "onboarding_completed";

export function ownerSmartSetupLaunchState(recommendationId: string): Record<string, unknown> | null;
export function readOwnerSmartSetupLaunchState(state: unknown): { recommendationId: string } | null;
export function ownerSmartSetupSuccessState(code: OwnerSmartSetupSuccessCode): Record<string, unknown> | null;
export function readOwnerSmartSetupSuccessState(state: unknown): { code: OwnerSmartSetupSuccessCode; message: string } | null;
export function ownerSetupOverviewLaunchState(recommendationId: string): Record<string, unknown> | null;
export function readOwnerSetupOverviewLaunchState(state: unknown): { recommendationId: string } | null;
export function ownerSetupOverviewSuccessState(code: OwnerSmartSetupSuccessCode): Record<string, unknown> | null;
export function readOwnerSetupOverviewSuccessState(state: unknown): { code: OwnerSmartSetupSuccessCode; message: string } | null;
