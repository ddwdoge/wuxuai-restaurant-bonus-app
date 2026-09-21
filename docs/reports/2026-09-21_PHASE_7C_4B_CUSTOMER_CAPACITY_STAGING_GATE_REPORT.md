# WUXUAI BONUS – Phase 7C.4B Customer-Capacity Staging-Gate

Datum: 2026-09-21
Branch: `codex/v1-release-integration`
Base-HEAD: `31fa1574477a45b54b4513bda792829d3a6e0497`
Implementierungscommit: `013b843265a8269a62e55a23d5bc44025e36b8b5`
Status: **PHASE 7C.4B CUSTOMER CAPACITY STAGING BACKEND LOCK**

## Ursache und Ziel

Phase 7C.4 stellte das serverseitige Customer-Capacity-Enforcement lokal
fertig. Phase 7C.4B sollte diesen exakt geprueften Stand eng committen,
pushen, ausschliesslich als Migration 155 auf das eindeutig verifizierte
Staging-Projekt anwenden und danach ohne Kundenaktivitaet read-only pruefen.

## Provenienz und Staging-Identitaet

- Lokaler und Remote-Base-HEAD vor dem Commit:
  `31fa1574477a45b54b4513bda792829d3a6e0497`, Paritaet 0/0.
- Implementierungscommit:
  `013b843265a8269a62e55a23d5bc44025e36b8b5`.
- Branch und Pushziel: `codex/v1-release-integration`.
- Supabase-Projekt: `wuxuai-bonus-staging`.
- Projekt-ID: `bwhvfjuwixgwduoeqaya`.
- Production-Projekt `fuqhljgesclipzduhykl` war nicht verlinkt und wurde
  weder abgefragt noch veraendert.
- Vor Migration: Remote-Historie 154/154; Dry-Run zeigte ausschliesslich
  `20260921003000_customer_capacity_enforcement.sql`.
- Nach Migration: Remote-Historie 155/155; Repeat-Dry-Run leer.
- Migration 153 und 154 blieben bytegleich zu ihren erwarteten SHA-256-Werten.

## Migration und installierter Vertrag

- Exakt eine neue Migration wurde angewendet: Migration 155.
- Remote-DB-Lint: PASS, keine Ergebnisse.
- Installiert und aktiv sind:
  `list_restaurant_active_customer_capacity_keys_internal`,
  `resolve_restaurant_capacity_internal`,
  `enforce_customer_capacity_activity` und `get_restaurant_capacity`.
- Beide AFTER-Trigger sind aktiviert: Punkteaktivitaet auf
  `points_transactions` und Einloesungsaktivitaet auf
  `redemption_activity_journal`.
- Alle vier Funktionen sind `SECURITY DEFINER` mit festem Search Path
  `pg_catalog, public, pg_temp`.
- Interne Funktionen sind fuer `anon`, `authenticated` und `service_role`
  nicht direkt ausfuehrbar. Der privacy-minimale Owner-Read ist nur fuer
  `authenticated` und mit serverseitiger Tenant-Autorisierung erreichbar.
- RLS bleibt auf beiden autoritativen Ledgern aktiv. Browserrollen besitzen
  keine direkte INSERT-Berechtigung.
- Stable Error: `CUSTOMER_CAPACITY_REACHED`.

## Founder-Vertrag – physisch read-only bestaetigt

- Identitaet: `customer_account_memberships.account_id`, mit
  `customer_id`-Fallback.
- Zaehlgrain: eine eindeutige Identitaet pro Restaurant.
- Fenster: `[as_of - 365 Tage, as_of)` fuer Punkte und Redemption-Journal.
- BASIC-Limit: 3.000.
- PRO-Limit: 15.000.
- Customer-Add-on-Einheit: +5.000.
- Limit- und Usage-Autoritaet: zentraler Capacity-Resolver.
- Enforcement-Punkt: erste qualifizierende Aktivitaet einer bisher nicht
  aktiven Identitaet.
- Bestehende aktive Identitaeten werden nicht pauschal blockiert.
- Migration und Trigger enthalten keine Kunden-, Membership-, Punkte- oder
  Redemption-Loeschung.
- Owner-Capacity-Read enthaelt keine E-Mail, Telefonnummer, Auth-Metadaten
  oder Customer-ID.

## Staging-Zustand

- Restaurants: 16.
- Aktive Kundenidentitaeten gesamt: 9.
- Hoechste Nutzung eines Restaurants: 8.
- Over-Limit-Restaurants: 0.
- Customer-Add-on-Entitlements: 0.
- Commercial-PRO-Grants: 0.
- AT-PRO-Release-State: `LOCKED`.
- TEST_ONLY-Tenants: 2, unveraendert.
- Zwei Resolver-Lesevorgaenge mit identischem Serverzeitanker lieferten je
  Lauf denselben Hash.

## Vorher-/Nachher-Fingerprints

Alle folgenden Relationen hatten vor und nach Migration 155 identische
Zeilenanzahl und identischen kanonischen Zeilenhash:

- `customers`: 25
- `customer_accounts`: 17
- `customer_account_memberships`: 22
- `restaurant_members`: 18
- `points_transactions`: 22
- `redemption_activity_journal`: 8
- `gift_redemption_presentations`: 7
- `kassa_redemption_workflows`: 8
- `points_redemption_presentations`: 2
- `reward_redemption_events`: 2
- `branch_subscriptions`: 16
- `commercial_plan_release_policy`: 6
- `country_launch_policy`: 6
- `platform_test_tenant_registry`: 2
- `audit_log`: 3.315
- `coupon_redemptions`, `customer_reward_redemption_attempts`,
  `redemption_activation_attempts`, `redemption_codes`,
  `reward_redemption_codes`, `restaurant_capacity_addon_entitlements` und
  `commercial_pro_access_grants`: jeweils 0

Damit gilt:

- neue qualifizierende Kundenaktivitaeten: 0
- neue Kunden: 0
- neue Memberships: 0
- neue Punktebuchungen: 0
- neue Redemption-Schreibvorgaenge: 0
- neue Grants: 0
- neue Add-on-Einheiten: 0
- neue Capacity-Blockereignisse beziehungsweise Auditzeilen: 0
- unerwartete Datenloeschungen: 0

## Lokale und technische Gates

- Focused-/Security-Tests: PASS, 65/65.
- Customer-Capacity-Tests: PASS, 8/8 innerhalb der Focused-Matrix.
- SQL-Grenzwert-, Tenant-, Rollen- und Bypass-Matrix: PASS.
- Parallelitaet: 96 unterschiedliche Erstaktivierungen ergaben exakt 5
  Erfolge; 24 parallele Aktivitaeten derselben Identitaet blieben erlaubt und
  zaehlten einmal. Cleanup-Fingerprint: PASS.
- Fresh-Replay 155/155: PASS.
- Historischer Replay 154 und Upgrade 154→155: PASS.
- Repeat-Lauf 1 und 2: PASS.
- Full Tests: PASS, 1.906/1.906.
- Typecheck: PASS.
- Lint: PASS, 0 Fehler; 8 bereits bestehende Warnungen in unveraenderten
  Dateien.
- Build: PASS; nur der bekannte Vite-Chunkgroessenhinweis.
- Secret Scan und Diff Checks: PASS.

## Nicht geaendert

- Kein App-Deployment.
- Kein Production- oder Stripe-Zugriff.
- Kein Country Release, Grant, Add-on oder TEST_ONLY-Marker.
- Keine reale oder synthetische Kundenaktivitaet auf Staging.
- Keine Registrierung, Membership, Punktebuchung oder Einloesung.
- Keine bestehende Migration geaendert und keine weitere Migration angewendet.
- Keine Owner-UI, Warnung, Infrastructure-Monitoring- oder Billingfunktion.

## Risiken und Status

Der Backend-Vertrag ist lokal und auf Staging nachgewiesen. Ein positives
Staging-Enforcement durch echte oder synthetische Kundenaktivitaet war
ausdruecklich nicht freigegeben; dafuer bleibt der lokale Parallelitaets- und
Grenzwertnachweis massgeblich. Owner-UI, Warnungen, Monitoring und Stripe sind
separate Folgephasen. Daher kein FINAL LOCK des vollstaendigen
Capacity-Systems.

Status: **PHASE 7C.4B CUSTOMER CAPACITY STAGING BACKEND LOCK**
