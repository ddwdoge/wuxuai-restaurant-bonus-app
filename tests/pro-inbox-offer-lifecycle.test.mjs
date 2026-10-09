import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const migration = readFileSync(new URL(
  '../supabase/migrations/20261008231214_pro_inbox_offer_lifecycle_visibility.sql',
  import.meta.url,
), 'utf8');

test('offer inbox readback keeps only currently published, active and unexpired sources', () => {
  assert.match(migration, /notification\.event_type = 'OFFER_PUBLISHED'[\s\S]*?offer\.status = 'PUBLISHED'[\s\S]*?offer\.is_active is true[\s\S]*?offer\.valid_to > statement_timestamp\(\)/);
  assert.match(migration, /notification\.event_type = 'POINT_REWARD_AVAILABLE' and reward_enabled/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.customer_pro_in_app_notifications/i);
});

test('hidden offer cannot be marked read; customer RPC permissions remain explicit', () => {
  assert.match(migration, /notification_record\.event_type = 'OFFER_PUBLISHED'[\s\S]*?PRO_IN_APP_OFFER_INACTIVE/);
  assert.match(migration, /revoke execute on function public\.get_customer_pro_in_app_inbox\(text, text\) from public/);
  assert.match(migration, /grant execute on function public\.get_customer_pro_in_app_inbox\(text, text\) to anon, authenticated/);
  assert.match(migration, /revoke execute on function public\.mark_customer_pro_in_app_notification_read\(text, text, uuid\)[\s\S]*?from public/);
  assert.match(migration, /grant execute on function public\.mark_customer_pro_in_app_notification_read\(text, text, uuid\)[\s\S]*?to anon, authenticated/);
});
