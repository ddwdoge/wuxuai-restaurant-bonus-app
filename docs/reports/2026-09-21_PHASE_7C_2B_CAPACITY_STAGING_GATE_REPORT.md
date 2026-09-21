# Phase 7C.2B – Capacity Commit, Push und Read-only Staging-Gate

Datum: 2026-09-21
Branch: `codex/v1-release-integration`
Ausgangs-HEAD/Remote: `f28a15495ffbbe9788513eba6c84a74f4e743080`
Implementierungscommit: `ab9b9897dc43267e13f857f368cb5ba9a9832fe9`
Evidence Commit: dieser enge Evidenzcommit; exakter Hash im finalen Handoff
Staging-Projekt: `bwhvfjuwixgwduoeqaya` (`wuxuai-bonus-staging`)
Status: **PHASE 7C.2B STAGING BACKEND LOCK**

## Ursache und Scope

Die lokal abgeschlossene Phase 7C.2 führte eine additive, endliche und
versionierte Capacity-Read-Schicht ein. Phase 7C.2B commitete ausschließlich
die geprüften task-eigenen Artefakte, pushte sie auf den gleichnamigen
Integrationsbranch, wandte ausschließlich Migration 153 auf das eindeutig
verifizierte Staging-Projekt an und prüfte die neue Schicht danach read-only.

Es gab keinen App-Quellcode-Diff und deshalb kein App-Deployment. Es wurden
keine synthetischen Daten, Add-on-Einheiten, Subscriptions, Grants,
TEST_ONLY-Markierungen oder Länderfreigaben erzeugt.

## Git- und Artefaktgate

- Branch und Remote waren vor Beginn bytegleich auf `f28a1549...` (0/0).
- Migrationen 1–152 waren gegenüber Remote unverändert; 153 war die einzige
  neue Migration.
- Migration 153 war im Worktree und im Implementierungscommit bytegleich:
  `df2c79aa20abd3555cc6002b0a7d857259f9bc9b1b05056bfc74b59272a5e0b9`.
- Die Migrationen 01000, 02000 und 03000 blieben bytegleich mit den bereits
  dokumentierten SHA-256-Werten.
- Das erwartete ursprüngliche Prüf-ZIP wurde vor der Commitvorbereitung mit
  `e4c4671a...` erfolgreich geprüft. Sieben Markdown-Hardbreak-Leerzeichen
  mussten für `git diff --cached --check` entfernt werden. Das danach mit dem
  committed Inhalt konsistente Implementierungs-ZIP besitzt SHA-256
  `fb64674e6ec51735b94a1189299703c8a7a3781f909312b44eddcd63ca2d51c1`.
- Secret Scan, `git diff --check` und `git diff --cached --check`: PASS.
- Implementierungscommit und Remote-HEAD waren nach Push exakt gleich.

## Erneute lokale Verifikation

| Gate | Ergebnis |
| --- | --- |
| Focused Capacity Tests | 12/12 PASS |
| SQL-Vertragsmatrix | PASS; Transaktion vollständig zurückgerollt |
| Paralleltest | 24/24 deterministisch, 0 Writes |
| Full Tests | 1891/1891 PASS |
| Typecheck | PASS |
| Lint | PASS, 0 Fehler; 8 bekannte Warnungen außerhalb des Scopes |
| Build | PASS mit nicht geheimen lokalen Platzhaltern |
| Fresh/Upgrade/Repeat | reproduzierbarer Nachweis auf bytegleicher Migration bestätigt |

Der erste Paralleltest-Aufruf wurde vom vorgesehenen Local-Only-Guard
blockiert. Die Wiederholung mit explizitem Loopback-Opt-in bestand. Der dafür
gestartete lokale Supabase-Stack wurde danach kontrolliert gestoppt. Der fremde
Container `welcome-to-docker` blieb unverändert.

## Staging-Preflight

- CLI-Konto: Staging-Projekt sichtbar und verknüpft.
- Organisation: `hpvrtjwzxnbydibwyjrk`.
- Projekt: `bwhvfjuwixgwduoeqaya`, Name `wuxuai-bonus-staging`, Status
  `ACTIVE_HEALTHY`, Region `eu-west-1`.
- Production war ein anderes, nicht verknüpftes Projekt in einer anderen
  Organisation und wurde nicht angesprochen.
- Remote-Migrationen vor Anwendung: 152/152, letzte Migration
  `20260915003000`.
- Pending: ausschließlich `20260921001000_central_capacity_entitlements.sql`.
- Dry-Run vor Anwendung plante genau diese eine Migration.
- AT und alle vorhandenen PRO-Länder: `LOCKED`.
- Commercial Grants: 0; Commercial Audit: 0; effektive PRO-Betriebe: 0.
- Eine gespeicherte manuelle PRO-Trialzeile war vorhanden, jedoch 0 aktive,
  0 bezahlte und 0 Stripe-gebundene PRO-Zeilen. Sie erzeugte wegen Country
  Lock keine PRO-Autorität und ist kein realer 99-EUR-Vertrag.

## Migration 153

- Angewendet: ausschließlich `20260921001000`.
- Seeds: keine.
- Rollenänderungen außerhalb der Migration: keine.
- Manuelle SQL-Nachkorrektur: keine.
- Remote danach: 153/153.
- Migration 153 in History: exakt einmal.
- Repeat-/Dry-Run danach: leer, Remote up to date.
- DB-Lint: erfolgreich; bekannte Bestandswarnungen, keine Warnung für die
  neuen Capacity-Funktionen oder -Objekte.

## Read-only Capacity-Vertrag auf Staging

### Referenzdaten

| Vertrag | Preis Minor | Kapazität |
| --- | ---: | ---: |
| BASIC | 5900 EUR, EX_VAT | 5 Angebote / 3.000 Kunden |
| PRO | 14900 EUR, EX_VAT | 15 Angebote / 15.000 Kunden |
| Offer Add-on | 1900 EUR, EX_VAT | +5 je Einheit |
| Customer Add-on | 2900 EUR, EX_VAT | +5.000 je Einheit |

Die historischen Katalogzeilen BASIC 59, PRO 99 und PREMIUM 199 blieben
unverändert. Es bestehen keine aktiven, bezahlten oder Stripe-gebundenen
99-EUR-PRO-Verträge.

### Resolver und vorhandene Nutzung

- 16 vorhandene Restaurants read-only geprüft.
- 16 BASIC, 0 effektive PRO.
- Offer Limit jeweils 5; Customer Limit jeweils 3.000.
- Offer-Add-on-Einheiten: 0; Customer-Add-on-Einheiten: 0.
- Unlimited-Ergebnisse: 0; aktives Write-Enforcement: 0.
- Summierte vorhandene Usage: 4 kapazitätsrelevante Angebote und 9 aktive
  eindeutige Kunden über die 16 Tenant-Snapshots.
- Zwei Reads mit identischer fester Serverzeit erzeugten denselben Hash
  `0fc6579a6e28cc601cf24ac0b21bed9d`.
- Resolver- und Snapshot-Reads verursachten 0 Writes.

### Rollen, ACL und RLS

- RLS ist auf allen drei neuen Tabellen aktiv.
- Anonymous besitzt weder RPC-Execute noch Tabellen-DML.
- Authenticated besitzt keine Tabellen-DML-Rechte.
- Der öffentliche RPC ist nur für `authenticated` ausführbar und prüft im
  Funktionskörper `is_restaurant_admin(input_restaurant_id)` oder
  `is_platform_admin()`.
- Staff und Customer erhalten dadurch keine zusätzliche Capacity-Autorität;
  der lokale Rollen-/Cross-Tenant-Vertragstest bestand.
- Der interne Resolver ist für `anon`, `authenticated` und `service_role`
  nicht ausführbar.
- Die Service Role bleibt die bestehende vertrauenswürdige serverseitige
  Append-Autorität für spätere Billing-/Lifecycle-Schritte. Drei
  Immutable-Trigger blockieren Update/Delete; Browserrollen besitzen keine
  direkte DML-Autorität.
- Beide Resolver besitzen einen festen `search_path`.

## Vorher-/Nachher-Fingerprints

Alle folgenden Zeilenanzahlen und MD5-Fingerprints waren vor Migration, direkt
danach und nach allen Read-Tests identisch:

| Relation | Zeilen | MD5 |
| --- | ---: | --- |
| `country_launch_policy` | 6 | `cdcd4138cb3fa5be694efffdd40f7a2d` |
| `commercial_plan_release_policy` | 6 | `d3be58128a0b37d5ea5f346f901fb74b` |
| `commercial_pro_access_grants` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `commercial_pro_access_audit` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `branch_subscriptions` | 16 | `9ee635f086ae51ad938765097006cdf6` |
| `commercial_plan_catalog` | 3 | `deaf6805a93ccff03bba8ed3a27bad03` |
| `branch_entitlement_overrides` | 1 | `58617169c4e441e9d0f0519ca1ab002a` |
| `organizations` | 16 | `10a4b4ceccbb1ea24960eed03f0e7865` |
| `branches` | 16 | `f5b60fd9343f8f3d6e2e1e8d104ea455` |
| `restaurants` | 16 | `8bd05abad1df9c05f81c29a04b80a99c` |
| `customers` | 25 | `9d73109d3811e4932f7ba5a71f7f69db` |
| `customer_account_memberships` | 22 | `cd8d18d2c6d37ded4f9903864f3ff509` |
| `points_transactions` | 22 | `116e4aa426f8d5e1b9f835c2377084ba` |
| `restaurant_offers` | 18 | `7318a911ccd05206e356694f12521bf6` |
| `redemption_activity_journal` | 8 | `bc25a36f5e67f89d011358b38dc92501` |

Erwartete neue Daten: 2 Planversionen, 2 Add-on-Versionen und 0 Restaurant-
Add-on-Entitlements. Weitere Businessdatenänderungen wurden nicht gefunden.

## Nicht geändert

- kein produktiver `src/`-Code und kein App-Deployment;
- keine Country Policy und keine PRO-Freigabe;
- kein Grant, Pilot, TEST_ONLY-Marker oder Add-on-Entitlement;
- keine Subscription, kein Restaurant, Kunde, Membership, Punkt, Ledger,
  Angebot oder Commercial Audit;
- kein Stripe- oder Production-Zugriff;
- kein Merge nach `main` und kein Force-Push.

## Abschlussmatrix

```text
IMPLEMENTATION COMMIT: ab9b9897dc43267e13f857f368cb5ba9a9832fe9
IMPLEMENTATION PUSH / REMOTE PARITY: PASS
STAGING PROJECT: bwhvfjuwixgwduoeqaya / VERIFIED
PRODUCTION EXCLUDED: PASS
MIGRATION BEFORE: 152/152
MIGRATION APPLIED: 20260921001000 ONLY
MIGRATION AFTER: 153/153
REPEAT DRY-RUN: EMPTY
STAGING DB LINT: PASS / EXISTING WARNINGS ONLY
PLAN / PRICE CONTRACT: PASS
CAPACITY RESOLVER: PASS
READ DETERMINISM: PASS
READS CAUSE WRITES: NO
ROLE / ACL / RLS: PASS
BEFORE / AFTER BUSINESS FINGERPRINTS: IDENTICAL
AT + PRO: LOCKED
APP DEPLOYMENT: NO
PRODUCTION CHANGED: NO
STATUS: PHASE 7C.2B STAGING BACKEND LOCK
```

## AGENTS-Abschlussformat

```text
- Aufgabe: Phase 7C.2B Commit, Push und read-only Staging-Gate
- Build: Ja
- Migration: Auf Staging angewendet (nur 20260921001000)
- Flow-Test: Ja, read-only Capacity-Resolver gegen vorhandene Staging-Daten
- RLS/Security: Ja
- Alte Logik geprüft: Ja
- Report: docs/reports/2026-09-21_PHASE_7C_2B_CAPACITY_STAGING_GATE_REPORT.md
- Prüf-ZIP: exports/2026-09-21_PHASE_7C_2B_CAPACITY_STAGING_GATE.zip
- Offene Risiken: produktives Enforcement, Owner-UI, Warnungen und Stripe bleiben Folgephasen
- Status: LOCK
```
