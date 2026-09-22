# WUXUAI® BONUS – Phase 7C.6B4 Staging-Migrationen und Read-only Application Gate

Datum: 2026-09-23

Branch: `codex/v1-release-integration`

Base-/Deployment-Commit: `9319d16b7f4f303db858b45459ac57bb6adf394f`

Status: **PHASE 7C.6B4 TECHNICAL STAGING LOCK / PHYSICAL PLATFORM-ADMIN RESTGATE OPEN**

## Ergebnis

Das verifizierte Staging-Projekt `bwhvfjuwixgwduoeqaya`
(`wuxuai-bonus-staging`, `ACTIVE_HEALTHY`) wurde von 162/162 kontrolliert
zuerst auf 163/163 und danach auf 164/164 migriert. Es wurden ausschließlich
`20260922006000_pending_activation_registration_and_live_gates.sql` und
`20260922007000_billing_catalog_reconciliation.sql` angewendet. Repeat-Dry-Run
und DB-Lint sind leer beziehungsweise fehlerfrei.

Der kanonische Commit wurde gebaut und ausschließlich auf den Cloudflare-Worker
`wuxuai-restaurant-bonus-app-staging` deployt. `index.html` und Hauptasset sind
lokal und remote bytegleich. Production, Stripe, Scheduler und Edge Functions
wurden nicht verändert.

Eine legitime Owner-Sitzung war in Safari vorhanden. Die Owner-Seite, der
Informationsdrawer, das QR-Center und alle sieben Sprachen wurden physisch und
ohne Businesswrite geprüft. Eine legitime Platform-Admin-Sitzung war nicht
vorhanden; sie wurde nicht umgangen. Deshalb wird kein vollständiger Staging
Lock behauptet.

## Provenienz und Baseline

- Lokaler und Remote-HEAD vor dem Gate:
  `9319d16b7f4f303db858b45459ac57bb6adf394f`; Parität 0/0.
- Vorbestehende fremde Datei `supabase/.temp/cli-latest` blieb unangetastet;
  SHA-256 vor/nach dem Gate:
  `103e9d7a97f9a66c28586ffae6f8d81a90630d5cb2c537b23ed886a5e0e5ff01`.
- Migration 163 SHA-256:
  `70fbd71826275c44ae79117bda6e668cccd41a0fc9f23867c0bb4930e3633611`.
- Migration 164 SHA-256:
  `f6e4bd47ee55aa79bd3fa9aeefacf7c0b80c40ee2ea66c589e0bf8696f406ad5`.
- Migrationen 001–162 wurden gegenüber dem direkten Vorgänger des
  Implementierungscommits 163 nicht verändert.
- Supabase-Ziel: ausschließlich Organisation `wuxuai bonus os`, Projekt
  `wuxuai-bonus-staging`; das Production-Projekt war nicht verknüpft.
- Staging-App: `https://staging-app.bonus.wuxuaisbi.com`, HTTP 200.
- Vorher: 162 Migrationen, letzte Version `20260922005000`; Dry-Run enthielt
  exakt 163 und 164.
- PRO-Release: AT/CH/DE/ES/FR/IT jeweils `LOCKED`; Grants 0, Add-ons 0.
- Stripe-Customer- und Subscription-Bindungen: jeweils 0.
- Bestehende Subscriptions: 16 `trialing`, davon 15 BASIC und 1 PRO;
  unverändert und nicht rückwirkend umgestellt.
- Customer-Mail-Outbox: 21 `SKIPPED`, 0 Versuche, 0 aktive Leases;
  Quarantäne-Audit vorhanden und unverändert.
- Warning Episodes/Deliveries/Audit: jeweils 0.

## Migration und Datenbankvertrag

Migration 163 wurde über ein isoliertes temporäres CLI-Arbeitsverzeichnis
allein angewendet. Der direkte Nachweis ergab 163/163, genau einen
Historieneintrag für 163 und anschließend ausschließlich 164 als pending.
Danach wurde 164 allein angewendet. Endstand: 164/164, beide neuen Versionen
jeweils genau einmal.

Kanonischer aktiver Katalog:

| Produkt | Preis netto/Monat | Kapazität | Trial |
| --- | ---: | --- | --- |
| BASIC | 5.900 Cent | 5 Angebote / 3.000 Kundenkonten | 1 Kalendermonat |
| PRO | 14.900 Cent | 15 Angebote / 15.000 Kundenkonten | 1 Kalendermonat |
| Angebots-Add-on | 1.900 Cent | +5 Angebote | kein Trial |
| Kunden-Add-on | 2.900 Cent | +5.000 Kundenkonten | kein Trial |

Alle Produkte verwenden EUR, monatliche Abrechnung und `EX_VAT`. Das
Kundenfenster bleibt exakt 365 Tage. PRO ist nicht unbegrenzt.

- Seller: `WUXUAI Digital & Trading GmbH`, Status `PLANNED`.
- IP-Lizenzgeber: `WU & XU Group GmbH`.
- Stripe TEST: vier Produkte `UNBOUND`, keine Product-/Price-ID.
- Stripe LIVE: vier Produkte `UNBOUND`, keine Product-/Price-ID.
- Purchase/Activation: `false`; Live Billing fail-closed blockiert.
- Trial Claims: 0.
- Bestehende Restaurants mit Pending-Marker: 0.
- Pending-Registration-Audit: 0.
- Bestehende Subscriptions mit neuem `selected_plan`: 0.

Die fünf neuen privaten Tabellen besitzen RLS und keinerlei direkte
SELECT-/DML-/TRUNCATE-Rechte für `public`, `anon`, `authenticated` oder
`service_role`. Immutable-Trigger sind aktiv. Interne Funktionen besitzen
keine Runtime-EXECUTE-Grants; die beiden Read-RPCs sind nur für
`authenticated` freigegeben und prüfen Owner-/Platform-Admin-Autorität und
Tenant serverseitig. Anonymous, Customer, Staff ohne Ownerbindung und direkte
DML bleiben gesperrt. Alle geprüften Funktionen besitzen einen fest gesetzten
`search_path`.

## Vorher-/Nachher-Fingerprints

Für 37 geschützte Relationen wurden serverseitig nur Counts und irreversible
MD5-Zeilenfingerprints ausgegeben. Nach Migration, Deployment und Browser-Smoke
ergab der automatische Vergleich `mismatch_count = 0`. Bei `restaurants` und
`branch_subscriptions` wurden ausschließlich die drei neu hinzugefügten,
für Altzeilen null bleibenden Spalten aus dem Altbestandsvergleich entfernt.

Unverändert sind insbesondere Organizations, Restaurants, Branches,
Memberships, Subscriptions/Trials, Grants, Add-ons, Kundenkonten und
-aktivitäten, Rewards/Offers/Gifts, Punkte, Einlösungen, Commercial Audit,
Outbox/Quarantäne, Warning-Tabellen, TEST_ONLY-Registry/Receipts sowie Country-
und PRO-Policies. Erwartet neu sind ausschließlich:

- 4 Billing-Produktversionen,
- 1 Seller-Version,
- 8 getrennte TEST/LIVE-Provider-Bindungen mit Status `UNBOUND`,
- 0 Trial-Claims,
- 0 Pending-Auditzeilen.

Nach dem physischen Owner-Smoke: Grants 0, Add-ons 0, Trial-Claims 0,
Pending-Audit 0, Stripe-Bindungen 0, Warning Episodes/Deliveries/Audit 0,
Outbox weiterhin 21 `SKIPPED`, 0 Versuche, 0 Leases, PRO-Unlocks 0.

## Lokale Gates

- Focused Pending-/Billing-Tests: 12/12 PASS.
- Security Contracts: PASS im fokussierten und vollständigen Vertragslauf.
- Full Tests: 1.953/1.953 PASS.
- Typecheck: PASS.
- Lint: PASS, 0 Fehler und exakt 8 bekannte vorbestehende Warnungen.
- Build: PASS mit öffentlichen Staging-Werten ausschließlich im
  Kindprozessspeicher; keine Werte gespeichert oder ausgegeben.
- Secret Scan über den relevanten Commitumfang: PASS.
- `git diff --check` und `git diff --cached --check`: PASS.

## Staging-Deployment

- Worker: `wuxuai-restaurant-bonus-app-staging`.
- Deployment-ID: `366c4c14-2f3c-4f66-a8c7-a430c1afe008`.
- Version-ID: `6694bacb-828d-4310-87b3-4068c0d9dcb2` (100 %).
- Aktives Hauptasset: `assets/index-CjyPOGjh.js`.
- `index.html` lokal/remote SHA-256:
  `c5a673ee1ecfbc4042d3c5513c612c45fc5b0d3b09ab7e4ada13a2ce46485cfc`.
- Hauptasset lokal/remote SHA-256:
  `3520479ae5af35597c7faad21aa34dc396a728e31c4c5b05dd042b1618db134f`.
- Asset-Parität: PASS; Staging HTTP 200.
- Keine Edge Function, kein Scheduler und kein Secret verändert.

## Physischer Owner-Smoke

Mit der vorhandenen legitimen Safari-Owner-Sitzung wurden read-only geprüft:

- aktiver Bestandsbetrieb und `/admin/settings/tarif-kapazitaet`: PASS;
- BASIC 59 EUR, 5 Angebote, 3.000 Kundenkonten: PASS;
- PRO 149 EUR, 15 Angebote, 15.000 Kundenkonten, nicht unlimited: PASS;
- Add-ons 19 EUR/+5 und 29 EUR/+5.000: PASS;
- 365-Tage-Text und ein Kalendermonat erst nach Provideraktivierung: PASS;
- PRO noch nicht freigegeben, keine Zahlung erforderlich: PASS;
- kein Checkout, keine Kaufaktion, keine Stripe-Bindung und keine falsche
  Trialanzeige: PASS;
- Informationsdrawer: nur Information; X, Schließen und Escape: PASS;
- QR-Center des Bestandsbetriebs: unverändert erreichbar; kein Download und
  keine Aktion ausgelöst;
- DE/EN/FR/IT/ES/ZH/KO: physisch PASS, keine leere Seite und keine sichtbaren
  Translation Keys; Deutsch abschließend wiederhergestellt.

Die lokale, unveränderte responsive Vertragsmatrix des Code Locks deckt
320/375/390/430/767/768/1024/1440 px, Touchziele und Overflow ab. Eine
physische Staging-Platform-Admin-/Responsive-Prüfung wurde mangels legitimer
Platform-Admin-Sitzung nicht umgangen und bleibt offen.

## Nicht geändert und Restgate

- Keine Registrierung, kein synthetischer Tenant und keine TEST_ONLY-Markierung.
- Keine Subscription-Aktivierung, kein Trialstart, kein Grant oder Add-on.
- Kein Stripe-Zugriff, Checkout, Webhook, Product, Price oder Secret.
- Keine E-Mail und kein Schedulerlauf.
- Keine Country- oder PRO-Freigabe.
- Keine Production-Verbindung oder -Bereitstellung.
- Keine reale Datenkorrektur.

Offen bleiben die physische Platform-Admin-Ansicht für Seller `PLANNED`, TEST
und LIVE `UNBOUND`, Live Billing `BLOCKED` sowie deren responsive
Staging-Matrix. Seller- und Stripe-Provider-Verifikation bleiben bewusst
blockiert.

## Abschlussmatrix

```text
BRANCH: codex/v1-release-integration
BASE HEAD: 9319d16b7f4f303db858b45459ac57bb6adf394f
PRE-MIGRATION HISTORY: 162/162
MIGRATION 163 APPLIED: YES / ONLY 163
MIGRATION 164 APPLIED: YES / ONLY 164
POST-MIGRATION HISTORY: 164/164
REPEAT DRY RUN: EMPTY / PASS
DB LINT: PASS
PROTECTED FINGERPRINTS: 37/37 IDENTICAL / PASS
CANONICAL BILLING CATALOG: PASS
SELLER STATUS: PLANNED
TEST PROVIDER STATUS: UNBOUND
LIVE PROVIDER STATUS: UNBOUND
PENDING CONTRACT: INSTALLED / NO EXISTING ROW CONVERTED
ROLE MATRIX: TECHNICAL PASS
FULL TESTS: 1953/1953 PASS
TYPECHECK: PASS
LINT: PASS / 0 ERRORS / 8 KNOWN WARNINGS
BUILD: PASS
DEPLOYMENT ID: 366c4c14-2f3c-4f66-a8c7-a430c1afe008
ACTIVE ASSET: assets/index-CjyPOGjh.js
ASSET PARITY: PASS
OWNER UI: PHYSICAL SAFARI PASS
PLATFORM ADMIN UI: PHYSICAL RESTGATE OPEN
LANGUAGES: OWNER PHYSICAL DE/EN/FR/IT/ES/ZH/KO PASS
RESPONSIVE MATRIX: LOCAL CODE-LOCK PASS / PHYSICAL PLATFORM-ADMIN OPEN
STAGING CHANGED: MIGRATIONS 163/164 + STAGING APP DEPLOYMENT ONLY
STRIPE CHANGED: NO
PRODUCTION CHANGED: NO
REAL BUSINESS DATA CHANGED: NO

TASK-OWNED BACKGROUND PROCESSES STARTED: 0
TASK-OWNED BACKGROUND PROCESSES STOPPED: 0
TASK-OWNED BACKGROUND PROCESSES STILL RUNNING: 0
RETAINED PROCESS PURPOSE: NONE
RAM CLEANUP: PASS
UNRELATED NODE PROCESSES CHANGED: NO
UNRELATED PROCESSES CHANGED: NO
FOREIGN CONTAINERS CHANGED: NO
```
