import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260731001000_restaurant_controlled_points_collection.sql", import.meta.url), "utf8");
const sharedEngineMigration = readFileSync(new URL("../supabase/migrations/20260801001000_shared_points_bonus_engine.sql", import.meta.url), "utf8");
const service = readFileSync(new URL("../src/modules/loyalty/loyaltyService.ts", import.meta.url), "utf8");
const staff = readFileSync(new URL("../src/modules/staff/StaffTablet.tsx", import.meta.url), "utf8");
const customer = readFileSync(new URL("../src/modules/customer/CustomerPortal.tsx", import.meta.url), "utf8");
const settings = readFileSync(new URL("../src/modules/admin/pages/SettingsPage.tsx", import.meta.url), "utf8");

test("existing restaurants retain customer initiated mode and new rows default to restaurant controlled", () => {
  assert.match(migration, /set points_collection_mode = 'customer_initiated_only'[\s\S]*where points_collection_mode is null/);
  assert.match(migration, /set default 'restaurant_controlled_only'/);
  for (const mode of ["restaurant_controlled_only", "customer_initiated_only", "both"]) assert.match(migration, new RegExp(mode));
});

test("amount limits are enforced in cents on server and owner UI", () => {
  assert.match(migration, /set points_collection_max_amount_cents = 30000/);
  assert.match(migration, /between 100 and 100000/);
  assert.match(migration, /input_amount_cents > settings_record\.points_collection_max_amount_cents/);
  assert.match(settings, /Standard 300 EUR/);
  assert.match(settings, /max="1000" min="1"/);
});

test("customer QR is opaque, hashed, five minutes and single use", () => {
  assert.match(migration, /gen_random_bytes\(32\)/);
  assert.match(migration, /hash_public_token\(raw_token\)/);
  assert.match(migration, /interval '5 minutes'/);
  assert.match(migration, /for update/);
  assert.match(migration, /consumed_at = now\(\), consumed_transaction_id/);
  assert.doesNotMatch(migration, /insert into public\.customer_points_qr_references[\s\S]{0,300}input_customer_token/);
});

test("QR tables keep RLS and expose no direct client table rights", () => {
  assert.match(migration, /customer_points_qr_references enable row level security/);
  assert.match(migration, /revoke all on table public\.customer_points_qr_references from anon, authenticated/);
  assert.match(migration, /restaurant_points_credit_attempts enable row level security/);
});

test("security definer functions have fixed search paths and narrow grants", () => {
  const definerFunctions = [...migration.matchAll(
    /create or replace function public\.([^\s(]+)[\s\S]*?security definer set search_path = ([^\n]+) as \$\$/g,
  )];
  assert.equal(definerFunctions.length, 6);
  for (const [, functionName, searchPath] of definerFunctions) {
    assert.match(searchPath, /^public(?:, extensions)?, pg_temp$/, `${functionName} needs a fixed safe search_path`);
  }
  assert.match(migration, /revoke execute on function public\.confirm_restaurant_controlled_points[\s\S]*from public, anon/);
  assert.match(migration, /grant execute on function public\.confirm_restaurant_controlled_points[\s\S]*to authenticated/);
});

test("tenant and role checks are server side", () => {
  assert.match(migration, /is_restaurant_member\(input_restaurant_id\)/);
  assert.match(migration, /rm\.restaurant_id = input_restaurant_id[\s\S]*rm\.user_id = auth\.uid\(\)/);
  assert.match(migration, /q\.restaurant_id = input_restaurant_id/);
  assert.match(migration, /c\.restaurant_id = input_restaurant_id/);
});

test("idempotency and replay protection survive parallel requests", () => {
  assert.match(migration, /points_transactions_restaurant_idempotency_idx|idempotency_key = input_idempotency_key/);
  assert.match(migration, /where restaurant_id = input_restaurant_id and idempotency_key = input_idempotency_key/);
  assert.match(migration, /if qr_record\.consumed_at is not null/);
  assert.match(migration, /customer_points_qr_references q[\s\S]*for update/);
});

test("daily PIN stays server side and is never written into metadata", () => {
  assert.match(migration, /ensure_today_restaurant_pin/);
  assert.match(migration, /persist_daily_pin_rejection/);
  assert.doesNotMatch(migration, /jsonb_build_object\([^)]*input_daily_pin/);
  assert.doesNotMatch(migration, /return jsonb_build_object\([^;]*pin_code/);
});

test("existing two-bookings-per-Vienna-day limit remains server enforced", () => {
  assert.match(migration, /timezone\(coalesce\(restaurant_record\.timezone_name, 'Europe\/Vienna'\)/);
  assert.match(migration, />= 2 then/);
  assert.match(migration, /POINTS_DAILY_LIMIT_BLOCKED/);
});

test("high amount and limit rejection are auditable", () => {
  assert.match(migration, /POINTS_AMOUNT_LIMIT_BLOCKED/);
  assert.match(migration, /HIGH_POINTS_AMOUNT_REVIEW/);
  assert.match(migration, /0\.8/);
});

test("receipt and rapid repeat checks reduce split attempts", () => {
  assert.match(migration, /receipt_number = trim\(input_receipt_number\)/);
  assert.match(migration, /interval '5 minutes'/);
  assert.match(migration, />= 3/);
});

test("invalid manual codes count against the authenticated staff rate limit", () => {
  assert.match(migration, /actor_user_id = auth\.uid\(\)[\s\S]*interval '5 minutes'[\s\S]*>= 30/);
  assert.match(migration, /reason_code\)[\s\S]*'QR_NOT_FOUND'/);
  assert.match(migration, /'error_code', 'RATE_LIMITED'/);
});

test("reversal is compensating, owner-manager only and idempotent", () => {
  assert.match(migration, /role in \('owner', 'manager'\)/);
  assert.match(migration, /reversal_of = original\.id/);
  assert.match(migration, /'adjust',[\s\S]*-original\.points/);
  assert.match(migration, /POINTS_CREDIT_REVERSED/);
});

test("disabled collection modes are blocked below the UI", () => {
  assert.match(migration, /enforce_points_collection_mode_trigger/);
  assert.match(migration, /new\.source = 'customer_portal'[\s\S]*restaurant_controlled_only/);
  assert.match(staff, /restaurantControlledEnabled/);
  assert.match(customer, /settings\?\.points_collection_mode === "restaurant_controlled_only"/);
});

test("staff sends amount and reference but not a trusted points value", () => {
  const call = service.match(/confirmRestaurantControlledPoints[\s\S]*?return result;/)?.[0] ?? "";
  assert.match(call, /input_amount_cents/);
  assert.match(call, /input_qr_reference/);
  assert.doesNotMatch(call, /input_points/);
  assert.match(staff, /Punkte serverseitig berechnen/);
});

test("customer QR payload contains only type and short-lived token", () => {
  assert.match(customer, /JSON\.stringify\(\{ type: "wuxuai_points_credit", token: pointsQr\.qr_token \}\)/);
  assert.doesNotMatch(customer, /wuxuai_points_credit[^\n]*(name|phone|email|customer_code)/);
});

test("external platform exclusions are visible in staff and owner flows", () => {
  assert.match(staff, /Trinkgeld, Gutscheinkäufe und Lieferplattformen zählen nicht/);
  assert.match(settings, /Trinkgeld, Gutscheinkäufe und Bestellungen über externe Lieferplattformen/);
});

test("both collection modes use the same server-side points engine", () => {
  assert.match(sharedEngineMigration, /create or replace function public\.calculate_points_award_v1/);
  assert.match(sharedEngineMigration, /preview_restaurant_controlled_points[\s\S]*calculate_points_award_v1/);
  assert.match(sharedEngineMigration, /confirm_restaurant_controlled_points[\s\S]*award_points_v1/);
  assert.match(sharedEngineMigration, /collect_bonus_points_v1[\s\S]*award_points_v1/);
  assert.match(sharedEngineMigration, /award_points_v1[\s\S]*calculate_points_award_v1/);
});

test("active referral boost is tenant scoped, time bounded and applied once", () => {
  assert.match(sharedEngineMigration, /cb\.restaurant_id = input_restaurant_id/);
  assert.match(sharedEngineMigration, /cb\.customer_id = input_customer_id/);
  assert.match(sharedEngineMigration, /cb\.status = 'active'/);
  assert.match(sharedEngineMigration, /cb\.active_from <= now\(\)/);
  assert.match(sharedEngineMigration, /cb\.active_until > now\(\)/);
  assert.match(sharedEngineMigration, /round\(base_points_value \* multiplier_value\)/);
  assert.doesNotMatch(sharedEngineMigration, /multiplier_value\s*\*\s*multiplier_value/);
});

test("expired boost is excluded and boost snapshots are persisted", () => {
  assert.match(sharedEngineMigration, /active_until > now\(\)/);
  for (const column of ["base_points", "boost_multiplier", "boost_source", "boost_expires_at", "bonus_rule_version"]) {
    assert.match(sharedEngineMigration, new RegExp(`add column if not exists ${column}`));
    assert.match(sharedEngineMigration, new RegExp(`input_staff_user_id, base_points_value, multiplier_value`));
  }
});

test("idempotency retry returns stored boost result without applying the engine again", () => {
  const confirmation = sharedEngineMigration.match(/create or replace function public\.confirm_restaurant_controlled_points[\s\S]*?revoke execute on function public\.confirm_restaurant_controlled_points/)?.[0] ?? "";
  assert.match(confirmation, /idempotency_key = input_idempotency_key[\s\S]*if existing_transaction\.id is not null then[\s\S]*already_completed', true/);
  assert.ok(confirmation.indexOf("if existing_transaction.id is not null") < confirmation.indexOf("public.award_points_v1"));
});

test("first collection qualification is atomic and exactly once", () => {
  assert.match(sharedEngineMigration, /pg_advisory_xact_lock[\s\S]*:first-points/);
  assert.match(sharedEngineMigration, /successful_earn_count = 1/);
  assert.match(sharedEngineMigration, /r\.status = 'pending_registered'[\s\S]*for update/);
  assert.match(sharedEngineMigration, /set status = 'activated', activated_at = now\(\)[\s\S]*status = 'pending_registered'/);
  assert.match(sharedEngineMigration, /upsert_referral_boost[\s\S]*upsert_referral_boost/);
});

test("preview neither qualifies referral nor unlocks a welcome gift", () => {
  const preview = sharedEngineMigration.match(/create or replace function public\.preview_restaurant_controlled_points[\s\S]*?revoke execute on function public\.preview_restaurant_controlled_points/)?.[0] ?? "";
  assert.match(preview, /calculate_points_award_v1/);
  assert.doesNotMatch(preview, /apply_successful_points_effects_v1|upsert_referral_boost|customer_rewards[\s\S]*set status/);
});

test("failed confirmation cannot consume first collection qualification", () => {
  const confirmation = sharedEngineMigration.match(/create or replace function public\.confirm_restaurant_controlled_points[\s\S]*?revoke execute on function public\.confirm_restaurant_controlled_points/)?.[0] ?? "";
  assert.ok(confirmation.indexOf("pin_record.pin_code") < confirmation.indexOf("public.award_points_v1"));
  assert.ok(confirmation.indexOf("public.award_points_v1") < confirmation.indexOf("consumed_at = now()"));
  assert.match(sharedEngineMigration, /apply_successful_points_effects_v1[\s\S]*input_transaction_id/);
});

test("customer and restaurant collection persist distinct sources but identical rule snapshots", () => {
  assert.match(sharedEngineMigration, /'customer_initiated', 'bonus_qr'/);
  assert.match(sharedEngineMigration, /'restaurant_controlled',[\s\S]*Direkt im Restaurant/);
  assert.match(sharedEngineMigration, /calculation->>'bonus_rule_version'/);
  assert.match(sharedEngineMigration, /calculation->>'applied_rate'/);
});

test("reversal preserves the calculation snapshot and never requalifies referral", () => {
  const reversal = sharedEngineMigration.match(/create or replace function public\.reverse_restaurant_controlled_points[\s\S]*?notify pgrst/)?.[0] ?? "";
  assert.match(reversal, /original\.base_points/);
  assert.match(reversal, /original\.boost_multiplier/);
  assert.match(reversal, /original\.bonus_rule_version/);
  assert.match(reversal, /reversal_of/);
  assert.doesNotMatch(reversal, /apply_successful_points_effects_v1|upsert_referral_boost/);
});

test("private engine helpers are not executable by browser roles", () => {
  for (const signature of [
    "calculate_points_award_v1\\(uuid, uuid, integer\\)",
    "apply_successful_points_effects_v1\\(uuid, uuid, uuid, text\\)",
    "award_points_v1\\(uuid, uuid, uuid, integer, text, text, uuid, text, uuid\\)",
  ]) {
    assert.match(sharedEngineMigration, new RegExp(`revoke execute on function public\\.${signature}[\\s\\S]*from public, anon, authenticated`));
  }
});

test("every integration security definer function has the fixed safe search path", () => {
  const functions = [...sharedEngineMigration.matchAll(
    /create or replace function public\.([^\s(]+)[\s\S]*?security definer\s+set search_path = ([^\n]+)/g,
  )];
  assert.equal(functions.length, 7);
  for (const [, functionName, searchPath] of functions) {
    assert.equal(searchPath.trim(), "public, pg_temp", functionName);
  }
});

test("legacy low-level collection RPCs can no longer bypass mode enforcement", () => {
  assert.match(sharedEngineMigration, /revoke execute on function public\.collect_bonus_points\(text, text, text\)[\s\S]*from public, anon, authenticated/);
  assert.match(sharedEngineMigration, /revoke execute on function public\.collect_bonus_points\(text, text, text, text, text\)[\s\S]*from public, anon, authenticated/);
  assert.match(sharedEngineMigration, /points_collection_mode not in \('customer_initiated_only', 'both'\)/);
});

test("migration leaves legacy rows intact and only adds nullable snapshot columns", () => {
  assert.doesNotMatch(sharedEngineMigration, /delete from|truncate table|drop table|drop column/);
  assert.match(migration, /set points_collection_mode = 'customer_initiated_only'[\s\S]*where points_collection_mode is null/);
  assert.match(migration, /alter column points_collection_mode set default 'restaurant_controlled_only'/);
});
