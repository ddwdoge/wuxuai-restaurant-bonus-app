# WUXUAI® BONUS – Phase 7B.4D lokale Vertragsmatrix

Datum: 2026-09-20

Branch: `codex/v1-release-integration`

Kanonische Ausgangsbasis: `44f05418ec8b9db4cbea1f8c5e56dd2d08e710dd`

Implementierungscommit: `a5697917d65689a98bcfbc22af8317f3c17b84ee`

Ausführungsziel: ausschließlich isolierte lokale Supabase-Runtime

Staging/Production: nicht verwendet und unverändert

## Ursache und Ziel

Phase 7B.4D benötigte einen vollständigen historischen Supabase-Replay und die Prüfung des Test-Tenant-Hardening-Vertrags gegen eine echte lokale Supabase-Runtime. Dafür wurden die repositorylokale Supabase CLI `2.116.0`, eine strikt localhostgebundene Konfiguration und ein fail-closed Testziel-Guard ergänzt. Nach bestandenem Datenbankvertrag wurde die Platform-Admin-UI an den aktuellen RPC-Vertrag mit Recent-Auth-, Preflight- und Request-Idempotenzbindung angepasst.

## Laufzeit und Isolation

- Gate-Node: `v24.18.0` (Projektminimum Node 22 erfüllt)
- Paketmanager: npm mit bestehender `package-lock.json`
- Supabase CLI: `2.116.0`, ausschließlich repositorylokale Dev-Abhängigkeit
- Projekt-ID: `wuxuai-phase7b4d-local`
- API-Port: `56121`
- PostgreSQL-Port: `56122`
- Shadow-Port: `56120`
- Reservierter Port `55439`: nicht verwendet
- Auth-Schema: PASS
- Storage-Schema: PASS
- PostgreSQL/RLS/RPC/Migration-Tracking: PASS
- Deaktivierte optionale Dienste: Studio, Analytics, Realtime, Edge Runtime, lokales SMTP/Mailpit, Image Proxy, Vector, Pooler und PostgreSQL Meta
- Fremde Container geändert: NEIN

Der Test-Guard verlangt explizit `ALLOW_LOCAL_SUPABASE_TESTS=1`, gleicht Projekt-ID und DB-Port mit `supabase/config.toml` und der laufenden Supabase-Instanz ab, akzeptiert ausschließlich Loopback-Hosts und beschränkt Testdatenbanken auf `postgres` beziehungsweise `wuxuai_7b4c_*`. Remote-, Staging-, Production-, Fremdport-, Fremdprojekt- und Port-`55439`-Ziele werden vor jedem SQL-Lauf abgewiesen. Zugangsdaten werden nicht ausgegeben und das Passwort wird nur über die Kindprozessumgebung an PostgreSQL-Werkzeuge übergeben.

## Migrations- und Vertragsmatrix

- Vollständiger Fresh-Replay: PASS, 152/152 Migrationen
- Historischer Stand bis `02000`: PASS, 151 Migrationen
- Upgrade `151 → 152` ausschließlich über `20260915003000_test_tenant_contract_hardening.sql`: PASS
- Direkter Repeat-/Idempotenzlauf 1: PASS
- Direkter Repeat-/Idempotenzlauf 2: PASS
- Migration `03000` unverändert und bytegleich zur Phase-7B.4C-Basis: PASS
- SHA-256 Migration `03000`: `5ff37ab21bab8b3727587d9370dbd581c391d9260f661b7ca0ca860d6f00db91`
- Fresh-Fokusmatrix: PASS, 66 Gruppen
- Upgrade-Fokusmatrix: PASS, 66 Gruppen

Geprüfte Sicherheits- und Fachverträge:

- Shared-Organization-, fremde Membership-/Identity- und fremde Restaurantbindungen blockiert
- Nicht-Test-Customer, Storage-Objekte, immutable Audit, fehlende Bindungen und aktive Einlösungen blockiert
- Payment-, Subscription- und Stripe-Artefakte blockiert
- Unbekannte Schemas und Länderzustände blockiert
- Platform Admin erlaubt; Owner, Staff, Customer und Anon verweigert
- Support, Billing, Viewer und inaktive Platform-Rollen verweigert
- Platform Owner Read erlaubt
- Fehlende, abgelaufene und nicht passende Recent Auth blockiert
- Exakte Bestätigungsphrase erforderlich
- Alte Overloads und direkte DML blockiert
- Positiver synthetischer Erstmarkierungsablauf: PASS
- Receipt-Identity-Snapshot einschließlich `target_restaurant_ref`: PASS
- Identischer Replay idempotent; Payload-Konflikt und tenantübergreifende Request-ID blockiert
- Receipt und Audit append-only
- Cleanup ohne fachlichen Write und ohne selbstblockierende generische Discovery
- Später Fehler rollt atomar zurück
- 12 identische parallele Requests: exakt ein Erstresultat
- 12 konkurrierende Requests: exakt ein Write, ein Receipt und ein Audit
- Paralleler Migrations-Repeat erhält Receipts
- Legacy-Cleanup-Kompatibilität: PASS
- AT + PRO: LOCKED; keine Pro-Grants; keine verbleibenden Test-Tenant-Receipts nach Cleanup

## UI-/RPC-Vertrag

Die Platform-Admin-Anbindung verwendet nun den aktuellen `marking_preflight`, sendet `input_idempotency_key`, aktualisiert den Preflight unmittelbar vor dem Write und prüft dabei die aktuelle Markierungsfähigkeit, Recent Auth und die exakte Bestätigung. Eine stabile Request-ID wird pro unverändertem Payload wiederverwendet; bei Payloadänderung wird eine neue ID erzeugt. Es bleibt bei genau einem expliziten Marker-Aufruf.

- UI-RPC-Vertrag: PASS
- Request-Idempotenz: PASS
- Cancel/Close/Escape Writes: 0; das Panel besitzt dort keine schreibenden Handler
- Sieben Sprachen (DE/EN/FR/IT/ES/ZH/KO): PASS über Contract-Tests
- Responsive Contract (320/360/375/390/415/430/768/Desktop): PASS über bestehende statische UI-Vertragstests
- Physischer Browser-/Staging-Flow: nicht ausgeführt und nicht freigegeben

## Geänderte Dateien

- `.gitignore`
- `package.json`
- `package-lock.json`
- `supabase/config.toml`
- `src/modules/platform/PlatformKassaCompliancePanel.tsx`
- `src/modules/platform/platformAdminService.ts`
- `src/shared/i18n/platformTestTenantMessages.mjs`
- `tests/helpers/local-supabase-test-guard.mjs`
- `tests/local-supabase-test-guard.test.mjs`
- `tests/pro-commercial-release-lock-base.sql`
- `tests/test-tenant-contract-hardening.local.mjs`
- `tests/test-tenant-contract-hardening.test.mjs`
- `tests/test-tenant-receipt-cleanup-compatibility.sql`
- `tests/kassa-test-tenant-cleanup-contract.test.mjs`
- `tests/phase6f-platform-test-tenant-i18n.test.mjs`

## Was nicht geändert wurde

- Keine bestehende Migration geändert
- Migration `03000` nicht auf Staging oder Production angewendet
- Keine Staging-/Production-Verbindung und keine realen Datenänderungen
- Keine `TEST_ONLY`-Markierung und kein Pro-Grant außerhalb der isolierten lokalen Testdatenbanken
- Keine Stripe-Nutzung
- Kein Deployment, Rebase, Force-Push oder Merge nach `main`
- Image Render Contract unverändert und weiterhin FINAL LOCK
- Fremder Docker-Container `welcome-to-docker` unverändert

## Gates

- Guard-Tests: PASS, 5/5
- Fokussierte UI-/Security-Tests: PASS, 40/40
- Full Tests: PASS, 1875/1875
- Typecheck: PASS
- Lint: PASS, 0 Fehler; 8 vorbestehende Warnungen außerhalb des Scopes
- Build: PASS mit synthetischer lokaler, nicht geheimer Vite-Konfiguration; nur bestehende Chunk-Size-Warnung
- Secret Scan: PASS
- `git diff --check`: PASS
- Migration-bytegleich: PASS

Der erste Build ohne Vite-Umgebungswerte brach erwartungsgemäß am fail-closed Konfigurationsschutz ab. Der anschließende Build verwendete ausschließlich synthetische lokale Werte (`http://127.0.0.1:56121` und einen nicht geheimen Platzhalter) und war erfolgreich.

## Cleanup

- Task-Datenbanken `wuxuai_7b4c_fresh` und `wuxuai_7b4c_upgrade`: entfernt
- Lokaler Supabase-Stack: kontrolliert ohne Backup gestoppt
- Task-eigene Container gestartet: 5
- Task-eigene Container gestoppt: 5
- Task-eigene Hintergrundprozesse weiterhin aktiv: 0
- Fremde Container/Prozesse verändert: NEIN

## Risiken und Status

Es besteht kein offenes lokales Vertragsrisiko im geprüften Scope. Ein echter Staging-Flow, eine Staging-Migration und ein Deployment waren ausdrücklich nicht freigegeben und wurden nicht ausgeführt. Daher ist dies ein lokaler **CODE LOCK**, kein FINAL LOCK.

Status: **CODE LOCK**
