import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260823001500_v1_redemption_reporting_simplification.sql", "utf8");
const legacyMigration = readFileSync("supabase/migrations/20260728001000_v1_bonus_activity_journal.sql", "utf8");
const customer = readFileSync("src/modules/customer/CustomerPortal.tsx", "utf8");
const staff = readFileSync("src/modules/staff/StaffTablet.tsx", "utf8");
const reportPage = readFileSync("src/modules/reports/BonusActivityReportsPage.tsx", "utf8");
const reportStyles = readFileSync("src/modules/reports/bonus-activity-reports.css", "utf8");
const reportService = readFileSync("src/modules/reports/bonusActivityService.ts", "utf8");
const pointsPresentation = readFileSync("supabase/migrations/20260803007000_points_redemption_presentation_window.sql", "utf8");
const giftPresentation = readFileSync("supabase/migrations/20260809001000_v1_release_gift_presentations_notifications.sql", "utf8");

test("primary customer flow starts presentations instead of six-digit codes", () => {
  assert.match(customer, /startCustomerPointsPresentation/);
  assert.match(customer, /startCustomerGiftPresentation/);
  assert.doesNotMatch(customer, /startCustomerRedemption\(/);
  assert.match(customer, /Bitte erst vor dem Mitarbeiter bestätigen/);
  assert.match(customer, /<SwipeToRedeem/);
});

test("staff primary flow contains no code verification", () => {
  assert.doesNotMatch(staff, /inspectRedemptionCode|consumeRedemptionCode|Einlösecode prüfen|Code prüfen/);
  assert.match(staff, /type StaffView = "home" \| "search" \| "earn"/);
});

test("legacy code data and compatibility RPC remain preserved", () => {
  assert.match(legacyMigration, /write_redemption_activity/);
  assert.match(legacyMigration, /get_reward_accounting_export/);
  assert.match(legacyMigration, /consume_redemption_code/);
});

test("points and gifts use server-timed fifteen-minute presentations", () => {
  assert.match(pointsPresentation, /activated_at_value \+ interval '15 minutes'/);
  assert.match(pointsPresentation, /complete_points_redemption_presentations/);
  assert.match(giftPresentation, /activated_at_value \+ interval '15 minutes'/);
  assert.match(giftPresentation, /complete_gift_redemption_presentations/);
  assert.match(giftPresentation, /WELCOME_GIFT/);
  assert.match(giftPresentation, /BIRTHDAY_GIFT/);
});

test("reporting migration snapshots start finalization and optional reference values", () => {
  assert.match(migration, /redemption_started_at timestamptz/);
  assert.match(migration, /finalized_at timestamptz/);
  assert.match(migration, /reference_value_cents integer/);
  assert.match(migration, /reward\.product_price/);
  assert.match(migration, /Missing historical values are[\s\S]*left null/i);
});

test("final points presentation updates reporting exactly once", () => {
  assert.match(migration, /finalize_points_redemption_reporting/);
  assert.match(migration, /old\.status = 'REDEEMED_ACTIVE'[\s\S]*new\.status = 'REDEEMED_COMPLETED'/);
  assert.match(migration, /and finalized_at is null/);
});

test("report RPC is tenant-scoped and excludes tests", () => {
  assert.match(migration, /is_bonus_report_admin\(input_restaurant_id\)/);
  assert.match(migration, /journal\.restaurant_id = input_restaurant_id/);
  assert.match(migration, /journal\.is_test_event = false/);
  assert.match(migration, /REPORT_ACCESS_DENIED/);
  assert.match(migration, /revoke execute[\s\S]*from public, anon/);
  assert.match(migration, /grant execute[\s\S]*to authenticated/);
});

for (const period of ["today", "yesterday", "this_week", "last_week", "this_month", "last_month", "this_year", "custom"]) {
  test(`report supports ${period}`, () => assert.match(migration, new RegExp(`'${period}'`)));
}

test("period boundaries use restaurant timezone and half-open ranges", () => {
  assert.match(migration, /timezone_value/);
  assert.match(migration, /at time zone timezone_value/);
  assert.match(migration, /finalized_at >= period_from and journal\.finalized_at < period_to/);
  assert.match(migration, /extract\(isodow from local_today\)/);
});

test("report provides source totals daily top reward and annual series", () => {
  assert.match(migration, /'point_rewards'/);
  assert.match(migration, /'welcome_gifts'/);
  assert.match(migration, /'birthday_gifts'/);
  assert.match(migration, /'daily_series'/);
  assert.match(migration, /'top_rewards'/);
  assert.match(migration, /'monthly_series'/);
});

test("owner UI provides every V1 period and restaurant report table", () => {
  for (const label of ["Heute", "Gestern", "Diese Woche", "Letzte Woche", "Dieser Monat", "Letzter Monat", "Dieses Jahr", "Benutzerdefiniert"]) {
    assert.match(reportPage, new RegExp(label));
  }
  for (const heading of ["Datum", "Zeit", "Belohnung", "Typ", "Punkte", "Referenzwert", "Status"]) {
    assert.match(reportPage, new RegExp(`>${heading}<`));
  }
});

test("mobile report table scroll stays contained inside the report", () => {
  assert.match(reportStyles, /\.bonus-report-table-wrap\s*\{[^}]*contain:\s*inline-size/);
  assert.match(reportStyles, /\.bonus-report-table-wrap\s*\{[^}]*overflow-x:\s*auto/);
});

test("CSV contains no direct customer identity", () => {
  const csv = reportService.slice(reportService.indexOf("export function redemptionReportRowsToCsv"));
  assert.doesNotMatch(csv, /customer_reference|customer_token|phone|email|birth/i);
  assert.match(csv, /WUXUAI_Einloesungen_/);
});

test("reference values remain explicitly optional", () => {
  assert.match(reportPage, /Fehlende Werte werden nicht geschätzt/);
  assert.match(reportPage, /Nicht verfügbar/);
  assert.match(migration, /reference_value_cents is null/);
});

test("report indexes cover tenant finalization source and branch filters", () => {
  assert.match(migration, /redemption_activity_report_finalized_idx/);
  assert.match(migration, /restaurant_id, finalized_at desc, reward_type/);
  assert.match(migration, /redemption_activity_report_branch_idx/);
});

test("detail rows are capped server-side while aggregates remain complete", () => {
  assert.match(migration, /input_limit integer default 250/);
  assert.match(migration, /limit least\(greatest\(coalesce\(input_limit, 250\), 1\), 500\)/);
  assert.match(reportService, /input_limit: 250/);
});
