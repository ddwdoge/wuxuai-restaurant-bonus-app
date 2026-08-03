import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260803001000_harden_points_idempotency_receipts_and_dml.sql", import.meta.url),
  "utf8",
);
const engine = readFileSync(
  new URL("../supabase/migrations/20260801001000_shared_points_bonus_engine.sql", import.meta.url),
  "utf8",
);
const activeV1 = readFileSync(
  new URL("../supabase/migrations/20260803003000_remove_receipts_from_v1_points_flow.sql", import.meta.url),
  "utf8",
);

const canonicalReceipt = (value) => {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed.toUpperCase();
};
const fingerprint = (payload) => createHash("sha256")
  .update(JSON.stringify(payload))
  .digest("hex");

test("receipt normalization trims and uppercases", () => {
  assert.equal(canonicalReceipt("  bon-a12  "), "BON-A12");
});
test("empty receipt normalizes to null", () => {
  assert.equal(canonicalReceipt("   "), null);
  assert.equal(canonicalReceipt(null), null);
});
test("SQL receipt normalization is immutable and parallel safe", () => {
  assert.match(migration, /normalize_points_receipt_number_v1[\s\S]*immutable[\s\S]*parallel safe/);
});
test("receipt normalization helper is private to browser roles", () => {
  assert.match(migration, /revoke execute on function public\.normalize_points_receipt_number_v1\(text\)[\s\S]{0,80}public, anon, authenticated/);
});
test("migration blocks duplicate canonical legacy receipts", () => {
  assert.match(migration, /POINTS_RECEIPT_LEGACY_DUPLICATES/);
  assert.match(migration, /having count\(\*\) > 1/);
});
test("legacy missing sources are reported without rewriting rows", () => {
  assert.match(migration, /Existing earn rows without collection_source remain unchanged/);
  assert.doesNotMatch(migration, /update public\.points_transactions[\s\S]{0,100}collection_source/);
});
test("receipt uniqueness is restaurant scoped", () => {
  assert.match(migration, /unique index[\s\S]*\(\s*restaurant_id,[\s\S]*normalize_points_receipt_number_v1/);
});
test("receipt uniqueness applies only to nonempty earn receipts", () => {
  assert.match(migration, /where type = 'earn'[\s\S]*normalize_points_receipt_number_v1\(receipt_number\) is not null/);
});
test("same canonical receipt variants collide", () => {
  assert.equal(canonicalReceipt("Bon-77"), canonicalReceipt(" bon-77 "));
});
test("null receipts remain outside the unique receipt index", () => {
  assert.match(migration, /normalize_points_receipt_number_v1\(receipt_number\) is not null/);
});
test("receipt conflict returns controlled code", () => {
  assert.match(migration, /'error_code', 'RECEIPT_ALREADY_USED'/);
});
test("receipt conflict response is persisted idempotently", () => {
  assert.match(migration, /if response_payload->>'error_code' = 'RECEIPT_ALREADY_USED'[\s\S]*status = 'completed'/);
});
test("receipt lock is tenant scoped and precedes delegated confirmation", () => {
  const lock = migration.indexOf("'points-receipt:' || input_restaurant_id::text");
  const call = migration.indexOf("confirm_restaurant_controlled_points_before_security_guard(", lock);
  assert.ok(lock > 0 && call > lock);
});
test("receipt conflict subtransaction protects QR and points side effects", () => {
  assert.match(migration, /begin[\s\S]*confirm_restaurant_controlled_points_before_security_guard[\s\S]*exception[\s\S]*unique_violation/);
});

test("historical receipt hardening is explicitly superseded for the active V1 flow", () => {
  assert.match(activeV1, /drop index if exists public\.points_transactions_unique_receipt_per_restaurant_idx/);
  assert.match(activeV1, /rename to confirm_restaurant_controlled_points_with_legacy_receipt_v1/);
  assert.match(activeV1, /Legacy placeholder reserved for a future V3\/V4 POS integration/);
  assert.match(activeV1, /confirm_restaurant_controlled_points\([\s\S]*input_idempotency_key uuid\n\)/);
});

test("idempotency claims are keyed by restaurant and key", () => {
  assert.match(migration, /primary key \(restaurant_id, idempotency_key\)/);
});
test("idempotency claim table has RLS", () => {
  assert.match(migration, /points_idempotency_claims enable row level security/);
});
test("idempotency claim table exposes no browser table rights", () => {
  assert.match(migration, /revoke all on table public\.points_idempotency_claims from anon, authenticated/);
});
test("fingerprint is a SHA-256 hex digest", () => {
  assert.match(migration, /extensions\.digest[\s\S]*'sha256'[\s\S]*'hex'/);
  assert.match(migration, /\^\[0-9a-f\]\{64\}\$/);
});
test("fingerprint helper has fixed safe search path", () => {
  assert.match(migration, /compute_points_request_fingerprint_v1[\s\S]*set search_path = public, extensions, pg_temp/);
});
test("fingerprint excludes PINs and raw access tokens", () => {
  const helper = migration.match(/create or replace function public\.compute_points_request_fingerprint_v1[\s\S]*?revoke execute/)?.[0] ?? "";
  assert.doesNotMatch(helper, /daily_pin|customer_token|refresh_token|qr_reference text/);
});
test("fingerprint includes tenant customer source amount receipt QR action and context", () => {
  const helper = migration.match(/create or replace function public\.compute_points_request_fingerprint_v1[\s\S]*?revoke execute/)?.[0] ?? "";
  for (const field of ["restaurant_id", "customer_id", "collection_source", "amount_cents", "receipt_number", "qr_reference_id", "action_type", "context"]) {
    assert.match(helper, new RegExp(`'${field}'`));
  }
});
test("identical payload creates identical reference fingerprint", () => {
  const payload = { restaurant: "a", customer: "b", amount: 1000 };
  assert.equal(fingerprint(payload), fingerprint(payload));
});
test("changed amount changes reference fingerprint", () => {
  assert.notEqual(fingerprint({ amount: 1000 }), fingerprint({ amount: 1100 }));
});
test("changed customer changes reference fingerprint", () => {
  assert.notEqual(fingerprint({ customer: "a" }), fingerprint({ customer: "b" }));
});
test("changed receipt changes reference fingerprint", () => {
  assert.notEqual(fingerprint({ receipt: "A" }), fingerprint({ receipt: "B" }));
});
test("changed source changes reference fingerprint", () => {
  assert.notEqual(fingerprint({ source: "restaurant_controlled" }), fingerprint({ source: "customer_initiated" }));
});
test("changed QR changes reference fingerprint", () => {
  assert.notEqual(fingerprint({ qr: "a" }), fingerprint({ qr: "b" }));
});
test("staff mismatch is rejected before delegated confirmation", () => {
  const mismatch = migration.indexOf("IDEMPOTENCY_KEY_PAYLOAD_MISMATCH");
  const delegate = migration.indexOf("confirm_restaurant_controlled_points_before_security_guard(", mismatch);
  assert.ok(mismatch > 0 && delegate > mismatch);
});
test("identical completed staff retry returns stored result", () => {
  assert.match(migration, /existing_claim\.status = 'completed'[\s\S]*return existing_claim\.result_payload/);
});
test("parallel staff requests serialize on tenant-scoped advisory key", () => {
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\([\s\S]*points-idempotency:[\s\S]*input_restaurant_id[\s\S]*input_idempotency_key/);
});
test("successful staff transaction stores fingerprint and full result", () => {
  assert.match(migration, /set request_fingerprint = request_fingerprint_value[\s\S]*status = 'completed'[\s\S]*result_payload = response_payload/);
});
test("retryable staff failures release the key", () => {
  assert.match(migration, /Retryable validation and PIN failures[\s\S]*delete from public\.points_idempotency_claims/);
});
test("pre-migration staff transactions are payload checked before binding", () => {
  assert.match(migration, /Safely bind successful pre-migration transactions[\s\S]*historical_fingerprint[\s\S]*IDEMPOTENCY_KEY_PAYLOAD_MISMATCH/);
});
test("customer initiated mode uses the same claim contract", () => {
  assert.match(migration, /'customer_initiated_earn'/);
  assert.match(migration, /customer_initiated_collect_v2/);
});
test("customer tier key participates in request context", () => {
  assert.match(migration, /customer_initiated_collect_v2:' \|\| coalesce\(input_amount_tier_key/);
});
test("same key remains independent across restaurants", () => {
  assert.match(migration, /where pic\.restaurant_id = restaurant_record\.id[\s\S]*pic\.idempotency_key = input_idempotency_key/);
});

test("anon and authenticated direct ledger writes are revoked", () => {
  assert.match(migration, /revoke insert, update, delete, truncate, references, trigger[\s\S]*points_transactions from anon, authenticated/);
});
test("owner direct insert policy is removed", () => {
  assert.match(migration, /drop policy if exists "points transactions admin insert"/);
});
test("existing tenant select policy is not removed", () => {
  assert.doesNotMatch(migration, /drop policy[^;]*points transactions member select/);
});
test("new earn rows require an explicit allowed source", () => {
  assert.match(migration, /type <> 'earn'[\s\S]*collection_source is not null[\s\S]*restaurant_controlled[\s\S]*customer_initiated/);
});
test("earn source constraint is NOT VALID for untouched legacy rows", () => {
  assert.match(migration, /points_transactions_earn_source_check[\s\S]*\) not valid;/);
});
test("internal award helper remains browser-inaccessible", () => {
  assert.match(engine, /revoke execute on function public\.award_points_v1[\s\S]*public, anon, authenticated/);
});
test("private delegated staff and customer functions are browser-inaccessible", () => {
  assert.match(migration, /confirm_restaurant_controlled_points_before_security_guard[\s\S]*public, anon, authenticated/);
  assert.match(migration, /collect_bonus_points_v1_before_idempotency_guard[\s\S]*public, anon, authenticated/);
});
test("public staff confirmation remains authenticated-only", () => {
  assert.match(migration, /grant execute on function public\.confirm_restaurant_controlled_points[\s\S]{0,180}to authenticated/);
  assert.doesNotMatch(migration, /grant execute on function public\.confirm_restaurant_controlled_points[\s\S]{0,180}to anon/);
});
test("customer initiated contract remains available to anon and authenticated", () => {
  assert.match(migration, /grant execute on function public\.collect_bonus_points_v1[\s\S]{0,180}to anon, authenticated/);
});
test("minimum amount validator still runs before staff claim work", () => {
  const validator = migration.indexOf("validate_minimum_points_amount_v1(input_amount_cents)");
  const claim = migration.indexOf("insert into public.points_idempotency_claims", validator);
  assert.ok(validator > 0 && claim > validator);
});
test("maximum amount and daily PIN remain delegated to existing server contract", () => {
  assert.match(migration, /confirm_restaurant_controlled_points_before_security_guard/);
  assert.match(engine, /POINTS_AMOUNT_LIMIT_EXCEEDED/);
  assert.match(engine, /ensure_today_restaurant_pin/);
});
test("QR raw reference and PIN are never written to claim rows", () => {
  const inserts = [...migration.matchAll(/insert into public\.points_idempotency_claims \([\s\S]*?\);/g)].map((match) => match[0]).join("\n");
  assert.doesNotMatch(inserts, /input_qr_reference|input_daily_pin|input_customer_token/);
});
test("migration does not weaken RLS or alter historical migrations", () => {
  assert.doesNotMatch(migration, /disable row level security|alter policy|drop table|drop column/);
  assert.match(migration, /enable row level security/);
});
