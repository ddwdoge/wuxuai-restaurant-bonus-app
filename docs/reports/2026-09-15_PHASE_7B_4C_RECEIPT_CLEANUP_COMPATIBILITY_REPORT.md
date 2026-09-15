# Phase 7B.4C – lokaler Receipt-/Cleanup-Zwischenstand

Fortsetzung am 2026-09-15: Dieser historische Zwischenstand bleibt erhalten.
Aktueller lokaler Nachweis: [Local Completion](2026-09-15_PHASE_7B_4C_LOCAL_COMPLETION_REPORT.md).

Datum: 2026-09-15
Worktree: `/private/tmp/wuxuai-pro-phase1-authoritative`
Branch: `codex/v1-phase-7-pro-entitlements`
Basis: `8834bc52c7c96f6fc3021ae8e1ce21fe36bc4eb6`

## Ursache

Der ungetrackte Entwurf enthielt einen Receipt-Speicher mit `restaurant_id`,
der vom generischen Cleanup automatisch erfasst worden waere. Ausserdem
fehlten Legacy-Rueckgabefelder und Isolationspruefungen. Die lokale Korrektur
ist vom Founder freigegeben; Staging und fachliche Mutationen sind gesperrt.

## Geaenderte Dateien

- `supabase/migrations/20260915003000_test_tenant_contract_hardening.sql`
- `tests/test-tenant-contract-hardening.test.mjs`
- `tests/test-tenant-receipt-cleanup-compatibility.sql` (neu, nicht ausgefuehrt)
- dieser Bericht

## Was wurde geaendert

- Receipt-Tenantreferenz heisst `target_restaurant_ref` (UUID, NOT NULL).
  Organization und Location werden als unveraenderbare UUID-Snapshots gespeichert.
  Der Zielindex umfasst Tenantreferenz, Zeitpunkt und Idempotency-Key.
  Keine Tenant-FK-Kaskade und keine Spalte mit exaktem Namen `restaurant_id`.
- Receipt-UPDATE, DELETE und TRUNCATE werden durch Trigger abgewiesen.
  Direkte Rechte fuer PUBLIC, anon, authenticated und service_role sind entzogen.
- Der Preflight uebernimmt Legacy-JSON und dessen numerisches `inventory`
  aus `get_platform_test_tenant_cleanup_preflight_v1`. Die vorhandene Ausnahme
  fuer Legal-Evidenz entspricht unveraendert dem angewendeten v2-Wrapper.
  Andere Legacy-Blocker werden nicht entfernt. `eligible`, `restaurant_name`
  und `inventory` bleiben erhalten; weitere Informationen sind additiv.
- Vorhandene Platform-Audits, Commercial-/Cleanup-Audits und Receipts blockieren.
  `eligible` ist bei jedem Blocker false. Read und neuer Mutator erlauben
  ausschliesslich aktive Plattformrollen platform_owner/platform_admin ueber
  den bestehenden serverseitigen Rollenresolver.
- Der neue Mutator bindet Actor, Zielreferenz, Operation und Payload-Hash an
  den Idempotency-Key. Er verwendet den bestehenden Recent-Auth-Helper und
  einen Request-Advisory-Lock; diese Pfade sind noch nicht SQL-verifiziert.

## Was wurde nicht geaendert

Migrationen 01000/02000 stimmen weiterhin mit dem Basiscommit ueberein.
Der generische Cleanup-RPC, die UI und alle angewendeten Migrationen wurden
nicht bearbeitet. Fremde lokale Aenderungen wurden bewahrt. Keine Markierung,
keine Datenbereinigung, keine Storage-Aktion, kein Pro-Grant, kein Commit/Push,
keine Staging-Migration, kein Deployment, kein Stripe- oder Production-Zugriff.

## Pruefungen und Stop

- Focused Contracts (Hardening, Legacy Cleanup, Commercial Reads): 35/35 PASS.
- Full Tests: 1847/1847 PASS, keine uebersprungenen Tests.
- Security: statische Contracts in diesen Tests bestanden; eigenstaendige
  SQL-Rollen-/RLS-Matrix NICHT AUSGEFUEHRT.
- Typecheck: PASS.
- Lint: PASS mit 8 Warnungen, 0 Fehlern in nicht geaenderten Quelldateien.
- Build: FAIL vor Kompilierung, weil VITE_SUPABASE_URL und
  VITE_SUPABASE_ANON_KEY nicht in der Build-Umgebung vorliegen.
- Git diff --check: PASS zum Zeitpunkt des Code-Gates.
- Secret Scan: PASS fuer die vier enthaltenen Phase-7B.4C-Dateien
  (Private-Key-, Stripe-/Supabase-Secret-, JWT- und AWS-Key-Muster).
- Fresh/Upgrade/Repeat/Parallelitaet und SQL-Receipt-Regression: NOT RUN.

Nach dem fehlgeschlagenen Build-Gate wurde die Implementierung gestoppt.
Der neue leere Testordner ist `/private/tmp/wuxuai-7b4c-receipt-pg.XBkcAC`.
Kein initdb, PostgreSQL-Start oder Datenbankzugriff wurde in diesem Turn ausgefuehrt.
Der frueher ungeklaerte PostgreSQL-Prozess wurde weder abgefragt noch beendet.

## Offene Risiken und Grenzen

Das ist kein lokaler Code Lock. Statische Tests beweisen keine SQL-Laufzeit-
oder Parallelitaetssicherheit. Der neue SQL-Test deckt Receipt-Katalogstruktur,
Unveraenderbarkeit und Rechte ab; die vollstaendige dynamische Preflight-,
Rollen-, Blocker-, Replay- und Parallelitaetsmatrix ist noch zu ergaenzen.

Der Preflight setzt PAYMENT_STRIPE_FREEDOM_NOT_VERIFIED immer als Blocker,
weil der vorhandene lokale Vertrag keine autoritative Abwesenheit externer
Rechnungen/Zahlungen/Auszahlungen belegen kann. Leere Stripe-Referenzen sind
kein Beweis. Eine erfolgreiche neue Markierung ist damit absichtlich gesperrt.
Auch der Legacy-Blocker TEST_ONLY_MARKER_MISSING bleibt erhalten; die atomare
Erstmarkierung und ihr positiver Testpfad sind noch nicht fertiggestellt.
Die alte Vier-Parameter-Markierung bleibt im Entwurf fuer Browser gesperrt;
ein spaeterer UI-Schreibpfad benoetigt den neuen Idempotency-Vertrag.
Keine dieser offenen Stellen wird als abgeschlossen oder freigegeben dargestellt.

## Status

```text
CANONICAL PHASE 7 BASELINE: PASS
PHASE 7B.4C ARTIFACTS: RECOVERED AND LOCALLY EDITED
RECEIPT/CLEANUP STRUCTURAL CONTRACT: STATIC PASS / SQL NOT VERIFIED
LOCAL GATES: FAIL
BUILD: FAIL – MISSING BUILD ENVIRONMENT
MIGRATION APPLIED LOCALLY: NO
DATA REMEDIATION: NO
TEST_ONLY MARKER: NO
PRO GRANT: NO
COMMIT/PUSH/STAGING: NO
PRODUCTION CHANGED: NO
STATUS: NOT READY FOR STAGING
TASK-OWNED BACKGROUND PROCESSES STARTED THIS TURN: 3
TASK-OWNED BACKGROUND PROCESSES COMPLETED THIS TURN: 3
TASK-OWNED BACKGROUND PROCESSES STILL RUNNING FROM THIS TURN: 0
EARLIER POSTGRESQL PROCESS: UNKNOWN – UNTOUCHED PER FOUNDER INSTRUCTION
RAM CLEANUP: CURRENT TURN COMPLETE / EARLIER PROCESS NOT VERIFIED
UNRELATED PROCESSES CHANGED: NO
```
