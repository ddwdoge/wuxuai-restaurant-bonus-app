export type PlatformTestCollectionMode = "restaurant_controlled_only" | "both";
export type PlatformTestCollectionReceiptStatus = "committed" | "not_committed" | "unclear" | "security_conflict";
export const PLATFORM_TEST_COLLECTION_ACTION: "TEST_ONLY_PRO_REWARD_FLOW";
export const PLATFORM_TEST_COLLECTION_MODES: readonly PlatformTestCollectionMode[];
export function platformTestControlEnvironmentEnabled(input: {
  featureFlag?: string;
  expectedProjectRef?: string;
  supabaseUrl?: string;
  hostname?: string;
  protocol?: string;
}): boolean;
export function canShowPlatformTestCollectionControl(input: {
  environmentEnabled: boolean;
  platformRole: string | null;
  aal2: boolean;
  verifiedTotp: boolean;
  exactTestOnlyTenant: boolean;
}): boolean;
export function platformTestCollectionTransition(currentMode: string | null | undefined): {
  currentMode: PlatformTestCollectionMode;
  targetMode: PlatformTestCollectionMode;
  label: string;
} | null;
export function classifyPlatformTestCollectionReceipt(
  receipt: Record<string, unknown> | null | undefined,
  expectedMode: PlatformTestCollectionMode,
  targetMode: PlatformTestCollectionMode,
): { status: PlatformTestCollectionReceiptStatus; currentMode: PlatformTestCollectionMode | null };
