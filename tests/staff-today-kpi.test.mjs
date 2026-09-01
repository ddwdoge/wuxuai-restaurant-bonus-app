import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260823002000_staff_today_kpis_authoritative_sources.sql", import.meta.url),
  "utf8",
);
const staffPortal = readFileSync(new URL("../src/modules/staff/StaffTablet.tsx", import.meta.url), "utf8");

test("Bonuspunkte heute stammen aus dem autoritativen Punktejournal", () => {
  assert.match(migration, /from public\.points_transactions points_transaction/);
  assert.match(migration, /points_transaction\.type = 'earn'/);
  assert.match(migration, /sum\(points_transaction\.points\)/);
  assert.match(migration, /points_transaction\.restaurant_id = input_restaurant_id/);
  assert.match(migration, /points_transaction\.created_at >= period_from/);
  assert.match(migration, /points_transaction\.created_at < period_to/);
});

test("Einlösungen heute zählen nur finalisierte aktive Journaleinträge", () => {
  assert.match(migration, /from public\.redemption_activity_journal journal/);
  assert.match(migration, /journal\.status = 'ACTIVE'/);
  assert.match(migration, /journal\.finalized_at >= period_from/);
  assert.match(migration, /journal\.finalized_at < period_to/);
  assert.doesNotMatch(migration, /staff_reward_redeemed|audit_log/);
});

test("Restaurant-Zeitzone und Testdatenfilter sind serverseitig verbindlich", () => {
  assert.match(migration, /restaurant\.timezone_name/);
  assert.match(migration, /'Europe\/Vienna'/);
  assert.match(migration, /at time zone timezone_value/);
  assert.match(migration, /not coalesce\(customer\.is_test_customer, false\)/);
  assert.match(migration, /not journal\.is_test_event/);
});

test("Tenant-Scope und RPC-Rechte bleiben serverseitig begrenzt", () => {
  assert.match(migration, /if not public\.is_restaurant_member\(input_restaurant_id\)/);
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = public, pg_temp/);
  assert.match(migration, /revoke execute[\s\S]*from public, anon/);
  assert.match(migration, /grant execute[\s\S]*to authenticated/);
  assert.doesNotMatch(migration, /disable row level security|create policy|service_role/i);
});

test("KPI-Fehler bleibt vom echten Nullwert unterscheidbar und Buchungen laden neu", () => {
  assert.match(staffPortal, /activityError[\s\S]*Übersicht nicht verfügbar/);
  assert.match(staffPortal, /setTodayActivity\(\[\]\)[\s\S]*setActivityError/);
  assert.match(staffPortal, /setActivityRefreshToken\(\(current\) => current \+ 1\)/);
  assert.match(staffPortal, /\[activityRefreshToken, restaurantId\]/);
});
