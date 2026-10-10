import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import {
  canShowPlatformTestCollectionControl,
  classifyPlatformTestCollectionReceipt,
  platformTestCollectionTransition,
  platformTestControlEnvironmentEnabled,
} from "../src/modules/platform/platformTestCollectionModeContract.mjs";

const component = readFileSync(new URL("../src/modules/platform/PlatformTestCollectionModeControl.tsx", import.meta.url), "utf8");
const controlContract = readFileSync(new URL("../src/modules/platform/platformTestCollectionModeContract.mjs", import.meta.url), "utf8");
const serviceSource = readFileSync(new URL("../src/modules/platform/platformAdminService.ts", import.meta.url), "utf8");
const controlCenter = readFileSync(new URL("../src/modules/platform/PlatformRestaurantControlCenter.tsx", import.meta.url), "utf8");
const envExample = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const joinPage = readFileSync(new URL("../src/modules/customer/CustomerTestOnlyJoinPage.tsx", import.meta.url), "utf8");
const operatorPage = readFileSync(new URL("../src/modules/customer/CustomerActiveOperatorLegalTestPage.tsx", import.meta.url), "utf8");
const bindingMigration = readFileSync(new URL("../supabase/migrations/20261009190125_project_binding_runtime_guards.sql", import.meta.url), "utf8");

test("feature flag is fail-closed to the exact v2 host and project binding", () => {
  const valid = {
    featureFlag: "true",
    expectedProjectRef: "mbgveqbhessaunrhfudm",
    supabaseUrl: "https://mbgveqbhessaunrhfudm.supabase.co",
    appOrigin: "https://staging-v2.bonus.wuxuaisbi.com",
    runtimeOrigin: "https://staging-v2.bonus.wuxuaisbi.com",
  };
  assert.equal(platformTestControlEnvironmentEnabled(valid), true);
  for (const change of [
    { featureFlag: "false" }, { featureFlag: undefined },
    { expectedProjectRef: "" }, { expectedProjectRef: "foreign" }, { supabaseUrl: "https://foreign.supabase.co" },
    { appOrigin: "https://app.bonus.wuxuaisbi.com" }, { runtimeOrigin: "https://app.bonus.wuxuaisbi.com" },
    { runtimeOrigin: "http://staging-v2.bonus.wuxuaisbi.com" },
  ]) assert.equal(platformTestControlEnvironmentEnabled({ ...valid, ...change }), false);
  assert.match(envExample, /VITE_PLATFORM_TEST_CONTROL_ENABLED=false/);
  assert.match(envExample, /VITE_PLATFORM_TEST_CONTROL_PROJECT_REF=staging-project-ref/);
});

test("both Customer TEST_ONLY routes use the exact UI tuple and retain server binding checks", () => {
  for (const page of [joinPage, operatorPage]) {
    assert.match(page, /platformTestControlEnvironmentEnabled\(/);
    assert.match(page, /runtimeOrigin: window\.location\.origin/);
    assert.match(page, /appOrigin: import\.meta\.env\.VITE_APP_BASE_URL/);
    assert.doesNotMatch(page, /staging-app\.bonus\.wuxuaisbi\.com|bwhvfjuwixgwduoeqaya/);
  }
  assert.match(bindingMigration, /public\.project_binding_session_matches\(\)/);
  assert.match(bindingMigration, /require_platform_test_only_join_scope_internal/);
  assert.match(bindingMigration, /require_active_operator_test_legal_customer_internal/);
});

test("visibility requires strict Platform role, AAL2, verified TOTP and exact TEST_ONLY", () => {
  const valid = { environmentEnabled: true, platformRole: "platform_admin", aal2: true, verifiedTotp: true, exactTestOnlyTenant: true };
  assert.equal(canShowPlatformTestCollectionControl(valid), true);
  assert.equal(canShowPlatformTestCollectionControl({ ...valid, platformRole: "platform_owner" }), true);
  for (const role of ["owner", "manager", "staff", "customer", "app_admin", null]) {
    assert.equal(canShowPlatformTestCollectionControl({ ...valid, platformRole: role }), false);
  }
  for (const change of [{ environmentEnabled: false }, { aal2: false }, { verifiedTotp: false }, { exactTestOnlyTenant: false }]) {
    assert.equal(canShowPlatformTestCollectionControl({ ...valid, ...change }), false);
  }
});

test("only the two Migration-190 transitions can produce an action", () => {
  assert.deepEqual(platformTestCollectionTransition("restaurant_controlled_only"), {
    currentMode: "restaurant_controlled_only", targetMode: "both", label: "Temporär auf both umstellen",
  });
  assert.deepEqual(platformTestCollectionTransition("both"), {
    currentMode: "both", targetMode: "restaurant_controlled_only", label: "Ausgangsmodus wiederherstellen",
  });
  for (const mode of [null, "customer_initiated_only", "unknown"]) assert.equal(platformTestCollectionTransition(mode), null);
});

test("all four transport recovery states are deterministic and fail closed", () => {
  const base = { found: true, tenant_id: "tenant", action_code: "TEST_ONLY_PRO_REWARD_FLOW", previous_mode: "restaurant_controlled_only", new_mode: "both", status: "COMPLETED", current_collection_mode: "both" };
  assert.equal(classifyPlatformTestCollectionReceipt(base, "restaurant_controlled_only", "both").status, "committed");
  assert.equal(classifyPlatformTestCollectionReceipt({ found: false, tenant_id: "tenant", current_collection_mode: "restaurant_controlled_only" }, "restaurant_controlled_only", "both").status, "not_committed");
  assert.equal(classifyPlatformTestCollectionReceipt({ found: false, tenant_id: "tenant", current_collection_mode: "both" }, "restaurant_controlled_only", "both").status, "unclear");
  for (const change of [{ new_mode: "restaurant_controlled_only" }, { action_code: "OTHER" }, { status: "FAILED" }, { current_collection_mode: "restaurant_controlled_only" }]) {
    assert.equal(classifyPlatformTestCollectionReceipt({ ...base, ...change }, "restaurant_controlled_only", "both").status, "security_conflict");
  }
});

const require = createRequire(import.meta.url);
function compileService(supabase) {
  const { outputText } = ts.transpileModule(serviceSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const exports = {};
  vm.runInNewContext(outputText, { exports, require: (name) => name === "../../shared/lib/supabase" ? { supabase } : require(name), crypto });
  return exports;
}

test("service resolves TEST_ONLY and current mode through existing server reads only", async () => {
  const calls = [];
  const supabase = { rpc: async (name, args) => {
    calls.push({ name, args });
    if (name === "get_platform_pro_test_only_businesses") return { data: { items: [{ restaurant_id: "tenant" }], total: 1, limit: 50, offset: 0 }, error: null };
    if (name === "get_public_points_collection_mode") return { data: "restaurant_controlled_only", error: null };
    throw new Error(`unexpected ${name}`);
  } };
  const service = compileService(supabase);
  const result = await service.loadPlatformTestCollectionControlContext({ restaurantId: "tenant", restaurantName: "Wuxuai test only", restaurantSlug: "wuxuai-test-only" });
  assert.deepEqual({ ...result }, { exactTestOnlyTenant: true, currentMode: "restaurant_controlled_only" });
  assert.deepEqual(calls.map((call) => call.name).sort(), ["get_platform_pro_test_only_businesses", "get_public_points_collection_mode"].sort());
});

test("one mutation attempt is followed by one actor-bound receipt readback with the same key", async () => {
  const calls = [];
  const supabase = { rpc: async (name, args) => {
    calls.push({ name, args });
    if (name === "set_platform_test_collection_mode") return { data: null, error: new Error("transport unknown") };
    if (name === "get_platform_test_collection_mode_receipt") return { data: { found: false, tenant_id: "tenant", current_collection_mode: "restaurant_controlled_only" }, error: null };
    throw new Error(`unexpected ${name}`);
  } };
  const service = compileService(supabase);
  const result = await service.mutateAndConfirmPlatformTestCollectionMode({ restaurantId: "tenant", expectedMode: "restaurant_controlled_only", targetMode: "both", idempotencyKey: "request-key" });
  assert.equal(result.mutationAccepted, false);
  assert.deepEqual(calls.map((call) => call.name), ["set_platform_test_collection_mode", "get_platform_test_collection_mode_receipt"]);
  assert.equal(calls[0].args.input_idempotency_key, "request-key");
  assert.equal(calls[1].args.input_idempotency_key, "request-key");
  assert.equal(calls[0].args.input_action_code, "TEST_ONLY_PRO_REWARD_FLOW");
});

test("component keeps operation identity stable, blocks double-click and never logs secrets", () => {
  assert.match(component, /idempotencyKey: crypto\.randomUUID\(\)/);
  assert.match(component, /inFlight\.current/);
  assert.match(component, /if \(!operation \|\| locked \|\| busy \|\| inFlight\.current/);
  assert.match(component, /refreshPlatformTestCollectionRecentTotp[\s\S]*mutateAndConfirmPlatformTestCollectionMode/);
  assert.match(component, /Es erfolgt keine automatische Wiederholung/);
  assert.doesNotMatch(component, /console\.|localStorage|sessionStorage/);
  assert.doesNotMatch(serviceSource, /platform_test_collection_mode_audit/);
  assert.doesNotMatch(serviceSource, /service_role/);
});

test("German control copy, confirmation impact and responsive 44px targets are wired into tenant detail", () => {
  for (const copy of ["TEST_ONLY Punkte-Sammelmodus", "append-only Auditbeleg", "Punkte-, Belohnungs- und Abrechnungsdaten werden nicht verändert", "Aktueller sechsstelliger TOTP-Code"]) {
    assert.match(component, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const copy of ["Temporär auf both umstellen", "Ausgangsmodus wiederherstellen"]) {
    assert.match(controlContract, new RegExp(copy));
  }
  assert.match(controlCenter, /<PlatformTestCollectionModeControl restaurant=/);
  assert.match(styles, /\.platform-test-collection-control[\s\S]*min-width: 0/);
  assert.match(styles, /\.platform-test-collection-control \.button,[\s\S]*min-height: 44px/);
  assert.match(styles, /@media \(max-width: 430px\)[\s\S]*\.platform-test-collection-actions > \.button[\s\S]*width: 100%/);
});
