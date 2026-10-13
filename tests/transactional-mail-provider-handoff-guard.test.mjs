import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL(
  "../supabase/migrations/20261013130000_transactional_mail_provider_handoff_guard.sql",
  import.meta.url,
), "utf8");
const dispatcher = await readFile(new URL(
  "../supabase/functions/transactional-mail-dispatcher/index.ts",
  import.meta.url,
), "utf8");

function body(name) {
  const start = migration.indexOf(`create or replace function public.${name}(`);
  assert.notEqual(start, -1, `${name} missing`);
  const end = migration.indexOf("$function$;", start);
  assert.notEqual(end, -1, `${name} incomplete`);
  return migration.slice(start, end);
}

test("provider handoff has terminal SUBMITTING and UNKNOWN states", () => {
  assert.match(migration, /'SUBMITTING'[\s\S]*'UNKNOWN'/);
  const begin = body("begin_customer_transactional_email_delivery");
  assert.match(begin, /customer_transactional_email_dispatch_block_reason/);
  assert.match(begin, /status = 'SUBMITTING'/);
  assert.match(begin, /status <> 'PROCESSING'/);
  const complete = body("complete_customer_transactional_email_delivery_v2");
  assert.match(complete,
    /input_outcome is null[\s\S]*input_outcome not in \('ACCEPTED', 'UNKNOWN'\)/);
  assert.match(complete, /status = 'SENT' and input_outcome = 'ACCEPTED'/);
  assert.match(complete, /status = 'UNKNOWN' and input_outcome = 'UNKNOWN'/);
  assert.match(complete, /status <> 'SUBMITTING'/);
  assert.doesNotMatch(complete, /status\s*=\s*'FAILED'|status\s*=\s*'PENDING'/);
});

test("browser roles cannot start or complete an SMTP handoff", () => {
  for (const name of [
    "begin_customer_transactional_email_delivery",
    "complete_customer_transactional_email_delivery_v2",
  ]) {
    assert.match(body(name), /auth\.role\(\) is distinct from 'service_role'/);
    assert.match(migration, new RegExp(
      `revoke all on function public\\.${name}\\([\\s\\S]*?from public, anon, authenticated`,
    ));
    assert.match(migration, new RegExp(
      `grant execute on function public\\.${name}\\([\\s\\S]*?to service_role`,
    ));
  }
});

test("dispatcher crosses begin immediately before SMTP and never retries unknown", () => {
  const beginIndex = dispatcher.indexOf('"begin_customer_transactional_email_delivery"');
  const sendIndex = dispatcher.indexOf("transporter.sendMail", beginIndex);
  const completeIndex = dispatcher.indexOf(
    '"complete_customer_transactional_email_delivery_v2"', sendIndex,
  );
  assert.ok(beginIndex >= 0 && beginIndex < sendIndex && sendIndex < completeIndex);
  assert.match(dispatcher, /input_outcome: accepted \? "ACCEPTED" : "UNKNOWN"/);
  assert.match(dispatcher, /providerSubmissionStarted[\s\S]*input_outcome: "UNKNOWN"/);
  assert.doesNotMatch(dispatcher.slice(sendIndex, completeIndex),
    /complete_customer_transactional_email[^\n]*input_success:\s*false/);
});
