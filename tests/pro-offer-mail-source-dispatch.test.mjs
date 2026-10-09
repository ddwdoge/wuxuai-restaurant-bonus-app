import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL(
  "../supabase/migrations/20261009063822_pro_offer_mail_source_dispatch_gate.sql",
  import.meta.url,
), "utf8");

test("offer mail rechecks the exact current publication before provider authorization", () => {
  assert.match(migration, /create or replace function public\.customer_transactional_email_dispatch_block_reason/);
  assert.match(migration, /offer\.restaurant_id = delivery_record\.restaurant_id/);
  assert.match(migration, /restaurant\.status = 'active'/);
  assert.match(migration, /branch\.restaurant_id = offer\.restaurant_id/);
  assert.match(migration, /branch\.status = 'active'/);
  assert.match(migration, /offer\.status = 'PUBLISHED'/);
  assert.match(migration, /offer\.is_active is true/);
  assert.match(migration, /offer\.valid_from <= statement_timestamp\(\)/);
  assert.match(migration, /offer\.valid_to > statement_timestamp\(\)/);
  assert.match(migration, /offer\.publication_version::text[\s\S]*delivery_record\.customer_id::text = delivery_record\.event_key/);
  assert.match(migration, /return 'OFFER_SOURCE_INACTIVE'/);
});

test("existing entitlement, consent and reward fail-closed checks remain", () => {
  assert.match(migration, /restaurant_entitlement_enabled\([\s\S]*'offer_notifications'/);
  assert.match(migration, /consent\.status = 'ACTIVE'/);
  assert.match(migration, /consent\.withdrawn_at is null/);
  assert.match(migration, /customer\.membership_status = 'active'/);
  assert.match(migration, /return 'REWARD_EMAIL_CONSENT_CONTRACT_MISSING'/);
  assert.doesNotMatch(migration, /delete\s+from|truncate\s+public\.customer_transactional_email_deliveries/i);
  assert.match(migration, /revoke execute on function public\.customer_transactional_email_dispatch_block_reason\(uuid\)[\s\S]*from public, anon, authenticated, service_role/);
});
