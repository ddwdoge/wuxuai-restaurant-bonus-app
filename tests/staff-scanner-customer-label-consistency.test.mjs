import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260908007000_staff_scanner_customer_label_consistency.sql", import.meta.url),
  "utf8",
);
const staffPortal = readFileSync(new URL("../src/modules/staff/StaffTablet.tsx", import.meta.url), "utf8");

test("Staff preview returns the complete canonical tenant customer name", () => {
  assert.match(migration, /'customer_label', customer_record\.name/);
  assert.doesNotMatch(migration, /'customer_label', split_part\(customer_record\.name/);
  assert.match(staffPortal, /<h3>\{pointsPreview\.customer_label\}<\/h3>/);
});

test("multi-word names are not truncated to their first token", () => {
  assert.doesNotMatch(migration, /split_part\(customer_record\.name/);
  assert.doesNotMatch(migration, /string_to_array\(customer_record\.name/);
});

test("preview remains non-booking and does not consume the QR", () => {
  assert.doesNotMatch(migration, /insert into public\.points_transactions/);
  assert.doesNotMatch(migration, /update public\.customer_points_qr_references/);
  assert.doesNotMatch(migration, /set consumed_at/);
  assert.match(migration, /insert into public\.restaurant_points_credit_attempts[\s\S]*'previewed'/);
});

test("QR and tenant binding remain server-side", () => {
  assert.match(migration, /public\.is_restaurant_member\(input_restaurant_id\)/);
  assert.match(migration, /q\.restaurant_id = input_restaurant_id/);
  assert.match(migration, /q\.token_hash = hashed_reference or q\.manual_code_hash = hashed_reference/);
  assert.match(migration, /c\.restaurant_id = input_restaurant_id/);
  assert.match(migration, /c\.membership_status = 'active'/);
});

test("final booking remains outside preview and requires the existing Daily PIN flow", () => {
  assert.doesNotMatch(migration, /input_daily_pin/);
  assert.match(staffPortal, /confirmRestaurantControlledPoints\(\{ restaurantId, qrReference: pointsQrReference,/);
  assert.match(staffPortal, /amountCents: pointsPreview\.amount_cents, dailyPin, idempotencyKey/);
});
