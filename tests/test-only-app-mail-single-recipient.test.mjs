import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(new URL(
  "../supabase/migrations/20261013140000_test_only_app_mail_single_recipient.sql",
  import.meta.url,
), "utf8");
const worker = readFileSync(new URL(
  "../supabase/functions/test-only-app-mail-dispatch/index.ts",
  import.meta.url,
), "utf8");
const config = readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8");

const projectRef = "mbgveqbhessaunrhfudm";
const origin = "https://staging-v2.bonus.wuxuaisbi.com";
const eventType = "TEST_ONLY_APP_MAIL_SMOKE";
const subject = "[TEST_ONLY] WUXUAI Staging-v2 App-Mail";
const text = "TEST_ONLY – synthetischer Staging-v2-App-Mailnachweis.\n\n"
  + "Dieses Ereignis ist kein Angebot, keine Aktivierung und keine reale Kundenkommunikation.\n\n"
  + `Projekt: ${projectRef}\nOrigin: ${origin}\nVertrag: ${eventType}/v1`;
const html = `<!doctype html><html lang="de"><body><h1>TEST_ONLY</h1><p>Synthetischer `
  + "Staging-v2-App-Mailnachweis.</p><p>Dieses Ereignis ist kein Angebot, keine Aktivierung "
  + `und keine reale Kundenkommunikation.</p><p>Projekt: ${projectRef}<br>Origin: ${origin}`
  + `<br>Vertrag: ${eventType}/v1</p></body></html>`;
const contentSha256 = createHash("sha256")
  .update(JSON.stringify({ subject, text, html }))
  .digest("hex");

test("TEST_ONLY app-mail is one project, one origin, one event and one recipient binding", () => {
  assert.equal(contentSha256, "1663c63b2cf0edc11188a8fdf035e726704e10a1bfb33cce6703346cad0c30bb");
  for (const source of [migration, worker]) {
    assert.match(source, new RegExp(projectRef, "g"));
    assert.match(source, new RegExp(origin.replaceAll(".", "\\."), "g"));
    assert.match(source, new RegExp(eventType, "g"));
    assert.match(source, new RegExp(contentSha256, "g"));
  }
  assert.match(migration, /singleton boolean primary key default true check \(singleton\)/);
  assert.match(migration, /recipient_email = lower\(trim\(recipient_email\)\)/);
  assert.match(migration, /unique \(binding_id, event_type, event_version\)/);
  assert.match(migration, /TEST_ONLY_APP_MAIL_BINDING_CONFLICT/);
  assert.match(migration, /TEST_ONLY_APP_MAIL_RECIPIENT_NOT_ELIGIBLE/);
  assert.doesNotMatch(worker, /recipient_email|input_recipient/i,
    "the request must not select its own recipient");
  assert.match(worker, /to: delivery\.email/);
});

test("the private queue, provider receipt and audit evidence are separated and immutable", () => {
  for (const table of ["recipient_binding", "queue", "provider_receipts", "audit"]) {
    assert.match(migration, new RegExp(`alter table test_only_app_mail\\.${table} enable row level security`));
  }
  assert.match(migration, /revoke all on schema test_only_app_mail from public, anon, authenticated, service_role/);
  assert.match(migration, /revoke all on all tables in schema test_only_app_mail from public, anon, authenticated, service_role/);
  assert.match(migration, /TEST_ONLY_APP_MAIL_EVIDENCE_IMMUTABLE/);
  assert.match(migration, /create table test_only_app_mail\.queue/);
  assert.match(migration, /create table test_only_app_mail\.provider_receipts/);
  assert.match(migration, /create table test_only_app_mail\.audit/);
  assert.match(migration, /status in \([\s\S]*'ACCEPTED', 'UNKNOWN', 'SKIPPED'/);
  assert.match(migration, /attempt_count between 0 and 1/);
  assert.match(migration, /queue_record\.status <> 'PENDING' then return/);
  assert.match(migration, /if receipt_record\.id is not null then[\s\S]*return receipt_record\.outcome = input_outcome/);
  assert.doesNotMatch(migration, /UNKNOWN'[\s\S]{0,180}(?:PENDING|RESERVED)/,
    "UNKNOWN must never transition back into a reservable state");
});

test("only fixed-search-path service RPCs can drive the single delivery", () => {
  for (const signature of [
    "enqueue_test_only_app_mail(uuid, uuid, integer, text)",
    "reserve_test_only_app_mail(uuid)",
    "begin_test_only_app_mail_delivery(uuid)",
    "complete_test_only_app_mail_delivery(uuid, text, text, text)",
    "get_test_only_app_mail_result(uuid)",
  ]) {
    assert.match(migration, new RegExp(`grant execute on function public\\.${signature.replace(/[()]/g, "\\$&")}[\\s\\S]{0,80}to service_role`));
  }
  assert.match(migration, /security definer\nset search_path = pg_catalog, public, test_only_app_mail/g);
  assert.match(migration, /session_user <> 'postgres' or current_user <> 'postgres'/);
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\('test-only-app-mail-binding', 0\)\)/g);
  assert.match(migration, /deterministic_message_id = '<wuxuai-test-only-' \|\| id::text \|\| '@wuxuai\.invalid>'/);
  assert.match(migration, /BINDING_REVOKED/);
  assert.match(migration, /CONTRACT_VERSION_CHANGED/);
});

test("the Edge function performs the final DB check immediately before one SMTP handoff", () => {
  const begin = worker.indexOf('service.rpc(\n    "begin_test_only_app_mail_delivery"');
  const handoff = worker.indexOf("await transporter.sendMail", begin);
  assert.ok(begin > 0 && handoff > begin);
  const boundary = worker.slice(begin, handoff);
  assert.equal((boundary.match(/\bawait\b/g) ?? []).length, 0,
    "nothing else may be awaited after the begin RPC starts and before provider handoff");
  assert.match(worker, /messageId: delivery\.deterministic_message_id/);
  assert.match(worker, /input_outcome: accepted \? "ACCEPTED" : "UNKNOWN"/);
  assert.match(worker, /catch \(error\)[\s\S]*input_outcome: "UNKNOWN"/);
  assert.match(worker, /mode === "local_catcher"[\s\S]*localSmtpHostAllowed/);
  assert.match(worker, /!smtpUsername && !smtpPassword/);
  assert.match(worker, /computedContentSha256 !== CONTENT_SHA256/);
  assert.match(config, /\[functions\.test-only-app-mail-dispatch\]\nverify_jwt = false/);
});

test("real mail, billing and entitlement writers are not referenced", () => {
  const combined = `${migration}\n${worker}`;
  for (const forbidden of [
    "customer_offer_email_deliveries",
    "customer_transactional_email_deliveries",
    "customer_offer_email_confirmation_outbox",
    "commercial_pro_access_grants",
    "billing_trial_claims",
    "basic_test_checkout_requests",
    "stripe",
    "cron.schedule",
  ]) assert.doesNotMatch(combined, new RegExp(forbidden, "i"), forbidden);
  const executableTopLevel = migration.slice(0, migration.indexOf("create function"));
  assert.doesNotMatch(executableTopLevel, /insert into test_only_app_mail\.(?:recipient_binding|queue)/i,
    "migration application itself must not seed a binding or event");
});
