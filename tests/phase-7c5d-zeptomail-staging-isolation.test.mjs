import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";

const migration = readFileSync(new URL("../supabase/migrations/20260922001000_capacity_warning_synthetic_staging_test.sql", import.meta.url), "utf8");
const worker = readFileSync(new URL("../supabase/functions/transactional-mail-dispatcher/index.ts", import.meta.url), "utf8");

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
  assert.match(worker, /reserve_capacity_warning_synthetic_email_test/);
  const isolated = worker.slice(worker.indexOf("if (syntheticRequest)"), worker.indexOf("const { data: customerData"));
  assert.doesNotMatch(isolated, /reserve_customer_transactional_emails|reserve_capacity_warning_emails/);
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
