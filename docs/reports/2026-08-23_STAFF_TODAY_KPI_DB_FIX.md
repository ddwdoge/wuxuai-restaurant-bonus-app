# Staff Today KPI DB Fix

Datum: 2026-08-23  
Branch: `codex/v1-release-finishing-sprint`  
Staging: `wuxuai-bonus-staging` (`bwhv…qaya`)

## Ursache

Die bestehende RPC `get_staff_daily_activity(uuid)` stammte aus dem alten
Staff-Modell. Sie gruppierte Punkte über `points_transactions.staff_member_id`,
während der aktuelle restaurantgesteuerte Punkteflow den authentifizierten
Mitarbeiter in `staff_user_id` protokolliert. Dadurch wurden echte Earn-Zeilen
nicht der alten Staff-Liste zugeordnet und `Bonuspunkte heute` blieb bei 0.

Zusätzlich verwendete die RPC `current_date` statt der Restaurant-Zeitzone und
zählte Einlösungen aus dem Legacy-Audit-Event `staff_reward_redeemed`. Der
aktuelle V1-Präsentationsflow finalisiert Punkte-, Willkommens- und
Geburtstagsbelohnungen dagegen im unveränderbaren
`redemption_activity_journal`.

## Datenvertrag

- Punktequelle: `points_transactions`, `type = 'earn'`, Summe positiver
  `points`.
- Einlösungsquelle: `redemption_activity_journal`, `status = 'ACTIVE'`,
  `finalized_at` im lokalen Restauranttag.
- Tenant: `restaurant_id = input_restaurant_id` und serverseitiger
  `is_restaurant_member`-Guard.
- Tagesgrenze: halb-offen von lokal 00:00 bis zum folgenden lokal 00:00 mit
  `restaurants.timezone_name`, Fallback `Europe/Vienna`.
- Testdaten: Kunden mit `is_test_customer = true` und Journaleinträge mit
  `is_test_event = true` werden ausgeschlossen.

## Änderungen

- Additiver Forward-Fix
  `20260823002000_staff_today_kpis_authoritative_sources.sql` ersetzt nur die
  Implementierung der bestehenden RPC. Signatur und Frontendvertrag bleiben
  erhalten.
- Erfolgreiche Punktebuchungen invalidieren die Staff-Tagesabfrage.
- Der bestehende Fehlerzustand bleibt vom fachlichen Wert 0 getrennt.
- Die Reporting-Migration wurde wegen einer lokalen Versionskollision ohne
  Inhaltsverlust von `20260823001000` auf `20260823001500` umnummeriert.
- Der erste Staging-Lauf reproduzierte einen Block durch den bestehenden
  Journal-Unveränderbarkeitstrigger. Der deterministische Backfill nutzt nun
  ausschließlich dessen transaktionslokalen Wartungspfad; historische
  Einlösungswerte und Status bleiben unverändert.

## Staging

- Reporting-Migration `20260823001500`: angewendet.
- KPI-Forward-Fix `20260823002000`: angewendet.
- Lokale/Remote-Migrationshistorie: synchron.
- Supabase DB Linter: 0 Fehler.
- Reporting-RPC und Snapshotspalten: durch erfolgreichen Migrationslauf
  vorhanden.

Ein authentifizierter Staff-Testaccount mit reproduzierbarer Punktebuchung und
finalisierter Testeinlösung stand in dieser Ausführung nicht zur Verfügung.
Darum wurden keine Zahlen erfunden; der direkte Vergleich `DB EXPECTED` gegen
`STAFF UI` bleibt ein manueller Staging-Gate.

## Prüfung

- Automatisierte Tests: 791/791 bestanden.
- Typecheck: bestanden.
- Lint: 0 Fehler, 8 bestehende Warnungen.
- Build: bestanden.
- `git diff --check`: bestanden.
- Tenant-, Zeitzonen-, Testevent-, Finalisierungs- und Fehlerzustandsregeln:
  automatisiert geprüft.

## Ergebnis

```text
ROOT CAUSE:
Legacy-RPC verband Earn-Zeilen über staff_member_id, obwohl der aktuelle Flow
staff_user_id schreibt; zusätzlich waren current_date und Legacy-Audit-Events
die falschen Tages- und Einlösungsquellen.

POINT BOOKING EXISTS IN DB:
NO LIVE TEST EXECUTED

POINT KPI QUERY:
PASS

BONUSPUNKTE HEUTE DB EXPECTED:
NOT VERIFIED

BONUSPUNKTE HEUTE UI:
NOT VERIFIED

REDEMPTION KPI QUERY:
PASS

EINLÖSUNGEN HEUTE DB EXPECTED:
NOT VERIFIED

EINLÖSUNGEN HEUTE UI:
NOT VERIFIED

RESTAURANT CONTEXT:
PASS

TIMEZONE:
PASS

TEST EVENTS:
PASS

REPORTING MIGRATION PRESENT:
YES

ERROR STATE:
PASS

REFRESH / CACHE INVALIDATION:
PASS

TENANT ISOLATION:
PASS

TESTS:
791/791 PASS

TYPECHECK:
PASS

LINT:
PASS (0 errors, 8 existing warnings)

BUILD:
PASS

STAGING VERIFIED:
NO

STAFF TODAY KPIS READY:
NO
```

## Offenes Risiko

Vor FINAL LOCK muss ein angemeldeter Staff-Smoke-Test auf Staging die Werte vor
und nach einer echten Test-Punktebuchung sowie einer finalisierten
Testeinlösung mit einer direkten DB-Auswertung vergleichen.
