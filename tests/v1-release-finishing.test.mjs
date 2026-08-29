import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL(
  "../supabase/migrations/20260809001000_v1_release_gift_presentations_notifications.sql",
  import.meta.url,
), "utf8");
const portal = await readFile(new URL("../src/modules/customer/CustomerPortal.tsx", import.meta.url), "utf8");
const service = await readFile(new URL("../src/modules/rewards/rewardService.ts", import.meta.url), "utf8");

test("gift presentation is assignment-bound, server-timed and single active", () => {
  assert.match(migration, /customer_reward_id uuid not null unique/);
  assert.match(migration, /expires_at = activated_at \+ interval '15 minutes'/);
  assert.match(migration, /for update/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /unique \(restaurant_id, customer_id, idempotency_key\)/);
});

test("gift start is tenant and customer scoped and retry-safe", () => {
  assert.match(migration, /token_record\.restaurant_id/);
  assert.match(migration, /customer_id = customer_record\.id/);
  assert.match(migration, /IDEMPOTENCY_KEY_PAYLOAD_MISMATCH/);
  assert.match(migration, /already_started', true/);
  assert.match(migration, /GIFT_NOT_AVAILABLE/);
});

test("gift completion is automatic, auditable and never deletes the assignment", () => {
  assert.match(migration, /complete_gift_redemption_presentations/);
  assert.match(migration, /status = 'redeemed', redeemed_at = input_now/);
  assert.match(migration, /GIFT_REDEMPTION_PRESENTATION_COMPLETED/);
  assert.match(migration, /redemption_activity_journal/);
  assert.doesNotMatch(migration, /delete from public\.customer_rewards/);
});

test("customer uses the same live display for points welcome and birthday gifts", () => {
  assert.match(service, /start_customer_gift_presentation/);
  assert.match(service, /get_customer_gift_presentation/);
  assert.match(portal, /loadCustomerGiftPresentation/);
  assert.match(portal, /startCustomerGiftPresentation/);
  assert.match(portal, /activePointsPresentation\.gift_type/);
  assert.match(portal, /Bitte erst vor dem Mitarbeiter bestätigen/);
  assert.match(portal, /<SwipeToRedeem/);
});

test("birthday assignment is exactly fourteen days early and annual-idempotent", () => {
  assert.match(migration, /birthday_date_value <> \(input_run_at at time zone membership\.timezone_name\)::date \+ 14/);
  assert.match(migration, /gift_type = 'birthday' and birthday_year = target_year/);
  assert.match(migration, /customer_rewards_one_birthday_gift_year_idx|unique_violation/);
  assert.match(migration, /v1_birthday_date/);
});

test("birthday e-mail and reminder are queued once without rolling back assignment", () => {
  assert.match(migration, /unique \(event_type, event_key\)/);
  assert.match(migration, /BIRTHDAY_GIFT_ASSIGNED/);
  assert.match(migration, /BIRTHDAY_GIFT_EXPIRY_REMINDER/);
  assert.match(migration, /status = 'active'/);
  assert.match(migration, /exception when others[\s\S]*return false/);
});

test("point reward notification reacts only to threshold crossings and can re-arm", () => {
  assert.match(migration, /previous_balance := current_balance - new\.points/);
  assert.match(migration, /not was_above and current_balance >= reward_record\.required_points/);
  assert.match(migration, /above_threshold = excluded\.above_threshold/);
  assert.match(migration, /POINT_REWARD_AVAILABLE/);
  assert.match(migration, /not is_starter_reward/);
});

test("transactional e-mail queue is private and service-role dispatch only", () => {
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on public\.customer_transactional_email_deliveries from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.reserve_customer_transactional_emails\(integer\) to service_role/);
  assert.doesNotMatch(migration, /grant .*customer_transactional_email_deliveries.*anon/i);
});
