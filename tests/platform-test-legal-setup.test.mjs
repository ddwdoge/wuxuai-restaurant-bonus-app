import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import {
  TEST_LEGAL_TEXT, TEST_LEGAL_VERSION, classifyTestLegalError, exactTestLegalScope,
  testLegalConfirmation, testLegalDocuments, validTestCustomerId,
} from "../src/modules/platform/platformTestLegalSetupContract.mjs";
import { platformTestControlEnvironmentEnabled } from "../src/modules/platform/platformTestCollectionModeContract.mjs";

const restaurant = "11111111-1111-4111-8111-111111111111";
const branch = "22222222-2222-4222-8222-222222222222";
const owner = "33333333-3333-4333-8333-333333333333";
const customer = "44444444-4444-4444-8444-444444444444";
const organization = "55555555-5555-4555-8555-555555555555";
const session = `test-tenant-${restaurant}`;
const preflight = {
  restaurant_id: restaurant, restaurant_name: "Synthetischer Testbetrieb",
  context: { restaurant_id: restaurant, organization_id: organization, owner_auth_user_id: owner,
    location_ids: [branch], country_codes: ["AT"], stored_plan: "BASIC" },
  registry_states: [{ state: "ACTIVE", deleted_at: null, restaurant_id: restaurant,
    organization_id: organization, owner_user_id: owner, test_session_id: session }],
};
const status = { restaurant_id: restaurant, status: "NOT_FOUND", bundle_id: null,
  bundle_hash: null, test_only: true, real_intake_opened: false };
const source = readFileSync(new URL("../src/modules/platform/platformTestLegalSetupService.ts", import.meta.url), "utf8");
const ui = readFileSync(new URL("../src/modules/platform/PlatformTestLegalSetupControl.tsx", import.meta.url), "utf8");
const center = readFileSync(new URL("../src/modules/platform/PlatformRestaurantControlCenter.tsx", import.meta.url), "utf8");
const m196 = readFileSync(new URL("../supabase/migrations/20261005105848_at_legal_synthetic_staging_attestation.sql", import.meta.url), "utf8");
const m198 = readFileSync(new URL("../supabase/migrations/20261005165839_platform_customer_account_acceptance.sql", import.meta.url), "utf8");
function serviceWithRpc(handler) {
  const exports = {};
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022 } }).outputText;
  const require = (name) => {
    if (name.includes("shared/lib/supabase")) return { supabase: { rpc: (rpcName, args) => ({
      abortSignal: async () => handler(rpcName, args),
    }) } };
    if (name.includes("platformAdminService")) return { loadPlatformTestTenantCleanupPreflight: async () => preflight };
    if (name.includes("platformTestLegalSetupContract")) return { exactTestLegalScope };
    throw new Error(`Unexpected dependency: ${name}`);
  };
  new Function("require", "exports", compiled)(require, exports);
  return exports;
}

test("only exact STAGING TEST_ONLY owner, tenant, branch and status scope is accepted", () => {
  const scoped = exactTestLegalScope(preflight, status, restaurant, preflight.restaurant_name);
  assert.equal(scoped.branchId, branch);
  assert.equal(scoped.testSessionId, session);
  for (const [candidate, result, id, name] of [
    [{ ...preflight, registry_states: [] }, status, restaurant, preflight.restaurant_name],
    [{ ...preflight, registry_states: [{ ...preflight.registry_states[0], state: "INACTIVE" }] }, status, restaurant, preflight.restaurant_name],
    [{ ...preflight, context: { ...preflight.context, owner_auth_user_id: customer } }, status, restaurant, preflight.restaurant_name],
    [{ ...preflight, context: { ...preflight.context, location_ids: [branch, customer] } }, status, restaurant, preflight.restaurant_name],
    [{ ...preflight, context: { ...preflight.context, country_codes: ["DE"] } }, status, restaurant, preflight.restaurant_name],
    [{ ...preflight, context: { ...preflight.context, stored_plan: "PRO" } }, status, restaurant, preflight.restaurant_name],
    [preflight, { ...status, real_intake_opened: true }, restaurant, preflight.restaurant_name],
    [preflight, status, customer, preflight.restaurant_name],
    [preflight, status, restaurant, "Fremder Betrieb"],
  ]) assert.equal(exactTestLegalScope(candidate, result, id, name), null);
});

test("synthetic documents are exact, independently hashed and never real legal approvals", async () => {
  const docs = await testLegalDocuments(restaurant);
  assert.equal(docs.platform.version, TEST_LEGAL_VERSION);
  for (const area of ["legal", "privacy", "document_catalog", "retention"]) {
    assert.equal(docs.manifest[area].status, "VERIFIED_TEST_ONLY");
    assert.equal(docs.manifest[area].version, TEST_LEGAL_VERSION);
    assert.match(docs.manifest[area].body, /^TEST ONLY:/);
    assert.match(docs.manifest[area].sha256, /^[0-9a-f]{64}$/);
    assert.notEqual(docs.manifest[area].sha256, docs.platform.sha256);
  }
  assert.match(TEST_LEGAL_TEXT.provider, /^TEST ONLY:/);
  assert.equal(validTestCustomerId(customer), true);
  assert.equal(validTestCustomerId("not-a-customer"), false);
  assert.equal(testLegalConfirmation("identity", exactTestLegalScope(preflight, status, restaurant, preflight.restaurant_name), customer),
    `TEST_ONLY:IDENTITY:${restaurant}:${customer}`);
});

test("production and unbound frontends cannot show the control", () => {
  const base = { featureFlag: "true", expectedProjectRef: "bwhvfjuwixgwduoeqaya",
    supabaseUrl: "https://bwhvfjuwixgwduoeqaya.supabase.co",
    hostname: "staging-app.bonus.wuxuaisbi.com", protocol: "https:" };
  assert.equal(platformTestControlEnvironmentEnabled(base), true);
  for (const changed of [
    { hostname: "app.bonus.wuxuaisbi.com" }, { protocol: "http:" }, { featureFlag: "false" },
    { supabaseUrl: "https://another.supabase.co" },
  ]) assert.equal(platformTestControlEnvironmentEnabled({ ...base, ...changed }), false);
});

test("existing protected RPCs gate MFA, tenant, identity, stale version and replay server-side", () => {
  assert.match(m196, /require_legal_bundle_admin_internal\(\)[\s\S]*require_at_legal_synthetic_scope_internal/);
  assert.match(m196, /runtime_environment is distinct from 'STAGING'/);
  assert.match(m196, /policy\.real_intake_status is distinct from 'BLOCKED'/);
  assert.match(m196, /policy\.test_only_intake_status is distinct from 'READY'/);
  assert.match(m196, /input_manifest->>'restaurant_id' is distinct from input_restaurant_id::text/);
  assert.match(m196, /input_expected_status is distinct from status_value/);
  assert.match(m196, /existing\.actor_id is distinct from auth\.uid\(\)/);
  assert.match(m198, /PLATFORM_TERMS_TEST_IDENTITY_NOT_ISOLATED/);
  assert.match(m198, /previous\.branch_id is distinct from branch_id_value/);
  assert.match(m198, /previous\.request_id is distinct from input_request_id/);
  assert.match(m198, /input_body not like 'TEST ONLY:%'/);
  assert.match(m198, /previous\.id is distinct from input_expected_previous_id/);
  for (const rpc of ["bind_platform_terms_test_identity", "set_platform_terms_test_publication"]) {
    assert.match(m198, new RegExp(`revoke all on function public\\.${rpc}\\([\\s\\S]*?to authenticated`));
  }
  assert.match(m196, /revoke all on table public\.at_legal_synthetic_test_publications,[\s\S]*service_role/);
  assert.match(m198, /revoke all on public\.platform_terms_test_publications from public, anon, authenticated, service_role/);
});

test("service binds only exact customer/branch/session receipt and rejects foreign identity", async () => {
  const scope = exactTestLegalScope(preflight, status, restaurant, preflight.restaurant_name);
  const requestId = "66666666-6666-4666-8666-666666666666";
  const service = serviceWithRpc(async (name, args) => {
    assert.equal(name, "bind_platform_terms_test_identity");
    assert.equal(args.input_auth_user_id, customer);
    return { data: { auth_user_id: customer, restaurant_id: restaurant,
      branch_id: branch, test_session_id: session, idempotent: false }, error: null };
  });
  assert.equal((await service.bindTestLegalCustomer(scope, customer, requestId)).branch_id, branch);
  const foreign = serviceWithRpc(async () => ({ data: { auth_user_id: owner, restaurant_id: restaurant,
    branch_id: branch, test_session_id: session, idempotent: false }, error: null }));
  await assert.rejects(foreign.bindTestLegalCustomer(scope, customer, requestId), /IDENTITY_RECEIPT_CONFLICT/);
});

test("platform publication accepts exact idempotent replay but rejects stale or wrong hash", async () => {
  const scope = exactTestLegalScope(preflight, status, restaurant, preflight.restaurant_name);
  const docs = await testLegalDocuments(restaurant);
  const requestId = "66666666-6666-4666-8666-666666666666";
  const replay = serviceWithRpc(async (name, args) => {
    assert.equal(name, "set_platform_terms_test_publication");
    assert.equal(args.input_expected_previous_id, null);
    assert.equal(args.input_body, docs.platform.body);
    return { data: { id: requestId, action: "PUBLISH_TEST", sha256: docs.platform.sha256,
      idempotent: true }, error: null };
  });
  assert.equal((await replay.publishTestPlatformTerms(scope, docs, requestId)).idempotent, true);
  const stale = serviceWithRpc(async () => ({ data: null,
    error: { message: "PLATFORM_TERMS_TEST_PUBLICATION_STALE" } }));
  await assert.rejects(stale.publishTestPlatformTerms(scope, docs, requestId),
    error => error.message === "PLATFORM_TERMS_TEST_PUBLICATION_STALE");
  const wrongHash = serviceWithRpc(async () => ({ data: { id: requestId, action: "PUBLISH_TEST",
    sha256: "0".repeat(64), idempotent: true }, error: null }));
  await assert.rejects(wrongHash.publishTestPlatformTerms(scope, docs, requestId), /RECEIPT_CONFLICT/);
});

test("merchant publication verifies all four returned document hashes and fail-closes on withdrawal", async () => {
  const scope = exactTestLegalScope(preflight, status, restaurant, preflight.restaurant_name);
  const docs = await testLegalDocuments(restaurant);
  const hash = "a".repeat(64);
  const areas = Object.fromEntries(["legal", "privacy", "document_catalog", "retention"]
    .map(area => [area, { version: docs.manifest[area].version,
      sha256: docs.manifest[area].sha256, status: "VERIFIED_TEST_ONLY" }]));
  const service = serviceWithRpc(async (name) => name === "set_platform_at_legal_synthetic_test_publication"
    ? { data: { event_id: customer, bundle_id: `at-test-${hash}`,
      bundle_hash: hash, status: "PUBLISHED_TEST", test_only: true, idempotent: false }, error: null }
    : { data: { ...status, status: "PUBLISHED_TEST", bundle_id: `at-test-${hash}`,
      bundle_hash: hash, areas }, error: null });
  assert.equal((await service.publishTestMerchantBundle(scope, docs, customer)).bundle_hash, hash);
  const withdrawn = serviceWithRpc(async (name) => name === "set_platform_at_legal_synthetic_test_publication"
    ? { data: { event_id: customer, bundle_id: `at-test-${hash}`,
      bundle_hash: hash, status: "PUBLISHED_TEST", test_only: true, idempotent: false }, error: null }
    : { data: { ...status, status: "WITHDRAWN_TEST", bundle_id: `at-test-${hash}`,
      bundle_hash: hash, areas }, error: null });
  await assert.rejects(withdrawn.publishTestMerchantBundle(scope, docs, customer), /READBACK_CONFLICT/);
});

test("UI uses only guarded RPCs, fresh TOTP, exact confirmation and explicit errors", () => {
  for (const rpc of ["bind_platform_terms_test_identity", "set_platform_terms_test_publication",
    "set_platform_at_legal_synthetic_test_publication", "get_platform_at_legal_synthetic_test_status"]) {
    assert.match(source, new RegExp(rpc));
  }
  assert.doesNotMatch(source, /\.from\(["'](?:platform_terms_test|at_legal_synthetic|platform_test_tenant_registry)/);
  assert.match(ui, /refreshPlatformTestCollectionRecentTotp\(factorId, totpCode\)/);
  assert.match(ui, /typedConfirmation !== operation\.confirmation/);
  assert.match(ui, /inFlight\.current/);
  assert.match(ui, /current\.branchId !== scope\.branchId/);
  assert.match(ui, /current\.testSessionId !== scope\.testSessionId/);
  assert.match(ui, /operation\.uncertain/);
  assert.match(ui, /role="alert"/);
  assert.match(center, /view === "system" \? <PlatformTestLegalSetupControl canWrite=\{permittedWrite\}/);
  assert.equal(classifyTestLegalError(new Error("RECENT_PLATFORM_TOTP_REQUIRED")).includes("Authenticator"), true);
  assert.equal(classifyTestLegalError(new Error("AT_LEGAL_TEST_EXPECTED_STATE_MISMATCH")).includes("Dokumentstand"), true);
});

test("service compiles without any local harness or machine-bound path", () => {
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022 } });
  assert.equal(compiled.diagnostics?.length ?? 0, 0);
  assert.doesNotMatch(source + ui, /\/Users\/|\.local\.mjs|service_role|SUPABASE_SERVICE_ROLE_KEY/);
});
