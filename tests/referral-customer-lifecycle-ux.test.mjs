import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  formatReferralBoostExpiry,
  formatReferralBoostRemaining,
} from "../src/modules/customer/referralLifecycle.mjs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20260824006000_referral_welcome_eligibility_monthly_quota.sql");
const portal = read("../src/modules/customer/CustomerPortal.tsx");

test("referral lifecycle is resolved from restaurant-scoped server records", () => {
  assert.match(migration, /r\.restaurant_id = restaurant_record\.id/);
  assert.match(migration, /r\.referrer_customer_id = customer_id_value/);
  assert.match(migration, /r\.referred_customer_id = customer_id_value/);
  assert.match(migration, /cb\.restaurant_id = restaurant_record\.id/);
  assert.match(migration, /cb\.customer_id = customer_id_value/);
  assert.match(migration, /rbg\.boost_id = boost_record\.id/);
  assert.match(migration, /'lifecycle_state', lifecycle_state_value/);
  assert.doesNotMatch(portal, /localStorage[\s\S]{0,120}lifecycle_state|sessionStorage[\s\S]{0,120}lifecycle_state/);
});

test("waiting, pending, active and expired states have deterministic priority", () => {
  const active = migration.indexOf("lifecycle_state_value := 'active'");
  const friendPending = migration.indexOf("beneficiary_role_value := 'invited_friend'", active);
  const referrerPending = migration.indexOf("beneficiary_role_value := 'referrer'", friendPending);
  const waiting = migration.indexOf("lifecycle_state_value := 'waiting_registration'", referrerPending);
  const expired = migration.indexOf("lifecycle_state_value := 'expired'", waiting);
  assert.ok(active > 0 && active < friendPending && friendPending < referrerPending && referrerPending < waiting && waiting < expired);
  assert.match(portal, /Einladung gesendet/);
  assert.match(portal, /Einladung versendet/);
  assert.match(portal, /Freund erfolgreich eingeladen/);
  assert.match(portal, /Einladung erfolgreich angenommen/);
  assert.match(portal, /Dein letzter 2× Bonus ist abgelaufen/);
});

test("remaining duration switches from days to precise hours and minutes", () => {
  const now = Date.UTC(2026, 7, 24, 10, 0, 0);
  assert.equal(formatReferralBoostRemaining(new Date(now + 14 * 86_400_000).toISOString(), now), "Noch 14 Tage");
  assert.equal(formatReferralBoostRemaining(new Date(now + 25 * 3_600_000).toISOString(), now), "Noch 1 Tag");
  assert.equal(formatReferralBoostRemaining(new Date(now + 135 * 60_000).toISOString(), now), "Noch 2 Std. 15 Min.");
  assert.equal(formatReferralBoostRemaining(new Date(now - 1).toISOString(), now), "Boost abgelaufen");
});

test("expiry is formatted for Vienna and active customer copy distinguishes beneficiary roles", () => {
  assert.match(formatReferralBoostExpiry("2026-08-24T16:30:00.000Z"), /24\.08\.2026.*18:30/);
  assert.match(portal, /Dein Einladungsbonus/);
  assert.match(portal, /50 % der eingestellten Bonusdauer/);
  assert.match(portal, /Dein Bonus/);
  assert.match(portal, /die volle Bonusdauer/);
  assert.match(portal, /Aktiv bis \$\{boostExpiryLabel\}/);
  assert.match(portal, /boostDetail=\{activeBoost \? `Aktiv bis \$\{boostExpiryLabel\}`/);
});

test("customer UX uses current owner duration and contains no active 30 or 15 day referral copy", () => {
  assert.match(portal, /normalizeReferralBonusDuration\(settings\?\.referral_boost_duration_days\)/);
  assert.match(portal, /formatInvitedReferralDuration\(referralBoostDurationDays\)/);
  assert.doesNotMatch(portal, /30 Tage|15 Tage/);
});

test("stacked boosts expose the combined server expiry without changing the multiplier", () => {
  assert.match(migration, /order by[\s\S]*cb\.active_until desc/);
  assert.match(portal, /activeBoost\.active_until/);
  assert.match(portal, /retention\.referral\.successful_referrals/);
  assert.match(portal, /2× Bonus Boost aktiv/);
});
