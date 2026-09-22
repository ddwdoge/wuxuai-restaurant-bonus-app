# Phase 7C.6B3 – Canonical Billing Catalog

Datum: 2026-09-23. Ausschließlich lokal.

Status: **PHASE 7C.6B3 CANONICAL BILLING CATALOG LOCAL CODE LOCK**.
Kein Stripe-, Staging-, Production- oder Gesamt-FINAL-LOCK.

## Ursache und Basis

Branch `codex/v1-release-integration`, HEAD/Remote-Tracking-Ref
`ec6f52ece5e85168a3c5cff4d656f35337a26a59`, Ausgangsparität 0/0.
Die Remote-Abfrage wurde im vorangegangenen read-only Preflight bestätigt;
in diesem lokalen Implementierungslauf kein erneuter externer Zugriff.
Einzige vorbestehende Abweichung: `supabase/.temp/cli-latest`, unverändert.
SHA-256: `103e9d7a97f9a66c28586ffae6f8d81a90630d5cb2c537b23ed886a5e0e5ff01`.

Der aktive Entitlement-Resolver verwendete noch den historischen 99-EUR-/
NULL-Unlimited-Katalog, während die Capacity-Schicht bereits 59/149 EUR und
begrenzte Kapazitäten verwendete. Die aktive Akquise-Konfiguration versprach
noch drei Monate. Die neue additive Schicht vereinheitlicht diese Autorität,
ohne Bestandsverträge umzuschreiben.

## Founder-Vertrag

| Produkt | EUR netto/Monat | Capacity | Trial |
|---|---:|---|---|
| BASIC | 59 | 5 Angebote / 3.000 Kundenkonten | ein Kalendermonat, später providergebunden |
| PRO | 149 | 15 Angebote / 15.000 Kundenkonten | ein Kalendermonat, später providergebunden |
| OFFER_CAPACITY | 19 je Einheit | +5 Angebote | keiner |
| CUSTOMER_CAPACITY | 29 je Einheit | +5.000 Kundenkonten | keiner |

Aktive eindeutige Kundenkonten innerhalb der jeweils zurückliegenden 365 Tage.
Serverzeit, halboffen `[as_of - 365 Tage, as_of)`, unveränderte Zählweise und
Tenant-Grain. Keine zwölf Kalendermonate und keine Änderung des Enforcements.

Trial getrennt: ein Kalendermonat am bestätigten Aktivierungszeitpunkt in UTC,
Monatsende geklemmt, nicht 30 Tage. Registrierung bleibt PENDING_ACTIVATION,
ohne Trial, effektiven Plan oder Capacity. Keine Aktivierung in dieser Phase.
Die spätere Aktivierung benötigt KYB, Country Release, aktuelle Vertragsannahme,
Owner-/Tenantbindung, bestätigten Checkout/Zahlungsmethode und ein signiertes,
idempotent verarbeitetes Providerereignis. Bestehende Drei-Monats-Trials bleiben.

## Neue Migration und Datenmodell

Migration 164: `20260922007000_billing_catalog_reconciliation.sql`.
SHA-256: `f6e4bd47ee55aa79bd3fa9aeefacf7c0b80c40ee2ea66c589e0bf8696f406ad5`.

Neue private RLS-Tabellen:

- `billing_product_versions`: Produktart, Code, Kapazitätsversions-FKs,
  Monatsintervall, Trial Policy, Gültigkeitsbeginn, aktiv, Revision/Akteur/Grund.
- `billing_seller_versions`: versionierter Seller und Verifikationsreferenzen.
- `billing_provider_binding_versions`: STRIPE, getrennt TEST/LIVE,
  immutable Product-/Price-Revisionen; initial acht UNBOUND-Bindungen, IDs NULL.
- `billing_trial_claims`: höchstens ein Claim pro Organisation und Restaurant;
  kein Claim-Schreib-RPC, keine Provideraktivierung, keine Bestandsmigration.

Private Views `billing_catalog_internal` und
`billing_plan_presentation_internal` referenzieren die bestehenden unveränderten
Capacity-Preisversionen. Keine zweite gepflegte Preis-/Limitkopie.

Neue Funktionen:

- `billing_trial_end_internal(timestamptz)`: reine private UTC-Monatsarithmetik.
- `resolve_billing_product_internal(text,text)`: private Readiness-Auflösung;
  ungültige Umgebung/Produkt fail-closed, fehlende Bindung niemals kaufbereit.
- `get_restaurant_billing_catalog(uuid,text)`: authentifizierter Owner des
  eigenen Tenants oder verifizierter Platform Admin; keine Schreibaktion.

`resolve_restaurant_entitlements_internal(uuid)` liest jetzt die kanonische
Preis-/Limitprojektion. Country-/Lifecycle-/Grant-/TEST_ONLY-/Pending-Zweige
bleiben erhalten. Effektive PRO-Limits sind endlich; Lookup-Key NULL ist keine
Providerbindung. Historische Overrides bleiben gespeichert, nicht unlimited.

UPDATE/DELETE/TRUNCATE der neuen Tabellen sind gesperrt. Direkte DML und
private Funktionsausführung sind für anon/authenticated/service_role entzogen.
Feste Search Paths; neue Views ohne API-Rechte. Keine neue Aktivierungsfunktion.

## Seller und Provider

Seller: WUXUAI Digital & Trading GmbH, zu gründen, **PLANNED**.
IP-Inhaberin/Lizenzgeberin: WU & XU Group GmbH, nicht Kunden-Rechnungsausstellerin.
TEST_READY/LIVE_READY sind modelliert, nicht aktiviert. LIVE_READY verlangt
nichtleere Gesellschafts-, Steuer-, Bank- und Stripe-Verifikationsreferenzen;
keine API-Rolle kann diese Konfiguration setzen. Die spätere privilegierte
Integration muss echte Verifikationsnachweise prüfen, nicht bloße UI-Angaben.
Keine Firmenbuch-, UID-, Bank-, Adress- oder Stripe-IDs erfunden.

Provider: STRIPE; TEST und LIVE getrennt; alle Product-/Price-IDs NULL,
alle Bindungen UNBOUND. `purchase_allowed=false`, `activation_implemented=false`.
Keine Secrets, Providerkontakte, Webhooks, Rechnungen, Zahlungen oder Auszahlungen.

## Altvertragsfundstellen und Behandlung

| Fundstelle/Klasse | Behandlung |
|---|---|
| Historischer `commercial_plan_catalog`, 99 EUR, NULL-Limit, Lookup-Keys | Tabellenzeilen/Migrationen unverändert; keine aktuelle Preisautorität im Entitlement-Resolver |
| Aktiver Entitlement-Resolver aus Migration 163 | additive Neudefinition in 164, 59/149 und endlich; historische Migration unverändert |
| Bestehender BASIC-Elevation-Guard | unverändert; alter Katalog dort nur als BASIC-Sicherheitsgrenze, nicht als PRO-Preis-/Unlimited-Autorität |
| `commercialContract.mjs/.d.mts` | aktive Trial Policy ein Monat; Legacy-Datumsfallback ausdrücklich weiter drei Monate |
| `catalog.mjs` öffentliche Einstiegsbeschreibung | sieben Sprachen: Registrierung startet keinen Trial, providergebundener erster Monat |
| `PlatformPlanEntitlementsPanel.tsx` | NULL/Unlimited nicht mehr als unbegrenzt darstellen; ungültige Antwort nicht verfügbar |
| `SettingsPage.tsx` | kein pauschaler 59-EUR-Preis als aktueller Plan; zentraler Katalog, kein automatischer Trial bei fehlendem Abo |
| `planOverrideMessages.mjs` / generierte historische i18n-Einträge | nicht mehr konsumierte Unlimited-Texte sind keine aktive Autorität; nicht massenhaft umgeschrieben |
| Tests mit Dreimonats-Neuregistrierungsbehauptung | eng auf neuen Vertrag aktualisiert; historische Migrationstests explizit Legacy |
| Master Contract, Payment Plan, Guardrails | aktueller Vertrag dokumentiert, ältere Payment-Plan-Abschnitte als historische Evidenz abgegrenzt |
| Mehrdeutige aktive Kunden-Zeitraumtexte | Suche in Source/Funktionen/aktuellen Dokumenten; relevanter Zwölf-Monats-Treffer nur in historischem 7C.1-Report, unverändert |
| Frühere Reports, ZIPs und Migrationen 001–163 | unverändert |

## UI und Verbindung

`BillingCatalogInfo` liest ausschließlich den neuen RPC; Preise/Limits aus dem
Server, kein Kaufbutton, keine Stripe-Funktion oder Aktivierungsaktion.
Eingebunden in Owner-Kapazität und Abo-/Testphase-Einstellungen.
Pending-Owner-Flächen behalten ihren frühen Setup-Hinweis; keine operativen
Hooks werden durch die Ergänzung gestartet.

Chromium/WebKit: je zwei geänderte Owner-Routen, DE in
320/375/390/430/767/768/1024/1440 px; EN/FR/IT/ES/ZH/KO jeweils 390/1440 px.
80 erfolgreiche Seiten-/Sprach-/Breitenprüfungen, keine Runtime-Fehler und kein
horizontaler Overflow; Preise und 365-Tage-Hinweis geladen. Neue Katalogfläche
enthält keine interaktiven Elemente, keine neuen Touchziel-/Drawerverträge.

Der erste abschließende Write-Snapshot scheiterte an einem unvollständigen
synthetischen Legacy-Fixture: fehlende `loyalty_settings` aktivierten den
unveränderten Settings-Loader-Default. Betroffen: restaurants, loyalty_settings,
audit_log, ausschließlich lokale synthetische Daten. Keine Korrektur außerhalb
des Billing-Scopes. Das Fixture wurde vor dem Snapshot vollständig initialisiert;
der enge Chromium-Schreibtest beider Seiten bestand mit **0 Writes** über alle
Public-Relationen. Die bereits bestandene Browsermatrix wurde nicht wiederholt.
Der vorhandene Reparatur-Fallback für beschädigte/fehlende Legacy-Einstellungen
ist kein allgemeiner Read-only-Nachweis für solche Sonderzustände.

## Testmatrix und Bestandsschutz

- Vier kanonische Produkte, Preise und Capacity-Werte: PASS.
- PRO endlich; historischer 99-EUR-/NULL-Datensatz weiterhin unverändert: PASS.
- Pending-Registrierung über echten lokalen RPC, null effektiver Plan,
  null Trialaktivierung und 0/0 Capacity: PASS.
- Kalender: 31.01.2024→29.02., 31.01.2025→28.02., 31.03.→30.04.,
  Jahreswechsel, gleiche Uhrzeit und andere Session-Zeitzone: PASS.
- Claim-Uniqueness nach Organisation/Restaurant, zweiter Claim abgewiesen,
  planunabhängig, kein Claim-Writer; Legacy-Trialprüfung: PASS.
- Add-ons ohne Trial; getrennte TEST/LIVE-Auflösung; fehlende Price ID und
  LIVE_READY ohne Verifikation abgewiesen: PASS.
- Owner eigener Tenant erlaubt; fremder Tenant, Staff, Customer, anon blockiert;
  Platform-Admin-Read erlaubt; direkte DML/private RPCs gesperrt: PASS.
- 24 parallele identische Katalogreads, explizite READ ONLY-Transaktionen: PASS.
- Pending-Registration/Rollback-, Rollen-/RLS-/Direct-DML-Regressionsmatrix und
  bestehende Owner-Capacity-Matrix: PASS.
- Upgrade: Fingerprints sämtlicher vorheriger Public-Tabellen unverändert,
  synthetischer Bestands-Trial nicht verkürzt; alle vorhandenen Funktionen außer
  der freigegebenen Entitlement-Auflösung bytegleich in `pg_get_functiondef`.
  Damit insbesondere Warning-, Country-, Enforcement-, Outbox-/Scheduler-
  Funktionen unverändert. Keine reale Datenmigration.

## Gates

| Gate | Ergebnis |
|---|---|
| Fresh | 164/164 PASS |
| Upgrade | 163→164 PASS |
| Repeat 1 / 2 | PASS / PASS |
| Migrationen 001–163 | 163 Dateien bytegleich zu HEAD |
| DB-Lint | Exit 0; keine neuen Billing-Befunde; 34 vorhandene Befunde in 20 Legacy-Funktionen, nicht verschwiegen |
| Focused Billing/V1/Pending | 17/17 PASS; zusätzlich lokale SQL-/Rollenmatrix |
| Security Contracts | finale Gesamtsuite und reale lokale Rollenregression PASS |
| Full Tests | final 1.953/1.953 PASS |
| Typecheck | PASS |
| Lint | PASS, 0 Fehler / 8 vorbestehende Warnungen |
| Build | PASS, vorhandene große-Chunks-Warnung |
| Secret Scan / Diff Checks | separat abschließend gegen Artefaktumfang geprüft |

Erster Gesamtlauf: 1.951/1.953; zwei veraltete Dreimonats-Assertions wurden
korrigiert. Ein abschließender Gesamtlauf bestätigt 1.953/1.953. Typecheck,
Lint und Build nicht mehrfach durchgeführt. Eine Slug-Kollision zwischen
zwei synthetischen Testfixtures wurde ausschließlich im lokalen Testharness
korrigiert und fokussiert erneut geprüft.

Lint-Altbefunde: AuthProvider, campaignService, CustomerAuthPage,
PlatformOperationsPanel, TenantProvider (3), I18nProvider. Keine neue Warnung.
DB-Lint enthält unter anderem vorbestehende ungenutzte Parameter/Variablen,
`audit_safe_metadata`-Volatilität und den Legacy-Pfad
`ensure_today_restaurant_pin`; diese Funktionen wurden nicht geändert.
Die kopierte Entitlement-Funktion behält die bereits vorher ungenutzte Variable
`override_plan_valid`; keine neue Warnursache durch diese Phase.

## Geänderte Dateien

- Migration 164; keine andere Migration.
- `src/modules/capacity/BillingCatalogInfo.tsx`
- `src/modules/capacity/billingCatalogMessages.mjs` und `.d.mts`
- `src/modules/admin/pages/OwnerCapacityPage.tsx`, `SettingsPage.tsx`
- `src/modules/platform/PlatformPlanEntitlementsPanel.tsx`
- `src/shared/commercialContract.mjs`, `.d.mts`, `src/shared/i18n/catalog.mjs`
- Drei bestehende Tests: v1-commercial-contract,
  ai-implementation-guardrails-contract, i18n-complete-catalog.
- Fünf neue `tests/phase-7c6b3-*`-Dateien: Source-Contract, SQL-Matrix,
  Upgrade/Repeat, Runtime/Rollen/Parallelität, Browser.
- Master Contract, Payment Plan, Guardrails und dieser Bericht.

## Nicht geändert / offene spätere Gates

Implementierungscommit:
`4e3da2e91a9a58487276c79fa0a4a1a04e505d4e`
(`feat(billing): add canonical catalog and provider bindings`). Dieser Bericht
bildet den separaten Evidenzcommit; beide Commits werden ausschließlich auf
`origin/codex/v1-release-integration` gepusht. Kein Staging-/Production-Zugriff,
kein Deployment, kein Stripe-Zugriff, keine E-Mail, keine echten Businessdaten
oder Verträge.
AT + PRO bleiben im bestehenden Lock-Vertrag. Keine neue Grant-/Add-on-
Aktivierungsautorität. Keine bestehenden Migrationen geändert.

Spätere Gates: Sellergründung und echte Verifikationen, Stripe TEST-Konfiguration,
signierter Providerpfad mit einmaliger Trial-Claim-Transaktion, Checkout,
Paymentmethodenprüfung, VAT/Reverse Charge/Stripe Tax, Refunds, Chargebacks,
Proration. Diese Punkte sind **nicht** durch LOCAL CODE LOCK freigegeben.

## Artefakt und Cleanup

Prüf-ZIP: `exports/2026-09-23_PHASE_7C_6B3_CANONICAL_BILLING_CATALOG.zip`.
Nur eng geänderte Source-/Test-/Vertrags-/Berichtdateien. Kein .env, kein
node_modules, dist, build, Git, lokale Runtime-Logs oder Secrets. Inventar,
ZIP-Integrität und byteweiser Source-Abgleich separat geprüft. SHA-256 im
abschließenden Handoff, nicht selbstreferenziell im ZIP-Inhalt. Das unveränderte
Code-Lock-ZIP wurde vor den Git-Commits erzeugt und bleibt ausdrücklich
außerhalb von Git; SHA-256:
`e8dec7aefaf47698eb9c6f9ddd7a370efd7e83d67e2f9dce30068f9285529c13`.

TASK-OWNED BACKGROUND PROCESSES STARTED: 2 Vite-Server (73107, 79841)
TASK-OWNED BACKGROUND PROCESSES STOPPED: 2
TASK-OWNED BACKGROUND PROCESSES STILL RUNNING: 0
RETAINED PROCESS PURPOSE: NONE
RAM CLEANUP: PASS nach kontrolliertem Supabase-Stop
UNRELATED PROCESSES CHANGED: NO
FOREIGN CONTAINERS CHANGED: NO

Chromium/WebKit geschlossen; Test-/CLI-Hauptprozesse abgeschlossen. Fünf
task-eigene Supabase-Container werden mit `stop --no-backup` kontrolliert
entfernt, ausschließlich synthetische lokale Daten verworfen. Der fremde
Container `welcome-to-docker` und Port 55439 bleiben unangetastet.
