import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260824002000_fix_referral_settings_audit_and_boost_kpis.sql", import.meta.url),
  "utf8",
);

function extraPoints(basePoints, finalPoints) {
  return Math.max(finalPoints - basePoints, 0);
}

test("Owner-Audit nutzt den bestehenden admin actor contract", () => {
  assert.match(migration, /'admin',\s*auth\.uid\(\),\s*'REFERRAL_BONUS_SETTINGS_UPDATED'/);
  assert.doesNotMatch(migration, /'restaurant_user'/);
  assert.doesNotMatch(migration, /audit_log_actor_type_check|add constraint[\s\S]*actor_type/i);
});

test("Owner-Settings-Vertrag und Berechtigungen bleiben eng", () => {
  assert.match(migration, /rm\.role in \('owner', 'admin'\)/);
  assert.match(migration, /input_multiplier is distinct from 2::numeric/);
  assert.match(migration, /input_duration_days < 1 or input_duration_days > 365/);
  assert.match(migration, /security definer[\s\S]*set search_path = public, pg_temp/);
  assert.match(migration, /revoke execute on function public\.update_referral_bonus_settings[\s\S]*from public, anon/);
  assert.match(migration, /grant execute on function public\.update_referral_bonus_settings[\s\S]*to authenticated/);
});

test("KPI liest aktuellen POINTS_ADDED-Vertrag und Legacy-Daten kompatibel", () => {
  assert.match(migration, /a\.event_type = 'POINTS_ADDED'/);
  assert.match(migration, /a\.metadata->>'boost_source' = 'referral'/);
  assert.match(migration, /a\.metadata->>'boost_multiplier'/);
  assert.match(migration, /a\.action = 'public_bonus_points_collected'/);
  assert.match(migration, /a\.metadata->>'multiplier'/);
  assert.match(migration, /group by event_key, customer_id/);
});

test("Zusatzpunkte sind exakt final minus base", () => {
  assert.equal(extraPoints(20, 40), 20);
  assert.equal(extraPoints(20, 20), 0);
  assert.equal(extraPoints(30, 60), 30);
  assert.equal([extraPoints(20, 40), extraPoints(20, 20), extraPoints(30, 60)].reduce((a, b) => a + b, 0), 50);
  assert.match(migration, /final_points'[\s\S]*-[\s\S]*base_points'/);
});

test("Testdaten werden aus Booster-KPIs ausgeschlossen", () => {
  assert.match(migration, /not a\.is_test_event/);
  assert.match(migration, /not c\.is_test_customer/);
});

test("KPI-Grants bleiben auf authentifizierte Restaurantmitglieder begrenzt", () => {
  assert.match(migration, /public\.is_restaurant_member\(input_restaurant_id\)/);
  assert.match(migration, /raise exception 'not allowed' using errcode = '42501'/);
  assert.match(migration, /revoke execute on function public\.get_bonus_boost_kpis\(uuid\)[\s\S]*from public, anon/);
  assert.match(migration, /grant execute on function public\.get_bonus_boost_kpis\(uuid\)[\s\S]*to authenticated/);
});
