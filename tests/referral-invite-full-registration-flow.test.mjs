import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { safeCustomerReturnPath } from "../src/modules/customer/customerReturnPath.mjs";
import { referralInvitationTitle, safeReferralFirstName } from "../src/modules/customer/referralInviteFlow.mjs";
import { formatInvitedReferralDuration } from "../src/modules/loyalty/referralBonusSettings.mjs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const landing = read("../src/modules/customer/ReferralLanding.tsx");
const authPage = read("../src/modules/customer/CustomerAuthPage.tsx");
const authService = read("../src/modules/customer/customerAuthService.ts");
const accountService = read("../src/modules/customer/customerAccountService.ts");
const migration = read("../supabase/migrations/20260824004000_authenticated_referral_registration_bridge.sql");

test("referral return path survives the canonical email confirmation flow", () => {
  const token = "A".repeat(64);
  const returnPath = `/r/wuxuai-cafe/${token}`;
  assert.equal(safeCustomerReturnPath(returnPath), returnPath);
  assert.match(authService, /customer_return_to: input\.returnTo/);
  assert.match(authService, /emailRedirectTo/);
  assert.match(authPage, /customerReturnPath\.mjs/);
});

test("unsafe referral return paths never become callback destinations", () => {
  assert.equal(safeCustomerReturnPath("/r/cafe/short"), "/customer");
  assert.equal(safeCustomerReturnPath("/r/../admin/" + "x".repeat(64)), "/customer");
  assert.equal(safeCustomerReturnPath("//evil.example/r/cafe/" + "x".repeat(64)), "/customer");
  assert.equal(safeCustomerReturnPath("/r/Cafe/" + "x".repeat(64)), "/customer");
});

test("landing uses the full canonical customer account registration instead of a duplicate identity form", () => {
  assert.match(landing, /\/customer\/register\?returnTo=/);
  assert.match(landing, /\/customer\/login\?returnTo=/);
  assert.doesNotMatch(landing, /registerReferralGuest/);
  assert.doesNotMatch(landing, /CustomerPhoneField/);
  assert.doesNotMatch(landing, /referral-first-name|referral-birthday/);
  assert.match(authPage, /customer-first-name/);
  assert.match(authPage, /central-customer-phone/);
  assert.match(authPage, /customer-birthday/);
  assert.match(authPage, /customer-email/);
  assert.match(authPage, /customer-password/);
  assert.match(authPage, /customer-confirm-password/);
});

test("password confirmation remains local form state and is never sent to auth metadata", () => {
  assert.match(authPage, /confirmPassword/);
  assert.doesNotMatch(authService, /confirmPassword/);
  assert.doesNotMatch(migration, /confirmPassword|confirm_password/);
});

test("invitation copy exposes only a safe first name and exact V1 friend durations", () => {
  assert.equal(safeReferralFirstName(" Anna "), "Anna");
  assert.equal(safeReferralFirstName("<script>"), null);
  assert.equal(safeReferralFirstName("A".repeat(41)), null);
  assert.equal(referralInvitationTitle("Mia"), "Mia lädt dich ein");
  assert.equal(referralInvitationTitle("<invalid>"), "Ein Freund lädt dich ein");
  assert.equal(formatInvitedReferralDuration(7), "84 Stunden");
  assert.equal(formatInvitedReferralDuration(14), "7 Tage");
  assert.equal(formatInvitedReferralDuration(28), "14 Tage");
  assert.match(landing, /× Punkte für euch beide/);
  assert.match(landing, /erhält den vollen Bonuszeitraum/);
  assert.match(landing, /die Hälfte der Bonusdauer/);
});

test("authenticated bridge validates tenant, token, legal state and authenticated account server-side", () => {
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = public, pg_temp/);
  assert.match(migration, /ensure_authenticated_customer_account\(\)/);
  assert.match(migration, /r\.restaurant_id = restaurant_record\.id/);
  assert.match(migration, /referral_token_hash = public\.hash_public_token\(input_referral_token\)/);
  assert.match(migration, /restaurant_legal_bundle_is_current/);
  assert.match(migration, /input_terms_accepted[\s\S]*input_privacy_acknowledged/);
  assert.match(migration, /revoke execute[\s\S]*from public, anon/);
  assert.match(migration, /grant execute[\s\S]*to authenticated/);
});

test("public resolver checks expiry and exposes neither internal ids nor unapproved referrer identity", () => {
  const resolver = migration.slice(
    migration.indexOf("create or replace function public.get_public_referral"),
    migration.indexOf("create or replace function public.join_authenticated_customer_referral"),
  );
  assert.match(resolver, /r\.expires_at is null or r\.expires_at > now\(\)/);
  assert.match(resolver, /referral_token_hash = public\.hash_public_token\(input_referral_token\)/);
  assert.match(resolver, /'referrer', jsonb_build_object\('first_name', null\)/);
  assert.doesNotMatch(resolver, /auth_user_id|customer_id'|referral_id'|phone|email/);
});

test("referral registration and membership binding are atomic, locked and retry-safe", () => {
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /for update/);
  assert.match(migration, /register_referral_customer_legal/);
  assert.match(migration, /insert into public\.customer_account_memberships/);
  assert.match(migration, /referred_customer_id is distinct from membership_record\.customer_id/);
  assert.match(migration, /return public\.open_customer_account_membership/);
  assert.match(accountService, /join_authenticated_customer_referral/);
});

test("signup and acceptance do not qualify or grant referral boosts", () => {
  assert.doesNotMatch(migration, /set\s+status\s*=\s*'activated'/i);
  assert.doesNotMatch(migration, /apply_v1_referral_boost_grant|upsert_referral_boost/);
  assert.doesNotMatch(migration, /insert into public\.points_transactions/);
  assert.match(migration, /referral_status', 'pending_registered'/);
  assert.match(landing, /ersten gültigen Besuch/);
});

test("referral context is persisted server-side rather than only in browser storage", () => {
  assert.match(migration, /register_referral_customer_legal/);
  assert.match(migration, /customer_account_memberships/);
  assert.doesNotMatch(landing, /localStorage|sessionStorage/);
  assert.match(landing, /Einladung angenommen/);
});
