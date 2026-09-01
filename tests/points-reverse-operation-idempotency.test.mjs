import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const repair = readFileSync(
  new URL("../supabase/migrations/20260803002000_scope_reverse_idempotency_by_operation.sql", import.meta.url),
  "utf8",
);
const earnHardening = readFileSync(
  new URL("../supabase/migrations/20260803001000_harden_points_idempotency_receipts_and_dml.sql", import.meta.url),
  "utf8",
);

const normalizeReason = (value) => value.trim().replace(/\s+/g, " ");
const reverseFingerprint = ({ restaurantId, transactionId, reason }) => createHash("sha256")
  .update(JSON.stringify({
    restaurant_id: restaurantId,
    operation_type: "reverse",
    original_transaction_id: transactionId,
    reason: normalizeReason(reason),
  }))
  .digest("hex");

test("ledger idempotency is scoped by earn and reverse operation", () => {
  assert.match(repair, /points_transactions_restaurant_operation_idempotency_idx/);
  assert.match(repair, /when type = 'earn' then 'earn'/);
  assert.match(repair, /reversal_of is not null or collection_source = 'reversal' then 'reverse'/);
  assert.match(repair, /drop index if exists public\.points_transactions_restaurant_idempotency_idx/);
});

test("reverse uses a separate tenant-scoped claim table", () => {
  assert.match(repair, /create table if not exists public\.points_reverse_idempotency_claims/);
  assert.match(repair, /primary key \(restaurant_id, idempotency_key\)/);
  assert.match(repair, /original_transaction_id uuid not null/);
});

test("reverse claims retain RLS and expose no browser table rights", () => {
  assert.match(repair, /points_reverse_idempotency_claims enable row level security/);
  assert.match(repair, /revoke all on table public\.points_reverse_idempotency_claims from anon, authenticated/);
  assert.doesNotMatch(repair, /disable row level security|create policy/);
});

test("Earn retry contract remains unchanged", () => {
  assert.match(earnHardening, /existing_claim\.status = 'completed'[\s\S]*return existing_claim\.result_payload/);
  assert.match(earnHardening, /'restaurant_controlled_earn'/);
  assert.doesNotMatch(repair, /create or replace function public\.confirm_restaurant_controlled_points/);
  assert.doesNotMatch(repair, /create or replace function public\.collect_bonus_points_v1/);
});

test("Reverse retry returns the stored result", () => {
  assert.match(repair, /existing_claim\.status = 'completed'[\s\S]*return existing_claim\.result_payload/);
  assert.match(repair, /result_payload = response_payload/);
});

test("Earn and reverse may safely reuse the same client key", () => {
  assert.match(repair, /points-reverse-idempotency:/);
  assert.doesNotMatch(repair, /from public\.points_idempotency_claims/);
  assert.match(repair, /collection_source, staff_user_id, reversal_of/);
});

test("Earn and reverse with different keys remain valid", () => {
  assert.match(repair, /where pric\.restaurant_id = input_restaurant_id[\s\S]*pric\.idempotency_key = input_idempotency_key/);
  assert.match(repair, /where pt\.reversal_of = original\.id/);
});

test("Reverse payload fingerprint binds tenant transaction and normalized reason", () => {
  const helper = repair.match(/create or replace function public\.compute_points_reverse_fingerprint_v1[\s\S]*?revoke execute/)?.[0] ?? "";
  for (const field of ["restaurant_id", "operation_type", "original_transaction_id", "reason"]) {
    assert.match(helper, new RegExp(`'${field}'`));
  }
  assert.match(helper, /extensions\.digest[\s\S]*'sha256'[\s\S]*'hex'/);
});

test("Reverse payload mismatch has the stable controlled error", () => {
  assert.match(repair, /existing_claim\.original_transaction_id <> input_transaction_id[\s\S]*IDEMPOTENCY_KEY_PAYLOAD_MISMATCH/);
  assert.match(repair, /existing_claim\.payload_fingerprint <> request_fingerprint_value/);
  assert.match(repair, /historical_fingerprint <> request_fingerprint_value[\s\S]*IDEMPOTENCY_KEY_PAYLOAD_MISMATCH/);
});

test("identical reverse payload fingerprints match and changed payloads differ", () => {
  const base = { restaurantId: "r1", transactionId: "t1", reason: " Korrektur   Bon " };
  assert.equal(reverseFingerprint(base), reverseFingerprint({ ...base, reason: "Korrektur Bon" }));
  assert.notEqual(reverseFingerprint(base), reverseFingerprint({ ...base, transactionId: "t2" }));
  assert.notEqual(reverseFingerprint(base), reverseFingerprint({ ...base, reason: "Andere Korrektur" }));
});

test("parallel reverse retries serialize before claim inspection", () => {
  const lock = repair.indexOf("'points-reverse-idempotency:'");
  const claim = repair.indexOf("from public.points_reverse_idempotency_claims", lock);
  const originalLock = repair.indexOf("for update;", claim + 1);
  assert.ok(lock > 0 && claim > lock && originalLock > claim);
});

test("parallel earn and reverse use distinct lock namespaces", () => {
  assert.match(earnHardening, /'points-idempotency:' \|\| input_restaurant_id/);
  assert.match(repair, /'points-reverse-idempotency:' \|\| input_restaurant_id/);
});

test("storno remains compensating and cannot create two reversals", () => {
  assert.match(repair, /set points_balance = greatest\(0, c\.points_balance - original\.points\)/);
  assert.match(repair, /where pt\.reversal_of = original\.id/);
  assert.match(repair, /'adjust', -original\.points/);
  assert.doesNotMatch(repair, /delete from public\.points_transactions/);
});

test("existing reversal is returned without another balance update", () => {
  const existing = repair.indexOf("if existing_reversal.id is not null then", repair.indexOf("for update;"));
  const balanceUpdate = repair.indexOf("update public.customers c", existing);
  const earlyReturn = repair.indexOf("return response_payload;", existing);
  assert.ok(existing > 0 && earlyReturn > existing && balanceUpdate > earlyReturn);
});

test("repair preserves receipt, Earn RLS and existing grants", () => {
  assert.doesNotMatch(repair, /points_transactions_unique_receipt_per_restaurant_idx/);
  assert.doesNotMatch(repair, /drop policy|alter policy|disable row level security/);
  assert.match(repair, /revoke execute on function public\.reverse_restaurant_controlled_points[\s\S]*from public, anon/);
  assert.match(repair, /grant execute on function public\.reverse_restaurant_controlled_points[\s\S]*to authenticated/);
});

test("security definer functions use fixed safe search paths", () => {
  assert.match(repair, /compute_points_reverse_fingerprint_v1[\s\S]*set search_path = public, extensions, pg_temp/);
  assert.match(repair, /reverse_restaurant_controlled_points[\s\S]*security definer[\s\S]*set search_path = public, extensions, pg_temp/);
  assert.doesNotMatch(repair, /service_role|input_daily_pin|input_qr_reference|input_customer_token/);
});
