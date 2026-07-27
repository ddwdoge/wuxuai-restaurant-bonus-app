import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260728001000_v1_bonus_activity_journal.sql", "utf8");
const page = readFileSync("src/modules/reports/BonusActivityReportsPage.tsx", "utf8");
const service = readFileSync("src/modules/reports/bonusActivityService.ts", "utf8");
const router = readFileSync("src/app/App.tsx", "utf8");
const layout = readFileSync("src/modules/admin/AdminLayout.tsx", "utf8");
const legalPage = readFileSync("src/modules/legal/OwnerLegalSettingsPage.tsx", "utf8");

test("journal is an additive dedicated table", () => {
  assert.match(migration, /create table if not exists public\.redemption_activity_journal/);
});

test("journal deduplicates by source type and source id", () => {
  assert.match(migration, /unique \(source_type, source_id\)/);
  assert.match(migration, /on conflict \(source_type, source_id\) do nothing/);
});

test("journal has immutable human-readable activity numbers", () => {
  assert.match(migration, /activity_number text not null unique/);
  assert.match(migration, /'WXB-'/);
});

test("journal protects historical updates and deletes", () => {
  assert.match(migration, /Historische Einlösungsaktivitäten dürfen nicht geändert werden/);
  assert.match(migration, /Einlösungsaktivitäten dürfen nicht gelöscht werden/);
});

test("cancellation preserves the original row and requires a reason", () => {
  assert.match(migration, /create or replace function public\.cancel_redemption_activity/);
  assert.match(migration, /length\(trim\(coalesce\(input_reason, ''\)\)\) < 10/);
  assert.match(migration, /BONUS_ACTIVITY_CANCELLED/);
});

for (const rewardType of [
  "POINT_REWARD", "WELCOME_GIFT", "BIRTHDAY_GIFT", "REFERRAL_REWARD",
  "PROMOTIONAL_GIFT", "MANUAL_COMPENSATION",
]) {
  test(`${rewardType} is explicitly classified`, () => {
    assert.match(migration, new RegExp(`'${rewardType}'`));
    assert.match(service, new RegExp(`${rewardType}`));
  });
}

test("final consume writes exactly one journal activity in the same RPC", () => {
  const consume = migration.slice(migration.lastIndexOf("create or replace function public.consume_redemption_code"));
  assert.match(consume, /write_redemption_activity/);
  assert.equal((consume.match(/write_redemption_activity\(/g) ?? []).length, 1);
});

test("duplicate consume remains blocked", () => {
  assert.match(migration, /REWARD_REDEMPTION_BLOCKED/);
  assert.match(migration, /already_redeemed/);
});

test("new snapshots use reward data at final server confirmation", () => {
  assert.match(migration, /reward_record\.title, reward_record\.description, points_value, 1/);
});

test("legacy backfill never joins current rewards", () => {
  const backfill = migration.slice(migration.indexOf("-- Legacy backfill"), migration.indexOf("create or replace function public.cancel_redemption_activity"));
  assert.doesNotMatch(backfill, /join public\.rewards/);
  assert.match(backfill, /nullif\(rc\.metadata->>'title'/);
});

test("legacy rows expose partial or missing source data", () => {
  assert.match(migration, /partial_legacy/);
  assert.match(migration, /missing_source_data/);
  assert.match(service, /Historischer Wert nicht vorhanden/);
});

test("report periods are calculated in Europe Vienna", () => {
  assert.match(migration, /at time zone 'Europe\/Vienna'/);
  assert.match(migration, /make_date\(input_year, input_month, 1\) \+ interval '1 month'/);
});

test("report uses half-open period boundaries", () => {
  assert.match(migration, /j\.redeemed_at >= period_from and j\.redeemed_at < period_to/);
});

test("test activity is excluded by default", () => {
  assert.match(migration, /input_include_test boolean default false/);
  assert.match(migration, /input_include_test or not j\.is_test_event/);
  assert.match(page, /Standardmäßig ausgeschlossen/);
});

test("existing export RPC signature remains available", () => {
  assert.match(migration, /get_reward_accounting_export\(\s*input_restaurant_id uuid,\s*input_from timestamptz,\s*input_to timestamptz,\s*input_reward_id uuid default null,\s*input_status text default null/s);
});

test("compatibility export reads only the journal", () => {
  const exportFunction = migration.slice(migration.indexOf("-- Keep the existing RPC"), migration.indexOf("-- Preserve the existing secure consume"));
  assert.match(exportFunction, /from public\.redemption_activity_journal j/);
  assert.doesNotMatch(exportFunction, /join public\.rewards/);
});

test("report RPC is authenticated and anonymous access is revoked", () => {
  assert.match(migration, /revoke execute on function public\.get_bonus_activity_report[\s\S]*from public, anon/);
  assert.match(migration, /grant execute on function public\.get_bonus_activity_report[\s\S]*to authenticated/);
});

test("only owner and admin satisfy the report role helper", () => {
  const roleFunction = migration.slice(migration.indexOf("create or replace function public.is_bonus_report_admin"), migration.indexOf("drop policy"));
  assert.match(roleFunction, /rm\.role in \('owner', 'admin'\)/);
  assert.doesNotMatch(roleFunction, /'manager'/);
  assert.doesNotMatch(roleFunction, /'staff'/);
});

test("branch filter is validated against the same restaurant", () => {
  assert.match(migration, /id = input_branch_id and restaurant_id = input_restaurant_id/);
});

test("CSV excludes customer tokens phone numbers and birthdays", () => {
  const csvFunction = service.slice(
    service.indexOf("export function bonusActivityRowsToCsv"),
    service.indexOf("function safeFilenamePart"),
  );
  assert.doesNotMatch(csvFunction, /customer_token|phone|birth_date|customer_birthday/i);
  assert.doesNotMatch(csvFunction, /customer_reference/);
});

test("CSV includes legal and snapshot metadata", () => {
  assert.match(service, /Testdaten ausgeschlossen/);
  assert.match(service, /Stornierte Vorgänge enthalten/);
  assert.match(service, /Vollständige Snapshots/);
  assert.match(service, /Unvollständige historische Datensätze/);
});

test("owner route and navigation expose reports", () => {
  assert.match(router, /path="reports"/);
  assert.match(layout, /to: "\/admin\/reports", label: "Berichte"/);
});

test("owner page provides month year and journal tabs", () => {
  assert.match(page, /Monatsübersicht/);
  assert.match(page, /Jahresübersicht/);
  assert.match(page, /Einlösungsprotokoll/);
});

test("UI and export carry the mandatory cash boundary", () => {
  assert.match(page, /kein Kassenbeleg, keine Registrierkasse/);
  assert.match(migration, /kein Kassenbeleg, keine Registrierkasse/);
  assert.match(page, /LEGAL_REVIEW_REQUIRED/);
});

test("UI does not call the activity report a tax or cash report", () => {
  assert.doesNotMatch(page, /Steuerbericht|Kassenbericht|RKSV-Bericht|Buchhaltungsbeleg/);
});

test("legal settings link to bonus activity reports", () => {
  assert.match(legalPage, /Bonus-Aktivitätsberichte öffnen/);
  assert.match(legalPage, /DRAFT_LEGAL_REVIEW_REQUIRED/);
});

test("printing is available without a new PDF dependency", () => {
  assert.match(page, /window\.print\(\)/);
  assert.match(page, /Drucken \/ PDF/);
});

test("journal exposes only active and cancelled status values", () => {
  assert.match(migration, /status text not null default 'ACTIVE' check \(status in \('ACTIVE', 'CANCELLED'\)\)/);
});

test("redemption code is represented only by a masked technical reference", () => {
  assert.match(migration, /'WUXUAI-' \|\| upper\(left\(code_record\.id::text, 8\)\)/);
  assert.doesNotMatch(service, /input_code|code_hash|redemption_code[^_r]/);
});

test("report displays excluded test transaction count", () => {
  assert.match(page, /Ausgeschlossene Testvorgänge/);
  assert.match(migration, /excluded_test_count/);
});

test("report cancellation does not claim to reverse points or create cash entries", () => {
  assert.match(page, /keine automatische Punkte-, Kassen- oder Steuerbuchung/);
  assert.match(migration, /no_points_reversal/);
});

test("XLSX is not introduced without an existing export dependency", () => {
  assert.doesNotMatch(page, /XLSX|Excel/);
  assert.doesNotMatch(service, /xlsx|exceljs/i);
});
