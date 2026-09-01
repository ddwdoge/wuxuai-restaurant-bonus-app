import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const initialMigration = readFileSync(new URL("../supabase/migrations/20260731001000_restaurant_controlled_points_collection.sql", import.meta.url), "utf8");
const engineMigration = readFileSync(new URL("../supabase/migrations/20260801001000_shared_points_bonus_engine.sql", import.meta.url), "utf8");
const repairMigration = readFileSync(new URL("../supabase/migrations/20260802001000_enforce_minimum_points_amount.sql", import.meta.url), "utf8");
const volatilityMigration = readFileSync(new URL("../supabase/migrations/20260802002000_mark_minimum_validator_stable.sql", import.meta.url), "utf8");

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

test("historical points migrations remain byte-identical", () => {
  assert.equal(sha256(initialMigration), "afbed67b991e9bd7e576340bb7d1c11e9d200701ee98e5ad5d22adce84cdd894");
  assert.equal(sha256(engineMigration), "b9b9cb34979bfd7fe9105a9c760f8076a12423d7f9e344bc6b1e9fa630aa42a7");
});

test("one central validator owns the 100 cent rule and stable error contract", () => {
  const validator = repairMigration.match(/create or replace function public\.validate_minimum_points_amount_v1[\s\S]*?revoke execute on function public\.validate_minimum_points_amount_v1/)?.[0] ?? "";
  assert.match(validator, /input_amount_cents is null or input_amount_cents < 100/);
  assert.match(validator, /POINTS_AMOUNT_BELOW_MINIMUM/);
  assert.match(validator, /Mindestbetrag für eine Punktegutschrift beträgt 1,00 €/);
  assert.doesNotMatch(validator, /insert into|update public\.|delete from|write_audit_event/);
});

test("100 and 101 cents pass while 1, 50 and 99 cents fail the SQL predicate", () => {
  const accepts = (amountCents) => !(amountCents == null || amountCents < 100);
  for (const amount of [1, 50, 99]) assert.equal(accepts(amount), false);
  for (const amount of [100, 101]) assert.equal(accepts(amount), true);
});

test("preview and confirmation use the same validator before delegated work", () => {
  for (const functionName of ["preview_restaurant_controlled_points", "confirm_restaurant_controlled_points"]) {
    const body = repairMigration.match(new RegExp(`create or replace function public\\.${functionName}[\\s\\S]*?revoke execute on function public\\.${functionName}`))?.[0] ?? "";
    assert.match(body, /validate_minimum_points_amount_v1\(input_amount_cents\)/);
    assert.match(body, /return validation/);
    assert.ok(body.indexOf("validate_minimum_points_amount_v1") < body.indexOf(`${functionName}_before_minimum_guard`));
  }
});

test("direct engine and award calls cannot bypass the minimum", () => {
  for (const functionName of ["calculate_points_award_v1", "award_points_v1"]) {
    const body = repairMigration.match(new RegExp(`create or replace function public\\.${functionName}[\\s\\S]*?revoke execute on function public\\.${functionName}`))?.[0] ?? "";
    assert.match(body, /validate_minimum_points_amount_v1\(input_amount_cents\)/);
    assert.match(body, /errcode = 'P0001'/);
    assert.ok(body.indexOf("validate_minimum_points_amount_v1") < body.indexOf(`${functionName}_before_minimum_guard`));
  }
});

test("legacy dependency paths are protected by trigger and check constraint", () => {
  assert.match(repairMigration, /before insert or update of amount_cents, collection_source, type/);
  assert.match(repairMigration, /new\.collection_source in \('customer_initiated', 'restaurant_controlled'\)/);
  assert.match(repairMigration, /points_transactions_minimum_amount_check/);
  assert.match(repairMigration, /amount_cents is not null and amount_cents >= 100/);
  assert.match(repairMigration, /\) not valid;/);
});

test("rejected public requests return before QR, PIN, ledger or referral work", () => {
  for (const functionName of ["preview_restaurant_controlled_points", "confirm_restaurant_controlled_points"]) {
    const body = repairMigration.match(new RegExp(`create or replace function public\\.${functionName}[\\s\\S]*?revoke execute on function public\\.${functionName}`))?.[0] ?? "";
    const rejection = body.indexOf("return validation");
    const delegate = body.indexOf(`${functionName}_before_minimum_guard`);
    assert.ok(rejection >= 0 && rejection < delegate);
    assert.doesNotMatch(body.slice(0, delegate), /consumed_at|points_transactions|upsert_referral_boost|ensure_today_restaurant_pin/);
  }
});

test("private implementations and helpers are not executable by browser roles", () => {
  for (const functionName of [
    "validate_minimum_points_amount_v1",
    "calculate_points_award_v1_before_minimum_guard",
    "award_points_v1_before_minimum_guard",
    "preview_restaurant_controlled_points_before_minimum_guard",
    "confirm_restaurant_controlled_points_before_minimum_guard",
    "enforce_minimum_points_amount_v1",
  ]) {
    assert.match(repairMigration, new RegExp(`revoke execute on function public\\.${functionName}[\\s\\S]{0,180}from public, anon, authenticated`));
  }
});

test("public grants remain limited to authenticated staff RPCs", () => {
  assert.match(repairMigration, /grant execute on function public\.preview_restaurant_controlled_points[\s\S]{0,180}to authenticated/);
  assert.match(repairMigration, /grant execute on function public\.confirm_restaurant_controlled_points[\s\S]{0,180}to authenticated/);
  assert.doesNotMatch(repairMigration, /grant execute[\s\S]{0,180}to anon/);
});

test("repair is additive and does not rewrite data or weaken RLS", () => {
  assert.doesNotMatch(repairMigration, /delete from|truncate table|drop table|drop column|disable row level security/);
  assert.doesNotMatch(repairMigration, /alter policy|drop policy|create policy/);
  assert.match(repairMigration, /set search_path = public, pg_temp/g);
});

test("validator volatility is corrected additively after remote lint", () => {
  assert.match(volatilityMigration, /alter function public\.validate_minimum_points_amount_v1\(integer\) stable/);
  assert.doesNotMatch(volatilityMigration, /delete from|truncate table|drop table|drop column|policy|grant execute/);
});
