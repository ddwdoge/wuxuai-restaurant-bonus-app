# Phase 7B.4C – Local Completion

Datum: 2026-09-15. **LOCAL CODE LOCK / NOT READY FOR STAGING**.

## Basis und Ursache

Worktree: `/private/tmp/wuxuai-pro-phase1-authoritative`.
Branch: `codex/v1-phase-7-pro-entitlements`.
HEAD unverändert: `8834bc52c7c96f6fc3021ae8e1ce21fe36bc4eb6`.
Die bisherige lokale Fassung blockierte auch einen vollständig sauberen
Erstrequest durch Cleanup-Markierungspflicht und pauschal unbekanntes Billing.
Dieser Bericht ersetzt den früheren unvollständigen Receipt/Cleanup-Checkpoint
als aktuellen Nachweis, ohne dessen historische Inhalte zu überschreiben.

## Geänderte Dateien

- `supabase/migrations/20260915003000_test_tenant_contract_hardening.sql`
- `tests/test-tenant-contract-hardening.test.mjs`
- `tests/test-tenant-receipt-cleanup-compatibility.sql`
- `tests/test-tenant-contract-hardening-fixture.sql`
- `tests/test-tenant-contract-hardening.local.mjs`
- `docs/V1_AUSTRIA_LAUNCH_MASTER_CONTRACT.md` – additiver lokaler Nachtrag
- dieser Bericht und Fortsetzungsverweis im bisherigen Receipt/Cleanup-Bericht

Fremde vorhandene Änderungen wurden nicht gestaged oder verändert.
Alle **151 getrackten Migrationen** wurden byteweise mit HEAD verglichen:
identisch. Keine bestehende Migration wurde nachträglich verändert.

01000 SHA-256:
`dce608d4773639506baac868f4879bb13f839e71f317c56bff57a35ac8a0fcba`

02000 SHA-256:
`816369d51c871fa49d236a78d5893c077363bfbf1566fc15c589f9ffe12a05f2`

## Was geändert wurde

Der Cleanup-Read verwendet die echte alte Preflight-Funktion und behält alle
alten JSON-Felder, insbesondere `eligible`, `restaurant_name` und den exakten
flachen numerischen `inventory`-Wert. Die bereits angewendete Legal-Evidence-
Ausnahme bleibt gleich; Platform-Audit-Historie wird nicht ausgenommen.

Der additive `marking_preflight.eligible` prüft Erstmarkierung; das bisherige
`eligible` bezeichnet weiterhin Cleanup. Nur im Erstmarkierungszweck ist
`TEST_ONLY_MARKER_MISSING` erwartbar. Vorhandene Markierungen verhindern neue
Erstrequests. Alle anderen Blocker bleiben bestehen, einschliesslich unbekannter
Kundenklassifikation, fremder Memberships, Storage und unveränderbarer Historie.

Atomare Reihenfolge: Rolle/Recent Auth; Ziel-/Operationssperre; Requestsperre;
Receiptvergleich; identisches Replay oder Payloadkonflikt; Zielbindung und
Bestätigung; Preflight des vorherigen Zustands; Registry; Audit; Receipt.
Ein später Fehler rollt alle Inserts zurück. Der Receipt enthält unveränderbare
UUID-Snapshots für Zielrestaurant, Organization, Location und Actor sowie
Operation, Hash, Request-ID, Zeitstempel und Auditverweis. UPDATE, DELETE und
TRUNCATE werden blockiert. Generischer Cleanup bleibt unverändert und findet
den Receipt-Speicher mangels Spalte `restaurant_id` nicht.

Der erste gleichzeitige Migration-Repeat deckte einen DDL-Deadlock auf. Eine
transaktionale Migrationssperre behebt ihn; die finalen Wiederholungen bestehen.
Frühe Fehler im neuen Fixture-Lader und in erwarteten Fehlermeldungen wurden
korrigiert und nicht als erfolgreiche Läufe gezählt.

## Payment-/Stripe-Vertrag

Quellen: Payment-Plan, Canonical Product Contract, bestehendes
`branch_subscriptions`-Schema und Commercial Lock 01000. Es wurden keine
Payment-, Invoice- oder Stripe-Tabellen erfunden.

Jeder Subscription-Datensatz mit Zuordnung zur Organization **oder** zu einem
Restaurantstandort blockiert, unabhängig vom Status. Damit blockieren auch
Trial, unbekannte Statuswerte und quergemischte Zuordnungen. Die tatsächlichen
kanonischen Stripe-/Payment-Spalten werden geprüft; fehlende Spalten oder
Leseautorität ergeben fail-closed. Vollständig leeres kanonisches Billing
kann lokal positiv bestätigt werden.

Die Antwort meldet ausdrücklich keine externe Stripe-Attestierung und keine
verfügbare Invoice-Quelle. Dies ist kein Nachweis externer Zahlungsfreiheit eines
realen Betriebs. Bei späterer Billing-Integration ist ein erneuter Vertragsabgleich
erforderlich. Keine Stripe-Daten wurden gelesen oder verändert.

## Lokale SQL-Matrix

PostgreSQL 17.10; neuer Cluster:
`/private/tmp/wuxuai-7b4c-completion.PkbOwB/data`.
Bindung `127.0.0.1:55441`; PID und Prozessgruppe `54420`.
Die finalen Datenbanken `wuxuai_7b4c_verified_fresh` und
`wuxuai_7b4c_verified_upgrade` bestehen jeweils **66 Prüfgruppen**.

Methode: synthetische Tabellenabhängigkeiten, echte pgcrypto-Funktionen,
unveränderte bisherige Cleanup-/Rollen-/Recent-Auth-RPCs und tatsächliche
Migrationen 01000, 02000, 03000. JWT-Gateway-Claims sind lokale Testinputs;
Platformrollen stammen aus DB-Rollenzeilen. **Kein vollständiger Replay aller
151 historischen Migrationen, kein Staging-Schema-Dump.** Der Upgrade-Lauf
erhält vorhandene synthetische Punkte-/Besuchshistorie.

Bestanden:

- Fresh, Upgrade, Repeat und zwei gleichzeitige Migrationswiederholungen.
- Positiver Erstrequest, identisches Replay, Payload- und Zieltenantkonflikt.
- 12 gleiche Requests: ein Erstresultat, elf Replays, ein Receipt/Audit.
- 12 unterschiedliche Requests desselben Tenants: ein Erfolg, elf Blockierungen.
- Fehler nach Registry-/Audit-Insert: vollständiger Rollback.
- Alte Isolationsblocker, additive Kontext-/Payment-/Storage-/Audit-Blocker,
  unbekannte Kundenklassifikation und Kombination mehrerer Blocker.
- Owner, Staff, Customer und Anonymous abgewiesen; ebenso Support, Billing,
  Viewer und inaktiver Platform Admin. Platform Admin/Owner dürfen lesen.
- Fehlende, abgelaufene und nicht zum Actor passende Recent Auth abgewiesen.
- Exakte Bestätigung, gesperrtes altes Overload und blockierte direkte DML.
- Preflight in `BEGIN READ ONLY`, ohne Daten- oder Auditwrites.
- Altes JSON-Feldinventar, identische `inventory`, unveränderte Cleanup-
  Funktionsdefinition, statischer UI-Verbrauch der Pflichtfelder.
- Receipt-/Audit-Unveränderbarkeit, generische Cleanup-Erkennung und
  Cleanup-Ablehnung ohne DELETE/UPDATE gegen den Receipt-Speicher.
- AT lokal LOCKED; keine Pro-Grants.

Reproduktion nur in einem neu angelegten isolierten lokalen Cluster:
`WUXUAI_7B4C_LOCAL_PORT` und `WUXUAI_7B4C_LOCAL_DB` pro Prozess setzen und
`node tests/test-tenant-contract-hardening.local.mjs` ausführen. Der Runner
verlangt Loopback, speziellen DB-Namen und leeres Public-Schema. Niemals auf
Staging oder Production verwenden. Das ZIP ist ein Scope-Nachweis; die
unveränderten Abhängigkeiten stammen aus dem genannten Repository-HEAD.

## Automatische Gates und Build

- Focused Contracts: **37/37 PASS**.
- Security Contracts: **25/25 PASS** (Platform Foundation, Commercial Lock,
  Staff Preview), zusätzlich dynamische lokale Rollen-/DML-Matrix.
- Full Tests: **1849/1849 PASS**, keine übersprungenen Tests.
- Typecheck: PASS.
- Lint: PASS, null Fehler, acht bestehende Warnungen.
- Build: PASS mit Node 24.18.0; bestehende Chunkgrössenwarnung bleibt.
- Secret Scan: vorhandener expliziter Evidence-Scanner, keine erkannten Secrets.
- Git Diff Check / Cached Diff Check und Prüfung ungetrackter Scope-Dateien.
- ZIP-Inventar, Integrität und SHA-256: nach Paketierung separat geprüft.

Build-Testwerte stammen aus `tests/build-env-guard.test.mjs`, Zeilen 17–18.
Nur pro Build-Prozess gesetzt; keine `.env` angelegt oder verändert. Keine
Zugangsdaten übernommen oder ausgegeben. Build im netzwerkbeschränkten Sandbox-
Kontext, ohne Paketinstallation oder externen Tool-Netzwerkzugriff. Die
Buildausgabe ist nicht für ein Deployment bestimmt und nicht im Prüf-ZIP.

## Nicht geändert / Risiken / Staging

Keine reale Datenbereinigung, Customer-/Membership-/Storage-Veränderung,
Pro-Grants oder Länderfreigabe. Alle Mutatortests nutzten ausschliesslich
synthetische lokale Daten. Kein Commit, Push, Staging-Zugriff, DB-Push oder
App-Deployment. Production und Stripe unverändert. Der bekannte AT-Lock wurde
nicht angefasst; kein neuer Live-Nachweis wird aus lokalen Tests abgeleitet.

03000 nur lokal erstellt und getestet, nicht auf Staging angewendet. Die
bisherige UI sendet vier Argumente beim Markieren; dieses unsichere Overload
ist gesperrt. Eine spätere UI-Anpassung und Live-Freigabe sind getrennte, nicht
autorisierte Aufgaben. Read-/Cleanup-Pflichtfelder bleiben kompatibel.
Kein FINAL LOCK für einen Staging-Flow.

## Prozesse und Export

Vor Shutdown: null weitere Client-Verbindungen im eigenen Cluster. Kontrolliert
mit `pg_ctl -m smart -w stop` beendet. Alter ungeklärter PostgreSQL-Prozess weder
geprüft noch angefasst. Synthetische Clusterdateien bleiben lokal erhalten;
kein DB-Dump und keine Prozesslogs im ZIP.

Prüf-ZIP: `exports/2026-09-15_PHASE_7B_4C_LOCAL_COMPLETION.zip`.

```text
POSITIVE FIRST MARKING: PASS
SELF-BLOCKING RECEIPT: NONE
RECENT AUTH: PASS
REQUEST IDEMPOTENCY: PASS
PARALLEL SERIALIZATION: PASS
PAYMENT/STRIPE PREFLIGHT: PASS (canonical local schema)
LEGACY CLEANUP COMPATIBILITY: PASS
SQL FRESH/UPGRADE/REPEAT: PASS (synthetic dependency schema)
BUILD: PASS
FULL TESTS: 1849/1849
COMMIT/PUSH/STAGING: NO
PRODUCTION CHANGED: NO
STRIPE CHANGED: NO
TASK-OWNED BACKGROUND PROCESSES STARTED: 1
TASK-OWNED BACKGROUND PROCESSES STOPPED: 1
TASK-OWNED BACKGROUND PROCESSES STILL RUNNING: 0
RETAINED PROCESS PURPOSE: NONE
RAM CLEANUP: PASS
UNRELATED NODE PROCESSES CHANGED: NO
STATUS: LOCAL CODE LOCK / NOT READY FOR STAGING
```
