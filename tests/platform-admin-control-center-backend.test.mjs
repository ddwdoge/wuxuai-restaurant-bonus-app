import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260824005000_platform_admin_restaurant_control_center.sql",
    import.meta.url,
  ),
  "utf8",
);
const service = readFileSync(new URL("../src/modules/platform/platformAdminService.ts", import.meta.url), "utf8");

test("Control-Center-Migration folgt der offenen Referral-Bridge", () => {
  assert.match(migration, /20260824005000|ordered after the pending 04000/);
  assert.match(migration, /get_platform_restaurant_control_center/);
});

test("Control Center ist ausschließlich serverseitig für Plattformrollen freigegeben", () => {
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = public, pg_temp/);
  assert.match(migration, /if not public\.is_platform_admin\(\)/);
  assert.match(migration, /errcode = '42501'/);
  assert.match(migration, /revoke execute[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute[\s\S]*to authenticated/);
  assert.doesNotMatch(migration, /auth\.jwt|app_metadata|user_metadata|restaurant_members/);
});

test("Nutzungsdaten stammen aus aktuellen autoritativen Quellen und schließen Testdaten aus", () => {
  for (const source of [
    "public.customers",
    "public.points_transactions",
    "public.redemption_activity_journal",
    "public.customer_bonus_boosts",
    "public.referrals",
    "public.customer_transactional_email_deliveries",
  ]) {
    assert.match(migration, new RegExp(source.replaceAll(".", "\\.")));
  }
  assert.match(migration, /not coalesce\(customer\.is_test_customer, false\)/);
  assert.match(migration, /not journal\.is_test_event/);
  assert.match(migration, /not audit\.is_test_event/);
  assert.match(migration, /journal\.finalized_at is not null/);
  assert.match(migration, /journal\.reward_type in \('POINT_REWARD', 'WELCOME_GIFT', 'BIRTHDAY_GIFT'\)/);
});

test("echte Nullwerte, fehlende Telemetrie und Query-Fehler bleiben unterscheidbar", () => {
  assert.match(migration, /'customers_total', jsonb_build_object\('status', 'available', 'value', customers_total_value\)/);
  assert.match(migration, /'internal_test', jsonb_build_object\('status', 'unavailable', 'value', null\)/);
  assert.match(migration, /'cron', jsonb_build_object\([\s\S]*'status', 'unavailable'/);
  assert.match(migration, /'no_restaurant_scoped_job_telemetry'/);
  assert.doesNotMatch(migration, /exception\s+when\s+others/i);
});

test("Referral- und 2x-Vertrag bleiben read-only und entsprechen V1", () => {
  assert.match(migration, /'configured_duration_days', settings_record\.referral_boost_duration_days/);
  assert.match(migration, /'multiplier', 2/);
  assert.match(migration, /'friend_duration_ratio', 0\.5/);
  assert.match(migration, /'duration_type'.*\(7, 14, 28\)/);
  assert.match(migration, /qualified_referrals_30d_value/);
  assert.match(migration, /active_boosters_value/);
  assert.match(migration, /boost_extra_points_30d_value/);
  assert.doesNotMatch(migration, /update public\.loyalty_settings|insert into public\.referrals/);
});

test("Gesundheitswerte folgen expliziten Schwellen und unknown wird nicht healthy", () => {
  assert.match(migration, /registration_failures_24h_value >= 3 then 'error'/);
  assert.match(migration, /email_failed_24h_value >= 3 then 'error'/);
  assert.match(migration, /redemption_failure_24h_value >= 3 then 'error'/);
  assert.match(migration, /overall_health_value text := 'unknown'/);
  assert.match(migration, /else 'unknown'/);
  assert.doesNotMatch(migration, /unavailable[^\n]{0,80}then 'healthy'/);
});

test("Standort und Staff diagnostizieren ohne Geheimnisse offenzulegen", () => {
  assert.match(migration, /address_complete_value/);
  assert.match(migration, /coordinates_present_value/);
  assert.match(migration, /public_search_eligible_value/);
  assert.match(migration, /staff_count_value/);
  assert.match(migration, /daily_pin_available_value/);
  assert.match(migration, /qr_flow_available_value/);
  assert.doesNotMatch(migration, /pin_code|pin_hash|token_hash|provider_message_id|last_error[^_]/);
});

test("Audit-Payload ist begrenzt und verwendet lesbare bekannte Ereignisse", () => {
  assert.match(migration, /'platform_subscription_updated' then 'Abo-Status geändert'/);
  assert.match(migration, /'trial_extended' then 'Testphase verlängert'/);
  assert.match(migration, /'restaurant_status_updated' then 'Restaurantstatus geändert'/);
  assert.match(migration, /'manual_payment_recorded' then 'Manuelle Zahlung erfasst'/);
  assert.match(migration, /limit 20/);
  assert.doesNotMatch(migration, /'metadata', audit\.metadata/);
  assert.doesNotMatch(migration, /'phone'|'customer_email'|'customer_token'|'auth_token'/);
});

test("Client-Service nutzt den einen eng begrenzten RPC ohne Direktzugriff", () => {
  assert.match(service, /loadPlatformRestaurantControlCenter/);
  assert.match(service, /supabase\.rpc\("get_platform_restaurant_control_center"/);
  assert.doesNotMatch(service, /loadPlatformRestaurantControlCenter[\s\S]{0,800}\.from\(/);
  assert.doesNotMatch(service, /service[_-]?role/i);
});

test("Migration ändert keine Tenant-RLS und baut keine Zahlungsautomatisierung", () => {
  assert.doesNotMatch(migration, /disable row level security|create policy|drop policy/);
  assert.doesNotMatch(migration, /stripe|checkout|webhook/);
  assert.match(migration, /'manual_payment'[\s\S]*'status', 'deferred'/);
  assert.doesNotMatch(migration, /insert into public\.audit_log|update public\.branch_subscriptions/);
});
