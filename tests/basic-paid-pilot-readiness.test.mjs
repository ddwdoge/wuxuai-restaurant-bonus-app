import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL(
  "../supabase/migrations/20260928002000_basic_paid_and_free_pilot_readiness.sql",
  import.meta.url,
), "utf8");
const timeContractMigration = await readFile(new URL(
  "../supabase/migrations/20260928004000_basic_vienna_time_boundary_contract.sql",
  import.meta.url,
), "utf8");
const panel = await readFile(new URL(
  "../src/modules/platform/PlatformBasicPilotActivationPanel.tsx",
  import.meta.url,
), "utf8");
const service = await readFile(new URL(
  "../src/modules/platform/platformAdminService.ts",
  import.meta.url,
), "utf8");
const controlCenter = await readFile(new URL(
  "../src/modules/platform/PlatformRestaurantControlCenter.tsx",
  import.meta.url,
), "utf8");

test("paid BASIC readiness is rechecked at checkout, provider completion, trigger and webhook", () => {
  assert.match(migration, /basic_paid_activation_readiness_internal/);
  assert.ok((migration.match(/basic_paid_activation_readiness_internal\(/g) ?? []).length >= 6);
  assert.match(migration, /PAID_SELLER_NOT_READY/);
  assert.match(migration, /PAID_TAX_NOT_READY/);
  assert.match(migration, /PAID_ACCEPTED_CONTRACT_INVALID/);
  assert.match(migration, /PAID_PROVIDER_PRICE_BINDING_INVALID/);
  assert.match(migration, /PAID_ENVIRONMENT_MISMATCH/);
  assert.match(migration, /PAID_TEST_ONLY_REQUIRED/);
  assert.match(migration, /BASIC_PAID_READINESS_BLOCKED/);
});

test("paid event processing remains replay-safe and rejects stale ordering", () => {
  assert.match(migration, /BASIC_TEST_WEBHOOK_HASH_CONFLICT/);
  assert.match(migration, /OLDER_THAN_PROCESSED_EVENT/);
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\('basic-stripe-event:'/);
  assert.match(migration, /input_livemode is distinct from false/);
});

test("free AT pilot omits only billing and Stripe while all non-payment gates remain fail-closed", () => {
  for (const gate of ["legal", "privacy", "tax", "translation", "technical_smoke", "required_documents"]) {
    assert.match(migration, new RegExp(`'${gate}'`));
  }
  assert.match(migration, /billing_configuration_required',false/);
  assert.match(migration, /stripe_configuration_required',false/);
  assert.match(migration, /PILOT_POLICY_NOT_APPROVED/);
  assert.match(migration, /MANUAL_TRIAL_LEGAL_KYB_NOT_READY/);
  assert.match(migration, /KASSA_ACKNOWLEDGEMENT_REQUIRED/);
  assert.match(migration, /require_recent_platform_auth_internal\(\)/);
  assert.match(migration, /input_calendar_months not in \(1,3\)/);
  assert.match(migration, /public_country_release_changed',false/);
});

test("Vienna trial and redemption boundaries are server-derived and exclusive", () => {
  assert.match(migration, /vienna_calendar_month_boundary_internal/);
  assert.match(migration, /vienna_calendar_day_boundary_internal/);
  assert.match(migration, /boundary_timezone='Europe\/Vienna'/);
  assert.match(migration, /ends_at>statement_timestamp\(\)/);
  assert.match(timeContractMigration, /resolve_vienna_local_timestamp_internal/);
  assert.match(timeContractMigration, /default_roundtrip-input_local=interval '1 hour'/);
  assert.match(timeContractMigration, /select max\(candidate\)/);
  assert.match(timeContractMigration, /EXISTING_VIENNA_TRIAL_BOUNDARY_MISMATCH/);
  assert.match(timeContractMigration, /EXISTING_VIENNA_GRACE_BOUNDARY_MISMATCH/);
});

test("Platform Admin UI uses only server readiness and the fixed activation RPC", () => {
  assert.match(panel, /loadPlatformBasicPilotReadiness/);
  assert.match(panel, /activatePlatformBasicPilot/);
  assert.match(panel, /BASIC-TRIAL.*MONATE AKTIVIEREN/);
  assert.match(panel, /Keine Zahlungsmethode, keine Stripe-ID und keine automatische Verlängerung/);
  assert.match(service, /get_platform_basic_pilot_readiness/);
  assert.match(service, /activate_v1_manual_basic_trial/);
  assert.match(controlCenter, /PlatformBasicPilotActivationPanel/);
});
