import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260722003000_v1_retention_features.sql", import.meta.url), "utf8");
const giftMigration = readFileSync(new URL("../supabase/migrations/20260714002000_daily_pin_booking_gifts_redemption_v1.sql", import.meta.url), "utf8");
const portal = readFileSync(new URL("../src/modules/customer/CustomerPortal.tsx", import.meta.url), "utf8");
const retentionService = readFileSync(new URL("../src/modules/customer/retentionService.ts", import.meta.url), "utf8");
const serviceWorker = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
const pushFunction = readFileSync(new URL("../supabase/functions/expiry-reminders/index.ts", import.meta.url), "utf8");

test("expiry reminders are unique for the four V1 stages", () => {
  assert.match(migration, /reminder_stage in \(7, 3, 1, 0\)/);
  assert.match(migration, /expiry_reminders_unique_stage_idx/);
  assert.match(migration, /EXPIRY_REMINDER_CREATED/);
  assert.match(portal, /wuxuai:expiry-reminders:/);
  assert.match(portal, /Bald ablaufend/);
});

test("push remains opt-in and opens only the customer reward route", () => {
  assert.match(retentionService, /Notification\.requestPermission\(\)/);
  assert.match(retentionService, /permission !== "granted"/);
  assert.match(serviceWorker, /notificationclick/);
  assert.match(serviceWorker, /clients\.openWindow/);
  assert.doesNotMatch(serviceWorker, /redeem|consume/i);
  assert.match(pushFunction, /VAPID_PRIVATE_KEY/);
  assert.match(pushFunction, /EXPIRY_REMINDER_SCHEDULER_SECRET/);
  assert.match(pushFunction, /x-wuxuai-scheduler-secret/);
  assert.match(pushFunction, /statusCode === 404 \|\| statusCode === 410/);
  assert.match(pushFunction, /test_session_id: customer\?\.test_session_id \?\? null/);
  assert.match(portal, /searchParams\.get\("reminder"\)/);
  assert.match(portal, /searchParams\.get\("reward"\)/);
  assert.match(portal, /setRedemptionDrawerOpen\(true\)/);
});

test("birthday gift draw is server-side, idempotent, and uses only active pool rewards", () => {
  assert.match(migration, /draw_customer_birthday_gift/);
  assert.match(giftMigration, /customer_rewards_one_birthday_gift_year_idx/);
  assert.match(migration, /birthday_pool_enabled = true and active = true/);
  assert.match(migration, /order by encode\(extensions\.gen_random_bytes\(16\), 'hex'\)/);
  assert.match(migration, /exception when unique_violation/);
  assert.match(migration, /BIRTHDAY_GIFT_DRAWN/);
  assert.match(migration, /BIRTHDAY_GIFT_DRAW_BLOCKED/);
  assert.match(portal, /Geschenk abholen/);
});

test("legacy birthday cron is disabled in favor of explicit customer draw", () => {
  assert.match(migration, /wuxuai-v1-birthday-gifts-daily/);
  assert.match(migration, /cron\.unschedule\(existing_job\)/);
  assert.match(migration, /'mode', 'customer_draw'/);
});

test("referral boost is fixed to 2x for both customers and extends by 30 days", () => {
  assert.match(migration, /set referral_boost_multiplier = 2, referral_boost_duration_days = 30/);
  assert.match(migration, /now\(\) \+ interval '30 days'/);
  assert.match(migration, /extension_base \+ interval '30 days'/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /BONUS_BOOST_ACTIVATED/);
  assert.match(migration, /BONUS_BOOST_EXTENDED/);
  assert.match(portal, /const referralBoostMultiplier = 2/);
  assert.match(portal, /const referralBoostDurationDays = 30/);
  assert.match(migration, /and not c\.is_test_customer/);
  assert.match(migration, /and not is_test_event/);
});

test("retention tables expose no direct anon policies", () => {
  assert.match(migration, /customer_push_subscriptions enable row level security/);
  assert.match(migration, /expiry_reminders enable row level security/);
  assert.doesNotMatch(migration, /create policy[\s\S]{0,180}(customer_push_subscriptions|expiry_reminders)[\s\S]{0,180}to anon/i);
  assert.match(migration, /grant execute on function public\.get_customer_retention_status\(text, text\) to anon, authenticated/);
});
