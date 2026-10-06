import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL(
  "../supabase/migrations/20261006170000_pro_notification_consent_delivery_stop.sql",
  import.meta.url,
), "utf8");

test("PRO in-app generation remains synthetic and requires a confirmed linked identity", () => {
  assert.match(migration, /pro_in_app_test_scope_allowed_internal/);
  assert.match(migration, /customer\.is_test_customer is true/);
  assert.match(migration, /environment\.environment = 'STAGING'/);
  assert.match(migration, /join public\.customer_account_memberships membership/);
  assert.match(migration, /account\.auth_user_id is not null/);
  assert.match(migration, /account\.email_confirmed_at is not null/);
  assert.match(migration, /account\.disabled_at is null/);
  assert.match(migration, /revoke execute on function public\.pro_in_app_test_scope_allowed_internal\(uuid, uuid\)/);
});

test("PRO email is gated at creation without changing ordinary birthday events", () => {
  const enqueue = migration.slice(
    migration.indexOf("create or replace function public.enqueue_customer_transactional_email"),
    migration.indexOf("create or replace function public.customer_transactional_email_dispatch_block_reason"),
  );
  assert.match(enqueue, /if input_event_type = 'POINT_REWARD_AVAILABLE' then\s+return false/);
  assert.match(enqueue, /restaurant_entitlement_enabled\(input_restaurant_id, 'offer_notifications'\)/);
  assert.match(enqueue, /consent\.status = 'ACTIVE'/);
  assert.match(enqueue, /consent\.frequency in \('WEEKLY', 'MONTHLY'\)/);
  assert.match(enqueue, /consent\.withdrawn_at is null/);
  assert.match(enqueue, /consent\.consent_version/);
  assert.match(enqueue, /input_event_type <> 'OFFER_PUBLISHED'/);
  assert.match(enqueue, /on conflict \(event_type, event_key\) do nothing/);
});

test("queued PRO email rechecks identity, consent and entitlement; old evidence stays", () => {
  assert.match(migration, /consent\.updated_at <= delivery_record\.created_at/);
  assert.match(migration, /customer\.auth_user_id is null or customer\.auth_user_id = account\.auth_user_id/);
  assert.match(migration, /REWARD_EMAIL_CONSENT_CONTRACT_MISSING/);
  assert.match(migration, /PRO_ENTITLEMENT_INACTIVE/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.customer_transactional_email_deliveries/i);
  assert.doesNotMatch(migration, /grant execute on function public\.(?:enqueue_customer_transactional_email|customer_transactional_email_dispatch_block_reason)[\s\S]*to (?:anon|authenticated)/i);
});
