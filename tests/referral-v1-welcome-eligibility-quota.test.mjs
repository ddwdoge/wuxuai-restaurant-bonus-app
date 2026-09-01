import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createReferralCreationToken } from "../src/modules/customer/referralInviteFlow.mjs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20260824006000_referral_welcome_eligibility_monthly_quota.sql");
const customerPortal = read("../src/modules/customer/CustomerPortal.tsx");
const referralLanding = read("../src/modules/customer/ReferralLanding.tsx");
const loyaltyPage = read("../src/modules/admin/pages/LoyaltyPage.tsx");
const loyaltyService = read("../src/modules/loyalty/loyaltyService.ts");
const pointsEngine = read("../supabase/migrations/20260801001000_shared_points_bonus_engine.sql");

test("new invitation quota is additive, defaults to five and leaves history uncounted", () => {
  assert.match(migration, /referral_monthly_invite_limit integer not null default 5/);
  assert.match(migration, /referral_monthly_invite_limit between 1 and 100/);
  assert.match(migration, /quota_counted boolean not null default false/);
  assert.match(migration, /where quota_counted = true/);
  assert.doesNotMatch(migration, /update public\.referrals[\s\S]*quota_counted\s*=\s*true/i);
});

test("eligibility requires a positive earn for the same customer and restaurant", () => {
  assert.match(migration, /pt\.restaurant_id = restaurant_record\.id/);
  assert.match(migration, /pt\.customer_id = customer_id_value/);
  assert.match(migration, /pt\.type = 'earn'/);
  assert.match(migration, /pt\.points > 0/);
  assert.match(migration, /FIRST_QUALIFYING_VISIT_REQUIRED/);
  assert.doesNotMatch(migration, /welcome_gift_assigned[\s\S]{0,200}eligible_value\s*:=\s*true/i);
});

test("monthly quota uses restaurant-local calendar boundaries and an atomic lock", () => {
  assert.match(migration, /timezone_value := coalesce\([^;]+Europe\/Vienna/);
  assert.match(migration, /date_trunc\('month', statement_timestamp\(\) at time zone timezone_value\)::date/);
  assert.match(migration, /next_month_start::timestamp at time zone timezone_value/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /used_count >= limit_value/);
  assert.match(migration, /REFERRAL_MONTHLY_LIMIT_REACHED/);
});

test("retrying the same creation token returns the same invitation before quota consumption", () => {
  const replayCheck = migration.indexOf("if existing_referral.id is not null then");
  const eligibilityCheck = migration.indexOf("if not exists (", replayCheck);
  const insert = migration.indexOf("insert into public.referrals", replayCheck);
  assert.ok(replayCheck > 0 && replayCheck < eligibilityCheck && eligibilityCheck < insert);
  assert.match(migration.slice(replayCheck, eligibilityCheck), /'replayed', true/);
  assert.match(customerPortal, /referralCreationTokenRef\.current \?\? createReferralCreationToken\(\)/);
  assert.match(customerPortal, /createReferralLink\(restaurantSlug, activeToken, getWebDeviceId\(\), creationToken\)/);
});

test("creation tokens are cryptographically random, hashed in storage and absent from audit", () => {
  const token = createReferralCreationToken({
    getRandomValues(bytes) {
      bytes.forEach((_, index) => { bytes[index] = index; });
      return bytes;
    },
  });
  assert.equal(token.length, 64);
  assert.match(token, /^[0-9a-f]{64}$/);
  assert.match(migration, /referral_token_hash[\s\S]*hash_public_token\(normalized_creation_token\)/);
  const auditCall = migration.slice(
    migration.indexOf("'REFERRAL_CREATED'"),
    migration.indexOf("return jsonb_build_object", migration.indexOf("'REFERRAL_CREATED'")),
  );
  assert.doesNotMatch(auditCall, /normalized_creation_token|input_creation_token|referral_token/);
});

test("referral registration assigns the canonical one-per-restaurant welcome gift", () => {
  assert.match(migration, /assign_welcome_starter_reward\([\s\S]*'restaurant_qr'/);
  assert.match(migration, /registration_source', 'referral_registration'/);
  assert.match(migration, /'welcome_gift_assigned'/);
  assert.doesNotMatch(migration, /insert into public\.customer_rewards/);
  assert.match(referralLanding, /Dein Willkommensgeschenk ist bereits verfügbar/);
});

test("registration remains pending and only the invited friend's first earn qualifies", () => {
  assert.match(migration, /'referral_status', 'pending_registered'/);
  assert.doesNotMatch(migration, /set\s+status\s*=\s*'activated'/i);
  assert.match(pointsEngine, /r\.referred_customer_id = input_customer_id/);
  assert.match(pointsEngine, /successful_earn_count = 1/);
  assert.doesNotMatch(pointsEngine, /referral\.referrer_customer_id = input_customer_id[\s\S]{0,300}set status = 'activated'/i);
  assert.match(referralLanding, /Dein 2× Bonus wird nach deinem ersten qualifizierten Besuch aktiviert\./);
});

test("customer UI is locked before eligibility and reports quota and pending state", () => {
  assert.match(customerPortal, /referralInviteStatus\?\.eligible === true/);
  assert.match(customerPortal, /Nach deinem ersten qualifizierten Besuch kannst du Freunde einladen/);
  assert.match(customerPortal, /Einladungen diesen Monat:/);
  assert.match(customerPortal, /Du kannst noch/);
  assert.match(customerPortal, /Monatslimit erreicht/);
  assert.match(customerPortal, /referralResetLabel/);
  assert.match(customerPortal, /Freund erfolgreich eingeladen/);
  assert.match(customerPortal, /Einladung erfolgreich angenommen/);
  assert.match(customerPortal, /disabled=\{creatingReferral \|\| !referralInviteEnabled\}/);
});

test("owner monthly limit is tenant-scoped and validated on client and server", () => {
  assert.match(migration, /rm\.restaurant_id = input_restaurant_id/);
  assert.match(migration, /rm\.role in \('owner', 'admin'\)/);
  assert.match(migration, /input_monthly_invite_limit < 1[\s\S]*input_monthly_invite_limit > 100/);
  assert.match(loyaltyPage, /Einladungen pro Kunde \/ Monat/);
  assert.match(loyaltyService, /validateReferralMonthlyInviteLimit/);
  assert.match(loyaltyService, /input_monthly_invite_limit: input\.monthlyInviteLimit/);
});
