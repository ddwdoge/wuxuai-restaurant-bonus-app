# WUXUAI® BONUS – Phase 7B.4E Staging-Migration und Read-only Gate

Datum: 2026-09-21

Branch: `codex/v1-release-integration`

Implementierungscommit: `a5697917d65689a98bcfbc22af8317f3c17b84ee`

Ausgangs-/Deployment-Commit: `d5e63160c2e32442474bba73e0003eaf5473a18d`

Ziel: ausschließlich Supabase Staging `bwhvfjuwixgwduoeqaya` und Cloudflare Worker
`wuxuai-restaurant-bonus-app-staging`

Production, Stripe und reale beziehungsweise synthetische Testdaten: nicht verwendet
und unverändert

## Ergebnis

Die bytegleiche Migration
`20260915003000_test_tenant_contract_hardening.sql` wurde nach vollständig
bestandenem Preflight als einzige ausstehende Migration auf das eindeutig
verifizierte Staging-Projekt angewendet. Der Post-Migrationsvertrag, die
Bestandsdaten-Fingerprints, alle Code-Gates und das Staging-Deployment sind
bestanden.

Der physische Platform-Admin-UI-Smoke wurde nicht ausgeführt: Es war keine
legitime Platform-Admin-Sitzung eindeutig verfügbar. Vorhandene Owner- und
Customer-Sitzungen wurden nicht umgedeutet und keine Anmeldung wurde umgangen.
Damit besteht ein technischer Staging-Gate-PASS, aber noch kein FINAL LOCK.

## Kanonische Provenienz

- Branch: `codex/v1-release-integration`
- lokaler HEAD vor Evidenzcommit: `d5e63160c2e32442474bba73e0003eaf5473a18d`
- Remote-HEAD vor Evidenzcommit: `d5e63160c2e32442474bba73e0003eaf5473a18d`
- Arbeitsbaum vor Migration und Deployment: sauber
- Migration `03000` SHA-256:
  `5ff37ab21bab8b3727587d9370dbd581c391d9260f661b7ca0ca860d6f00db91`
- Supabase CLI: repositorylokal `2.116.0`
- Gate-/Build-Node: `v24.14.1`
- Staging- und Production-Projekte: getrennte Supabase-Projekte
- Staging- und Production-App: getrennte Hosts und unterschiedliche Hauptassets

## Phase A – Staging-Preflight

- Staging-Projektname: `wuxuai-bonus-staging`
- Projekt-Ref: `bwhvfjuwixgwduoeqaya`
- Projektstatus: `ACTIVE_HEALTHY`
- PostgreSQL: `17.6.1.141`
- Remote-Migrationshistorie: 151 Migrationen
- letzte Remote-Migration: `20260915002000`
- lokal ausstehend: exakt `20260915003000`
- Dry-Run: exakt eine Migration, keine Seeds und keine Rollen
- Country Policies: `AT`, `CH`, `DE`, `ES`, `FR`, `IT` jeweils `LOCKED`
- veröffentlichte PRO-Länder: `0`
- Grants aktiv/geplant/abgelaufen/widerrufen: jeweils `0`
- Grants gesamt: `0`
- effektive PRO-Betriebe: `0`
- TEST_ONLY-Registry-Baseline: `1` aktiv, `2` historisch gesamt
- Commercial-Audit-Baseline: `0`
- Receipt-Tabelle vor Migration: nicht vorhanden
- vorheriger Staging-Worker-Stand: Version
  `55206790-1a1b-414f-8d69-d17156f3891f`, 100 % Traffic

Alle vorgegebenen Stoppbedingungen waren negativ. Die bestehende
TEST_ONLY-Registry-Baseline wurde nicht verändert und war keine Stoppbedingung.

## Phase B – Migration 03000

- angewendet: JA
- Ziel: ausschließlich `bwhvfjuwixgwduoeqaya`
- angewendete Datei: ausschließlich
  `20260915003000_test_tenant_contract_hardening.sql`
- Seeds: keine
- Rollenänderungen außerhalb der Migration: keine
- Remote-Migrationshistorie danach: `152/152`
- letzte Migration danach: `20260915003000`
- Eintrag für `03000`: exakt `1`
- Pending danach: `0`
- Repeat-Dry-Run: leer / Remote-Datenbank aktuell
- keine Rückmigration, Remediation oder manuelle Schemaänderung

## Phase C – Staging-Datenbankvertrag

### Receipt und Audit

- `platform_test_tenant_mark_requests`: vorhanden
- `target_restaurant_ref`: vorhanden, `uuid`, `NOT NULL`
- `organization_ref`, `location_ref`, `actor_id`, `idempotency_key`:
  UUID-Snapshots, `NOT NULL`
- generische Spalte `restaurant_id`: nicht vorhanden
- Primärschlüssel: `idempotency_key`
- Zielindex:
  `(target_restaurant_ref, created_at, idempotency_key)`
- RLS: aktiviert
- Tabellen-ACL: nur `postgres`; kein direktes Browser-/Service-Role-DML
- direkte Rechte für `anon`, `authenticated`, `service_role` auf
  SELECT/INSERT/UPDATE/DELETE/TRUNCATE: jeweils `false`
- Receipt UPDATE/DELETE-Trigger: vorhanden
- Receipt TRUNCATE-Trigger: vorhanden
- Cleanup-Audit UPDATE/DELETE-Trigger: vorhanden
- Cleanup-Audit TRUNCATE-Trigger: vorhanden
- Commercial-Audit UPDATE/DELETE-Trigger: vorhanden

### RPC und Rollen

- neuer Mutator:
  `mark_platform_test_tenant(uuid,text,text,text,uuid)`
- alter Vier-Argument-Overload: kein Execute für Browserrollen
- neuer Mutator und Preflight: Execute nur für `authenticated`
- `anon`: kein Execute
- `service_role`: kein Execute auf dem neuen Browservertrag
- Platform-Rollenprüfung im Funktionskörper: vorhanden
- Recent-Auth-Guard: vorhanden, maximal zehn Minuten
- starke tenantgebundene Bestätigung: vorhanden
- Request-/Idempotency-ID: Pflicht und UUID
- identischer Replay: Receipt-Vertrag vorhanden
- Payload-/Actor-/Tenant-Konflikt: blockiert
- fester Search Path:
  `pg_catalog, public, storage, extensions, pg_temp`
- positiver Mutatoraufruf auf Staging: nicht ausgeführt

### Datenintegrität vorher/nachher

Die folgenden Relationen waren in exakter Zeilenanzahl und aggregiertem
MD5-Zeilenfingerprint unverändert:

- `commercial_plan_release_policy`: 6
- `commercial_pro_access_grants`: 0
- `commercial_pro_access_audit`: 0
- `platform_test_tenant_registry`: 2
- `platform_test_tenant_cleanup_audit`: 5
- `branch_subscriptions`: 16
- `points_transactions`: 22
- `customers`: 25
- `redemption_activity_journal`: 8
- `customer_rewards`: 32
- `restaurant_offers`: 18
- `storage.objects`: 89
- `platform_admin_operations`: 31

Post-Migrationszähler:

- neue Receipts: `0`
- neue Commercial-Audit-Zeilen: `0`
- neue TEST_ONLY-Markierungen: `0`
- PRO-Grants: `0`
- effektive PRO-Betriebe: `0`
- veröffentlichte PRO-Länder: `0`
- AT + PRO: `LOCKED`

DB-Lint: Prozess PASS (Exit 0). Es bestehen bekannte Warnungen in älteren,
außerhalb von `03000` liegenden Funktionen. Migration `03000` erzeugt keine
neue Lint-Warnung.

## Phase D – Code-Gates und Staging-Deployment

- Focused Tests: `52/52 PASS`
- Security Contracts: `25/25 PASS`
- Full Tests: `1875/1875 PASS`, 0 übersprungen
- Typecheck: PASS
- Lint: PASS, 0 Fehler; 8 bestehende Warnungen
- Build: PASS mit Node `v24.14.1` und den offiziellen öffentlichen
  Staging-Buildwerten ausschließlich im Kindprozessspeicher
- Deployment-Dry-Run: PASS
- `git diff --check`: PASS
- `git diff --cached --check`: PASS
- Arbeitsbaum vor Bericht: sauber
- Remote-Parität vor Bericht: PASS
- kein `.env` oder Key-Material erzeugt

Deployment:

- Worker: `wuxuai-restaurant-bonus-app-staging`
- Deployment-ID: `a6147626-61dd-4ebb-804e-44c912e3b780`
- Version-ID: `3f385e04-4d52-415d-91c1-566d0b917f75`
- Traffic: 100 %
- Quellcommit: `d5e63160c2e32442474bba73e0003eaf5473a18d`
  (sauberer, remote-paritätischer Checkout; Cloudflare-Version ohne Commit-Annotation)
- Staging HTTP: 200
- Hauptasset lokal/remote: `index-DJ528Df7.js`
- Hauptasset SHA-256 lokal/remote:
  `37fde422f1f0041db44d8f148607a7b88c0984960f4d82c3587b7e9fa11a01a3`
- Asset-Parität: PASS
- Production HTTP: 200
- Production-Hauptasset weiterhin separat: `index-CcQGACtT.js`
- Production geändert: NEIN

## Phase E – Read-only Platform-Admin-Smoke

- Platform-Admin-Sitzung: nicht eindeutig verfügbar
- Pro Control Center: nicht physisch verifiziert
- Country Status UI: nicht physisch verifiziert
- TEST_ONLY-UI-Zustand: nicht physisch verifiziert
- Recent-Auth-UI: nicht physisch verifiziert
- Cancel/Close/Escape- und Refresh-Vertrag: statische Tests PASS; physischer
  Staging-Nachweis offen
- sieben Sprachen: Contract-Tests PASS; physischer Staging-Nachweis offen
- responsive Matrix: Contract-Tests PASS; physischer Staging-Nachweis offen
- keine Anmeldung umgangen
- keine Bestätigungsphrase eingegeben
- kein Mutator ausgeführt

Die abschließenden Staging-Zählungen nach den Browserprüfungen blieben exakt:
Receipts `0`, Commercial Audit `0`, PRO-Grants `0`, veröffentlichte Länder `0`,
TEST_ONLY `1 aktiv / 2 historisch`.

## Secret Scan und Artefakte

Der taskbezogene Source-/Report-/ZIP-Scope wird mit dem vorhandenen Scanner
geprüft. Der globale Repository-Scan ist als Release-Gate ungeeignet, weil das
Repository historische ZIPs, `.env.example` und absichtliche Credential-/URL-
Negativfixtures enthält; diese vorbestehenden Funde wurden nicht verändert und
werden nicht in das neue Prüf-ZIP aufgenommen.

Das neue Prüf-ZIP enthält weder `node_modules`, `.env*`, `dist`, `build`, alte
ZIPs noch Zugangsdaten. Inventar, Integrität, SHA-256 und ZIP-Secret-Scan werden
nach Erstellung separat geprüft.

## Nicht geändert

- keine Produktdatei und keine bestehende Migration geändert
- keine reale oder synthetische Testzeile erstellt
- keine TEST_ONLY-Markierung erstellt
- kein PRO-Grant erstellt, verlängert oder widerrufen
- kein Commercial Country Release geändert
- keine Daten-Remediation
- kein Stripe-Zugriff
- kein Production-Deployment
- kein Rebase, Force-Push oder Merge nach `main`
- Image Render Contract bleibt FINAL LOCK

## Prozesse und Cleanup

- task-eigene Hintergrundprozesse gestartet: 0
- task-eigene Hintergrundprozesse gestoppt: 0
- task-eigene Hintergrundprozesse weiterhin aktiv: 0
- fremder Docker-Container `welcome-to-docker`: unverändert
- fremde Prozesse/Container beendet oder verändert: nein

## Status

Technische Staging-Gates: **PASS**

Physischer Platform-Admin-UI-Restgate: **OFFEN**

Gesamtstatus: **NOT READY** für FINAL LOCK, ausschließlich wegen der fehlenden
legitimen Platform-Admin-Sitzung und des dadurch nicht abgeschlossenen
physischen UI-/Responsive-/Sprach-Smokes.
