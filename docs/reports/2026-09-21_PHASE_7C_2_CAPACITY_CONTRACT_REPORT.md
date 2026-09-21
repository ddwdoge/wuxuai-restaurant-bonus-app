# Phase 7C.2 – Founder Capacity Contract und zentrale Entitlement-Schicht

Datum: 2026-09-21
Branch: `codex/v1-release-integration`
Ausgangs-HEAD/Remote: `f28a15495ffbbe9788513eba6c84a74f4e743080`
Status: **PHASE 7C.2 LOCAL CODE LOCK**

## Ursache

Der bisherige Commercial-Katalog enthielt BASIC mit 59 EUR und 5 Angeboten,
PRO jedoch historisch mit 99 EUR und `NULL = unlimited`. Eine zentrale,
versionierte und endliche Capacity-Schicht fuer Angebote und aktive Kunden
existierte nicht. Die Founder-Entscheidungen aus Phase 7C.1 definieren dagegen
BASIC 5/3.000, PRO 15/15.000 sowie endliche Offer- und Customer-Add-ons.

Der gefundene 99-EUR-Wert ist ausschließlich der bereits dokumentierte
historische Katalogwert. Stripe ist nicht integriert; eine belastbare reale
99-EUR-Billing- oder Vertragsquelle wurde nicht gefunden. Das Stop-Gate wurde
daher nicht ausgeloest. Der historische Datensatz blieb unveraendert.

## Geänderte Dateien

- `docs/V1_CURRENT_CANONICAL_PRODUCT_CONTRACT.md`
- `docs/19_CHANGELOG.md`
- `docs/reports/2026-09-21_PHASE_7C_1_PRO_BASIC_CAPACITY_AUDIT_REPORT.md`
- `supabase/migrations/20260921001000_central_capacity_entitlements.sql`
- `tests/phase-7c2-capacity-contract.test.mjs`
- `tests/phase-7c2-capacity-contract.local.sql`
- `tests/phase-7c2-capacity-concurrency.local.mjs`
- dieser Bericht

## Was wurde geändert

### Kanonischer Vertrag

Die Founder-Entscheidungen wurden vor der Implementierung im bestehenden
Master-Contract festgehalten. Der Phase-7C.1-Auditbericht dokumentiert ihren
bestaetigten Status. Es wurde keine zweite Masterdatei erzeugt.

### Additive Migration 153

Die Migration fuegt hinzu:

- versionierte BASIC-/PRO-Planregeln mit Minor Units, EUR, `EX_VAT`,
  Wirksamkeitsfenster und endlichen Basislimits;
- versionierte Offer-/Customer-Add-on-Regeln;
- append-only, revisionsbasierte Add-on-Entitlements mit Request-ID,
  Entitlement-Quelle, Lifecycle und Zeitfenstern;
- einen privaten zentralen Resolver sowie einen eng autorisierten,
  authentifizierten Read-RPC;
- partielle Indizes fuer qualifizierende Punktegutschriften und abgeschlossene
  Einloesungen.

Die Berechnung verwendet ausschließlich `bigint` und begrenzte positive
Einheiten. `NULL`, Infinity und Ersatz-Großwerte besitzen keine
Unlimited-Semantik. Der Resolver gibt Limits, Usage, Restkapazitaet,
Add-on-Einheiten und getrennte Over-Limit-Zustaende aus.

### Nutzungsvertrag

- Angebote: `PUBLISHED`, `is_active = true`, `valid_to > as_of`; damit zaehlen
  aktuelle und zukuenftig geplante veroeffentlichte Angebote, nicht jedoch
  Draft, deaktiviert, archiviert oder abgelaufen.
- Aktive Kunden: eindeutige Account-ID, mit restaurantbezogener Customer-ID als
  Legacy-Fallback, aus der Union gueltiger nicht aufgehobener Punktegutschriften
  und aktiver nicht stornierter Einloesungen im halboffenen Fenster
  `[as_of - 365 Tage, as_of)`.
- Testkunden, Testeinloesungen, Reversals, Cancellations, Registrierungen,
  Memberships, Logins, Seitenaufrufe und QR-Anzeigen zaehlen nicht.
- Plan-Autoritaet wird ausschließlich aus dem bestehenden v5-Commercial-
  Resolver uebernommen. AT + PRO bleibt LOCKED; alte Overrides erhalten keine
  Capacity-Autoritaet.

## Was wurde nicht geändert

- keine bestehende Migration;
- kein produktiver Offer-, Points-, Redemption-, Gift-, Registration- oder
  Login-Schreibflow;
- kein Platform-Capacity-Mutator;
- keine UI, keine Warnungsoberflaeche und kein Enforcement;
- keine bestehenden Subscription-, Override-, Pilot-, TEST_ONLY- oder
  Commercial-Control-Center-Daten;
- kein Stripe, keine Laenderfreigabe, kein PRO-Grant und keine
  TEST_ONLY-Markierung;
- kein Staging-, Deployment- oder Production-Vorgang;
- kein Commit, Push oder Staging.

## Lokale Testmatrix

| Gate | Ergebnis |
| --- | --- |
| Vollstaendiger Fresh-Replay | PASS, 153 Migrationen |
| Upgrade 152 → 153 | PASS in separater lokaler Testdatenbank |
| Repeat/Idempotenz | PASS; identische Plan-/Add-on- und Produktzaehler |
| SQL-Vertragsmatrix | PASS; alle Fixtures transaktional zurueckgerollt |
| BASIC 5/3.000 | PASS |
| PRO 15/15.000 und endliche Add-on-Formeln | PASS |
| Offer Add-on +5, ein/mehrere Units | PASS |
| Customer Add-on +5.000, ein/mehrere Units | PASS |
| Active/Cancelled/Past-Due/Expired/Chargeback/Revoked | PASS |
| negative/extrem hohe Einheiten | PASS, DB-Constraint blockiert |
| Planned/Draft/Expired Offer-Zaehlung | PASS |
| Earn/Reverse/Redemption/Cancellation/Test/365-Tage-Grenze | PASS |
| Mehrfachaktivitaet desselben Kunden | PASS, genau einmal |
| Owner-/Cross-Tenant-/Anonymous-Rechte | PASS |
| parallele Resolver-Aufrufe | PASS, 24 deterministische fail-closed Reads |
| Resolver-Reads verursachen Writes | NO; Vorher-/Nachher-Fingerprint identisch |
| Fokussierte statische Tests | 12/12 PASS |
| Full Tests | 1891/1891 PASS |
| Typecheck | PASS |
| Lint | PASS, 0 Fehler; 8 bekannte Warnungen außerhalb des Scopes |
| Build | PASS mit nicht geheimen lokalen Build-Platzhaltern |
| DB-Lint | PASS fuer neue Objekte; nur bekannte Bestandswarnungen |
| Secret Scan | PASS |
| `git diff --check` | PASS |

Der erste Build-Aufruf ohne lokale Vite-Variablen wurde korrekt vom bestehenden
Fail-Closed-Guard beendet. Der anschließende Build mit nicht geheimen lokalen
Platzhaltern war erfolgreich. Die erste Upgrade-Kopie scheiterte vor dem
Upgrade an Supabase-Owner-/Extension-Metadaten; die bereinigte, schemaeng
begrenzte Kopie bestand den echten 152→153-Lauf und wurde danach entfernt.

## Migrationsintegrität

Die drei bestehenden Phase-7B-Migrationen blieben bytegleich:

- `20260915001000`: `dce608d4773639506baac868f4879bb13f839e71f317c56bff57a35ac8a0fcba`
- `20260915002000`: `816369d51c871fa49d236a78d5893c077363bfbf1566fc15c589f9ffe12a05f2`
- `20260915003000`: `5ff37ab21bab8b3727587d9370dbd581c391d9260f661b7ca0ca860d6f00db91`

## Risiken und Folgephasen

- Phase 7C.2 ist absichtlich nur Read-/Datenvertrag. Produktives Enforcement
  fuer Offer-Writes und erstmalige Customer-Aktivitaeten folgt in 7C.3/7C.4.
- Warnungen, Prognosen, Owner-UI, E-Mail und Stripe bleiben spaetere Gates.
- DB-Lint meldet bekannte Bestandswarnungen, aber keine neue Warnung fuer den
  Capacity-Resolver.
- Ohne Staging-Migration und echten Staging-Flow ist kein FINAL LOCK zulaessig.

## Abschlussmatrix

```text
FOUNDER DECISIONS 1–8 RECORDED: PASS
MASTER CONTRACT UPDATED: PASS
REAL 99-EUR CONTRACT FOUND: NO
ADDITIVE MIGRATION: CREATED
EXISTING MIGRATIONS MODIFIED: NO
PLAN CATALOG VERSIONED: PASS
BASIC CAPACITY: PASS
PRO CAPACITY: PASS
OFFER ADD-ON CAPACITY: PASS
CUSTOMER ADD-ON CAPACITY: PASS
NULL UNLIMITED REMOVED FROM EFFECTIVE MODEL: PASS
ACTIVE CUSTOMER RESOLVER: PASS
OFFER USAGE RESOLVER: PASS
OVER-LIMIT RESOLVER: PASS
COUNTRY LOCK PRESERVED: PASS
ROLE/TENANT MATRIX: PASS
READS CAUSE WRITES: NO
FRESH/UPGRADE/REPEAT: PASS
FOCUSED TESTS: 12/12 PASS + SQL MATRIX PASS + 24 PARALLEL PASS
SECURITY CONTRACTS: PASS
FULL TESTS: 1891/1891 PASS
TYPECHECK: PASS
LINT: PASS (0 errors, 8 pre-existing warnings)
BUILD: PASS
SECRET SCAN: PASS
STAGING CHANGED: NO
STRIPE CHANGED: NO
PRODUCTION CHANGED: NO
AT + PRO: LOCKED
STATUS: PHASE 7C.2 LOCAL CODE LOCK
```

## AGENTS-Abschlussformat

```text
- Aufgabe: Phase 7C.2 Founder Capacity Contract und zentrale Read-Schicht
- Build: Ja
- Migration: Erstellt / nicht auf Staging angewendet
- Flow-Test: Ja, lokale SQL-/Resolver-Vertragsmatrix; kein Staging-Flow
- RLS/Security: Ja, lokal
- Alte Logik geprüft: Ja
- Report: docs/reports/2026-09-21_PHASE_7C_2_CAPACITY_CONTRACT_REPORT.md
- Prüf-ZIP: exports/2026-09-21_PHASE_7C_2_CAPACITY_CONTRACT.zip
- Offene Risiken: produktives Enforcement, UI/Warnungen, Stripe und Staging folgen separat
- Status: CODE LOCK
```
