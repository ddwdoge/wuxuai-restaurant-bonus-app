# WUXUAI® BONUS – Phase 7C.5C Capacity UI/Warning Staging Gate

Datum: 2026-09-21

Branch: `codex/v1-release-integration`

Base-HEAD: `7d57e73634a8052587e580b0ba82e11b86ccd72e`

Implementierungscommit: `8d01d4ee7775c2c03f636ed110ae3f0990299392`
Status: **PHASE 7C.5C CAPACITY UI/WARNING STAGING LOCK**

## Ergebnis

Das technische Staging-Gate ist bestanden. Migrationen 156 und 157 sind
ausschliesslich auf dem verifizierten Staging-Projekt angewendet, der exakte
Implementierungscommit ist ausschliesslich auf dem Staging-Worker ausgerollt,
und alle Vorher-/Nachher-Fingerprints sind identisch. Es gab keine externe
E-Mail, keine App-Warnung und keine Businessdatenmutation.

Der physische Owner-Smoke wurde anschliessend mit einer vom Founder manuell
hergestellten legitimen Owner-Sitzung in Safari bestanden. Route, Tarif,
Capacity-Werte, Warn-Leerzustand, Informations-Drawer, alle drei Schliesswege
und sieben Sprachen wurden auf dem aktiven Staging-Build geprueft. Die
anschliessenden Datenbankzaehler bestaetigen, dass weder Page View noch Drawer
oder Sprachwechsel eine Warnung, Zustellung, Berechtigung oder Add-on-Einheit
erzeugt haben.

## Baseline, Commit und lokale Gates

- Ausgangsbranch/Base-HEAD und Remote-Paritaet 0/0: PASS.
- Migrationen 153–155 unveraendert; Migrationen 156/157 vorhanden.
- Implementierungscommit eng gepusht: `8d01d4ee7775c2c03f636ed110ae3f0990299392`.
- Focused Owner-Capacity-UI/Warning: 17/17 PASS.
- Full Tests: 1.923/1.923 PASS.
- Typecheck: PASS.
- Lint: PASS, 0 Fehler; 8 bestehende Warnungen.
- Build: PASS; nur bestehende Chunk-Size-Warnung.
- Fresh-Replay 157/157 und Upgrade 155 → 156 → 157: PASS.
- Repeat 156 und 157, jeweils zweimal: PASS.
- 24 parallele Evaluationen: genau eine Episode.
- 24 parallele Delivery-Leases: genau eine Processing-Lease.
- 24 parallele Acknowledges: genau ein Audit.
- 24 parallele Rearms: genau eine Resolution und eine geloeste Episode.
- Rollenmatrix, Tenant-Isolation, RLS, ACLs, DB-Lint, Secret Scan und
  Diff-Checks: PASS.

## Sichere Staging-Mailunterdrueckung

Der vorhandene `transactional-mail-dispatcher` bricht vor Queue-Reservierung
mit 503 ab, wenn eine erforderliche Transportvariable fehlt. Auf Staging
fehlen nachweislich alle erforderlichen SMTP-Variablen sowie das
Scheduler-Secret. Werte wurden weder gelesen noch protokolliert. Ein Test-Sink
ist nicht konfiguriert.

- E-Mail-Transport: technisch deaktiviert / fail-closed.
- Test-Sink: keiner.
- Externe E-Mails: 0.
- Bestehende Transactional-Mail-Zeilen: 19 PENDING vor und nach dem Gate.
- Automatische Warning-Systemzeilen: 0.
- Restaurants mit faelligem 08:00-Lauf waehrend der Migration: 0.

## Staging-Migration und Sicherheit

- Projekt: `bwhvfjuwixgwduoeqaya` (Staging), eindeutig verifiziert.
- Vorher 155/155; nachher 157/157; genau Migration 156 und 157 angewendet.
- Repeat-Dry-Run leer; DB-Lint PASS.
- Fuenf Warning-Tabellen mit RLS; keine direkten Tabellenrechte fuer
  `anon`, `authenticated` oder `service_role`.
- Neun relevante `SECURITY DEFINER`-Funktionen mit festem `search_path`.
- Sieben aktive Trigger, darunter sechs kapazitaetsrelevante Trigger und der
  unveraenderliche Audit-Trigger.
- Cron: genau ein aktiver stündlicher Job fuer die lokale Restaurantzeit
  08:00 Uhr.
- Authentifizierter Direktzugriff auf private Warning-Tabellen: `42501`,
  blockiert.
- Snapshot-/Episode-/Delivery-/Audit-Zeilen nach Migration: jeweils 0.

## Vorher-/Nachher-Fingerprints

Alle Werte sind vor und nach Migration, Deployment und technischer QA
identisch:

| Relation | Zeilen | Fingerprint |
| --- | ---: | --- |
| restaurants | 16 | `8bd05abad1df9c05f81c29a04b80a99c` |
| restaurant_offers | 18 | `7318a911ccd05206e356694f12521bf6` |
| customers | 25 | `9d73109d3811e4932f7ba5a71f7f69db` |
| customer_accounts | 17 | `fd1ccc2fef8a345851ef53e43b51ba1a` |
| customer_account_memberships | 22 | `cd8d18d2c6d37ded4f9903864f3ff509` |
| restaurant_members | 18 | `2e4a11668f77506f543000949decaa59` |
| points_transactions | 22 | `116e4aa426f8d5e1b9f835c2377084ba` |
| redemption_activity_journal | 8 | `bc25a36f5e67f89d011358b38dc92501` |
| gift_redemption_presentations | 7 | `7fdcf79be073d4de83a7a87762bf426d` |
| points_redemption_presentations | 2 | `41b2284c17478d9cae4655ff6a5f5d6a` |
| reward_redemption_events | 2 | `9ebd783bad35fa078a94a9b34a84c26c` |
| branch_subscriptions | 16 | `9ee635f086ae51ad938765097006cdf6` |
| addons | 0 | leer |
| commercial grants | 0 | leer |
| country_launch_policy | 6 | `cdcd4138cb3fa5be694efffdd40f7a2d` |
| commercial_plan_release_policy | 6 | `d3be58128a0b37d5ea5f346f901fb74b` |
| customer transactional mail | 19 | `d18008276eb44b0e5765df6df09ff0e1` |
| customer offer mail | 0 | leer |

Der autoritative Capacity-Resolver lieferte vor dem Gate den Fingerprint
`776b090e65eb18ca1fb2fa31a6adaa6f`. Kein Evaluator wurde manuell ausgeloest.

## Staging-Deployment

- Worker: `wuxuai-restaurant-bonus-app-staging`.
- Deployment-ID: `f44d9d91-98d3-4b22-a3b5-f998fe8cfe0e`.
- Version-ID: `591655ba-b445-4eab-b72d-157236f53997`.
- Aktives Hauptasset: `assets/index-CKU1QE4b.js`; HTTP 200.
- `index.html` lokal/remote SHA-256:
  `95ba4868d37492424905b9ee5dc108b316240a08ab93ad71e4c37b88bc90cd2a`.
- Hauptasset lokal/remote SHA-256:
  `d421583bda28d7d78d57bb4a942ae6426f9c37f22a5eab37cf4a83ae15d3489b`.
- Commit-/Build-/Deployment-Paritaet: PASS.
- Production und Stripe: unveraendert.

## Physischer Restgate

- Safari/WebKit Owner-Sitzung: PASS.
- Route `/admin/settings/tarif-kapazitaet`: PASS.
- BASIC, AT, PRO noch nicht freigegeben und keine Zahlung erforderlich: PASS.
- Angebote: 4/5, 0 Add-on-Einheiten, Gesamtlimit 5, Rest 1: PASS.
- Aktive Kunden: 0/3.000, 0 Add-on-Einheiten, Gesamtlimit 3.000,
  Rest 3.000 und rollierende 365 Tage: PASS.
- Warn-Leerzustand und Hinweis, dass der Page View keine Warnung erzeugt:
  PASS.
- Informations-Drawer zeigt nur +5 Angebote fuer 19 EUR netto/Monat und
  +5.000 Kunden fuer 29 EUR netto/Monat; kein Checkout, keine Zahlungsabfrage
  und keine vorgetaeuschte Buchung: PASS.
- Schliessen, X und Escape: PASS.
- DE/EN/FR/IT/ES/ZH/KO physisch auf Staging: PASS; keine leere Seite und keine
  sichtbaren Translation Keys. Deutsch wurde abschliessend wiederhergestellt.
- Physischer Safari-Desktop-Smoke: PASS. Die bereits bestandene lokale
  Chromium-/WebKit-Matrix deckt 320/375/390/430/767/768/1024/1440 CSS-px ab.
- Nachher-Zaehlung: Episodes, Snapshots, States, Deliveries und Warning-Audit
  jeweils 0; Transactional Mail unveraendert 19/19 PENDING; Grants 0;
  Add-on-Entitlements 0.

## Abschlussmatrix

```text
BRANCH: codex/v1-release-integration
BASE HEAD: 7d57e73634a8052587e580b0ba82e11b86ccd72e
IMPLEMENTATION COMMIT: 8d01d4ee7775c2c03f636ed110ae3f0990299392
EVIDENCE COMMIT: FINAL RESTGATE EVIDENCE COMMIT; EXACT HASH IN FINAL HANDOFF
REMOTE HEAD: FINAL RESTGATE EVIDENCE COMMIT; EXACT HASH IN FINAL HANDOFF
REMOTE PARITY: 0/0

STAGING PROJECT: bwhvfjuwixgwduoeqaya
PROJECT VERIFIED: PASS
PRE-MIGRATION HISTORY: 155/155
POST-MIGRATION HISTORY: 157/157
MIGRATION 156: APPLIED / PASS
MIGRATION 157: APPLIED / PASS
ONLY 156/157 APPLIED: YES
REPEAT DRY RUN: EMPTY / PASS
DB LINT: PASS

EMAIL TRANSPORT: TECHNICALLY DISABLED / FAIL-CLOSED
TEST SINK: NONE
EXTERNAL EMAILS SENT: 0
APP WARNINGS CREATED: 0
SCHEDULER RUNS DURING QA: 0 DUE RESTAURANTS
SYSTEM ROWS CREATED: 0 WARNING ROWS; EXPECTED MIGRATION/CRON METADATA ONLY
UNEXPECTED WRITES: 0

OWNER CAPACITY ROUTE: PHYSICAL STAGING PASS
CURRENT PLAN: BASIC / EUR 59 NET PER MONTH
OFFER INCLUDED/ADD-ON/TOTAL: 5 / 0 / 5
CUSTOMER INCLUDED/ADD-ON/TOTAL: 3000 / 0 / 3000
REMAINING CAPACITY: OFFERS 1 / CUSTOMERS 3000
AT-LIMIT UX: LOCAL MATRIX PASS
OVER-LIMIT UX: LOCAL MATRIX PASS
INCREASE CAPACITY DRAWER: PHYSICAL STAGING PASS / INFORMATION ONLY
AUTO PURCHASE: NO
AUTO PLAN CHANGE: NO
PAGE VIEW WRITES: 0 / PHYSICAL STAGING PASS
CANCEL/X/ESCAPE WRITES: 0 / PHYSICAL STAGING PASS

OWNER ACCESS: PHYSICAL STAGING PASS
STAFF ACCESS: BLOCKED / PASS
CUSTOMER ACCESS: BLOCKED PHYSICALLY / PASS
ANONYMOUS ACCESS: BLOCKED / PASS
TENANT ISOLATION: PASS
PII EXPOSURE: NONE IN OWNER CAPACITY READ
COUNTRY GATE: UNCHANGED
AT + PRO: LOCKED

DE/EN/FR/IT/ES/ZH/KO: PHYSICAL STAGING PASS
RESPONSIVE MATRIX: LOCAL CHROMIUM/WEBKIT 320-1440 PASS; PHYSICAL SAFARI DESKTOP PASS
TOUCH TARGETS: LOCAL PASS
HORIZONTAL OVERFLOW: LOCAL PASS
SAFARI/WEBKIT: PHYSICAL OWNER STAGING PASS
CHROMIUM: LOCAL RESPONSIVE MATRIX PASS

BEFORE/AFTER BUSINESS FINGERPRINTS: IDENTICAL / PASS
REAL CUSTOMER ACTIVITIES: 0
REAL OFFER MUTATIONS: 0
POINT WRITES: 0
REDEMPTION WRITES: 0
GRANTS CREATED: 0
ADD-ON UNITS CREATED: 0
ENTITLEMENT WRITES: 0
REAL BUSINESS DATA CHANGED: NO

FOCUSED TESTS: 17/17 PASS
WARNING TESTS: PASS
SECURITY CONTRACTS: PASS
FULL TESTS: 1923/1923 PASS
TYPECHECK: PASS
LINT: PASS, 0 ERRORS / 8 EXISTING WARNINGS
BUILD: PASS
SECRET SCAN: PASS
GIT DIFF CHECK: PASS

STAGING DEPLOYMENT: PASS / STAGING ONLY
DEPLOYMENT ID: f44d9d91-98d3-4b22-a3b5-f998fe8cfe0e
ACTIVE ASSET: assets/index-CKU1QE4b.js
ASSET PARITY: PASS
PRODUCTION CHANGED: NO
STRIPE CHANGED: NO

REPORT: docs/reports/2026-09-21_PHASE_7C_5C_CAPACITY_UI_WARNING_STAGING_GATE_REPORT.md
PRUEF-ZIP: exports/2026-09-21_PHASE_7C_5C_CAPACITY_UI_WARNING_STAGING_GATE.zip
ZIP SHA-256: COMPUTED AFTER ARCHIVE CREATION; SEE FINAL HANDOFF

TASK-OWNED BACKGROUND PROCESSES STARTED: 1 LOCAL SUPABASE STACK / 5 CONTAINERS
TASK-OWNED BACKGROUND PROCESSES STOPPED: 1 LOCAL SUPABASE STACK / 5 CONTAINERS
TASK-OWNED BACKGROUND PROCESSES STILL RUNNING: 0
RETAINED PROCESS PURPOSE: NONE
RAM CLEANUP: PASS
UNRELATED PROCESSES CHANGED: NO
FOREIGN CONTAINERS CHANGED: NO
```

## Unveraendert und Zielstatus

AT + PRO bleibt LOCKED. Country Policies, Grants, Add-ons,
Plans/Subscriptions und alle Businessdaten sind unveraendert. Es gab keine
echte oder synthetische Capacity-Manipulation, keine externe E-Mail, keine
App-Warnung und keinen Production- oder Stripe-Zugriff.

Der technische und physische Staging-Gate ist damit geschlossen. Dies ist
kein FINAL LOCK fuer reale externe E-Mail-Zustellung und kein Production Lock.

**PHASE 7C.5C CAPACITY UI/WARNING STAGING LOCK**
