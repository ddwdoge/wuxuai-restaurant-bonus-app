# Phase 7B.3A – Pro Control Center Read Contract

Datum: 2026-09-15
Branch: `codex/v1-phase-7-pro-entitlements`
Basis-HEAD: `86498bd0b6bcd0cb9634e7498940e068998284d2`

## Ursache

Die auf Staging vorhandene Phase-7B.1A-RPC lieferte nur Release-Policies und
aktive Grants. Fuer das freigegebene Platform-Admin Control Center fehlten
historische Berechtigungszustaende, sichere reale-/TEST_ONLY-Betriebslisten,
vollstaendige Audit-Provenienz und paginierte Filter.

## Geaenderte Dateien

- `supabase/migrations/20260915002000_pro_commercial_control_center_reads.sql`
- `tests/pro-commercial-control-center-reads.sql`
- `tests/pro-commercial-control-center-reads.test.mjs`
- `docs/V1_CURRENT_CANONICAL_PRODUCT_CONTRACT.md`
- `docs/14_DATABASE_ARCHITEKTUR.md`
- `docs/23_API_RPC_REGELN.md`
- `docs/24_SECURITY_PRIVACY.md`
- `docs/19_CHANGELOG.md`
- dieser Bericht

## Was wurde geaendert

Die neue additive Migration fuegt fuenf voneinander getrennte Read-RPCs hinzu:

1. `get_platform_pro_country_status` liefert Release-Zustand, Readiness,
   letzte erfolgreiche Commercial-Aktion und aktive Paid-/Trial-/Pilot-/
   TEST_ONLY-Zaehler je Land.
2. `get_platform_pro_entitlements` liefert paginiert Paid, Trial, Pilot und
   TEST_ONLY in den Zustaenden active, expired, revoked und scheduled.
3. `search_platform_pro_real_businesses` schliesst jeden exakt aktiven
   TEST_ONLY-Registry-Marker aus.
4. `get_platform_pro_test_only_businesses` akzeptiert ausschliesslich die
   vollstaendig uebereinstimmende serverseitige Markerbeziehung aus Restaurant,
   Organization, Name und Owner.
5. `get_platform_pro_commercial_audit` liest ausschliesslich
   `commercial_pro_access_audit` und liefert Vorher/Nachher, Akteur, Grund,
   Zeitpunkt, Ablauf und Idempotenzreferenz.

Jede RPC prueft `platform_owner` oder `platform_admin` erneut serverseitig,
verwendet `SECURITY DEFINER`, einen festen `search_path`, `STABLE`, sichere
Filter, stabile Sortierung und ein hartes Seitenmaximum von 100. EXECUTE ist
fuer `public`, `anon` und `service_role` entzogen und nur fuer
`authenticated` als serverseitig erneut gepruefter Einstieg erteilt.

## Was wurde nicht geaendert

- `20260915001000_pro_commercial_release_lock.sql` blieb mit SHA-256
  `dce608d4773639506baac868f4879bb13f839e71f317c56bff57a35ac8a0fcba`
  bytegleich.
- Keine Tabellen, Resolver, Mutatoren, Subscriptions, Grants oder Auditzeilen
  wurden durch die neue Migration veraendert.
- Keine Platform-Admin-UI, kein Pricing-/Unlimited-Folgeumfang.
- Kein Commit, Push, Staging-Apply, Deployment, Stripe oder Production.
- Kein Country-, Pilot- oder TEST_ONLY-Mutator wurde gegen Staging ausgefuehrt.

## Lokale Migrationstests

Ein isolierter PostgreSQL-17-Cluster auf `127.0.0.1:55435` erhielt ein
synthetisches aktuelles Phase-7B.1A-Schema mit bereits gespeicherten Paid-,
Trial-, Pilot- und TEST_ONLY-Zustaenden. Die neue Migration wurde frisch und
anschliessend erneut angewendet. Geprueft wurden:

- Fresh/Upgrade/Repeat und unveraenderte bestehende Daten;
- Platform Admin erlaubt; Owner, Staff, Customer, rollenlos-authenticated und
  Anonymous abgewiesen;
- aktive, abgelaufene, widerrufene und geplante Eintraege;
- letzte Laenderaktion mit Akteur und Begruendung;
- reale Betriebe und exakte TEST_ONLY-Marker strikt getrennt;
- Country-, Type-, State- und Suchfilter, Maximalwert und stabile Sortierung;
- Commercial Audit vollstaendig und weiterhin append-only;
- Vorher-/Nachher-Snapshots fuer Policy, Grants und Audit: keine Read-Writes;
- AT + PRO blieb `LOCKED`.

Die ersten beiden Laeufe deckten ausschliesslich Test-/Read-Modellprobleme auf:
eine falsche Fixture-Anzahl sowie eine zukuenftig startende Trial, die vom
bestehenden Lifecycle-Helper bereits als eligible gemeldet wird. Das neue
Read-Modell priorisiert deshalb `scheduled` vor `eligible`, ohne den bestehenden
Resolver zu veraendern. Nach der Korrektur bestand der gesamte Lauf. Alle vier
task-eigenen PostgreSQL-Prozesse wurden kontrolliert beendet.

## Gates

- Neue statische Read-Contracts: 7/7 PASS
- Focused Pro/Country/Security: 127/127 PASS
- SQL Fresh/Upgrade/Repeat/Rollen/Lifecycle: PASS
- Full Tests: 1831/1831 PASS, 0 SKIP
- Typecheck: PASS
- Lint: PASS, 0 Fehler / 8 bestehende Warnungen
- Build: PASS, 2126 Module; bekannte Chunkgroessenwarnung
- Secret Scan: PASS
- Git Diff Check: PASS

## Risiken

- Die Migration ist absichtlich noch nicht auf Staging angewendet; daher ist
  die spaetere Control-Center-UI noch nicht implementier- oder live pruefbar.
- Die bestehenden uncommitted Altdateien im Worktree wurden nicht bereinigt,
  zurueckgesetzt oder in den Phase-7B.3A-Scope aufgenommen.

## Pflichtstatus

```text
NEW ADDITIVE MIGRATION: supabase/migrations/20260915002000_pro_commercial_control_center_reads.sql
APPLIED MIGRATION MODIFIED: NO
COUNTRY STATUS READ: PASS
LAST ACTOR/REASON READ: PASS
ALL GRANT STATES READ: PASS
REAL BUSINESS SEARCH: PASS
TEST_ONLY EXACT FILTER: PASS
COMMERCIAL AUDIT READ: PASS
PLATFORM ADMIN ACCESS: PASS
OWNER/STAFF/CUSTOMER/ANONYMOUS: BLOCKED
PAGINATION/FILTER/SORT: PASS
PII/SECRET EXPOSURE: NONE
DIRECT DML: NONE
READS CAUSE WRITES: NO
FRESH/UPGRADE/REPEAT: PASS
MIGRATION APPLIED TO STAGING: NO
AT + PRO: LOCKED
PRODUCTION CHANGED: NO
STATUS: PHASE 7B.3A LOCAL READ CONTRACT COMPLETE / NOT READY FOR STAGING
```
