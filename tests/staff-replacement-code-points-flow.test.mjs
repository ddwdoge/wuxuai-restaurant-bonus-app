import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const staffPortal = await readFile(new URL("../src/modules/staff/StaffTablet.tsx", import.meta.url), "utf8");
const qrContract = await readFile(new URL("../supabase/migrations/20260731001000_restaurant_controlled_points_collection.sql", import.meta.url), "utf8");
const sharedEngine = await readFile(new URL("../supabase/migrations/20260801001000_shared_points_bonus_engine.sql", import.meta.url), "utf8");
const labelFix = await readFile(new URL("../supabase/migrations/20260908007000_staff_scanner_customer_label_consistency.sql", import.meta.url), "utf8");

test("QR and replacement code are generated as one five-minute server-owned reference", () => {
  const creation = qrContract.match(/create or replace function public\.create_customer_points_credit_qr[\s\S]*?create or replace function public\.preview_restaurant_controlled_points/)?.[0] ?? "";
  assert.match(creation, /expiry_value timestamptz := now\(\) \+ interval '5 minutes'/);
  assert.match(creation, /raw_code := public\.generate_numeric_code\(8\)/);
  assert.match(creation, /token_hash, manual_code_hash, expires_at[\s\S]*hash_public_token\(raw_token\)[\s\S]*hash_public_token\(raw_code\), expiry_value/);
  assert.match(creation, /jsonb_build_object\('qr_token', raw_token, 'manual_code', raw_code, 'expires_at', expiry_value\)/);
  assert.doesNotMatch(creation, /insert into public\.customer_points_qr_references[\s\S]{0,400}'manual_code'/);
});

test("preview resolves QR and replacement code through the same tenant-bound context", () => {
  assert.match(labelFix, /is_restaurant_member\(input_restaurant_id\)/);
  assert.match(labelFix, /q\.restaurant_id = input_restaurant_id[\s\S]*q\.token_hash = hashed_reference or q\.manual_code_hash = hashed_reference/);
  assert.match(labelFix, /c\.id = qr_record\.customer_id[\s\S]*c\.restaurant_id = input_restaurant_id[\s\S]*c\.membership_status = 'active'/);
  assert.match(labelFix, /customer_label[\s\S]*points_balance[\s\S]*expires_at/);
  assert.match(labelFix, /restaurant_points_credit_attempts[\s\S]*interval '5 minutes'[\s\S]*>= 30/);
});

test("confirmation locks and consumes the shared reference exactly once", () => {
  const confirmation = sharedEngine.match(/create or replace function public\.confirm_restaurant_controlled_points\([\s\S]*?create or replace function public\.collect_bonus_points_v1/)?.[0] ?? "";
  assert.match(confirmation, /q\.restaurant_id = input_restaurant_id[\s\S]*q\.token_hash = hashed_reference or q\.manual_code_hash = hashed_reference[\s\S]*for update/);
  assert.match(confirmation, /c\.id = qr_record\.customer_id[\s\S]*c\.restaurant_id = input_restaurant_id[\s\S]*c\.membership_status = 'active'[\s\S]*for update/);
  assert.match(confirmation, /ensure_today_restaurant_pin\(input_restaurant_id, qr_record\.branch_id\)/);
  assert.match(confirmation, /award_points_v1\([\s\S]*qr_record\.branch_id[\s\S]*'restaurant_controlled'/);
  assert.match(confirmation, /set consumed_at = now\(\)[\s\S]*where q\.id = qr_record\.id and q\.consumed_at is null[\s\S]*if not found then raise exception 'QR-Code wurde bereits verwendet\.'/);
});

test("scanner routes QR and the 8-digit code into one preview/confirm flow", () => {
  assert.match(staffPortal, /activatePointsReference\(pointsReference, "qr"\)/);
  assert.match(staffPortal, /activatePointsReference\(pointsReference, "manual"\)/);
  assert.equal((staffPortal.match(/previewRestaurantControlledPoints\(/g) ?? []).length, 1);
  assert.equal((staffPortal.match(/confirmRestaurantControlledPoints\(/g) ?? []).length, 1);
  assert.match(staffPortal, /inputMode="numeric"/);
  assert.match(staffPortal, /staff\.drawer\.manualCodeInvalid/);
  assert.match(staffPortal, /scannerManualSubmitPendingRef\.current/);
});

test("name search cannot authorize a customer-id points write", () => {
  assert.match(staffPortal, /function selectCustomer\(customerId: string, nextView: StaffView = "search"\)/);
  assert.match(staffPortal, /Für eine Punktegutschrift bitte den persönlichen QR-Code scannen oder den aktuellen 8-stelligen Ersatzcode eingeben\./);
  assert.doesNotMatch(staffPortal, /applyStaffLoyaltyAction|apply_staff_daily_pin_loyalty_action_v2/);
  assert.doesNotMatch(staffPortal, /Punkte buchen|Stempel geben/);
});

test("FINAL-LOCK drawer minimize and cancellation contract remains intact", () => {
  assert.match(staffPortal, /dismissOnOverlay=\{hasActivePointsTask\}/);
  assert.match(staffPortal, /dismissOnEscape=\{!hasActivePointsTask\}/);
  assert.match(staffPortal, /function minimizeActivePointsTask[\s\S]*setPinDraft\(""\)[\s\S]*setPointsTaskMinimized\(true\)/);
  assert.match(staffPortal, /requestActivePointsTaskCancel/);
  assert.match(staffPortal, /cancelTaskPromptOpen/);
});
