import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL(
  "../supabase/migrations/20260903004000_point_reward_notification_order_fix.sql",
  import.meta.url,
), "utf8");
const queueMigration = await readFile(new URL(
  "../supabase/migrations/20260809001000_v1_release_gift_presentations_notifications.sql",
  import.meta.url,
), "utf8");

function evaluateCrossing({ storedBalance, points, source, existingState, threshold }) {
  const canonicalEarn = points > 0
    && ["customer_initiated", "restaurant_controlled"].includes(source);
  const currentBalance = storedBalance + (canonicalEarn ? points : 0);
  const previousBalance = currentBalance - points;
  const wasAbove = existingState ?? previousBalance >= threshold;
  return {
    currentBalance,
    notify: !wasAbove && currentBalance >= threshold,
    aboveThreshold: currentBalance >= threshold,
  };
}

test("canonical earn sources evaluate the effective post-booking balance", () => {
  assert.match(migration, /new\.type = 'earn'[\s\S]*new\.points > 0[\s\S]*new\.collection_source in \('customer_initiated', 'restaurant_controlled'\)/);
  assert.match(migration, /current_balance := current_balance \+ new\.points;[\s\S]*previous_balance := current_balance - new\.points;/);
  assert.deepEqual(evaluateCrossing({ storedBalance: 50, points: 8, source: "restaurant_controlled", existingState: null, threshold: 59 }), {
    currentBalance: 58,
    notify: false,
    aboveThreshold: false,
  });
  assert.equal(evaluateCrossing({ storedBalance: 50, points: 9, source: "restaurant_controlled", existingState: null, threshold: 59 }).notify, true);
  assert.equal(evaluateCrossing({ storedBalance: 58, points: 1, source: "customer_initiated", existingState: false, threshold: 59 }).notify, true);
});

test("an already-notified reward does not enqueue another notification", () => {
  const result = evaluateCrossing({ storedBalance: 59, points: 5, source: "restaurant_controlled", existingState: true, threshold: 59 });
  assert.equal(result.currentBalance, 64);
  assert.equal(result.notify, false);
  assert.equal(result.aboveThreshold, true);
});

test("rejected bookings and idempotent replays cannot create a second queue row", () => {
  assert.match(queueMigration, /after insert on public\.points_transactions/);
  assert.match(queueMigration, /unique \(event_type, event_key\)/);
  assert.match(migration, /new\.id::text \|\| ':' \|\| reward_record\.id::text/);
  assert.doesNotMatch(migration, /daily_pin|customer_points_qr_references/i);
});

test("the forward fix preserves private execution and does not alter RLS or grants", () => {
  assert.match(migration, /security definer[\s\S]*set search_path = public, pg_temp/);
  assert.match(migration, /revoke execute on function public\.sync_point_reward_notification_state\(\)[\s\S]*from public, anon, authenticated/);
  assert.doesNotMatch(migration, /disable row level security/i);
  assert.doesNotMatch(migration, /grant .* to (anon|authenticated)/i);
  assert.doesNotMatch(migration, /create policy|drop policy/i);
});
