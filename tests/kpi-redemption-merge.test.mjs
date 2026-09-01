import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const portal = await readFile(new URL("../src/modules/customer/CustomerPortal.tsx", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../src/modules/admin/pages/AdminDashboard.tsx", import.meta.url), "utf8");
const service = await readFile(new URL("../src/modules/rewards/rewardService.ts", import.meta.url), "utf8");
const redemptionSession = await readFile(new URL("../src/modules/customer/customerRedemptionSession.mjs", import.meta.url), "utf8");
const app = await readFile(new URL("../src/app/App.tsx", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20260720003000_dashboard_kpis_and_redemption_status.sql", import.meta.url), "utf8");

test("cached redemption is restored only after a positive server status", () => {
  assert.match(portal, /restoreScopedActiveRedemption\(window\.sessionStorage/);
  assert.match(redemptionSession, /serverStatus\?\.active && serverStatus\.status === "active"/);
  assert.match(portal, /loadCustomerGiftPresentation\(/);
  assert.match(portal, /loadCustomerPointsPresentation\(/);
  assert.match(redemptionSession, /removeScopedActiveRedemption\(storage/);
  assert.doesNotMatch(portal, /status === "redemption_started"\).*alreadyRedeemed/s);
});

test("final server consume and expiry remove the visible cached code", () => {
  assert.match(portal, /serverStatus\.status === "redeemed"/);
  assert.match(portal, /setActiveRedemptionCode\(null\)/);
  assert.match(portal, /setInterval[\s\S]*loadCustomerRedemptionStatus/);
  assert.match(migration, /perform public\.expire_redemption_codes\(now\(\)\)/);
  assert.match(migration, /source_status in \('started', 'redemption_started'\)/);
});

test("dashboard exposes all production KPI cards with Lucide icons", () => {
  for (const label of ["Kunden gesamt", "Neue Kunden heute", "Neue Kunden diese Woche", "Heute aktiv", "Einlösungen heute"]) {
    assert.match(dashboard, new RegExp(label));
  }
  assert.match(dashboard, /const Icon = kpi\.icon/);
  assert.doesNotMatch(dashboard, /icon: "[👥⭐🎁🔥📈🆕🔆]"/u);
});

test("KPI calculation uses restaurant timezone and Monday week start", () => {
  assert.match(migration, /timezone_value/);
  assert.match(migration, /Europe\/Vienna/);
  assert.match(migration, /extract\(isodow from local_today\)/);
  assert.match(migration, /local_week_start := local_today -/);
  assert.match(migration, /created_at >= week_start/);
});

test("active today is distinct, successful-only and test-safe", () => {
  assert.match(migration, /count\(distinct activity\.customer_id\)/);
  assert.match(migration, /pt\.type = 'earn'/);
  assert.match(migration, /re\.status = 'redeemed'/);
  assert.match(migration, /cr\.status = 'redeemed'/);
  assert.ok((migration.match(/not c\.is_test_customer/g) ?? []).length >= 10);
  assert.doesNotMatch(migration, /redemption_activation_attempts[\s\S]*active_today_count/);
});

test("redemptions count final gift, point and coupon events once", () => {
  assert.match(migration, /'gift:' \|\| cr\.id::text/);
  assert.match(migration, /'points:' \|\| re\.id::text/);
  assert.match(migration, /'coupon:' \|\| cp\.id::text/);
  assert.match(migration, /cr\.gift_type in \('welcome', 'birthday'\)/);
  assert.match(migration, /re\.status = 'redeemed'/);
  assert.match(migration, /\) final_redemptions/);
});

test("RPC grants preserve tenant and public-token security boundaries", () => {
  assert.match(service, /get_customer_redemption_status/);
  assert.match(migration, /public\.is_restaurant_member\(input_restaurant_id\)/);
  assert.match(migration, /revoke execute on function public\.get_restaurant_dashboard_kpis\(uuid\) from public, anon/);
  assert.match(migration, /cqt\.token_hash = public\.hash_public_token\(input_customer_token\)/);
  assert.match(migration, /revoke execute on function public\.get_customer_redemption_status\(text, text, uuid\) from public/);
  assert.doesNotMatch(migration, /jsonb_build_object\([^;]*(code_hash|input_customer_token)/s);
});

test("premium audit route remains present", () => {
  assert.match(app, /path="\/admin\/platform\/audit"/);
  assert.match(app, /PlatformAuditPage/);
});
