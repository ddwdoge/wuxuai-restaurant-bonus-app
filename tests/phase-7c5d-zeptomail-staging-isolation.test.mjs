import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";
import {
  renderOwnerCapacityWarningMail,
  renderSyntheticCapacityTestMail,
} from "../supabase/functions/_shared/transactionalMailTemplates.mjs";

const migration = readFileSync(new URL("../supabase/migrations/20260922001000_capacity_warning_synthetic_staging_test.sql", import.meta.url), "utf8");
const worker = readFileSync(new URL("../supabase/functions/transactional-mail-dispatcher/index.ts", import.meta.url), "utf8");
const schedulerMigration = readFileSync(new URL("../supabase/migrations/20260922003000_synthetic_mail_scheduler_test_contract.sql", import.meta.url), "utf8");
const requestId = "75d6d87d-860f-4b64-8cd7-9aa7cc219001";
const correlationId = "75d6d87d-860f-4b64-8cd7-9aa7cc219002";

test("synthetic renderer is visibly test-only and has no commercial action", () => {
  const mail = renderSyntheticCapacityTestMail({
    environment: "staging",
    syntheticTest: true,
    requestId,
    correlationId,
  });
  assert.equal(mail.subject, "[STAGING TEST] WUXUAI® Bonus Kapazitätswarnung");
  for (const output of [mail.text, mail.html]) {
    assert.match(output, /Synthetische Staging-Testnachricht/);
    assert.match(output, /keine echte Kapazitätswarnung/i);
    assert.match(output, /keine Buchung, Abbuchung oder Tarifänderung/i);
    assert.match(output, new RegExp(requestId));
    assert.match(output, new RegExp(correlationId));
    assert.doesNotMatch(output, /kaufen|upgrade|checkout|billing|Tarif & Kapazität öffnen|Deine Kapazität braucht Aufmerksamkeit/i);
    assert.doesNotMatch(output, /Restaurant|Kunde|verwendet|verfügbar|Prognose/i);
  }
  assert.doesNotMatch(mail.html, /<a\b|https?:\/\//i);
});

test("synthetic renderer rejects incomplete or non-staging contracts", () => {
  assert.throws(() => renderSyntheticCapacityTestMail({ environment: "production", syntheticTest: true, requestId, correlationId }), /STAGING_ONLY/);
  assert.throws(() => renderSyntheticCapacityTestMail({ environment: "staging", syntheticTest: false, requestId, correlationId }), /STAGING_ONLY/);
  assert.throws(() => renderSyntheticCapacityTestMail({ environment: "staging", syntheticTest: true, requestId: "", correlationId }), /IDS_REQUIRED/);
  assert.throws(() => renderSyntheticCapacityTestMail({ environment: "staging", syntheticTest: true, requestId, correlationId: "" }), /IDS_REQUIRED/);
});

test("normal capacity renderer remains byte-stable across all seven languages", () => {
  const outputs = ["de", "en", "fr", "it", "es", "zh", "ko"].map((language) => renderOwnerCapacityWarningMail({
    restaurantName: "Regression Restaurant",
    payload: { capacity_type: "offer", warning_level: "90", usage: 9, effective_limit: 10, remaining: 1, projected_usage_7d: 10, language },
    appBaseUrl: "https://staging-app.bonus.wuxuaisbi.com",
    language,
  }));
  assert.equal(createHash("sha256").update(JSON.stringify(outputs)).digest("hex"), "6c0d8e28f68307169b461970fcfcab43e78dd94c8cc7a2a250f9d8058daf974f");
});

test("synthetic transport uses a separate private staging-only table", () => {
  assert.match(migration, /create table if not exists public\.capacity_warning_synthetic_email_tests/);
  assert.match(migration, /environment = 'staging'/);
  assert.match(migration, /synthetic_test boolean not null check \(synthetic_test\)/);
  assert.match(migration, /office@wuxuaisbi\.com/);
  assert.match(migration, /notifications@wuxuaibonus\.com/);
  assert.match(migration, /support@wuxuaibonus\.com/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.capacity_warning_synthetic_email_tests/);
});

test("request and correlation ids are mandatory, unique and collision-safe", () => {
  assert.match(migration, /SYNTHETIC_TEST_IDS_REQUIRED/);
  assert.match(migration, /unique \(request_id, correlation_id\)/);
  assert.match(migration, /capacity_warning_synthetic_request_id_idx/);
  assert.match(migration, /capacity_warning_synthetic_correlation_id_idx/);
  assert.match(migration, /SYNTHETIC_TEST_IDEMPOTENCY_COLLISION/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /for update/);
});

test("reservation targets only the exact synthetic row and never scans existing outboxes", () => {
  const reserve = migration.slice(
    migration.indexOf("create or replace function public.reserve_capacity_warning_synthetic_email_test"),
    migration.indexOf("create or replace function public.complete_capacity_warning_synthetic_email_test"),
  );
  assert.match(reserve, /test\.request_id = input_request_id/);
  assert.match(reserve, /test\.correlation_id = input_correlation_id/);
  assert.doesNotMatch(reserve, /customer_transactional_email_deliveries|capacity_warning_deliveries|reserve_customer_transactional_emails|reserve_capacity_warning_emails/);
  assert.match(reserve, /if reserved_record\.status <> 'PENDING' then/);
});

test("staging synthetic mode blocks general queue processing fail-closed", () => {
  assert.match(worker, /TRANSACTIONAL_MAIL_MODE/);
  assert.match(worker, /staging_synthetic_only/);
  assert.match(worker, /staging_synthetic_contract_required/);
  assert.match(worker, /STAGING_TEST_RECIPIENT/);
  assert.match(worker, /office@wuxuaisbi\.com/);
  assert.match(worker, /message_type !== "synthetic_capacity"/);
  assert.match(worker, /reserve_capacity_warning_synthetic_email_test/);
  const isolated = worker.slice(worker.indexOf("if (syntheticRequest)"), worker.indexOf("const { data: customerData"));
  assert.doesNotMatch(isolated, /reserve_customer_transactional_emails|reserve_capacity_warning_emails/);
  assert.match(worker, /renderSyntheticCapacityTestMail/);
  assert.match(worker, /delivery\.queue_kind === "synthetic_capacity"/);
});

test("scheduled synthetic mode requires a one-time database authorization", () => {
  assert.match(worker, /scheduled_synthetic_capacity_test/);
  assert.match(worker, /scheduler_token/);
  assert.match(worker, /authorize_capacity_warning_synthetic_scheduler_test/);
  assert.match(worker, /authorizationError \|\| authorized !== true/);
  const isolated = worker.slice(worker.indexOf("if (syntheticRequest)"), worker.indexOf("const { data: customerData"));
  assert.match(isolated, /if \(!scheduledSyntheticRequest\)/);
  assert.match(isolated, /reserve_capacity_warning_synthetic_email_test/);
  assert.doesNotMatch(isolated, /reserve_customer_transactional_emails|reserve_capacity_warning_emails/);
});

test("one-shot scheduler contract cannot scan general queues or disclose its token", () => {
  assert.match(schedulerMigration, /create extension if not exists pg_net/);
  assert.match(schedulerMigration, /SYNTHETIC_SCHEDULER_POSTGRES_ONLY/);
  assert.match(schedulerMigration, /office@wuxuaisbi\.com/);
  assert.match(schedulerMigration, /notifications@wuxuaibonus\.com/);
  assert.match(schedulerMigration, /support@wuxuaibonus\.com/);
  assert.match(schedulerMigration, /extensions\.digest\(scheduler_token, 'sha256'\)/);
  assert.match(schedulerMigration, /token_hash = null/);
  assert.match(schedulerMigration, /perform cron\.unschedule\(run_record\.cron_job_name\)/);
  assert.match(schedulerMigration, /grant execute on function public\.authorize_capacity_warning_synthetic_scheduler_test[\s\S]*to service_role/);
  assert.match(schedulerMigration, /revoke execute on function public\.schedule_capacity_warning_synthetic_email_test[\s\S]*service_role/);
  assert.doesNotMatch(schedulerMigration, /customer_transactional_email_deliveries|capacity_warning_deliveries|reserve_customer_transactional_emails|reserve_capacity_warning_emails/);
  assert.doesNotMatch(worker, /console\.(?:log|info|error)\([^\n]*(scheduler_token|schedulerSecret)/);
});

test("sender, reply-to and provider acceptance are bound to the isolated record", () => {
  assert.match(worker, /SMTP_REPLY_TO/);
  assert.match(worker, /replyTo: replyToEmail/);
  assert.match(worker, /complete_capacity_warning_synthetic_email_test/);
  assert.match(worker, /provider_accepted: sent === 1 && failed === 0/);
  assert.doesNotMatch(worker, /console\.(?:log|info|error)\([^\n]*(recipient|smtpPassword|serviceRoleKey|schedulerSecret)/);
});

test("synthetic audit is append-only and stores no recipient address", () => {
  assert.match(migration, /CAPACITY_WARNING_SYNTHETIC_AUDIT_APPEND_ONLY/);
  const auditTable = migration.slice(
    migration.indexOf("create table if not exists public.capacity_warning_synthetic_email_audit"),
    migration.indexOf("alter table public.capacity_warning_synthetic_email_tests"),
  );
  assert.doesNotMatch(auditTable, /recipient_email|sender_email|reply_to_email|payload jsonb/);
  assert.match(auditTable, /PROVIDER_ACCEPTED/);
});
