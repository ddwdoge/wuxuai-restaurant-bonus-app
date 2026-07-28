import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  isReferralBonusDurationPreset,
  isValidReferralBonusDuration,
  referralBonusDurationPresets,
} from "../src/modules/loyalty/referralBonusSettings.mjs";

const migration = readFileSync(
  new URL("../supabase/migrations/20260728002000_referral_bonus_duration_settings.sql", import.meta.url),
  "utf8",
);
const service = readFileSync(new URL("../src/modules/loyalty/loyaltyService.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/modules/admin/pages/LoyaltyPage.tsx", import.meta.url), "utf8");
const referralLanding = readFileSync(new URL("../src/modules/customer/ReferralLanding.tsx", import.meta.url), "utf8");
const customerPortal = readFileSync(new URL("../src/modules/customer/CustomerPortal.tsx", import.meta.url), "utf8");

test("referral bonus keeps 2x and defaults to 30 days", () => {
  assert.match(migration, /referral_boost_multiplier set default 2/);
  assert.match(migration, /referral_boost_duration_days set default 30/);
  assert.match(migration, /check \(referral_boost_multiplier = 2\)/);
});

test("owner can configure any whole duration from 1 to 365 days", () => {
  assert.match(migration, /referral_boost_duration_days between 1 and 365/);
  assert.match(migration, /rm\.role in \('owner', 'admin'\)/);
  assert.doesNotMatch(migration, /rm\.role in \('owner', 'admin', 'manager'\)/);
  assert.match(migration, /where rm\.restaurant_id = input_restaurant_id/);
  assert.match(migration, /protect_referral_bonus_settings_trigger/);
  assert.deepEqual(referralBonusDurationPresets, [7, 14, 30, 60, 90]);
  assert.equal(isValidReferralBonusDuration(1), true);
  assert.equal(isValidReferralBonusDuration(14), true);
  assert.equal(isValidReferralBonusDuration(365), true);
  assert.equal(isValidReferralBonusDuration(0), false);
  assert.equal(isValidReferralBonusDuration(366), false);
  assert.equal(isValidReferralBonusDuration(14.5), false);
  assert.equal(isReferralBonusDurationPreset(30), true);
  assert.equal(isReferralBonusDurationPreset(31), false);
  assert.match(service, /isValidReferralBonusDuration\(durationDays\)/);
  assert.match(page, /referralBonusDurationPresets\.map/);
  assert.match(page, /Eigener Wert/);
});

test("new qualifications use the saved duration without changing active periods retroactively", () => {
  assert.match(migration, /now\(\) \+ make_interval\(days => input_duration_days\)/);
  assert.match(migration, /extension_base \+ make_interval\(days => input_duration_days\)/);
  assert.doesNotMatch(migration, /update public\.customer_bonus_boosts\s+set active_until[\s\S]*update_referral_bonus_settings/i);
  assert.match(migration, /pg_advisory_xact_lock/);
});

test("settings changes create a safe tenant-scoped audit event", () => {
  assert.match(migration, /REFERRAL_BONUS_SETTINGS_UPDATED/);
  assert.match(migration, /'old_value', old_settings/);
  assert.match(migration, /'new_value'/);
  assert.match(migration, /'actor_user_id', auth\.uid\(\)/);
  assert.match(migration, /revoke execute on function public\.update_referral_bonus_settings[\s\S]*from public, anon/);
});

test("customer referral copy remains driven by restaurant settings", () => {
  assert.match(referralLanding, /data\.settings\.referral_boost_duration_days/);
  assert.match(referralLanding, /data\.settings\.referral_boost_multiplier/);
  assert.doesNotMatch(referralLanding, /30 Tage lang 2×/);
  assert.match(customerPortal, /Number\(settings\?\.referral_boost_duration_days\) \|\| 30/);
});
