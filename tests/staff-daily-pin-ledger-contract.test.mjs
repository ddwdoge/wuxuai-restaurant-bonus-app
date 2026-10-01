import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20261001001000_staff_daily_pin_ledger_contract.sql", import.meta.url), "utf8");
const service = readFileSync(new URL("../src/modules/loyalty/loyaltyService.ts", import.meta.url), "utf8");
const staff = readFileSync(new URL("../src/modules/staff/StaffTablet.tsx", import.meta.url), "utf8");

test("migration 189 keeps the canonical ledger constraints and historical rows intact", () => {
  assert.doesNotMatch(migration, /drop\s+constraint\s+(?:if\s+exists\s+)?points_transactions_earn_source_check/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.points_transactions/i);
  assert.doesNotMatch(migration, /update\s+public\.points_transactions[\s\S]{0,240}set[\s\S]{0,120}collection_source/i);
  assert.match(migration, /'customer_initiated'/);
  assert.doesNotMatch(migration, /'staff_portal'\s*,\s*input_amount_cents\s*,\s*'staff_portal'/);
});

test("the new RPC accepts integer cents and computes points only through the canonical server engine", () => {
  assert.match(migration, /apply_staff_daily_pin_loyalty_action_v2\([\s\S]*input_amount_cents integer/);
  assert.match(migration, /validate_minimum_points_amount_v1\(input_amount_cents\)/);
  assert.match(migration, /points_collection_max_amount_cents/);
  assert.match(migration, /public\.award_points_v1\([\s\S]*input_amount_cents[\s\S]*'customer_initiated'/);
  assert.doesNotMatch(migration, /input_points integer[\s\S]*apply_staff_daily_pin_loyalty_action_v2/);
});

test("staff, tenant, membership, PIN and active-role checks remain server-authoritative", () => {
  assert.match(migration, /auth\.uid\(\) is null/);
  assert.match(migration, /rm\.role in \('staff', 'supervisor'\)/);
  assert.match(migration, /sm\.account_status = 'active'/);
  assert.match(migration, /customer_account_memberships/);
  assert.match(migration, /c\.membership_status = 'active'/);
  assert.match(migration, /daily_pin_record\.pin_code <>/);
  assert.match(migration, /persist_daily_pin_rejection/);
});

test("payload-bound idempotency and concurrency use the existing canonical claim contract", () => {
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /compute_points_request_fingerprint_v1/);
  assert.match(migration, /IDEMPOTENCY_KEY_PAYLOAD_MISMATCH/);
  assert.match(migration, /points_idempotency_claims/);
  assert.match(migration, /points_collection_requests/);
});

test("ACL exposes only v2 to authenticated users and removes direct legacy helper execution", () => {
  assert.match(migration, /revoke all on function public\.apply_staff_daily_pin_loyalty_action_v2\([\s\S]*from public, anon, authenticated, service_role/);
  assert.match(migration, /grant execute on function public\.apply_staff_daily_pin_loyalty_action_v2\([\s\S]*to authenticated/);
  assert.match(migration, /revoke all on function public\.apply_staff_daily_pin_loyalty_action\([\s\S]*service_role/);
});

test("old amount and menu RPC paths fail closed while the existing stamp path remains available", () => {
  assert.match(migration, /if input_loyalty_mode = 'stamp_based'[\s\S]*apply_staff_daily_pin_loyalty_action/);
  assert.match(migration, /STAFF_POINTS_RPC_UPGRADE_REQUIRED/);
});

test("the browser sends exact cents to v2 and does not send a client points value", () => {
  const v2Call = service.match(/supabase\.rpc\("apply_staff_daily_pin_loyalty_action_v2"[\s\S]*?\}\)/)?.[0] ?? "";
  assert.match(v2Call, /input_amount_cents: validatedAmountCents/);
  assert.doesNotMatch(v2Call, /input_points|input_bill_amount/);
  assert.match(service, /Number\.isSafeInteger\(amountCents\)/);
  assert.match(staff, /amountCents: pointsAmountCents/);
  assert.doesNotMatch(staff, /amountCents: payload\.billAmount \? Math\.round/);
});
