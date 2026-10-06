import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL(
  "../supabase/migrations/20260926003000_pro_notification_dispatch_authorization.sql",
  import.meta.url,
), "utf8");
const dispatcher = await readFile(new URL(
  "../supabase/functions/transactional-mail-dispatcher/index.ts",
  import.meta.url,
), "utf8");

test("reservation rechecks the current PRO entitlement and event-specific consent", () => {
  assert.match(migration, /customer_transactional_email_dispatch_block_reason/);
  assert.match(migration, /restaurant_entitlement_enabled\([\s\S]*'offer_notifications'/);
  assert.match(migration, /restaurant_entitlement_enabled\([\s\S]*'reward_notifications'/);
  assert.match(migration, /consent\.status = 'ACTIVE'/);
  assert.match(migration, /consent\.frequency in \('WEEKLY', 'MONTHLY'\)/);
  assert.match(migration, /consent\.email_confirmed_at is not null/);
  assert.match(migration, /consent\.withdrawn_at is null/);
  assert.match(migration, /consent\.updated_at <= delivery_record\.created_at/);
  assert.match(migration, /customer\.membership_status = 'active'/);
  assert.match(migration, /REWARD_EMAIL_CONSENT_CONTRACT_MISSING/);
});

test("blocked queue rows are retained in a terminal, classified state", () => {
  assert.match(migration, /set status = 'SKIPPED'/);
  assert.match(migration, /PRO_ENTITLEMENT_INACTIVE/);
  assert.match(migration, /OFFER_EMAIL_CONSENT_INACTIVE/);
  assert.match(migration, /REWARD_EMAIL_CONSENT_CONTRACT_MISSING/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.customer_transactional_email_deliveries/i);
  assert.doesNotMatch(migration, /truncate\s+public\.customer_transactional_email_deliveries/i);
});

test("dispatcher performs the final service-only authorization immediately before provider work", () => {
  assert.match(migration, /coalesce\(auth\.role\(\), ''\) <> 'service_role'/);
  assert.match(migration, /for update;/);
  assert.match(migration, /grant execute on function public\.authorize_customer_transactional_email_delivery\(uuid\)[\s\S]*to service_role/);
  assert.doesNotMatch(migration, /grant execute on function public\.authorize_customer_transactional_email_delivery\(uuid\)[\s\S]*to (anon|authenticated)/);

  const authorizationIndex = dispatcher.indexOf('"authorize_customer_transactional_email_delivery"');
  const recipientIndex = dispatcher.indexOf("resolveRecipientContext");
  const sendIndex = dispatcher.indexOf("transporter.sendMail", authorizationIndex);
  assert.ok(authorizationIndex >= 0);
  assert.ok(authorizationIndex > recipientIndex);
  assert.ok(sendIndex > authorizationIndex);
  assert.match(dispatcher, /if \(!authorization\?\.authorized\)[\s\S]*continue;/);
  assert.match(dispatcher, /DISPATCH_AUTHORIZATION_FAILED/);
  assert.match(dispatcher, /typeof error === "string"/);
});

test("existing birthday delivery and scheduler contracts are not broadened", () => {
  assert.match(migration, /if delivery_record\.event_type = 'OFFER_PUBLISHED'/);
  assert.match(migration, /if delivery_record\.event_type = 'POINT_REWARD_AVAILABLE'/);
  assert.match(migration, /return null;\s*end;/);
  assert.doesNotMatch(migration, /cron\.schedule|cron\.unschedule|net\.http_post/i);
  assert.doesNotMatch(dispatcher, /in_app|push_notification/i);
});
