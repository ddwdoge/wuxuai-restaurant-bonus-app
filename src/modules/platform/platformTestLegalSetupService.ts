import { supabase } from "../../shared/lib/supabase";
import { loadPlatformTestTenantCleanupPreflight } from "./platformAdminService";
import { exactTestLegalScope, type TestLegalDocuments, type TestLegalScope } from "./platformTestLegalSetupContract.mjs";

type SyntheticStatus = { restaurant_id: string; status: string; bundle_id: string | null;
  bundle_hash: string | null; test_only: boolean; real_intake_opened: boolean;
  areas?: Record<string, { version?: string; sha256?: string; source?: string; status?: string }> };
type BindResult = { auth_user_id: string; restaurant_id: string; branch_id: string;
  test_session_id: string; idempotent: boolean };
type PlatformResult = { id: string; action: string; sha256: string; version?: string;
  test_session_id?: string; idempotent: boolean };
type MerchantResult = { event_id: string; bundle_id: string; bundle_hash: string;
  status: string; test_only: boolean; idempotent: boolean };

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error("TEST_ONLY_CLIENT_UNAVAILABLE");
  const { data, error } = await supabase.rpc(name, args).abortSignal(AbortSignal.timeout(15000));
  if (error) throw error;
  return data as T;
}

export async function loadTestLegalScope(restaurantId: string, restaurantName: string): Promise<TestLegalScope | null> {
  const preflight = await loadPlatformTestTenantCleanupPreflight(restaurantId);
  const markerRows = (preflight as typeof preflight & { registry_states?: Array<{ state?: string; restaurant_id?: string }> }).registry_states;
  if (!Array.isArray(markerRows) || markerRows.length !== 1
    || markerRows[0]?.state !== "ACTIVE" || markerRows[0]?.restaurant_id !== restaurantId) return null;
  const status = await rpc<SyntheticStatus>("get_platform_at_legal_synthetic_test_status", {
    input_restaurant_id: restaurantId,
  });
  return exactTestLegalScope(preflight, status, restaurantId, restaurantName);
}

export async function bindTestLegalCustomer(scope: TestLegalScope, customerId: string, requestId: string) {
  const result = await rpc<BindResult>("bind_platform_terms_test_identity", {
    input_restaurant_id: scope.restaurantId,
    input_auth_user_id: customerId,
    input_request_id: requestId,
  });
  if (result?.auth_user_id !== customerId || result.restaurant_id !== scope.restaurantId
    || result.branch_id !== scope.branchId || result.test_session_id !== scope.testSessionId
    || typeof result.idempotent !== "boolean") throw new Error("TEST_ONLY_IDENTITY_RECEIPT_CONFLICT");
  return result;
}

export async function publishTestPlatformTerms(scope: TestLegalScope, documents: TestLegalDocuments, requestId: string) {
  const result = await rpc<PlatformResult>("set_platform_terms_test_publication", {
    input_restaurant_id: scope.restaurantId,
    input_action: "PUBLISH_TEST",
    input_version: documents.platform.version,
    input_body: documents.platform.body,
    input_provider_snapshot: documents.platform.providerSnapshot,
    input_expected_previous_id: null,
    input_request_id: requestId,
  });
  if (!result?.id || result.action !== "PUBLISH_TEST"
    || (result.idempotent === false && (result.version !== documents.platform.version
      || result.test_session_id !== scope.testSessionId))
    || result.sha256 !== documents.platform.sha256
    || typeof result.idempotent !== "boolean") throw new Error("TEST_ONLY_PLATFORM_RECEIPT_CONFLICT");
  return result;
}

export async function publishTestMerchantBundle(scope: TestLegalScope, documents: TestLegalDocuments, requestId: string) {
  if (scope.merchantStatus !== "NOT_FOUND") throw new Error("AT_LEGAL_TEST_EXPECTED_STATE_MISMATCH");
  const result = await rpc<MerchantResult>("set_platform_at_legal_synthetic_test_publication", {
    input_restaurant_id: scope.restaurantId,
    input_action: "PUBLISH_TEST",
    input_manifest: documents.manifest,
    input_expected_status: "NOT_FOUND",
    input_expected_previous_hash: null,
    input_request_id: requestId,
  });
  if (!result?.event_id || result.status !== "PUBLISHED_TEST" || result.test_only !== true
    || !result.bundle_id?.startsWith("at-test-") || result.bundle_hash !== result.bundle_id.slice(8)
    || typeof result.idempotent !== "boolean") throw new Error("TEST_ONLY_BUNDLE_RECEIPT_CONFLICT");
  const status = await rpc<SyntheticStatus>("get_platform_at_legal_synthetic_test_status", {
    input_restaurant_id: scope.restaurantId,
  });
  if (status.restaurant_id !== scope.restaurantId || status.status !== "PUBLISHED_TEST"
    || status.test_only !== true || status.real_intake_opened !== false
    || status.bundle_id !== result.bundle_id || status.bundle_hash !== result.bundle_hash
    || Object.entries(documents.manifest).some(([area, item]) =>
      area === "legal" || area === "privacy" || area === "document_catalog" || area === "retention"
        ? status.areas?.[area]?.version !== (item as { version: string }).version
          || status.areas?.[area]?.sha256 !== (item as { sha256: string }).sha256
          || status.areas?.[area]?.status !== "VERIFIED_TEST_ONLY"
        : false)) {
    throw new Error("TEST_ONLY_BUNDLE_READBACK_CONFLICT");
  }
  return result;
}

export async function readTestMerchantPublicationReceipt(scope: TestLegalScope, requestId: string) {
  const receipt = await rpc<{ found: boolean; operation?: string; event_id?: string;
    bundle_id?: string; bundle_hash?: string; test_only?: boolean }>(
    "get_platform_at_legal_synthetic_test_receipt", { input_request_id: requestId },
  );
  if (receipt?.found !== true) return { found: false as const };
  const status = await rpc<SyntheticStatus>("get_platform_at_legal_synthetic_test_status", {
    input_restaurant_id: scope.restaurantId,
  });
  if (receipt.operation !== "PUBLISH_TEST" || !receipt.event_id || receipt.test_only !== true
    || status.restaurant_id !== scope.restaurantId || status.status !== "PUBLISHED_TEST"
    || status.real_intake_opened !== false || status.test_only !== true
    || receipt.bundle_id !== status.bundle_id || receipt.bundle_hash !== status.bundle_hash) {
    throw new Error("TEST_ONLY_BUNDLE_RECEIPT_CONFLICT");
  }
  return { found: true as const, bundleId: receipt.bundle_id, bundleHash: receipt.bundle_hash };
}
