# WUXUAI Bonus V1 Final Staging Gate

Datum: 2026-08-24  
Branch: `codex/v1-canonical-recovery`  
Basis: `919141181223aa414ef004a09aa3f02637f2b7fd`  
Staging: `wuxuai-bonus-staging` (`bwhv...qaya`)

## Ursache

Die einzige offene Migration `20260824001000_v1_referral_owner_duration_split.sql`
wurde nach erfolgreichem Dry Run auf Staging angewendet. Die Referral-Kernlogik
ist technisch korrekt, das Final Gate ist jedoch durch zwei reproduzierbare
Integrationsfehler blockiert:

1. `update_referral_bonus_settings` ruft `write_audit_event` mit dem Actor-Typ
   `restaurant_user` auf. Der aktive Constraint `audit_log_actor_type_check`
   erlaubt nur `admin`, `staff`, `customer` und `system`. Der Owner-RPC endet
   deshalb mit PostgreSQL `23514`; die Einstellung kann über den regulären
   Anwendungsweg nicht gespeichert werden.
2. `get_bonus_boost_kpis` summiert Zusatzpunkte nur aus Auditzeilen mit
   `action = 'public_bonus_points_collected'`. Die aktuelle gemeinsame
   Punkte-Engine schreibt `event_type = 'POINTS_ADDED'` und
   `action = 'points_added'`. Im Live-Smoke war die Empfehlung korrekt
   qualifiziert (`successful_referrals = 1`), aber `boost_extra_points = 0`
   trotz nachgewiesener Buchung von 20 Basispunkten auf 40 Punkte.

## Migration

- Dry Run: PASS; ausschließlich `20260824001000` geplant.
- Destruktive oder fachfremde DDL: keine erkannt.
- Anwendung auf Staging: erfolgreich.
- Lokale/Remote-Historie: vollständig synchron bis `20260824001000`.
- DB-Linter nach Anwendung: 0 Fehler.
- Production: nicht berührt.

## Staging-E2E

Die Prüfung verwendete zwei isolierte temporäre Owner-Tenants. Alle
Restaurant-, Kunden-, Referral-, Punkte-, Audit- und Auth-Testdaten wurden
anschließend entfernt. Nullkontrolle: 0 temporäre Restaurants, 0 temporäre
Auth-User. Tokens, PINs und Schlüssel wurden nicht in diesen Report übernommen.

Bestanden:

- Default 14 Tage.
- 7 Tage: Referrer 168 Stunden, Freund 84 Stunden.
- 14 Tage: Referrer 14 Tage, Freund 7 Tage.
- 28 Tage: Referrer 28 Tage, Freund 14 Tage.
- 21 Tage: Referrer 21 Tage, Freund exakt 252 Stunden.
- Referrer 100 Prozent und Freund 50 Prozent ohne Rundungsfehler.
- Stacking 5 + 14 = 19 Tage bei maximal 2x.
- Zwei parallele Qualifikationen: 10 + 14 + 14 = 38 Tage ohne verlorenes Update.
- Wiederholung derselben Qualifikation: keine zweite Verlaengerung und keine
  doppelten Grants.
- Freund wird Referrer: 7 + 14 = 21 Tage; neuer Freund erhaelt 7 Tage.
- Konfigurationswechsel: bestehende 5 Tage bleiben, neue 28 Tage ergeben 33;
  neuer Freund erhaelt 14 Tage.
- Punkteberechnung: 20 Basispunkte, Multiplikator 2, Ergebnis 40; nach Ablauf
  wieder 20 Punkte.
- Audit der Punktebuchung enthaelt `base_points = 20`,
  `boost_multiplier = 2`, `final_points = 40`.
- Customer-Home-Kontext liefert die richtige Beguenstigtenrolle und Laufzeit.
- Owner B und anon sehen keine Boost-Daten von Restaurant A; Owner A sieht die
  eigenen Daten. Restaurant B erhielt keine Booster aus Restaurant A.

Fehlgeschlagen:

- Owner-Konfiguration 7/14/28/eigener Wert ueber den regulaeren RPC: FAIL
  wegen `audit_log_actor_type_check` (`23514`). Die Laufzeitlogik wurde danach
  nur fuer die restliche Verifikation ueber einen isolierten Owner-Direktupdate
  im Testtenant gesetzt.
- Owner-Reporting Zusatzpunkte: FAIL; beobachtet wurden eine erfolgreiche
  Empfehlung und 0 Zusatzpunkte statt mindestens 20.

## Regressionen

Die geschuetzten Auth-, Redemption-, Geocoding-, Mobile- und Staff-Aenderungen
wurden nicht veraendert. Ihre statischen und automatisierten Regressionen sind
Teil der vollstaendigen Testsuite. Ein echter manueller Pilot-E2E ist wegen der
beiden Staging-Blocker noch nicht freigegeben.

## Lokale Laufzeit

Docker ist auf diesem Rechner nicht installiert. Clean-DB- und Upgrade-Tests
sind deshalb nicht fehlgeschlagen, sondern durch die lokale Docker-Laufzeit
blockiert. Kompensation: erfolgreicher Staging-Dry-Run, Staging-Anwendung,
History-Sync, DB-Linter 0 und isolierte funktionale Staging-Smokes.

## Risiken und naechste Aktion

Eine separate additive Reparatur muss den Audit-Actor des Owner-RPC an den
kanonischen Constraint anpassen und die Bonus-KPI auf die aktuelle Auditquelle
umstellen. Danach sind Migration-Dry-Run, Staging-Anwendung, Owner-RPC,
Reporting und die vollstaendige Regression erneut auszufuehren. Keine
Production-Aktion vor diesem Re-Test.

Status: **NOT READY**

## Finale Ergebnismatrix

```text
STAGING MIGRATION DRY RUN:
PASS

20260824001000 APPLIED:
YES

LOCAL/REMOTE MIGRATION HISTORY:
PASS

DB LINTER ERRORS:
0

OWNER 7 DAYS:
FAIL

OWNER 14 DAYS:
FAIL

OWNER 28 DAYS:
FAIL

OWNER CUSTOM:
FAIL

REFERRER 100%:
PASS

FRIEND 50%:
PASS

STACKING:
PASS

PARALLEL STACKING:
PASS

IDEMPOTENCY:
PASS

FRIEND BECOMES REFERRER:
PASS

OWNER CONFIG CHANGE:
FAIL

2X POINT CALCULATION:
PASS

MAX MULTIPLIER:
2X

RESTAURANT ISOLATION:
PASS

RLS:
PASS

CUSTOMER HOME:
PASS

OWNER REPORTING:
FAIL

CUSTOMER AUTH REGRESSION:
PASS

REDEMPTION REGRESSION:
PASS

GEOLOCATION REGRESSION:
PASS

CUSTOMER MOBILE REGRESSION:
PASS

CLEAN DB:
BLOCKED BY LOCAL DOCKER RUNTIME

UPGRADE:
BLOCKED BY LOCAL DOCKER RUNTIME

TESTS:
797/797 PASS

TYPECHECK:
PASS

LINT:
PASS (0 Fehler, 8 bestehende Warnungen)

BUILD:
PASS

SECRET SCAN:
PASS

AUTHORITATIVE RECOVERY COMPLETE:
NO

READY FOR MANUAL PILOT E2E:
NO

PRODUCTION:
LOCKED

STRIPE:
DEFERRED
```
