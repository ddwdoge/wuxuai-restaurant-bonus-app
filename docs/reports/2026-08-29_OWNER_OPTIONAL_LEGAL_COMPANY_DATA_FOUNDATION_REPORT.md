# WUXUAI Bonus - Owner Optional Legal Company Data Foundation

Datum: 2026-08-29  
Branch: `codex/v1-canonical-recovery`  
Production: LOCKED  
Stripe: DEFERRED

## Ursache

Das bestehende `restaurant_legal_profiles` vermischte rechtlichen Betreiber
und Restaurantmarke. Dadurch konnte ein Markenname fälschlich zum rechtlichen
Unternehmensnamen werden und die Geschäftsanschrift besaß keine explizite
Beziehung zur Restaurantadresse. Die bereits vorhandene `organizations`-Ebene
war strukturell der richtige Betreiber-Knoten, enthielt aber noch kein
geschütztes Legal-Profil.

## Geänderte Dateien

- `src/modules/admin/pages/RestaurantOnboarding.tsx`
- `src/modules/tenant/TenantProvider.tsx`
- `src/shared/types/domain.ts`
- `src/modules/onboarding/pilotOnboardingService.ts`
- `src/modules/admin/pages/SettingsPage.tsx`
- `src/modules/admin/admin-premium.css`
- `src/modules/legal/OwnerLegalSettingsPage.tsx`
- `src/modules/legal/legalCompanyData.mjs`
- `src/modules/legal/legalCompanyData.d.mts`
- `supabase/migrations/20260829001000_optional_legal_company_data_foundation.sql`
- `tests/owner-legal-company-data-foundation.test.mjs`
- `tests/automated-legal-onboarding.test.mjs`
- `docs/08_FLOW_01_ONBOARDING.md`
- `docs/14_DATABASE_ARCHITEKTUR.md`
- `docs/17_CTO_ENTSCHEIDUNGEN.md`
- `docs/19_CHANGELOG.md`

Der Arbeitsstand enthält außerdem die unmittelbar vorherige, noch nicht
committete Owner-Onboarding-/Legal-Readiness-Korrektur. Sie wurde nicht
zurückgebaut und ist Bestandteil des gemeinsam geprüften 1110-Test-Stands.

## Was wurde geändert

- Eigener Pflichtwert für den rechtlichen Unternehmensnamen, weil dieser Wert
  bereits Teil des bestehenden Legal-Veröffentlichungsvertrags ist.
- Rechtsform mit freien Eingaben und den Vorschlägen Einzelunternehmen, GmbH,
  OG, KG und Verein.
- Firmenbuchnummer, UID und vertretungsberechtigte Person als ausdrücklich
  optionale Felder im Onboarding.
- Länderabhängige Bezeichnungen: österreichische FN/UID, ansonsten generische
  Unternehmensregistrierungs- und Umsatzsteuer-ID.
- Zurückhaltende Normalisierung erkannter österreichischer Werte; unklare
  optionale Formate erzeugen nur einen verständlichen Hinweis und blockieren
  nicht.
- `organization_legal_profiles` als organisationsgebundene kanonische Quelle
  eingeführt: Legal Operator -> Restaurantmarke -> Branch/Standort.
- `restaurant_legal_profiles` bleibt nur als über `operator_profile_id`
  verknüpfte Kompatibilitätsprojektion für bestehende Legal-Verträge.
- Explizite Adressquelle eingeführt: Restaurantadresse referenzieren oder
  separate Geschäftsanschrift speichern.
- Onboarding und `Unternehmensdaten & Rechtliches` verwenden denselben
  ownergeschützten Legal-Generator.
- Neue Dokumententwürfe enthalten vorhandene optionale Kennungen und
  Vertretungsdaten im strukturierten Inhalt sowie im Impressum.
- Audit protokolliert für Unternehmensname, Rechtsform, FN, UID und Vertretung
  sowie die Adressquelle nur geänderte Feldnamen, keine Werte.
- Die zentrale Registration-Readiness und der Public Legal Center verlangen
  dieselbe gültige Verbindung zwischen Restaurantprojektion und kanonischem
  Operator-Profil. Ohne diese Verbindung bleibt die Registrierung blockiert.

## Was wurde nicht geändert

- Keine parallele, unabhängig editierbare Unternehmensdatenquelle.
- Keine automatische Dokumentannahme oder Veröffentlichung.
- Keine Änderung veröffentlichter oder historischer Dokumentversionen.
- Keine FN-/UID-Pflicht und keine Platzhalterwerte.
- Keine Änderung an Customer-, Staff-, Points-, Referral- oder Reward-Logik.
- Keine Stripe-Customer, Subscriptions, Webhooks oder externe Billing-Aktion.
- Keine RLS-Lockerung, keine Service Role im Browser.
- Keine Production- oder Staging-Aktion.
- Keine neue Mehrsprachenarchitektur: Die verbindliche V1-Bible verlangt
  weiterhin deutsche sichtbare UI. Nicht-österreichische Unternehmensdaten
  werden dennoch mit generischen Feldbezeichnungen behandelt.

## Canonical Data Source

Quelle: `public.organization_legal_profiles`, eindeutig über
`organization_id` an `public.organizations` gebunden.

- Owner-Onboarding schreibt `input_profile` über
  `public.complete_restaurant_onboarding`.
- Owner-Einstellungen laden über `public.get_restaurant_legal_setup` und
  erzeugen Änderungen über `public.generate_restaurant_legal_package`.
- Legal-Dokumente lesen dieselben normalisierten Operator-Daten über die
  explizit verknüpfte Restaurant-Kompatibilitätsprojektion.
- `commercial_register_number`, `vat_id` und `responsible_person` bleiben aus
  `restaurant_registration_readiness` ausgeschlossen.

## Migration

Datei: `20260829001000_optional_legal_company_data_foundation.sql`

- Additive Tabelle `organization_legal_profiles`, Backfill vollständiger
  Bestandsprofile und explizite Projektions-Fremdschlüssel.
- RLS erlaubt das Lesen nur autorisierten Owner-/Admin-/Manager-Beziehungen;
  direkte Browser-Schreibrechte bleiben entzogen.
- Ersetzt den Legal-Generator und den Public-Legal-Center-Vertrag; der alte
  direkte Restaurant-Save-RPC ist für `authenticated` entzogen.
- `SECURITY DEFINER` mit `search_path = public, extensions, pg_temp`.
- Serverseitige Prüfung über `public.is_restaurant_admin`.
- EXECUTE: `authenticated`; `public` und `anon` entzogen.
- Optionales FN-/UID-Format blockiert die Generierung nicht.
- Neue Versionen bleiben immutable Drafts; kein Auto-Publish.
- Staging angewendet: NEIN.
- Lokaler DB-Linter: NICHT AUSFÜHRBAR, weil keine lokale Supabase-DB auf
  `127.0.0.1:54322` lief. Der SQL-Vertrag ist durch fokussierte statische Tests
  geprüft, ersetzt aber keinen echten Migration-Dry-Run.

## SECURITY-DEFINER-Funktionen

Neu:

- `public.upsert_organization_legal_profile(uuid, jsonb)`
  - Zweck: tenantgebundene, atomare Pflege des kanonischen Operator-Profils
    und der explizit verknüpften Restaurant-Kompatibilitätsprojektion.
  - Autorisierung: serverseitig über `is_restaurant_admin`; kein direkter
    Browser-Aufruf.
  - `search_path`: `public, extensions, pg_temp`.
  - `EXECUTE`: `public`, `anon` und `authenticated` ausdrücklich entzogen.

Bestehend, durch die additive Migration ersetzt:

- `public.generate_restaurant_legal_package(uuid, jsonb, boolean)`
  - Zweck: Owner-geschützte Operator-Pflege und immutable Dokumententwürfe.
  - `search_path`: `public, extensions, pg_temp`.
  - `EXECUTE`: `authenticated` gewährt; `public` und `anon` entzogen; die
    Funktion prüft zusätzlich `is_restaurant_admin`.
- `public.restaurant_legal_bundle_is_current(uuid, date)`
  - Zweck: interne Readiness-Prüfung inklusive gültiger Operator-Verknüpfung.
  - `search_path`: `public, pg_temp`.
  - `EXECUTE`: `public`, `anon` und `authenticated` entzogen.
- `public.restaurant_registration_readiness(uuid, date)`
  - Zweck: ein serverseitiger Owner-/System-Readiness-Vertrag; fehlende
    Operator-Verknüpfung wird als `Betreiberdaten` gemeldet.
  - `search_path`: `public, pg_temp`.
  - `EXECUTE`: `public`, `anon` und `authenticated` entzogen.
- `public.get_public_legal_center(text, text)`
  - Zweck: bewusst öffentlicher Legal-Center-Vertrag mit Operatoridentität
    und getrenntem Restaurant-Markennamen.
  - `search_path`: `public, pg_temp`.
  - `EXECUTE`: `anon` und `authenticated` gewährt; `public` entzogen.

Der historische direkte Schreibweg
`save_restaurant_legal_setup(uuid, jsonb, jsonb, text, date, boolean)` verliert
sein `authenticated`-EXECUTE-Recht, damit die Organisationsebene nicht
umgangen werden kann.

## Sicherheit

- Owner: eigener Tenant über `is_restaurant_admin`.
- Staff: kein EXECUTE-Zugang über eine Staff-spezifische Freigabe; die Funktion
  lehnt Nicht-Admins serverseitig ab.
- Customer/Anon: keine Berechtigung.
- Cross-Tenant: durch `is_restaurant_admin(input_restaurant_id)` blockiert.
- RLS: neue organisationsgebundene Select-Policy; keine Staff-, Customer- oder
  Anon-Schreibmöglichkeit.
- Secret-Scan des Diffs: keine Treffer.

## Ergebnisse

- Gezielte Legal-/Readiness-Vertragstests: 52/52 PASS.
- Vollständige Tests: 1125/1125 PASS.
- Typecheck: PASS.
- Lint: PASS, 0 Fehler; 7 bekannte Warnungen außerhalb dieser Änderung.
- Build: PASS, Vite Production Build.
- `git diff --check`: PASS.
- Responsive Fixture: 320/375/390/414/430/768/1024/1440 PASS.
- Globaler horizontaler Overflow: NEIN.
- Desktop geprüft: JA, technische responsive Fixture.
- Tablet geprüft: JA, technische responsive Fixture.
- Mobile geprüft: JA, technische responsive Fixture.
- Echter Staging-Onboarding-Flow: NEIN.

## Finale Klassifikation

COMPANY DATA ONBOARDING: PASS  
FN OPTIONAL: PASS  
UID OPTIONAL: PASS  
LEGAL FORM: PASS  
AUTHORIZED REPRESENTATIVE: PASS  
CANONICAL DATA SOURCE: PASS - `organization_legal_profiles`  
LEGAL OPERATOR / RESTAURANT / BRANCH: PASS  
ADDRESS SEPARATION: PASS  
SETTINGS EDIT: PASS  
LEGAL DOCUMENT INTEGRATION: CODE PASS / STAGING OFFEN  
READINESS CONTRACT: PASS  
EXISTING RESTAURANTS: PASS - Migration schreibt keine Bestandsdaten um  
STAFF: BLOCKED - Code-/Grant-Vertrag  
CUSTOMER: BLOCKED - Code-/Grant-Vertrag  
CROSS-TENANT: BLOCKED - Code-/RLS-Vertrag  
BUSINESS LOGIC CHANGED: NO  
DB MIGRATION: `20260829001000_optional_legal_company_data_foundation.sql`  
TESTS: 1125/1125 PASS  
OWNER COMPANY DATA FOUNDATION READY: NO - Staging-Migration und echter Flow-Test offen  
PRODUCTION: LOCKED  
STRIPE: DEFERRED

## Risiken

1. Die Migration benötigt vor Aktivierung einen echten Supabase-Dry-Run,
   DB-Linter und Staging-Anwendung.
2. Owner-, Staff-, Customer- und Cross-Tenant-Verhalten wurde in diesem Lauf
   vertraglich automatisiert geprüft, aber nicht mit vier echten Staging-
   Sitzungen wiederholt.
3. Die V1-UI bleibt gemäß Engineering Bible deutsch; eine spätere echte
   DE/EN/FR/IT/ES-Lokalisierung ist eine eigene freizugebende Architekturarbeit.

Status: CODE LOCK
