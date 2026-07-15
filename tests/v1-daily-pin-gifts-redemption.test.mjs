import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260714002000_daily_pin_booking_gifts_redemption_v1.sql", import.meta.url),
  "utf8",
);
const dailyLimitMigration = readFileSync(
  new URL("../supabase/migrations/20260711006000_daily_pin_bruteforce_and_points_daily_limit.sql", import.meta.url),
  "utf8",
);
const customerPortal = readFileSync(new URL("../src/modules/customer/CustomerPortal.tsx", import.meta.url), "utf8");
const staffPortal = readFileSync(new URL("../src/modules/staff/StaffTablet.tsx", import.meta.url), "utf8");
const loyaltyService = readFileSync(new URL("../src/modules/loyalty/loyaltyService.ts", import.meta.url), "utf8");

test("Tages-PIN ist vierstellig, lokal datiert und nicht öffentlich lesbar", () => {
  assert.match(migration, /ensure_today_restaurant_pin[\s\S]*timezone\(restaurant_record\.timezone_name, now\(\)\)::date/);
  assert.match(migration, /generate_daily_pin_code\(\)/);
  assert.match(dailyLimitMigration, /failed_attempts \+ 1 >= 5/);
  assert.doesNotMatch(migration, /grant execute on function public\.get_today_restaurant_pin\(uuid\) to anon/i);
});

test("Punktebuchung ist auf zwei Erfolge begrenzt und idempotent", () => {
  assert.match(dailyLimitMigration, /today_points_collections >= 2/);
  assert.match(migration, /points_collection_requests/);
  assert.match(migration, /input_idempotency_key uuid/);
  assert.match(migration, /revoke execute on function public\.collect_bonus_points\(text, text, text, text, text\) from public, anon, authenticated/);
  assert.match(migration, /revoke execute on function public\.apply_loyalty_staff_action/);
  assert.match(customerPortal, /idempotencyKey: crypto\.randomUUID\(\)/);
  assert.match(loyaltyService, /bereits zweimal Punkte gesammelt/);
});

test("Willkommens- und Geburtstagsgeschenke haben harte Eindeutigkeitsregeln", () => {
  assert.match(migration, /customer_rewards_one_welcome_gift_idx/);
  assert.match(migration, /where gift_type = 'welcome'/);
  assert.match(migration, /customer_rewards_one_birthday_gift_year_idx/);
  assert.match(migration, /where gift_type = 'birthday'/);
  assert.match(migration, /gift_assignment_cleanup_log/);
  assert.match(migration, /Doppelte Willkommenszuteilung vor V1-Eindeutigkeitsregel/);
  assert.match(migration, /target_year % 400 = 0/);
  assert.match(migration, /r\.is_starter_reward = true[\s\S]*r\.active = true/);
  assert.match(migration, /wuxuai-v1-birthday-gifts-daily/);
});

test("Einlösecode ist sechsstellig, gehasht, einmalig und 15 Minuten gültig", () => {
  assert.match(migration, /raw_code := public\.generate_numeric_code\(6\)/);
  assert.match(migration, /digest\(raw_code, 'sha256'\)/);
  assert.match(migration, /now\(\) \+ interval '15 minutes'/);
  assert.match(migration, /redemption_codes_one_active_reward_idx/);
  assert.match(migration, /status = 'redeemed', redeemed_at = now\(\), deactivated_at = now\(\)/);
  assert.match(migration, /wuxuai-v1-expire-redemption-codes/);
  assert.match(migration, /revoke execute on function public\.redeem_reward_with_pin/);
  assert.match(migration, /revoke execute on function public\.redeem_reward_with_staff_session/);
});

test("Customer- und Staff-Portal verwenden den Bestätigungs-Code ohne Einlöse-PIN", () => {
  assert.match(customerPortal, /Bitte erst direkt vor dem Mitarbeiter bestätigen/);
  assert.match(customerPortal, /Jetzt verbindlich einlösen/);
  assert.match(customerPortal, /redemption-code-value/);
  assert.match(customerPortal, /customerRewardId: redeemOffer\.assignment_id/);
  assert.match(staffPortal, /Sechsstelliger Einlösecode/);
  assert.match(staffPortal, /Für die Einlösung ist keine Tages-PIN erforderlich/);
});
