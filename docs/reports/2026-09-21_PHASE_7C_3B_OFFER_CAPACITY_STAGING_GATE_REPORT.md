# Phase 7C.3B – Offer Capacity Enforcement Staging-Gate

Datum: 2026-09-21
Branch: `codex/v1-release-integration`
Base-HEAD/Remote: `78c031a9ca0bd68668e6bcc7d31b57ead6d438af`
Implementierungscommit: `277a2528f60db0a2931b84512a18f0bbb3afc95b`
Evidence Commit: dieser enge Evidenzcommit; exakter Hash im finalen Handoff
Staging-Projekt: `bwhvfjuwixgwduoeqaya` (`wuxuai-bonus-staging`)
Status: **PHASE 7C.3B STAGING BACKEND LOCK**

## Ursache und Scope

Phase 7C.3 ersetzt die historische Angebotslimit-Autoritaet durch den zentralen
Capacity-Vertrag aus Phase 7C.2 und erzwingt freie Angebotskapazitaet
transaktional beim Uebergang in den kapazitaetsrelevanten Zustand. Phase 7C.3B
hat den lokal vollstaendig geprueften Stand eng committed und gepusht,
ausschliesslich Migration 154 auf das verifizierte Staging-Projekt angewendet
und den resultierenden Backend-Vertrag ohne Angebots- oder Testdatenmutation
physisch read-only geprueft.

Es gab kein App-Deployment, keinen Production- oder Stripe-Zugriff und keine
Country-, Grant-, TEST_ONLY-, Add-on-, Subscription-, Restaurant-, Kunden-
oder Angebotsmutation.

## Baseline und lokaler Abschluss

- Branch, lokaler HEAD und Remote standen zu Beginn exakt auf
  `78c031a9ca0bd68668e6bcc7d31b57ead6d438af`; ahead/behind war 0/0.
- Migration 153 blieb bytegleich mit SHA-256
  `df2c79aa20abd3555cc6002b0a7d857259f9bc9b1b05056bfc74b59272a5e0b9`.
- Migration 154 besitzt SHA-256
  `8b5e713771c000a2a41f4be3119d85c90a578f20a00cb559c10337342a185acf`.
- Secret Scan, `git diff --check` und `git diff --cached --check`: PASS.
- Implementierungscommit:
  `277a2528f60db0a2931b84512a18f0bbb3afc95b`.
- Implementierungscommit und Remote-HEAD waren nach Push exakt gleich.

| Lokales Gate | Ergebnis |
| --- | --- |
| Focused/Security Tests | 68/68 PASS |
| Fresh-Replay bis Migration 154 | PASS |
| Upgrade 153 auf 154 | PASS |
| Repeat/Idempotenz | PASS |
| Parallelitaet 5/10/15/20 | 96 Versuche; exakt 5/10/15/20 Erfolge |
| Multirow-Rollback | PASS |
| Tenant-Isolation | PASS |
| Full Tests | 1898/1898 PASS |
| Typecheck | PASS |
| Lint | PASS; 0 Fehler, 8 bekannte Warnungen ausserhalb des Scopes |
| Build | PASS; nur bekannte Chunk-Hinweiswarnung |

Der lokale Supabase-Teststack wurde nach den Gates kontrolliert gestoppt. Der
fremde Container `welcome-to-docker` blieb unveraendert.

## Staging-Provenienz und Preflight

- Supabase CLI: repositorylokal, Version `2.116.0`.
- Organisation: `hpvrtjwzxnbydibwyjrk`.
- Verknuepftes Projekt: `bwhvfjuwixgwduoeqaya`,
  `wuxuai-bonus-staging`, `ACTIVE_HEALTHY`, Region `eu-west-1`.
- Production ist `fuqhljgesclipzduhykl`, nicht verknuepft und wurde nicht
  angesprochen.
- Remote vor Anwendung: 153/153; letzte Migration `20260921001000`.
- Pending: ausschliesslich
  `20260921002000_offer_capacity_enforcement.sql`.
- Pre-Dry-Run plante genau Migration 154, keine Seeds und keine Rollen.
- Der erste Pre-Dry-Run erhielt einen temporaeren CLI-Login-Fehler
  `SQLSTATE 28P01`. Der isolierte Wiederholungsaufruf initialisierte die Rolle
  neu und bestand; vor dem erfolgreichen Dry-Run wurde nichts angewendet.
- AT und alle vorhandenen PRO-Country-Policies: `LOCKED`.
- Grants: 0 gesamt, 0 aktiv, 0 TEST_ONLY.
- Restaurant-Capacity-Add-on-Zeilen und effektive Einheiten: 0.
- 16 Restaurants: 16 BASIC, 0 effektive PRO.
- 18 gespeicherte Angebote, davon 4 kapazitaetsrelevant und 0 zukuenftig
  geplante kapazitaetsrelevante Angebote zum festen Snapshotzeitpunkt.

## Migration 154

- Angewendet wurde ausschliesslich
  `20260921002000_offer_capacity_enforcement.sql`.
- Seeds: keine.
- Rollenpakete: keine.
- Manuelle SQL-Nachkorrektur: keine.
- Remote danach: 154/154; Migration 154 exakt einmal vorhanden.
- Der isolierte Repeat-Dry-Run ist leer und meldet die Remote-Datenbank als
  aktuell.
- Ein parallel gestarteter erster Repeat-Dry-Run erhielt denselben temporaeren
  CLI-Login-Fehler; Historie, Lint und Snapshot liefen dabei read-only weiter.
  Der anschliessende isolierte Repeat-Dry-Run bestand.
- DB-Lint: Exit 0. Es bestehen bekannte historische Warnungen; keine betrifft
  `validate_restaurant_offer_row` oder `get_restaurant_capacity`.

## Physischer Backend-Vertrag auf Staging

### Limits und zentrale Autoritaet

| Vertrag | Monatspreis Minor | Angebotslimit | Kundenlimit |
| --- | ---: | ---: | ---: |
| BASIC | 5900 EUR exkl. USt. | 5 | 3.000 |
| PRO | 14900 EUR exkl. USt. | 15 | 15.000 |

- Offer Add-on: 1900 EUR exkl. USt., +5 Angebote je aktiver Einheit.
- Customer Add-on: 2900 EUR exkl. USt., +5.000 Kunden je aktiver Einheit.
- `validate_restaurant_offer_row()` verwendet ausschliesslich
  `resolve_restaurant_capacity_internal()` als Limitautoritaet.
- Eine UI-Auswahl oder historische Override-Zeile erzeugt keine Kapazitaet.
- Inaktive, abgelaufene, widerrufene oder fehlgeschlagene Add-ons werden vom
  zentralen Resolver nicht als wirksame Einheiten gezaehlt.

### Trigger, Rollen und RLS

- Genau ein aktiver Trigger bindet die Validatorfunktion:
  `validate_restaurant_offer_row_trigger`, BEFORE INSERT OR UPDATE, FOR EACH
  ROW auf `restaurant_offers`.
- Die Tabelle `restaurant_offers` behaelt RLS aktiviert.
- Der Validator ist `SECURITY DEFINER`, besitzt einen festen
  `search_path = pg_catalog, public, pg_temp` und ist fuer `public`, `anon`,
  `authenticated` und `service_role` nicht direkt ausfuehrbar.
- Der Trigger gilt unabhaengig vom SQL-Schreibpfad; eine direkte DML-Umgehung
  des Capacity-Guards wurde nicht gefunden.
- Slotverbrauchende Uebergaenge werden per tenantbezogenem
  `pg_advisory_xact_lock` serialisiert.
- Der stabile Fehlercode ist `OFFER_CAPACITY_REACHED`.
- `get_restaurant_capacity(uuid)` ist `SECURITY DEFINER`, besitzt denselben
  festen `search_path`, autorisiert nur Restaurant-Admin oder Platform-Admin
  und ist ausschliesslich fuer `authenticated` direkt ausfuehrbar.
- Der Read-RPC meldet `write_enforcement_active = true`; der interne Resolver
  bleibt fuer Browserrollen nicht direkt ausfuehrbar.

### Zaehlung und Bestandsschutz

- Kapazitaetsrelevant sind `PUBLISHED`, aktiv und nach Serverzeit noch nicht
  abgelaufen. `valid_from` schraenkt die Zaehlung nicht ein; geplante bereits
  veroeffentlichte Angebote reservieren sofort einen Slot.
- Nur ein Uebergang aus dem nicht zaehlenden in den zaehlenden Zustand verlangt
  freie Kapazitaet.
- Bereits zaehlende Angebote bleiben im Over-Limit-Zustand editierbar.
- Bestehende Over-Limit-Daten werden nicht geloescht; Migration 154 enthaelt
  keine Business-DML.
- Zwei Resolverauswertungen mit demselben festen Zeitpunkt lieferten denselben
  Hash `0591d7980212d15121d236fad1edd5f7`.

## Vorher-/Nachher-Fingerprints

Alle folgenden Zeilenanzahlen und kanonisch sortierten MD5-Fingerprints waren
vor und nach Migration sowie nach den read-only Vertragspruefungen identisch:

| Relation | Zeilen | MD5 |
| --- | ---: | --- |
| `country_launch_policy` | 6 | `8c7eb0028aca304b141b646c27c2a4c2` |
| `commercial_plan_release_policy` | 6 | `8d22ec520109433e465b83652f8510f9` |
| `commercial_pro_access_grants` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `commercial_pro_access_audit` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `branch_subscriptions` | 16 | `a691fd4b2668da9cdc9705a90ce3d5f5` |
| `branch_entitlement_overrides` | 1 | `b6759ba4856863fea0ad0921df16ca7d` |
| `commercial_capacity_plan_versions` | 2 | `0e6474786af637c9a05414e462d347e0` |
| `commercial_capacity_addon_versions` | 2 | `b9da9ecacf84e4d8b792d3b4882504ce` |
| `restaurant_capacity_addon_entitlements` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `restaurants` | 16 | `6019de8e58cf9dc50c04873b4162913b` |
| `restaurant_offers` | 18 | `172eb4cec3a12d6aa66e89694ab73176` |
| `customers` | 25 | `05df6298d538b20e129c2a56bd7d8452` |
| `points_transactions` | 22 | `4a5fc5ad5371581cad21bd2a125b3aa0` |
| `redemption_activity_journal` | 8 | `8fc00a30ca4f466ca4ba9140c3f07125` |

Damit sind reale Angebotsmutationen, geloeschte Over-Limit-Daten,
unbeabsichtigte Grants und Add-on-Einheiten jeweils 0. AT + PRO bleibt LOCKED.

## Nicht geaendert

- kein App-Deployment;
- keine Angebots-, Restaurant-, Kunden-, Subscription- oder Billingdaten;
- keine Country Policy, kein PRO-Grant und keine TEST_ONLY-Markierung;
- keine Add-on-Einheit;
- keine Migration ausser 154;
- keine Aenderung an Migration 153;
- kein Stripe- oder Production-Zugriff;
- kein Customer-Capacity-Enforcement, Warnsystem oder Checkout;
- kein Merge nach `main`, Rebase oder Force-Push.

## Abschlussmatrix

```text
BRANCH: codex/v1-release-integration
BASE HEAD: 78c031a9ca0bd68668e6bcc7d31b57ead6d438af
IMPLEMENTATION COMMIT: 277a2528f60db0a2931b84512a18f0bbb3afc95b
EVIDENCE COMMIT: dieser enge Evidenzcommit
REMOTE PARITY AFTER IMPLEMENTATION PUSH: PASS
MIGRATION 153: PRESENT / UNCHANGED
MIGRATION 154: APPLIED TO VERIFIED STAGING ONLY
PRE-MIGRATION HISTORY: 153/153
POST-MIGRATION HISTORY: 154/154
REPEAT DRY RUN: EMPTY
DB LINT: PASS / EXISTING WARNINGS ONLY
BASIC OFFER LIMIT: 5
PRO OFFER LIMIT: 15
OFFER ADD-ON UNIT: +5
CENTRAL RESOLVER: PASS
RLS/TENANT ISOLATION: PASS
DIRECT DML BYPASS: NO
EXISTING DATA PRESERVED: YES
OVER-LIMIT DATA DELETED: NO
COUNTRY GATE: PASS
AT + PRO: LOCKED
REAL OFFER MUTATIONS: 0
GRANTS CREATED: 0
ADD-ON UNITS CREATED: 0
BEFORE/AFTER FINGERPRINTS: IDENTICAL
APP DEPLOYMENT: NO
STRIPE CHANGED: NO
PRODUCTION CHANGED: NO
REAL DATA CHANGED: NO
STATUS: PHASE 7C.3B STAGING BACKEND LOCK
```

## AGENTS-Abschlussformat

```text
- Aufgabe: Phase 7C.3B Commit, Push und read-only Staging-Gate
- Build: Ja
- Migration: Auf Staging angewendet (nur 20260921002000)
- Flow-Test: Ja, read-only Backend-Vertrag und vorhandene Staging-Bestaende
- RLS/Security: Ja
- Alte Logik geprüft: Ja
- Report: docs/reports/2026-09-21_PHASE_7C_3B_OFFER_CAPACITY_STAGING_GATE_REPORT.md
- Prüf-ZIP: exports/2026-09-21_PHASE_7C_3B_OFFER_CAPACITY_STAGING_GATE.zip
- Offene Risiken: Customer-Capacity, Warnsystem, Owner-Folge-UI und Stripe bleiben Folgephasen
- Status: LOCK
```
