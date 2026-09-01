import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260803003000_remove_receipts_from_v1_points_flow.sql", import.meta.url),
  "utf8",
);
const pointsMigration = readFileSync(
  new URL("../supabase/migrations/20260731001000_restaurant_controlled_points_collection.sql", import.meta.url),
  "utf8",
);
const hardeningMigration = readFileSync(
  new URL("../supabase/migrations/20260803001000_harden_points_idempotency_receipts_and_dml.sql", import.meta.url),
  "utf8",
);
const operationMigration = readFileSync(
  new URL("../supabase/migrations/20260803002000_scope_reverse_idempotency_by_operation.sql", import.meta.url),
  "utf8",
);
const service = readFileSync(new URL("../src/modules/loyalty/loyaltyService.ts", import.meta.url), "utf8");
const staff = readFileSync(new URL("../src/modules/staff/StaffTablet.tsx", import.meta.url), "utf8");
const customer = readFileSync(new URL("../src/modules/customer/CustomerPortal.tsx", import.meta.url), "utf8");
const settings = readFileSync(new URL("../src/modules/admin/pages/SettingsPage.tsx", import.meta.url), "utf8");

const activeEarnFingerprint = ({ restaurantId, customerId, source, amountCents, qrReferenceId, actionType, context }) => createHash("sha256")
  .update(JSON.stringify({ restaurantId, customerId, source, amountCents, qrReferenceId, actionType, context }))
  .digest("hex");

test("V1 removes the receipt uniqueness rule without deleting historical values", () => {
  assert.match(migration, /drop index if exists public\.points_transactions_unique_receipt_per_restaurant_idx/);
  assert.match(migration, /Legacy placeholder reserved for a future V3\/V4 POS integration/);
  assert.doesNotMatch(migration, /drop column|update public\.points_transactions[\s\S]*receipt_number|delete from public\.points_transactions/);
});

test("the active restaurant confirmation RPC has exactly five receipt-free inputs", () => {
  const active = migration.match(/create or replace function public\.confirm_restaurant_controlled_points\([\s\S]*?\n\)\nreturns jsonb/)?.[0] ?? "";
  assert.match(active, /input_restaurant_id uuid/);
  assert.match(active, /input_qr_reference text/);
  assert.match(active, /input_amount_cents integer/);
  assert.match(active, /input_daily_pin text/);
  assert.match(active, /input_idempotency_key uuid/);
  assert.doesNotMatch(active, /receipt|bon/i);
});

test("the historical six-argument contract is private and receives only NULL", () => {
  assert.match(migration, /rename to confirm_restaurant_controlled_points_with_legacy_receipt_v1/);
  assert.match(migration, /confirm_restaurant_controlled_points_with_legacy_receipt_v1\([\s\S]*?input_idempotency_key,[\s\S]*?null/);
  assert.match(migration, /revoke execute on function public\.confirm_restaurant_controlled_points_with_legacy_receipt_v1[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.confirm_restaurant_controlled_points\([\s\S]*uuid\n\) to authenticated/);
});

test("staff sends no receipt field and shows no receipt input", () => {
  const call = service.match(/confirmRestaurantControlledPoints[\s\S]*?return result;/)?.[0] ?? "";
  assert.doesNotMatch(call, /receipt|bon/i);
  assert.doesNotMatch(staff, /receiptNumber|controlled-receipt|Bonnummer/);
  assert.match(staff, /Hoher Betrag: Bitte den bezahlten Betrag sorgfältig prüfen\./);
});

test("customer and owner V1 surfaces contain no receipt-number contract", () => {
  assert.doesNotMatch(customer, /Bonnummer|receiptNumber|input_receipt_number/);
  assert.doesNotMatch(settings, /Bonnummer|receiptNumber|input_receipt_number/);
  assert.match(service, /collect_bonus_points_v1/);
  assert.doesNotMatch(
    service.match(/collectBonusPoints[\s\S]*?return data/)?.[0] ?? "",
    /receipt|bonnummer|input_receipt_number/i,
  );
});

test("receipt data cannot influence the active V1 fingerprint", () => {
  const base = {
    restaurantId: "r1", customerId: "c1", source: "restaurant_controlled",
    amountCents: 1200, qrReferenceId: "q1", actionType: "earn", context: "shared_points_v1",
  };
  assert.equal(activeEarnFingerprint(base), activeEarnFingerprint({ ...base, receiptNumber: "A" }));
  assert.notEqual(activeEarnFingerprint(base), activeEarnFingerprint({ ...base, amountCents: 1300 }));
  assert.notEqual(activeEarnFingerprint(base), activeEarnFingerprint({ ...base, customerId: "c2" }));
  assert.notEqual(activeEarnFingerprint(base), activeEarnFingerprint({ ...base, qrReferenceId: "q2" }));
});

test("QR single use five-minute validity and daily PIN remain server enforced", () => {
  assert.match(pointsMigration, /interval '5 minutes'/);
  assert.match(pointsMigration, /consumed_at = now\(\), consumed_transaction_id/);
  assert.match(pointsMigration, /for update/);
  assert.match(pointsMigration, /ensure_today_restaurant_pin/);
  assert.doesNotMatch(pointsMigration, /jsonb_build_object\([^)]*input_daily_pin/);
});

test("idempotency payload binding remains tenant customer amount QR and source scoped", () => {
  for (const field of ["restaurant_id", "customer_id", "collection_source", "amount_cents", "qr_reference_id", "action_type", "context"]) {
    assert.match(hardeningMigration, new RegExp(`'${field}'`));
  }
  assert.match(hardeningMigration, /IDEMPOTENCY_KEY_PAYLOAD_MISMATCH/);
  assert.match(hardeningMigration, /primary key \(restaurant_id, idempotency_key\)/);
});

test("parallel confirmation and rapid-repeat defenses do not depend on receipts", () => {
  assert.match(hardeningMigration, /points-idempotency:[\s\S]*input_restaurant_id[\s\S]*input_idempotency_key/);
  assert.match(pointsMigration, /interval '5 minutes'[\s\S]*>= 3/);
  assert.match(pointsMigration, /actor_user_id = auth\.uid\(\)[\s\S]*>= 30/);
});

test("direct browser ledger DML remains blocked", () => {
  assert.match(hardeningMigration, /revoke insert, update, delete, truncate, references, trigger[\s\S]*points_transactions from anon, authenticated/);
  assert.match(hardeningMigration, /drop policy if exists "points transactions admin insert"/);
  assert.doesNotMatch(migration, /grant (insert|update|delete)|disable row level security|create policy/i);
});

test("Earn and Reverse remain operation-specific and may share one client key", () => {
  assert.match(operationMigration, /when type = 'earn' then 'earn'/);
  assert.match(operationMigration, /reversal_of is not null or collection_source = 'reversal' then 'reverse'/);
  assert.match(operationMigration, /points-reverse-idempotency:/);
  assert.doesNotMatch(migration, /points_transactions_restaurant_idempotency_idx/);
});

test("Reverse fingerprint includes authorized role and no receipt data", () => {
  const helper = migration.match(/create or replace function public\.compute_points_reverse_fingerprint_v2[\s\S]*?revoke execute/)?.[0] ?? "";
  for (const field of ["restaurant_id", "operation_type", "original_transaction_id", "actor_role", "reason"]) {
    assert.match(helper, new RegExp(`'${field}'`));
  }
  assert.doesNotMatch(helper, /receipt|bon|daily_pin|access_token|refresh_token/i);
});

test("minimum maximum and mode protections remain untouched", () => {
  assert.match(pointsMigration, /between 100 and 100000/);
  assert.match(pointsMigration, /points_collection_max_amount_cents/);
  assert.match(pointsMigration, /restaurant_controlled_only/);
  assert.match(pointsMigration, /customer_initiated_only/);
  assert.match(pointsMigration, /both/);
});

test("the repair is additive and does not weaken RLS grants or history", () => {
  assert.doesNotMatch(migration, /drop table|drop column|disable row level security|alter policy/i);
  assert.doesNotMatch(migration, /service_role|input_customer_token|refresh_token/i);
  assert.match(migration, /set search_path = public, pg_temp/);
  assert.match(migration, /set search_path = public, extensions, pg_temp/);
});
