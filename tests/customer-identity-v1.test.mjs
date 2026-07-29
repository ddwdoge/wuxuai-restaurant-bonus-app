import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { normalizeCustomerPhone } from "../src/modules/customer/customerIdentity.mjs";

const migration = await readFile(new URL("../supabase/migrations/20260727001000_customer_identity_v1_no_sms.sql", import.meta.url), "utf8");
const securityVerificationFix = await readFile(new URL("../supabase/migrations/20260729003000_customer_identity_security_verification_fix.sql", import.meta.url), "utf8");
const loyaltySource = await readFile(new URL("../src/modules/loyalty/loyaltyService.ts", import.meta.url), "utf8");
const portalSource = await readFile(new URL("../src/modules/customer/CustomerPortal.tsx", import.meta.url), "utf8");
const customersPage = await readFile(new URL("../src/modules/admin/pages/CustomersPage.tsx", import.meta.url), "utf8");
const staffPage = await readFile(new URL("../src/modules/staff/StaffTablet.tsx", import.meta.url), "utf8");

test("österreichische Telefonnummern werden zentral auf dieselbe Identität normalisiert", () => {
  const expected = "+436641234567";
  assert.equal(normalizeCustomerPhone("0664 1234567"), expected);
  assert.equal(normalizeCustomerPhone("0664-1234567"), expected);
  assert.equal(normalizeCustomerPhone("+43 664 1234567"), expected);
  assert.equal(normalizeCustomerPhone("0043 664 1234567"), expected);
  assert.equal(normalizeCustomerPhone("123"), null);
});

test("beide öffentlichen Registrierungswege verwenden den zentralen Client-Helper", () => {
  assert.match(loyaltySource, /normalizeCustomerPhone\(input\.phone\)/g);
  assert.match(loyaltySource, /input_phone: normalizedPhone/g);
});

test("Datenbank erzwingt restaurantbezogene normalisierte Eindeutigkeit und Parallelitätsschutz", () => {
  assert.match(migration, /customers_restaurant_normalized_phone_unique_idx/);
  assert.match(migration, /\(restaurant_id, normalized_phone\)/);
  assert.match(migration, /alter column normalized_phone set not null/);
  assert.match(migration, /CUSTOMER_IDENTITY_MIGRATION_MISSING_PHONE/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /CUSTOMER_IDENTITY_MIGRATION_DUPLICATES_FOUND/);
  assert.match(migration, /CUSTOMER_DUPLICATE_ACCOUNT_BLOCKED/);
  assert.match(migration, /CUSTOMER_ACCOUNT_EXISTS/);
});

test("bekanntes Konto wird blockiert und erhält bei Registrierung keinen neuen Token", () => {
  const guardStart = migration.indexOf("create or replace function public.prepare_customer_registration");
  const registrationStart = migration.indexOf("create or replace function public.register_restaurant_customer_legal", guardStart);
  const registrationEnd = migration.indexOf("create or replace function public.register_referral_customer_legal", registrationStart);
  const guard = migration.slice(guardStart, registrationStart);
  const registration = migration.slice(registrationStart, registrationEnd);
  assert.match(guard, /'allowed', false/);
  assert.match(registration, /if not coalesce\(\(guard_payload->>'allowed'\)::boolean, false\) then[\s\S]*return jsonb_build_object\('success', false/);
  assert.match(registration, /register_restaurant_customer\([\s\S]*guard_payload->>'normalized_phone'/);
});

test("SMS-Verifizierung ist vorbereitet, standardmäßig aus und nicht Teil der Runtime", () => {
  assert.match(migration, /sms_verification_enabled boolean not null default false/);
  assert.doesNotMatch(loyaltySource, /signInWithOtp|verifyOtp|twilio|vonage|messagebird/i);
  assert.doesNotMatch(portalSource, /signInWithOtp|verifyOtp|SMS-Code/i);
});

test("Kunde sieht Identitätsdaten nur maskiert und besitzt kein Änderungsformular", () => {
  assert.match(portalSource, /identitySummary\?\.phone_masked/);
  assert.match(portalSource, /identitySummary\?\.birthday_masked/);
  assert.match(portalSource, /Identitätsdaten geschützt/);
  assert.doesNotMatch(portalSource, /updateCustomerBirthday|handleBirthdaySave|Geburtstag speichern/);
  assert.match(migration, /revoke execute on function public\.update_customer_birthday[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /guard_customer_identity_fields/);
});

test("Owner-Support verlangt Identitätsprüfung und rotiert nach Telefonänderung alle Zugänge", () => {
  assert.match(customersPage, /Die Identität des Kunden wurde geprüft/);
  assert.match(customersPage, /identitySupportAllowed \?/);
  assert.match(customersPage, /verificationMethod/);
  assert.match(customersPage, /reason/);
  assert.match(migration, /rm\.role in \('owner', 'admin'\)/);
  assert.match(migration, /CUSTOMER_PHONE_CHANGED_BY_SUPPORT/);
  assert.match(migration, /CUSTOMER_BIRTHDATE_CHANGED_BY_SUPPORT/);
  assert.match(migration, /update public\.customer_qr_tokens set active = false/);
  assert.match(migration, /delete from public\.customer_devices/);
  assert.match(migration, /CUSTOMER_TOKEN_ROTATED/);
});

test("Owner-Support verwendet einen vom Auditvertrag erlaubten Akteurtyp", () => {
  assert.match(securityVerificationFix, /input_customer_id, 'admin', auth\.uid\(\)/);
  assert.doesNotMatch(securityVerificationFix, /'restaurant_user'/);
});

test("Owner-Liste und Staff-Pfade verwenden nur minimierte Kundendaten", () => {
  assert.match(loyaltySource, /list_restaurant_customers_safe/);
  assert.doesNotMatch(loyaltySource, /\.from\("customers"\)/);
  assert.match(migration, /public\.mask_customer_phone\(c\.phone\)/);
  assert.match(migration, /'birthday', null/);
  assert.match(migration, /revoke select, insert, update, delete on public\.customers from anon, authenticated/);
  assert.doesNotMatch(customersPage, /<QrCode|guest-code/);
  assert.doesNotMatch(staffPage, /customer\.birthday|customer\.phone\s*\}\s*<\/|customer\.email\s*\}\s*</);
});

test("Audit-Metadaten entfernen Telefon, Geburtstag, Token und PIN", () => {
  assert.match(migration, /phone\|telephone\|birthday\|birthdate\|date_of_birth/);
  assert.match(migration, /customer_token\|referral_token\|session_token\|daily_pin/);
  assert.doesNotMatch(migration, /jsonb_build_object\([^)]*input_new_phone/);
  for (const eventType of [
    "CUSTOMER_REGISTRATION_ATTEMPT",
    "CUSTOMER_DUPLICATE_ACCOUNT_BLOCKED",
    "CUSTOMER_LOGIN_SUCCESS",
    "CUSTOMER_LOGIN_FAILED",
    "CUSTOMER_PHONE_CHANGED_BY_SUPPORT",
    "CUSTOMER_BIRTHDATE_CHANGED_BY_SUPPORT",
    "CUSTOMER_IDENTITY_VERIFIED_BY_RESTAURANT",
    "CUSTOMER_SESSIONS_REVOKED",
    "CUSTOMER_TOKEN_ROTATED",
    "CUSTOMER_RESTAURANT_CONTEXT_CHANGED",
    "CUSTOMER_SENSITIVE_DATA_VIEWED",
  ]) assert.match(migration, new RegExp(eventType));
});

test("Tages-PIN- und Reward-Einlöse-RPCs werden von der Identitätsmigration nicht ersetzt", () => {
  assert.doesNotMatch(migration, /create or replace function public\.collect_bonus_points_v1/);
  assert.doesNotMatch(migration, /create or replace function public\.consume_redemption_code/);
  assert.doesNotMatch(migration, /create or replace function public\.redeem_customer_reward/);
});
