# V1 Staging Migration Activation Report

Stand: 2026-08-15 (Europe/Vienna)

Branch: `codex/v1-release-finishing-sprint`  
Remote-Head: `c34c284461f602b985460e46bf239acc9ff112fa`  
Freigegebener Code-Commit: `c2228416f688f32deca5ae1de90e4cb2d46a1e03`

## Ergebnis

Die Forward-Fix-Migration `20260813001000_fix_legacy_rpc_lint_errors.sql`
wurde ausschließlich auf das verknüpfte Supabase-Staging-Projekt
`bwhvfjuwixgwduoeqaya` angewendet. Der vorherige Dry-Run plante genau diese
Migration. Der nachgelagerte Dry-Run ist leer; lokale und entfernte
Migrationshistorie sind mit 91 Versionen synchron.

Der Staging-DB-Linter meldet **0 Fehler**. Die erwarteten Registration-,
Redemption-, Punkte-/Geschenkpräsentations-, Birthday- und Notification-RPCs
sind im realen PostgREST-Schema vorhanden. RLS wurde mit zwei kurzlebigen,
anschließend gelöschten Testrollen gegen zwei Restaurants geprüft: Lesen blieb
auf den eigenen Tenant begrenzt, ein Cross-Tenant-PATCH blieb wirkungslos und
der fremde Owner-RPC wurde abgewiesen.

Die Staging-Datenbank wird trotzdem noch nicht als vollständig bereit
freigegeben. Der schreibende Redemption-Smoke wurde nicht komplett abgeschlossen:
Die Registrierung legte das Willkommensgeschenk vertragsgemäß zunächst mit
Status `locked` an. Das erste Testskript erwartete fälschlich sofort `active`
und brach deshalb vor der kontrollierten Freischaltung ab. Der Punkte-
Präsentationsstart und sein idempotenter Retry waren zu diesem Zeitpunkt bereits
erfolgreich und erzeugten den vorgesehenen unveränderbaren Journal-Snapshot.
Dieser Snapshot verhindert absichtlich die vollständige Löschung des
zugehörigen Testkunden.

Der verbleibende Datensatz ist als `is_test_customer = true` markiert, besitzt
Status `terminated`, keine aktiven Kundentokens, keine Customer-Rewards, keine
Präsentationszeilen und keine operativen Punktetransaktionen. Der bereits
geschriebene Journal-Snapshot bleibt unveränderbar und trägt jedoch
`is_test_event = false`, weil die Testkennzeichnung erst nach dem Start gesetzt
wurde. Dieser Staging-Testanker und die noch nicht vollständig wiederholten
Welcome-/Birthday-/Expiry-Smokes sind offene Freigabepunkte. Die
Journal-Integrität wurde nicht umgangen.

## Git Remote Sync

- Lokaler und Remote-Branch zeigen auf `c34c284461f602b985460e46bf239acc9ff112fa`.
- `c2228416f688f32deca5ae1de90e4cb2d46a1e03` ist direkter Vorgänger und enthält
  den freigegebenen Forward-Fix.
- Die im Auftrag angegebene Lang-SHA mit Suffix
  `...2177950fc3253c6e6291b3853` existiert nicht; die Kurz-SHA `c222841` und die
  Commit-Message stimmen mit der oben dokumentierten realen SHA überein.
- Working Tree war vor der Reporterstellung sauber.

## Migration

- Projekt: ausschließlich Staging `bwhvfjuwixgwduoeqaya`
- Dry-Run vor Anwendung: PASS, genau eine lokale Migration geplant
- Anwendung: PASS
- Dry-Run nach Anwendung: PASS, keine ausstehenden Migrationen
- Historie: 91 lokal / 91 remote
- Production-Migration: nicht ausgeführt

## Schema und RPCs

Im realen Staging-OpenAPI-Schema bestätigt:

- Registration: `register_restaurant_customer`, `register_referral_customer`,
  `register_campaign_customer`
- Legacy Redemption: `redeem_reward`, `redeem_reward_with_pin`,
  `redeem_reward_with_staff_session`
- Präsentationen: `start_customer_points_presentation`,
  `start_customer_gift_presentation`
- Birthday und Finalisierung: `issue_birthday_gifts`,
  `queue_birthday_gift_expiry_reminders`,
  `complete_gift_redemption_presentations`
- Notifications: `reserve_customer_transactional_emails`,
  `complete_customer_transactional_email`

Die zugehörigen Tabellen für Punkte-/Geschenkpräsentationen, E-Mail-
Zustellung und Reward-Notification-State sind vorhanden. Sensible Tabellen
antworten anonym mit `401`; die erlaubten öffentlichen Tabellen liefern ohne
passenden öffentlichen Kontext keine Tenantdaten.

## DB Linter

Ergebnis gegen den realen verknüpften Staging-Stand: **0 Fehler**.

Verbleibende Warnungen betreffen bestehende ungenutzte Parameter, einen
möglichen Funktionspfad ohne explizites `RETURN` sowie zu starke
Volatilitätsdeklarationen einzelner Bestandsfunktionen. Es wurden keine Regeln
deaktiviert und keine Warnungen unterdrückt.

## Registration Smoke

Ergebnis: **PASS**.

- Legal-Registrierung erzeugte genau einen restaurantgebundenen Testkunden.
- Die normalisierte Telefonnummer wurde gespeichert.
- Der zweite Registrierungsversuch wurde mit
  `CUSTOMER_ACCOUNT_EXISTS` blockiert.
- Audit enthielt Registrierung, Restaurantbeitritt, Legal-Akzeptanzen und
  `CUSTOMER_DUPLICATE_ACCOUNT_BLOCKED`.
- Der zweite, nicht journalgebundene Smoke-Kunde wurde vollständig entfernt.

## Redemption Smoke

Ergebnis: **FAIL / unvollständig**.

Bestätigt:

- Punkte-Präsentation startete serverseitig.
- Retry mit demselben Idempotency-Key erzeugte keine zweite Präsentation.
- Ein unveränderbarer Punkte-Journal-Snapshot wurde geschrieben.

Nicht abschließend live bestätigt:

- kontrollierte Aktivierung und Präsentation des zunächst `locked`
  Willkommensgeschenks
- Birthday-Gift-Präsentation
- Expiry-, Wrong-Customer- und Wrong-Restaurant-Fälle innerhalb desselben
  bereinigbaren Smoke-Laufs

Die statischen und lokalen Vertragstests für diese Fälle bleiben grün, ersetzen
aber nicht den fehlenden vollständigen Staging-Smoke.

## Cron

Ergebnis: **PASS auf Migrations- und Funktionsniveau**.

Die auf Staging registrierte Migration plant die drei V1-Jobs nach vorherigem
Unschedule desselben Jobnamens:

- Birthday Assignment täglich 01:30
- Birthday Reminder täglich 01:45
- Gift Presentation Finalization jede Minute

Alle drei Zielfunktionen sind im realen Staging-Schema vorhanden. Die Migration
wurde transaktional erfolgreich registriert; ein Fehler beim `cron.schedule`
hätte die Migration abgebrochen. Ein zusätzlicher direkter Export von
`cron.job` war lokal ohne Docker nicht verfügbar und wurde nicht durch einen
unsicheren Credential-Workaround ersetzt.

## RLS

Ergebnis: **PASS**.

- Owner A sah genau Restaurant A.
- Owner A konnte Restaurant B nicht ändern.
- Owner A konnte den tenantgebundenen Customer-RPC für Restaurant B nicht
  ausführen.
- Anonyme direkte Zugriffe auf Customers, Customer-Rewards, Präsentationen,
  Notification-State und E-Mail-Zustellung wurden abgewiesen.
- Temporäre Auth-User und Memberships wurden nach dem Test entfernt.

## App Regression

- Tests: **679/679 PASS**
- Typecheck: **PASS**
- ESLint: **PASS**, 0 Fehler
- Build: **PASS**
- `git diff --check`: **PASS** vor Reporterstellung

## Readiness-Report

`docs/reports/V1_FINAL_MIGRATION_PUSH_READINESS_REPORT.md` ist bereits im
Remote-Head `c34c284` enthalten. Der Text bildet jedoch den Stand vor der
Forward-Fix-Aktivierung ab und bezeichnet den Code noch als nicht pushbereit.
Er wurde deshalb nicht erneut oder zusätzlich committed. Dieser Bericht ist
die aktuelle Staging-Aktivierungsquelle.

## Abschlussstatus

```text
GIT REMOTE SYNC:
YES

STAGING DRY RUN:
PASS

STAGING MIGRATIONS APPLIED:
YES

LOCAL/REMOTE MIGRATION HISTORY SYNC:
YES

STAGING DB LINTER ERRORS:
0

REGISTRATION RPC SMOKE TEST:
PASS

REDEMPTION RPC SMOKE TEST:
FAIL

CRON:
PASS

RLS:
PASS

TESTS:
679/679 PASS

TYPECHECK:
PASS

LINT:
PASS

BUILD:
PASS

STAGING DATABASE READY:
NO

READY FOR REAL MANUAL E2E:
NO

PRODUCTION:
LOCKED

STRIPE:
DEFERRED
```

Nächster sicherer Schritt: Den verbleibenden Journal-Testanker vor dem nächsten
Smoke ausdrücklich als akzeptierte Staging-Testhistorie bestätigen. Danach
einen neuen, von Beginn an als Test markierten Customer verwenden und den
kompletten Welcome-/Birthday-/Expiry-/Cross-Customer-Smoke mit der korrekten
`locked -> active`-Freischaltung durchführen.
