import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  accountingRowsToCsv,
  canPubliclyActivate,
  legalReadiness,
  marketingMessageAllowed,
  termsAreComplete,
} from "../src/modules/legal/legalCompliance.mjs";

const migration = readFileSync(new URL("../supabase/migrations/20260724001000_legal_compliance_layer.sql", import.meta.url), "utf8");
const customerPortal = readFileSync(new URL("../src/modules/customer/CustomerPortal.tsx", import.meta.url), "utf8");
const referralLanding = readFileSync(new URL("../src/modules/customer/ReferralLanding.tsx", import.meta.url), "utf8");
const legalCenter = readFileSync(new URL("../src/modules/legal/LegalCenterPage.tsx", import.meta.url), "utf8");
const finder = readFileSync(new URL("../src/modules/customer/PartnerRestaurantFinderPage.tsx", import.meta.url), "utf8");

const completeTerms = {
  program_operator_name: "Testrestaurant", program_operator_address: "Teststraße 1, 1010 Wien",
  contact_email: "legal@example.invalid", points_earning_rule: "Regel", daily_booking_limit: "2",
  excluded_transactions: "Storno", points_validity_months: "12", reward_validity_rule: "Anzeige",
  redemption_conditions: "Bestätigung", cash_payout_prohibited: true, transfer_prohibited: true,
  cancellation_rule: "Korrektur", fraud_and_blocking_rule: "Prüfung", program_termination_rule: "Ankündigung",
  final_redemption_period: "Frist", complaint_contact: "Kontakt", effective_date: "2026-07-24",
  language: "de-AT", version: "1.0",
};

test("Teilnahmebedingungen verlangen alle Pflichtfelder", () => {
  assert.equal(termsAreComplete(completeTerms), true);
  assert.equal(termsAreComplete({ ...completeTerms, complaint_contact: "" }), false);
});

test("Marketing ohne kanalspezifische Einwilligung ist blockiert", () => {
  assert.equal(marketingMessageAllowed("MARKETING", "push", []), false);
  assert.equal(marketingMessageAllowed("MARKETING", "email", [{ consent_type: "marketing_push", status: "granted" }]), false);
  assert.equal(marketingMessageAllowed("MARKETING", "push", [{ consent_type: "marketing_push", status: "withdrawn" }]), false);
});

test("gültige Marketingeinwilligung wirkt nur für ihren Kanal", () => {
  const consents = [{ consent_type: "marketing_push", status: "granted" }];
  assert.equal(marketingMessageAllowed("MARKETING", "push", consents), true);
  assert.equal(marketingMessageAllowed("MARKETING", "sms", consents), false);
});

test("notwendige und Programmnachrichten sind nicht als Marketing gekoppelt", () => {
  assert.equal(marketingMessageAllowed("TRANSACTIONAL", "push", []), true);
  assert.equal(marketingMessageAllowed("PROGRAM_SERVICE", "push", []), true);
});

test("Legal Readiness verlangt Impressum, Bedingungen und Datenschutztext", () => {
  const profile = { company_name: "Test", street: "Straße 1", postal_code: "1010", city: "Wien", email: "legal@example.invalid", complaint_contact: "Kontakt" };
  assert.deepEqual(legalReadiness(profile, completeTerms, "x".repeat(120)), { imprintComplete: true, termsComplete: true, privacyComplete: true });
  assert.equal(legalReadiness({ ...profile, email: "" }, completeTerms, "x".repeat(120)).imprintComplete, false);
});

test("öffentliche Aktivierung benötigt drei Readiness-Signale", () => {
  assert.equal(canPubliclyActivate({ operational_ready: true, legal_ready: true, security_ready: true }), true);
  assert.equal(canPubliclyActivate({ operational_ready: true, legal_ready: false, security_ready: true }), false);
});

test("CSV-Export escaped Tabellenwerte und enthält keine Rohcode-Spalte außerhalb der Referenz", () => {
  const csv = accountingRowsToCsv([{ reward_name: 'Dessert "Spezial"', redemption_code: "Referenz abc12345", status: "redeemed" }]);
  assert.match(csv, /Dessert ""Spezial""/);
  assert.match(csv, /Referenz abc12345/);
});

test("Registrierung nutzt ausschließlich Legal-Wrapper und getrennte Opt-ins", () => {
  assert.match(customerPortal, /registerRestaurantGuest\(\{/);
  assert.match(customerPortal, /termsAccepted: form\.termsAccepted/);
  assert.match(customerPortal, /marketingPush: form\.marketingPush/);
  assert.match(customerPortal, /Freiwillige Einwilligungen/);
  assert.match(referralLanding, /termsAccepted: form\.termsAccepted/);
});

test("Migration blockiert Registrierung ohne Pflichtannahme serverseitig", () => {
  assert.match(migration, /if not input_terms_accepted or not input_privacy_acknowledged then/);
  assert.match(migration, /revoke execute on function public\.register_restaurant_customer\(text, text, text, date, text\) from anon, authenticated/);
  assert.match(migration, /register_restaurant_customer_legal/);
});

test("Dokumentversionen sind unveränderlich und gehasht", () => {
  assert.match(migration, /legal_document_versions_immutable/);
  assert.match(migration, /prevent_legal_version_mutation/);
  assert.match(migration, /extensions\.digest/);
});

test("neue Version kann eine erneute Annahme verlangen und bleibt tokengebunden", () => {
  assert.match(migration, /'reacceptance_required', v\.reacceptance_required/);
  assert.match(migration, /create or replace function public\.accept_current_legal_documents/);
  assert.match(migration, /resolve_customer_from_public_token\(restaurant_record\.id, input_customer_token\)/);
  assert.match(migration, /LEGAL_REACCEPTANCE_REQUIRED/);
  assert.match(legalCenter, /Aktuelle Version bestätigen/);
});

test("Acceptances und Consents sind je Restaurant und Kunde gescopet", () => {
  assert.match(migration, /unique \(customer_id, document_version_id\)/);
  assert.match(migration, /unique \(restaurant_id, customer_id, consent_type\)/);
  assert.match(migration, /resolve_customer_from_public_token\(restaurant_record\.id, input_customer_token\)/);
});

test("Widerruf ändert keine Punkte und erzeugt Audit", () => {
  const consentFunction = migration.slice(migration.indexOf("create or replace function public.update_customer_consent"), migration.indexOf("create or replace function public.create_customer_privacy_request"));
  assert.doesNotMatch(consentFunction, /points_balance\s*=/);
  assert.match(consentFunction, /CONSENT_WITHDRAWN/);
});

test("identische Consent-Auswahl erzeugt kein doppeltes Ereignis", () => {
  const consentFunction = migration.slice(migration.indexOf("create or replace function public.update_customer_consent"), migration.indexOf("create or replace function public.create_customer_privacy_request"));
  assert.match(consentFunction, /if previous_status_value = next_status_value then/);
  assert.match(consentFunction, /pg_advisory_xact_lock/);
});

test("Datenschutzexport und Löschantrag bleiben restaurantbezogen", () => {
  assert.match(migration, /create or replace function public\.get_customer_data_export/);
  assert.match(migration, /create or replace function public\.create_customer_privacy_request/);
  assert.match(migration, /DELETION_REQUEST_CREATED/);
  assert.match(migration, /DATA_ACCESS_REQUESTED/);
  assert.match(migration, /DATA_RECTIFICATION_REQUESTED/);
  assert.match(migration, /DATA_RESTRICTION_REQUESTED/);
  assert.match(migration, /DATA_EXPORT_CREATED/);
});

test("Mitgliedschaftsbeendigung wird zunächst nur als Antrag protokolliert", () => {
  assert.match(migration, /MEMBERSHIP_TERMINATION_REQUESTED/);
  assert.doesNotMatch(migration, /event_type_value := 'MEMBERSHIP_TERMINATED'/);
  assert.match(migration, /membership_status = 'termination_requested'/);
});

test("Program-End-Flow erzwingt geordnete Fristen", () => {
  assert.match(migration, /last_points_earning_at <= planned_end_at/);
  assert.match(migration, /planned_end_at <= final_redemption_at/);
  assert.match(migration, /PROGRAM_TERMINATION_SCHEDULED/);
});

test("Legal Center ist öffentlich, kundenbezogene Aktionen verlangen Token", () => {
  assert.match(legalCenter, /Rechtliches & Datenschutz/);
  assert.match(legalCenter, /token && data\.customer_recognized/);
  assert.match(legalCenter, /Meine Daten herunterladen/);
  assert.match(legalCenter, /Löschung beantragen/);
});

test("öffentliche Antwort enthält nur sichere Legal- und Laufzeitinformationen", () => {
  const publicFunction = migration.slice(migration.indexOf("create or replace function public.get_public_legal_center"), migration.indexOf("create or replace function public.record_customer_legal_state"));
  assert.match(publicFunction, /points_validity/);
  assert.match(publicFunction, /program_operator/);
  assert.doesNotMatch(publicFunction, /owner_email|service_role|customer_token_hash/);
});

test("Owner sieht offene Datenschutzanfragen nur restaurantbezogen", () => {
  assert.match(migration, /privacy_requests_owner_select/);
  assert.match(migration, /pr\.restaurant_id = input_restaurant_id/);
  assert.match(migration, /customer_reference/);
});

test("Marketing-Servergate ist nicht für Browserrollen ausführbar", () => {
  assert.match(migration, /revoke execute on function public\.authorize_customer_message[^;]+from public, anon, authenticated/);
  assert.match(migration, /MARKETING_MESSAGE_BLOCKED_NO_CONSENT/);
});

test("Restaurantsuche behält barrierefreie Listenalternative", () => {
  assert.match(finder, /aria-label="Liste der Partnerrestaurants"/);
  assert.match(finder, /Karte \/ Liste|Darstellung wählen/);
});

test("keine Public-Select-Policy wird für Legal- oder Kundentabellen geöffnet", () => {
  assert.doesNotMatch(migration, /create policy[^;]+to anon/si);
  assert.match(migration, /revoke all on public\.restaurant_legal_profiles/);
  assert.match(migration, /grant execute on function public\.get_public_legal_center/);
});
