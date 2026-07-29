import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/20260729006000_automated_restaurant_legal_onboarding.sql", import.meta.url),
  "utf8",
);
const guardMigration = await readFile(
  new URL("../supabase/migrations/20260729005000_legal_readiness_effective_date_guard.sql", import.meta.url),
  "utf8",
);
const onboarding = await readFile(
  new URL("../src/modules/admin/pages/RestaurantOnboarding.tsx", import.meta.url),
  "utf8",
);
const onboardingService = await readFile(
  new URL("../src/modules/onboarding/pilotOnboardingService.ts", import.meta.url),
  "utf8",
);
const ownerLegal = await readFile(
  new URL("../src/modules/legal/OwnerLegalSettingsPage.tsx", import.meta.url),
  "utf8",
);
const programTermination = await readFile(
  new URL("../src/modules/legal/ProgramTerminationPage.tsx", import.meta.url),
  "utf8",
);
const dashboard = await readFile(
  new URL("../src/modules/admin/pages/AdminDashboard.tsx", import.meta.url),
  "utf8",
);
const legalService = await readFile(
  new URL("../src/modules/legal/legalService.ts", import.meta.url),
  "utf8",
);
const customerPortal = await readFile(
  new URL("../src/modules/customer/CustomerPortal.tsx", import.meta.url),
  "utf8",
);
const publicLegalCenter = await readFile(
  new URL("../src/modules/legal/LegalCenterPage.tsx", import.meta.url),
  "utf8",
);
const ownerCss = await readFile(
  new URL("../src/modules/admin/admin-premium.css", import.meta.url),
  "utf8",
);

test("Onboarding erfasst nur Stammdaten und keine juristischen Freitexte", () => {
  for (const field of ["legalForm", "legalStreet", "legalPostalCode", "legalCity", "legalCountry", "legalEmail"]) {
    assert.match(onboarding, new RegExp(field));
  }
  assert.doesNotMatch(onboarding, /fraud_and_blocking_rule|program_termination_rule|privacyText/);
});

test("Beschwerdekontakt fällt auf Kontakt-E-Mail zurück", () => {
  assert.match(onboarding, /form\.legalComplaintContact\.trim\(\) \|\| form\.legalEmail\.trim\(\)/);
  assert.match(migration, /nullif\(trim\(input_profile->>'complaint_contact'\), ''\)[\s\S]*nullif\(trim\(input_profile->>'email'\), ''\)/);
});

test("Pflichtfelder enthalten Rechtsform, vollständige Adresse und Kontakt-E-Mail", () => {
  for (const field of ["legal_form", "street", "postal_code", "city", "country", "email"]) {
    assert.match(migration, new RegExp(`profile_value->>'${field}'`));
  }
});

test("Optionale Register- und UID-Angaben blockieren nicht", () => {
  const requiredBlock = migration.slice(
    migration.indexOf("if nullif(trim(profile_value->>'company_name')"),
    migration.indexOf("select exists ("),
  );
  assert.doesNotMatch(requiredBlock, /commercial_register_number|commercial_register_court|vat_id/);
});

test("zentrale Mastertemplates sind versioniert und nicht öffentlich lesbar", () => {
  assert.match(migration, /create table if not exists public\.legal_master_templates/);
  assert.match(migration, /unique \(document_type, version, language\)/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on public\.legal_master_templates from public, anon, authenticated/);
});

test("Pilot nutzt vorbereitete Vorlagen, Production verlangt geprüfte Mastertemplates", () => {
  assert.match(migration, /s\.plan_key = 'pilot'/);
  assert.match(migration, /is_pilot or review_status = 'REVIEWED'/);
  assert.match(migration, /selected_template_count < 5/);
  assert.match(migration, /publication_status := 'draft'/);
});

test("Dokumentversionen bleiben unveränderbar und neue Inhalte erzeugen neue Versionen", () => {
  const generatorBlock = migration.slice(
    migration.indexOf("create or replace function public.generate_restaurant_legal_package"),
    migration.indexOf("create or replace function public.mark_restaurant_legal_update_required"),
  );
  assert.match(migration, /insert into public\.legal_document_versions/);
  assert.doesNotMatch(generatorBlock, /update public\.legal_document_versions/);
  assert.match(migration, /old\.status = 'draft'[\s\S]*new\.status = 'published'/);
  assert.match(migration, /Veröffentlichte Rechtsdokumente sind unveränderlich/);
  assert.match(migration, /document_hash = hash_value/);
});

test("Generator ist ownergeschützt, tenantgebunden und nicht anonym ausführbar", () => {
  assert.match(migration, /if not public\.is_restaurant_admin\(input_restaurant_id\)/);
  assert.match(migration, /where id = input_restaurant_id[\s\S]*for update/);
  assert.match(migration, /revoke execute on function public\.generate_restaurant_legal_package[\s\S]*from public, anon/);
  assert.match(migration, /grant execute on function public\.generate_restaurant_legal_package[\s\S]*to authenticated/);
});

test("Onboarding erzeugt das Legal-Paket als prüfbaren Entwurf vor erfolgreicher Rückgabe", () => {
  const generation = onboardingService.indexOf('supabase.rpc("generate_restaurant_legal_package"');
  const result = onboardingService.indexOf("return { restaurant");
  assert.ok(generation > 0);
  assert.ok(result > generation);
});

test("Legal Readiness verlangt Stammdaten und zwei aktuell veröffentlichte Pflichtdokumente", () => {
  assert.match(guardMigration, /restaurant_legal_profiles p/);
  assert.match(guardMigration, /nullif\(trim\(p\.legal_form\), ''\) is not null/);
  assert.match(guardMigration, /count\(distinct d\.document_type\) = 2/);
  assert.match(guardMigration, /v\.effective_date <= input_as_of/);
});

test("Owner-Hauptansicht zeigt kompakte Karten statt juristischer Freitextfelder", () => {
  for (const label of ["Impressum", "Teilnahmebedingungen", "Datenschutzerklärung", "Bonusregeln", "Kassenabgrenzung"]) {
    assert.match(ownerLegal, new RegExp(label));
  }
  assert.doesNotMatch(ownerLegal, /Veröffentlichter Text|fraud_and_blocking_rule|DRAFT_LEGAL_REVIEW_REQUIRED/);
});

test("technische Statuscodes werden in verständliche Owner-Texte übersetzt", () => {
  assert.match(ownerLegal, /Vorlage – rechtliche Prüfung empfohlen/);
  assert.match(ownerLegal, /Bereit zur Veröffentlichung|Neue Version verfügbar|Veröffentlicht/);
});

test("Bonusregeländerungen markieren eine neue Legal-Version statt Altversionen zu überschreiben", () => {
  assert.match(migration, /legal_update_required_at/);
  assert.match(migration, /loyalty_settings_mark_legal_update/);
  assert.match(ownerLegal, /Neue Version verfügbar/);
});

test("Programmende besitzt einen eigenen bestätigten Owner-Flow", () => {
  assert.match(programTermination, /Bonusprogramm beenden/);
  assert.match(programTermination, /Fristen und Kundenhinweis geprüft/);
  assert.match(programTermination, /scheduleProgramTermination/);
});

test("Kassenabgrenzung wird automatisch erzeugt und verweist auf Aktivitätsberichte", () => {
  assert.match(migration, /cash_register_boundary/);
  assert.match(ownerLegal, /Bonus-Aktivitätsberichte öffnen/);
});

test("Dashboard zeigt den serverseitigen Legal-Status sofort nach dem Login", () => {
  assert.match(dashboard, /loadRestaurantLegalSetup/);
  assert.match(dashboard, /Rechtlicher Status/);
  assert.match(dashboard, /Bereit für Kundenregistrierung|legalRegistration\?\.label/);
  assert.match(dashboard, /Legal Center öffnen/);
});

test("vollständiges Restaurant erhält grün und fehlende Pflichtdokumente rot", () => {
  assert.match(migration, /when 'green' then 'Bereit für Kundenregistrierung'/);
  assert.match(migration, /else 'Kundenregistrierung blockiert'/);
  assert.match(migration, /active_required_count = 2/);
});

test("unveröffentlichte Entwürfe und geänderte Unternehmensdaten ergeben gelb", () => {
  assert.match(migration, /legal_update_required_at is not null or draft_count > 0/);
  assert.match(migration, /status_value := 'yellow'/);
  assert.match(ownerLegal, /Ihre Unternehmensdaten wurden geändert|Neue Version verfügbar/);
});

test("Unternehmensänderungen erzeugen Entwürfe und überschreiben keine aktive Version", () => {
  assert.match(migration, /publication_status := 'draft'/);
  assert.doesNotMatch(migration.slice(migration.indexOf("publication_status := 'draft'"), migration.indexOf("create or replace function public.mark_restaurant_legal_update_required")), /set current_published_version_id = version_id_value/);
  assert.match(ownerLegal, /Neue Version vorbereiten/);
});

test("Veröffentlichung verlangt Vorschau, Gültigkeitsdatum und ausdrückliche Bestätigung", () => {
  assert.match(ownerLegal, /Dokumentvorschau anzeigen/);
  assert.match(ownerLegal, /Gültig ab/);
  assert.match(ownerLegal, /Ich habe die Angaben geprüft und möchte diese Version veröffentlichen/);
  assert.match(legalService, /publish_restaurant_legal_drafts/);
  assert.match(migration, /if not input_confirmed/);
});

test("alte veröffentlichte Versionen und Kundenbestätigungen bleiben unverändert", () => {
  const publishBlock = migration.slice(migration.indexOf("create or replace function public.publish_restaurant_legal_drafts"), migration.indexOf("create or replace function public.get_restaurant_legal_setup"));
  assert.doesNotMatch(publishBlock, /update public\.customer_legal_acceptances|delete from public\.customer_legal_acceptances/);
  assert.match(migration, /customer_legal_acceptances[\s\S]*mandatory boolean not null default true/);
});

test("Reacceptance wird niemals automatisch aktiviert", () => {
  assert.match(legalService, /reacceptanceRequired: boolean/);
  assert.match(ownerLegal, /Nicht automatisch aktiv/);
  assert.match(migration, /input_reacceptance_required boolean default false/);
});

test("Dokumentdetails enthalten Version, Zeitpunkte, Akzeptanzen, Owner und Mastertemplate", () => {
  for (const field of ["published_at", "acceptance_count", "responsible_owner", "master_template_version", "draft_version"]) {
    assert.match(migration, new RegExp(`'${field}'`));
  }
  assert.match(ownerLegal, /Akzeptiert/);
  assert.match(ownerLegal, /Verantwortlich/);
  assert.match(ownerLegal, /Vorlage/);
});

test("technische Statuswerte werden nicht ungefiltert angezeigt", () => {
  assert.doesNotMatch(ownerLegal, /DRAFT_LEGAL_REVIEW_REQUIRED|LEGAL_REVIEW_REQUIRED|superseded/);
  assert.match(ownerLegal, /Rechtliche Prüfung empfohlen/);
  assert.match(ownerLegal, /Veröffentlicht/);
});

test("zukünftiges Gültigkeitsdatum wird vor der Aktivierung blockiert", () => {
  assert.match(migration, /v\.effective_date <= input_as_of/);
  assert.match(ownerLegal, /min=\{new Date\(\)\.toISOString\(\)\.slice\(0, 10\)\}/);
});

test("Programmende blockiert Neuregistrierung und erhält eine Read-only-Phase", () => {
  assert.match(migration, /t\.status = 'scheduled'/);
  assert.match(migration, /read_only_at/);
  assert.match(programTermination, /schreibgeschützte Abschlussphase/);
  assert.match(programTermination, /Abschlussbericht/);
  assert.match(programTermination, /historische Kundenbestätigungen verändert/);
});

test("Owner A kann B nicht lesen oder veröffentlichen und Staff besitzt kein Veröffentlichungsrecht", () => {
  assert.match(migration, /if not public\.is_restaurant_admin\(input_restaurant_id\)/);
  assert.match(migration, /where id = draft_record\.document_id and restaurant_id = input_restaurant_id/);
  assert.match(migration, /revoke execute on function public\.publish_restaurant_legal_drafts[\s\S]*from public, anon/);
});

test("fehlende Konfiguration und temporärer Netzwerkfehler bleiben getrennte Zustände", () => {
  assert.match(customerPortal, /Die rechtlichen Informationen dieses Restaurants konnten gerade nicht geladen werden\. Bitte versuche es erneut\./);
  assert.match(publicLegalCenter, /Dieses Restaurant hat die erforderlichen rechtlichen Informationen noch nicht vollständig eingerichtet\./);
  assert.match(publicLegalCenter, /Erneut versuchen/);
});

test("Legal-Fehler löschen weder Kundentoken noch Sitzung", () => {
  const reloadBlock = customerPortal.slice(customerPortal.indexOf("const reloadLegalCenter"), customerPortal.indexOf("useEffect(() =>", customerPortal.indexOf("const reloadLegalCenter")));
  assert.doesNotMatch(reloadBlock, /removeStoredCustomerToken|signOut|setCustomer\(null\)/);
});

test("Legal Center zeigt Readiness-Checkliste und automatisierten Hinweis", () => {
  assert.match(ownerLegal, /Legal Readiness/);
  assert.match(ownerLegal, /Automatisch erstellt von WUXUAI/);
  assert.match(ownerLegal, /ersetzen keine individuelle Rechtsberatung/);
});

test("Legal UI bleibt bei 390 Pixel ohne horizontales Überlaufen und mit Touchflächen", () => {
  assert.match(ownerCss, /@media \(max-width: 699px\)/);
  assert.match(ownerCss, /owner-legal-publication-grid[\s\S]*grid-template-columns: minmax\(0,1fr\)/);
  assert.match(ownerCss, /min-height: 48px/);
  assert.match(ownerCss, /min-width: 0/);
});
