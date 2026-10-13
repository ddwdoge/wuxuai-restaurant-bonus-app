import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL(
  "../supabase/migrations/20261012230846_test_only_basic_qr_pin_points_ui_contract.sql",
  import.meta.url,
), "utf8");
const service = await readFile(new URL(
  "../src/modules/verification/testOnlyBasicFlowService.ts",
  import.meta.url,
), "utf8");
const ownerPage = await readFile(new URL(
  "../src/modules/verification/TestOnlyBasicQrPointsPage.tsx",
  import.meta.url,
), "utf8");
const customerPage = await readFile(new URL(
  "../src/modules/customer/CustomerTestOnlyBasicPage.tsx",
  import.meta.url,
), "utf8");
const qrCenter = await readFile(new URL(
  "../src/modules/admin/pages/QrCenterPage.tsx",
  import.meta.url,
), "utf8");
const app = await readFile(new URL("../src/app/App.tsx", import.meta.url), "utf8");

function functionBody(name) {
  return migration.match(new RegExp(
    `create or replace function public\\.${name}\\([\\s\\S]*?\\$function\\$;`,
  ))?.[0] ?? "";
}

test("ordinary pending QR, PIN, points and offer reads remain real-only", () => {
  for (const name of [
    "create_customer_points_credit_qr",
    "get_today_restaurant_pin",
    "preview_restaurant_controlled_points",
    "confirm_restaurant_controlled_points",
    "get_public_restaurant_offers",
  ]) {
    const body = functionBody(name);
    assert.ok(body, `${name} missing`);
    assert.doesNotMatch(body, /test_only_basic_access_active_internal|begin_test_only_basic_operation_internal/);
  }
  assert.match(functionBody("create_customer_points_credit_qr"), /status = 'active'/);
  assert.match(functionBody("get_today_restaurant_pin"), /require_restaurant_operational/);
  assert.match(functionBody("preview_restaurant_controlled_points"), /require_restaurant_operational/);
  assert.match(functionBody("confirm_restaurant_controlled_points"), /require_restaurant_operational/);
  assert.match(functionBody("get_public_restaurant_offers"), /restaurant\.status = 'active'/);
});

test("dedicated TEST_ONLY wrappers require runtime binding, actor binding and active tenant scope", () => {
  for (const name of [
    "get_test_only_basic_customer_flow",
    "create_test_only_basic_customer_points_qr",
    "get_test_only_basic_today_restaurant_pin",
    "preview_test_only_basic_points",
    "confirm_test_only_basic_points",
  ]) {
    const body = migration.match(new RegExp(`create function public\\.${name}\\([\\s\\S]*?\\$function\\$;`))?.[0] ?? "";
    assert.ok(body, `${name} missing`);
    assert.match(body, /project_bootstrap\.require_runtime_binding\(true\)/);
  }
  assert.match(migration, /test_only_basic_customer_authorized_internal\(restaurant_record\.id\)/);
  assert.match(migration, /customer\.id = \(snapshot_value->>'customer_id'\)::uuid/);
  assert.match(migration, /ensure_today_restaurant_pin\([\s\S]*?\(snapshot_value->>'branch_id'\)::uuid/);
  assert.match(migration, /begin_test_only_basic_operation_internal\([\s\S]*?'CUSTOMER_POINTS_QR'/);
  assert.match(migration, /begin_test_only_basic_operation_internal\(input_restaurant_id, 'DAILY_PIN'\)/);
  assert.match(migration, /begin_test_only_basic_operation_internal\(input_restaurant_id, 'POINTS_PREVIEW'\)/);
  assert.match(migration, /begin_test_only_basic_operation_internal\(input_restaurant_id, 'POINTS_CONFIRM'\)/);
  assert.match(migration, /'test-only-basic:' \|\| input_restaurant_id::text/);
  assert.match(migration, /test_only_basic_offer_publication_receipts/);
});

test("least privilege exposes only dedicated RPCs to authenticated", () => {
  for (const signature of [
    "get_test_only_basic_customer_flow\\(text\\)",
    "create_test_only_basic_customer_points_qr\\(uuid, uuid\\)",
    "get_test_only_basic_today_restaurant_pin\\(uuid, uuid\\)",
    "preview_test_only_basic_points\\(uuid, text, integer, uuid\\)",
    "confirm_test_only_basic_points\\(uuid, text, integer, text, uuid\\)",
  ]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${signature}[\\s\\S]*?service_role`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${signature}[\\s\\S]*?to authenticated`));
  }
  assert.doesNotMatch(migration, /grant\s+(?:select|insert|update|delete)\s+on/i);
});

test("synthetic points stay idempotent and preserve real negative gates", () => {
  assert.match(migration, /confirm_test_only_basic_points_internal/);
  assert.match(migration, /input_idempotency_key/);
  assert.match(migration, /TEST_ONLY_BASIC_CUSTOMER_QR_CREATED/);
  assert.match(migration, /TEST_ONLY_BASIC_DAILY_PIN_READ/);
  assert.match(migration, /TEST_ONLY_BASIC_POINTS_PREVIEWED/);
  assert.match(migration, /'real_activation', false/);
  assert.match(migration, /'real_trial', false/);
  assert.match(migration, /'real_entitlement', false/);
  assert.match(migration, /'catalog_access', false/);
  assert.doesNotMatch(migration, /activate_v1_manual_basic_trial|stripe|enqueue_customer_transactional_email|cron\.schedule/i);
});

test("owner and guest UI call only the dedicated TEST_ONLY service", () => {
  assert.match(qrCenter, /isPendingActivation\(activeRestaurant\)[\s\S]*?<TestOnlyBasicQrPointsPage/);
  assert.match(app, /\/customer\/test-only-basic\/:slug/);
  assert.match(ownerPage, /previewTestOnlyBasicPoints/);
  assert.match(ownerPage, /confirmTestOnlyBasicPoints/);
  assert.match(ownerPage, /readTestOnlyBasicTodayPin/);
  assert.match(customerPage, /createTestOnlyBasicCustomerQr/);
  assert.match(customerPage, /readTestOnlyBasicCustomerFlow/);
  for (const realRpc of [
    "create_customer_points_credit_qr",
    "get_today_restaurant_pin",
    "preview_restaurant_controlled_points",
    "confirm_restaurant_controlled_points",
  ]) {
    assert.doesNotMatch(service, new RegExp(`\\.rpc\\(\"${realRpc}\"`));
  }
});
