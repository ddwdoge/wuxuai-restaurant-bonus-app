export const TEST_LEGAL_VERSION = "TEST_ONLY_SETUP_20261006_V1";
export const TEST_LEGAL_SOURCE = "TEST_ONLY_SETUP_20261006";

export const TEST_LEGAL_TEXT = Object.freeze({
  platform: "TEST ONLY: Synthetische Plattformbedingungen für den isolierten Staging-Test. Keine reale Vertragsfreigabe und kein produktiver Kundenzugang.",
  legal: "TEST ONLY: Synthetische Teilnahmebedingungen des Testbetriebs. Nur für den isolierten Staging-Beitritt; keine echten Vorteile oder Forderungen.",
  privacy: "TEST ONLY: Synthetische Datenschutzinformation zum Testbetrieb. Es werden ausschließlich Testidentitäten und Testbelege verarbeitet.",
  document_catalog: "TEST ONLY: Synthetischer Dokumentkatalog für die technische Staging-Prüfung; keine reale AT-Veröffentlichung.",
  retention: "TEST ONLY: Synthetischer Aufbewahrungs-Prüftext für technische Staging-Tests; keine produktive Löschentscheidung.",
  provider: "TEST ONLY: Synthetischer Staging-Anbieter; keine reale Anbieter- oder Kanzleifreigabe.",
});

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hashPattern = /^[0-9a-f]{64}$/;

export function validTestCustomerId(value) {
  return uuidPattern.test(String(value ?? "").trim());
}

export function exactTestLegalScope(preflight, status, restaurantId, restaurantName) {
  const markerRows = preflight?.registry_states;
  const context = preflight?.context;
  const marker = Array.isArray(markerRows) && markerRows.length === 1 ? markerRows[0] : null;
  const branches = context?.location_ids;
  const countries = context?.country_codes;
  if (!marker || marker.state !== "ACTIVE" || marker.deleted_at != null
    || marker.restaurant_id !== restaurantId || preflight?.restaurant_id !== restaurantId
    || preflight?.restaurant_name !== restaurantName
    || marker.organization_id !== context?.organization_id
    || marker.owner_user_id !== context?.owner_auth_user_id
    || !marker.test_session_id || !String(marker.test_session_id).startsWith("test-tenant-")
    || !Array.isArray(branches) || branches.length !== 1 || !uuidPattern.test(branches[0])
    || !Array.isArray(countries) || countries.length !== 1 || countries[0] !== "AT"
    || context?.stored_plan !== "BASIC"
    || status?.restaurant_id !== restaurantId || status?.test_only !== true
    || status?.real_intake_opened !== false
    || !["NOT_FOUND", "PUBLISHED_TEST", "WITHDRAWN_TEST"].includes(status?.status)) return null;
  if (status.status === "NOT_FOUND" && (status.bundle_id != null || status.bundle_hash != null)) return null;
  if (status.status !== "NOT_FOUND" && (!String(status.bundle_id).startsWith("at-test-")
    || !hashPattern.test(String(status.bundle_hash)))) return null;
  return Object.freeze({ restaurantId, restaurantName, branchId: branches[0],
    organizationId: context.organization_id, testSessionId: marker.test_session_id,
    merchantStatus: status.status, bundleId: status.bundle_id ?? null,
    bundleHash: status.bundle_hash ?? null });
}

export async function sha256(text) {
  const bytes = new globalThis.TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function testLegalDocuments(restaurantId) {
  if (!uuidPattern.test(restaurantId)) throw new Error("TEST_ONLY_RESTAURANT_INVALID");
  const platformHash = await sha256(TEST_LEGAL_TEXT.platform);
  const areas = {};
  for (const area of ["legal", "privacy", "document_catalog", "retention"]) {
    areas[area] = { status: "VERIFIED_TEST_ONLY", version: TEST_LEGAL_VERSION,
      source: TEST_LEGAL_SOURCE, body: TEST_LEGAL_TEXT[area], sha256: await sha256(TEST_LEGAL_TEXT[area]) };
  }
  return Object.freeze({ platform: { version: TEST_LEGAL_VERSION, body: TEST_LEGAL_TEXT.platform,
    providerSnapshot: TEST_LEGAL_TEXT.provider, sha256: platformHash },
    manifest: { schema_version: "1", test_only: true, country: "AT", locale: "de-AT",
      restaurant_id: restaurantId, ...areas } });
}

export function testLegalConfirmation(step, scope, customerId = "") {
  const target = step === "identity" ? `${scope.restaurantId}:${customerId}`
    : `${scope.restaurantId}:${TEST_LEGAL_VERSION}`;
  return `TEST_ONLY:${step.toUpperCase()}:${target}`;
}

export function nextTestLegalSetupStep(scope, documents, readback) {
  if (!scope || !documents || !readback || readback.test_only !== true
    || readback.restaurant_id !== scope.restaurantId
    || readback.branch_id !== scope.branchId
    || readback.test_session_id !== scope.testSessionId) return null;
  const binding = readback.binding;
  const platform = readback.platform;
  if (binding && (binding.restaurant_id !== scope.restaurantId
    || binding.branch_id !== scope.branchId
    || binding.test_session_id !== scope.testSessionId
    || !uuidPattern.test(binding.auth_user_id))) return null;
  if (scope.merchantStatus !== "NOT_FOUND") return null;
  if (platform?.status === "NOT_FOUND" && platform.publication_id == null
    && platform.version == null && platform.sha256 == null) {
    return binding ? "platform" : "identity";
  }
  if (binding && platform?.status === "PUBLISHED_TEST"
    && platform.version === documents.platform.version
    && platform.sha256 === documents.platform.sha256
    && typeof platform.publication_id === "string") return "merchant";
  return null;
}

export function classifyTestLegalError(error) {
  const code = String(error?.message ?? error ?? "");
  if (/RECENT_PLATFORM_TOTP_REQUIRED|MFA|TOTP/.test(code)) return "Der frische Authenticator-Nachweis fehlt oder ist abgelaufen. Es wurde nichts freigegeben.";
  if (/AT_LEGAL_TEST_SCOPE_DENIED|STAGING_REQUIRED|TEST_TENANT|ACCESS_DENIED/.test(code)) return "Dieser Betrieb ist nicht eindeutig für den isolierten Staging-Test freigegeben.";
  if (/IDENTITY_NOT_ISOLATED|IDENTITY_CONFLICT|IDENTITY_INVALID/.test(code)) return "Die Test-Gast-Identität ist nicht bestätigt oder bereits anderweitig gebunden.";
  if (/STALE|EXPECTED_STATE_MISMATCH|CONFLICT/.test(code)) return "Der Dokumentstand hat sich geändert. Bitte nicht erneut mit einer neuen Kennung ausführen.";
  return "Der Ausgang ist nicht sicher belegt. Es erfolgt keine automatische Wiederholung; denselben Vorgang gezielt prüfen.";
}
