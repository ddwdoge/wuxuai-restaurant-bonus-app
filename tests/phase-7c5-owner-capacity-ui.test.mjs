import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  capacityMessage,
  ownerCapacityMessages,
  ownerCapacityPaymentLabel,
} from "../src/modules/capacity/ownerCapacityMessages.mjs";

const migration = readFileSync(new URL(
  "../supabase/migrations/20260921004000_owner_capacity_read_contract.sql",
  import.meta.url,
), "utf8");
const warningMigration = readFileSync(new URL(
  "../supabase/migrations/20260921005000_capacity_warning_dispatch.sql",
  import.meta.url,
), "utf8");
const service = readFileSync(new URL("../src/modules/capacity/ownerCapacityService.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/modules/admin/pages/OwnerCapacityPage.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/app/App.tsx", import.meta.url), "utf8");
const settings = readFileSync(new URL("../src/modules/admin/pages/SettingsPage.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("owner capacity uses one authorized server snapshot and no client limit constants", () => {
  assert.match(service, /rpc\("get_restaurant_capacity"/);
  assert.match(page, /snapshot\.offers/);
  assert.match(page, /snapshot\.active_customers/);
  assert.match(page, /snapshot\.catalog\.offer_addon/);
  assert.match(page, /snapshot\.catalog\.customer_addon/);
  assert.doesNotMatch(page, /\b3000\b|\b15000\b|\b5000\b|\b5900\b|\b14900\b|\b1900\b|\b2900\b/);
  assert.doesNotMatch(service, /\b3000\b|\b15000\b|\b5900\b|\b14900\b|\b1900\b|\b2900\b/);
});

test("migration enriches only the owner read with authoritative catalog and warning status", () => {
  assert.match(migration, /create or replace function public\.get_restaurant_capacity/);
  assert.match(migration, /resolve_restaurant_capacity_internal/);
  assert.match(migration, /commercial_capacity_addon_versions/);
  for (const status of ["AVAILABLE", "WARNING_80", "WARNING_90", "AT_LIMIT", "OVER_LIMIT"]) {
    assert.match(migration, new RegExp(`'${status}'`));
  }
  assert.match(migration, /'thresholds_percent', jsonb_build_array\(80, 90, 100\)/);
  assert.match(migration, /'dispatch_active', false/);
  assert.match(migration, /'forecast_active', false/);
  assert.match(migration, /is_restaurant_admin/);
  assert.match(migration, /is_platform_admin/);
  assert.match(migration, /revoke execute[\s\S]*public, anon, authenticated, service_role/);
  assert.match(migration, /grant execute[\s\S]*to authenticated/);
});

test("migration creates no dispatcher billing or business-data mutation", () => {
  assert.doesNotMatch(migration, /create table|create trigger|cron|scheduler|outbox|send_email|stripe|checkout/i);
  assert.doesNotMatch(migration, /\b(insert into|update|delete from|truncate)\s+public\./i);
  assert.doesNotMatch(migration, /commercial_pro_access_grants|platform_test_tenant_registry/);
  assert.doesNotMatch(migration, /update\s+public\.commercial_plan_release_policy/i);
});

test("capacity route is discoverable and remains inside the owner portal", () => {
  assert.match(app, /path="settings\/tarif-kapazitaet"/);
  assert.match(app, /<OwnerCapacityPage/);
  assert.match(settings, /to="\/admin\/settings\/tarif-kapazitaet"/);
  assert.match(settings, /Tarif & Kapazität/);
});

test("increase capacity is informational and drawer close paths cannot write", () => {
  assert.match(page, /setDrawerOpen\(true\)/);
  assert.match(page, /<AppDrawer/);
  assert.match(page, /setDrawerOpen\(false\)/g);
  assert.doesNotMatch(page, /\.insert\(|\.update\(|\.delete\(|\.upsert\(|rpc\(/);
  assert.doesNotMatch(page, /startCheckout|purchaseAddon|subscribePlan|createGrant|mutateEntitlement/i);
});

test("status copy and payment states exist in all seven languages", () => {
  for (const language of ["de", "en", "fr", "it", "es", "zh", "ko"]) {
    const messages = ownerCapacityMessages(language);
    for (const key of ["title", "offers", "customers", "atLimit", "overLimit", "offerAt", "customerAt", "increase", "warningPending", "forecastPending"]) {
      assert.ok(messages[key], `${language}:${key}`);
    }
    assert.notEqual(ownerCapacityPaymentLabel(language, "failed", messages.unavailable), messages.unavailable);
  }
  assert.equal(capacityMessage("{usage}/{limit}", { usage: 4, limit: 5 }), "4/5");
});

test("responsive and accessible presentation contract is explicit", () => {
  assert.match(page, /role="progressbar"/);
  assert.match(page, /aria-valuemax/);
  assert.match(page, /aria-valuemin/);
  assert.match(page, /aria-valuenow/);
  assert.match(page, /data-drawer-autofocus/);
  assert.match(styles, /@media \(max-width: 767px\)/);
  assert.match(styles, /@media \(max-width: 430px\)/);
  assert.match(styles, /min-height: 44px/);
  assert.match(styles, /grid-template-columns: 1fr/);
});

test("migration 156 stays immutable while migration 157 activates the Founder warning contract", () => {
  assert.match(migration, /'dispatch_active', false/);
  assert.match(migration, /'forecast_active', false/);
  assert.match(warningMigration, /'dispatch_active', true/);
  assert.match(warningMigration, /'forecast_active', true/);
  assert.match(page, /loadOwnerCapacityWarnings/);
  assert.match(page, /acknowledgeOwnerCapacityWarning/);
});
