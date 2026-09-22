import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL(
  "../supabase/migrations/20260922002000_customer_outbox_quarantine_contract.sql",
  import.meta.url,
), "utf8");

test("quarantine contract is fingerprint-bound and locks the complete pending set", () => {
  assert.match(migration, /input_expected_count is distinct from 21/);
  assert.match(migration, /d77ca91c88b1d288bc30ea3c40981ec5/);
  assert.match(migration, /where delivery\.status = 'PENDING'[\s\S]*for update/);
  assert.match(migration, /md5\(coalesce\(string_agg\(to_jsonb\(locked\)::text, '\|' order by locked\.id\), ''\)\)/);
  assert.match(migration, /CUSTOMER_OUTBOX_QUARANTINE_PREFLIGHT_MISMATCH/);
});

test("quarantine changes only untouched pending rows without a delivery attempt", () => {
  assert.match(migration, /delivery\.attempt_count <> 0/);
  assert.match(migration, /delivery\.processing_started_at is not null/);
  assert.match(migration, /status = 'SKIPPED'/);
  assert.match(migration, /last_error_code = 'HISTORICAL_STAGING_TEST_DATA'/);
  assert.match(migration, /last_error = 'HISTORICAL_STAGING_TEST_DATA'/);
  const updateBody = migration.slice(migration.indexOf("update public.customer_transactional_email_deliveries"), migration.indexOf("  where delivery.id = any(target_ids)"));
  assert.doesNotMatch(updateBody, /attempt_count\s*=/);
  assert.doesNotMatch(updateBody, /delete from|provider_message_id\s*=/i);
});

test("quarantine audit is immutable, identity-bound and inaccessible to runtime roles", () => {
  assert.match(migration, /create table if not exists public\.customer_transactional_email_quarantine_audit/);
  assert.match(migration, /target_delivery_ids uuid\[\] not null/);
  assert.match(migration, /before_fingerprint text not null/);
  assert.match(migration, /executed_by_database_role text not null/);
  assert.match(migration, /executed_by_auth_uid uuid/);
  assert.match(migration, /before update or delete/);
  assert.match(migration, /CUSTOMER_TRANSACTIONAL_EMAIL_QUARANTINE_AUDIT_IMMUTABLE/);
  assert.match(migration, /session_user/);
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /revoke execute on function public\.quarantine_historical_staging_customer_outbox\(integer, text\)[\s\S]*from public, anon, authenticated, service_role/);
});

test("migration installs no automatic quarantine, scheduler or email side effect", () => {
  assert.doesNotMatch(migration, /select public\.quarantine_historical_staging_customer_outbox/);
  assert.doesNotMatch(migration, /cron\.schedule|net\.http_post|smtp|send_email/i);
  assert.doesNotMatch(migration, /delete from public\.customer_transactional_email_deliveries/i);
});
