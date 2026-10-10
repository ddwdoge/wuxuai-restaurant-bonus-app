export const PLATFORM_TEST_COLLECTION_ACTION = "TEST_ONLY_PRO_REWARD_FLOW";
export const PLATFORM_TEST_COLLECTION_MODES = Object.freeze([
  "restaurant_controlled_only",
  "both",
]);

// Presentation gate for the separately bound v2 release. The TEST_ONLY RPCs
// still validate the installed DB binding and the authenticated session.
const stagingV2ProjectRef = "mbgveqbhessaunrhfudm";
const stagingV2AppOrigin = "https://staging-v2.bonus.wuxuaisbi.com";
const stagingV2BackendUrl = `https://${stagingV2ProjectRef}.supabase.co`;

export function platformTestControlEnvironmentEnabled({
  featureFlag,
  expectedProjectRef,
  supabaseUrl,
  appOrigin,
  runtimeOrigin,
}) {
  return featureFlag === "true"
    && expectedProjectRef === stagingV2ProjectRef
    && supabaseUrl === stagingV2BackendUrl
    && appOrigin === stagingV2AppOrigin
    && runtimeOrigin === stagingV2AppOrigin;
}
export function canShowPlatformTestCollectionControl({
  environmentEnabled,
  platformRole,
  aal2,
  verifiedTotp,
  exactTestOnlyTenant,
}) {
  return environmentEnabled === true
    && (platformRole === "platform_owner" || platformRole === "platform_admin")
    && aal2 === true
    && verifiedTotp === true
    && exactTestOnlyTenant === true;
}

export function platformTestCollectionTransition(currentMode) {
  if (currentMode === "restaurant_controlled_only") {
    return { currentMode, targetMode: "both", label: "Temporär auf both umstellen" };
  }
  if (currentMode === "both") {
    return { currentMode, targetMode: "restaurant_controlled_only", label: "Ausgangsmodus wiederherstellen" };
  }
  return null;
}

export function classifyPlatformTestCollectionReceipt(receipt, expectedMode, targetMode) {
  if (!receipt || receipt.tenant_id == null || !PLATFORM_TEST_COLLECTION_MODES.includes(receipt.current_collection_mode)) {
    return { status: "security_conflict", currentMode: null };
  }
  if (receipt.found === true) {
    const matches = receipt.action_code === PLATFORM_TEST_COLLECTION_ACTION
      && receipt.previous_mode === expectedMode
      && receipt.new_mode === targetMode
      && receipt.status === "COMPLETED"
      && receipt.current_collection_mode === targetMode;
    return matches
      ? { status: "committed", currentMode: targetMode }
      : { status: "security_conflict", currentMode: receipt.current_collection_mode };
  }
  if (receipt.found !== false) return { status: "security_conflict", currentMode: receipt.current_collection_mode };
  return receipt.current_collection_mode === expectedMode
    ? { status: "not_committed", currentMode: expectedMode }
    : { status: "unclear", currentMode: receipt.current_collection_mode };
}
