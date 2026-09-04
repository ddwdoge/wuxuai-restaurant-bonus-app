import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getOperationalReasonLabel, getOperationalStatusPresentation } from "../src/modules/platform/platformOperationalTelemetryView.mjs";

const migration = readFileSync(new URL("../supabase/migrations/20260904001000_platform_admin_v1_operational_telemetry.sql", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/modules/platform/PlatformAdminPage.tsx", import.meta.url), "utf8");
const component = readFileSync(new URL("../src/modules/platform/PlatformOperationalTelemetry.tsx", import.meta.url), "utf8");
const service = readFileSync(new URL("../src/modules/platform/platformAdminService.ts", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("globale Telemetrie bleibt ausschließlich Platform-Admin autorisiert", () => {
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = public, pg_temp/);
  assert.match(migration, /if not public\.is_platform_admin\(\)/);
  assert.match(migration, /errcode = '42501'/);
  assert.match(migration, /revoke execute[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute[\s\S]*to authenticated/);
  assert.doesNotMatch(migration, /service[_-]?role|auth\.jwt|user_metadata|app_metadata/i);
});

test("Cron-Telemetrie prüft genau sieben kanonische Jobs und vorhandene Laufnachweise", () => {
  const expectedJobs = [
    "wuxuai-v1-birthday-gifts-daily",
    "wuxuai-v1-expire-redemption-codes",
    "wuxuai-v1-complete-points-presentations",
    "wuxuai-v1-expiry-reminders-daily",
    "wuxuai-v1-expire-bonus-boosts",
    "wuxuai-v1-birthday-gift-reminders",
    "wuxuai-v1-complete-gift-presentations",
  ];
  for (const job of expectedJobs) assert.match(migration, new RegExp(job));
  assert.match(migration, /to_regclass\('cron\.job'\)/);
  assert.match(migration, /to_regclass\('cron\.job_run_details'\)/);
  assert.match(migration, /configured_job_count/);
  assert.match(migration, /enabled_job_count/);
  assert.match(migration, /no_job_run_history/);
});

test("E-Mail und Registrierung verwenden nur bestehende sichere Aggregatquellen", () => {
  assert.match(migration, /public\.customer_transactional_email_deliveries/);
  assert.match(migration, /public\.audit_log/);
  assert.match(migration, /CUSTOMER_REGISTERED/);
  assert.match(migration, /OWNER_TRIAL_STARTED/);
  assert.match(migration, /RESTAURANT_ONBOARDING_COMPLETED/);
  assert.match(migration, /not audit\.is_test_event/);
  assert.doesNotMatch(migration, /auth\.users|customer_email|provider_message_id|last_error[^_]/i);
  assert.doesNotMatch(migration, /insert\s+into|update\s+public|delete\s+from/i);
});

test("fehlende und leere Quellen werden niemals als gesund ausgegeben", () => {
  assert.deepEqual(getOperationalStatusPresentation("healthy"), { label: "Betriebsbereit", tone: "success" });
  assert.deepEqual(getOperationalStatusPresentation("no_recent_events"), { label: "Keine aktuellen Ereignisse", tone: "neutral" });
  assert.deepEqual(getOperationalStatusPresentation("degraded"), { label: "Eingeschränkt", tone: "warning" });
  assert.deepEqual(getOperationalStatusPresentation("error"), { label: "Fehler", tone: "danger" });
  assert.deepEqual(getOperationalStatusPresentation("unavailable"), { label: "Nicht verfügbar", tone: "neutral" });
  assert.doesNotMatch(migration, /unavailable[^\n]{0,100}healthy/);
  assert.doesNotMatch(migration, /no_recent_events[^\n]{0,100}healthy/);
  assert.equal(getOperationalReasonLabel("expected_jobs_missing"), "Nicht alle sieben erwarteten Jobs sind konfiguriert.");
  assert.equal(getOperationalReasonLabel("failed_deliveries_present"), "In der Versandwarteschlange liegen fehlgeschlagene Zustellungen vor.");
  assert.equal(getOperationalReasonLabel("no_recent_registration_events"), "In den letzten sieben Tagen wurden keine Registrierungen erfasst.");
  assert.equal(getOperationalReasonLabel("unknown_internal_reason"), "Der Betriebsnachweis ist derzeit nicht eindeutig verfügbar.");
  assert.doesNotMatch(component, /Nachweis: \{data\.(cron|registration)\.reason\}/);
});

test("Dashboard lädt den eng begrenzten RPC und zeigt die drei freigegebenen Bereiche", () => {
  assert.match(service, /supabase\.rpc\("get_platform_operational_telemetry"\)/);
  assert.doesNotMatch(service, /loadPlatformOperationalTelemetry[\s\S]{0,600}\.from\(/);
  assert.match(page, /<OperationalTelemetry/);
  for (const label of ["Cron \/ Scheduler", "Transaktions-E-Mail", "Registrierungen"]) {
    assert.match(component, new RegExp(label));
  }
  assert.match(component, /Nicht aus der Datenbank prüfbar/);
});

test("Audit-Aktionen besitzen mindestens 44 Pixel Touchfläche", () => {
  assert.match(styles, /\.platform-audit-shell \.platform-admin-header-actions \.button,[\s\S]*\.platform-audit-shell \.platform-audit-toggle-row \.button[\s\S]*min-height: 45px/);
});

test("responsive Telemetrie bleibt innerhalb der Platform-Admin-Seite", () => {
  assert.match(styles, /\.platform-operational-grid[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(max-width: 820px\)[\s\S]*\.platform-operational-grid[\s\S]*grid-template-columns: 1fr/);
  assert.match(styles, /min-width: 0/);
  assert.match(styles, /overflow-wrap: anywhere/);
});
