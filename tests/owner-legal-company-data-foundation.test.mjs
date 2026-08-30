import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  companyRegistrationLabel,
  isAustriaCountry,
  normalizeCompanyRegistrationNumber,
  normalizeVatId,
  optionalCompanyIdentifierHint,
  vatIdLabel,
} from "../src/modules/legal/legalCompanyData.mjs";

const onboarding = await readFile(new URL("../src/modules/admin/pages/RestaurantOnboarding.tsx", import.meta.url), "utf8");
const ownerLegal = await readFile(new URL("../src/modules/legal/OwnerLegalSettingsPage.tsx", import.meta.url), "utf8");
const settings = await readFile(new URL("../src/modules/admin/pages/SettingsPage.tsx", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20260829001000_optional_legal_company_data_foundation.sql", import.meta.url), "utf8");
const branchAddressFix = await readFile(new URL("../supabase/migrations/20260829001500_legal_company_branch_address_forward_fix.sql", import.meta.url), "utf8");
const tenantProvider = await readFile(new URL("../src/modules/tenant/TenantProvider.tsx", import.meta.url), "utf8");
const legalFoundation = await readFile(new URL("../supabase/migrations/20260724001000_legal_compliance_layer.sql", import.meta.url), "utf8");

test("österreichische FN und UID werden zurückhaltend normalisiert", () => {
  assert.equal(isAustriaCountry("Österreich"), true);
  assert.equal(isAustriaCountry("AT"), true);
  assert.equal(normalizeCompanyRegistrationNumber("fn123456A", "Österreich"), "FN 123456 a");
  assert.equal(normalizeVatId("atu 1234-5678", "AT"), "ATU12345678");
  assert.equal(optionalCompanyIdentifierHint("registration", "FN 123456 a", "Österreich"), null);
  assert.equal(optionalCompanyIdentifierHint("vat", "ATU12345678", "Österreich"), null);
  assert.match(optionalCompanyIdentifierHint("vat", "123", "Österreich"), /optional/);
});

test("nicht österreichische Angaben bleiben generisch und unverändert", () => {
  assert.equal(companyRegistrationLabel("Deutschland"), "Unternehmensregistrierungsnummer");
  assert.equal(vatIdLabel("Frankreich"), "Umsatzsteuer-ID");
  assert.equal(normalizeCompanyRegistrationNumber("HRB 123", "Deutschland"), "HRB 123");
  assert.equal(normalizeVatId("FR 12 345", "Frankreich"), "FR 12 345");
  assert.equal(optionalCompanyIdentifierHint("vat", "FR 12 345", "Frankreich"), null);
});

test("Onboarding schreibt alle Angaben in das kanonische Operator-Profil", () => {
  assert.match(onboarding, /company_name: form\.legalCompanyName\.trim\(\)/);
  assert.match(onboarding, /registered_address_matches_restaurant: form\.legalAddressMatchesRestaurant/);
  assert.match(onboarding, /commercial_register_number: normalizeCompanyRegistrationNumber/);
  assert.match(onboarding, /vat_id: normalizeVatId/);
  assert.match(onboarding, /responsible_person: form\.legalAuthorizedRepresentative\.trim\(\)/);
  assert.match(onboarding, /FN und UID kannst du auch später ergänzen/);
});

test("FN, UID und vertretungsberechtigte Person blockieren das Onboarding nicht", () => {
  const checklist = onboarding.slice(onboarding.indexOf("function buildChecklist"), onboarding.indexOf("function getStepBlocker"));
  const blocker = onboarding.slice(onboarding.indexOf("function getStepBlocker"), onboarding.indexOf("export function RestaurantOnboarding"));
  for (const optionalField of ["legalCompanyRegistrationNumber", "legalVatId", "legalAuthorizedRepresentative"]) {
    assert.doesNotMatch(checklist, new RegExp(optionalField));
    assert.doesNotMatch(blocker, new RegExp(optionalField));
  }
});

test("Einstellungen bearbeiten dieselbe kanonische Quelle", () => {
  assert.match(settings, /Unternehmensdaten & Rechtliches/);
  assert.match(settings, /to="\/admin\/legal"/);
  for (const key of ["company_name", "legal_form", "commercial_register_number", "vat_id", "responsible_person"]) {
    assert.match(ownerLegal, new RegExp(key));
  }
  assert.match(ownerLegal, /generateRestaurantLegalPackage/);
  assert.match(ownerLegal, /Geschäftsanschrift entspricht Restaurantadresse/);
  assert.doesNotMatch(ownerLegal, /\["restaurant_operator", "Restaurantbetreiber"\]/);
});

test("Forward-Migration hält optionale Kennungen aus dem Readiness-Gate heraus", () => {
  const requiredBlock = migration.slice(
    migration.indexOf("if profile_value->>'company_name' is null"),
    migration.indexOf("is_austria :=", migration.indexOf("if profile_value->>'company_name' is null")),
  );
  assert.doesNotMatch(requiredBlock, /commercial_register_number|vat_id|responsible_person/);
  assert.match(migration, /company_registration_number/);
  assert.match(migration, /authorized_representative/);
  assert.match(migration, /when 'imprint'/);
});

test("Legal Operator, Restaurantmarke und Standort bleiben strukturell getrennt", () => {
  assert.match(migration, /create table if not exists public\.organization_legal_profiles/);
  assert.match(migration, /organization_id uuid not null unique references public\.organizations/);
  assert.match(migration, /operator_profile_id uuid[\s\S]*references public\.organization_legal_profiles/);
  assert.match(migration, /address_source_restaurant_id uuid references public\.restaurants/);
  assert.match(migration, /registered_address_source in \('restaurant', 'separate'\)/);
  assert.doesNotMatch(migration, /alter table public\.restaurant_branding[\s\S]*(company_name|vat_id|commercial_register_number)/);
});

test("Restaurantadresse wird nur über eine ausdrückliche Quelle wiederverwendet", () => {
  assert.match(migration, /registered_address_matches_restaurant/);
  assert.match(migration, /LEGAL_RESTAURANT_ADDRESS_INCOMPLETE/);
  assert.match(migration, /case when use_restaurant_address then null else resolved_street end/);
  assert.match(onboarding, /legal-address-matches-restaurant/);
  assert.match(onboarding, /disabled=\{form\.legalAddressMatchesRestaurant\}/);
});

test("Restaurantadresse stammt kanonisch vom Branch und nicht aus einer Restaurant-Spalte", () => {
  assert.match(branchAddressFix, /branch_record public\.branches%rowtype/);
  assert.match(branchAddressFix, /b\.restaurant_id = restaurant_record\.id/);
  assert.match(branchAddressFix, /b\.organization_id = restaurant_record\.organization_id/);
  assert.match(branchAddressFix, /resolved_street := nullif\(trim\(branch_record\.address\), ''\)/);
  assert.match(branchAddressFix, /address_source_branch_id uuid[\s\S]*references public\.branches/);
  assert.match(branchAddressFix, /update public\.organization_legal_profiles op[\s\S]*set address_source_branch_id = b\.id/);
  assert.doesNotMatch(branchAddressFix, /restaurant_record\.(address|postal_code|city|country)/);
  assert.doesNotMatch(tenantProvider, /language, address, postal_code, city, country, opening_hours/);
  assert.match(tenantProvider, /\.from\("branches"\)[\s\S]*\.select\("id, restaurant_id, address, postal_code, city, country"\)/);
  assert.match(tenantProvider, /branch\.id === restaurant\?\.primary_branch_id/);
});

test("Rechtstexte und Public Legal Center verwenden den Operator statt der Marke", () => {
  assert.match(migration, /'program_operator_name', profile_value->>'company_name'/);
  assert.match(migration, /'program_operator', profile_record\.company_name/);
  assert.doesNotMatch(migration, /'program_operator', restaurant_record\.name/);
  assert.match(migration, /'restaurant'[\s\S]*'name', restaurant_record\.name/);
});

test("Legacy-Profil ist eine verknüpfte Projektion und kein zweiter Owner-Schreibweg", () => {
  assert.match(migration, /operator_profile_id = excluded\.operator_profile_id/);
  assert.match(migration, /join public\.organization_legal_profiles op on op\.id = p\.operator_profile_id/);
  assert.match(migration, /operator_link_valid[\s\S]*'Betreiberdaten'/);
  assert.match(migration, /and operator_link_valid[\s\S]*and cardinality\(missing_fields\) = 0/);
  assert.match(migration, /revoke execute on function public\.save_restaurant_legal_setup[\s\S]*from authenticated/);
  assert.match(migration, /revoke all on public\.organization_legal_profiles from public, anon, authenticated/);
  assert.match(migration, /organization_legal_profiles_admin_select[\s\S]*rm\.role in \('owner', 'admin', 'manager'\)/);
});

test("Billing bleibt reine spätere Wiederverwendung ohne Stripe-Aktivierung", () => {
  assert.doesNotMatch(migration, /stripe_customer|stripe_subscription|checkout|webhook/i);
  assert.doesNotMatch(onboarding, /Stripe|Zahlungsdaten/);
});

test("Owner-Schutz, sichere Funktion und wertfreier Audit-Trail bleiben erhalten", () => {
  assert.match(migration, /security definer[\s\S]*set search_path = public, extensions, pg_temp/);
  assert.match(migration, /public\.is_restaurant_admin\(input_restaurant_id\)/);
  assert.match(migration, /revoke execute[\s\S]*from public, anon/);
  assert.match(migration, /grant execute[\s\S]*to authenticated/);
  assert.match(migration, /changed_profile_fields/);
  assert.doesNotMatch(migration, /'previous_state'[\s\S]*(company_name|vat_id)/);
  assert.match(legalFoundation, /restaurant_legal_profiles_owner_select[\s\S]*public\.is_restaurant_admin\(restaurant_id\)/);
});
