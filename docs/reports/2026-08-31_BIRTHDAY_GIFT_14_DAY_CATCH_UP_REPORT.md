# WUXUAI Bonus P1 - Birthday Gift 14-Day Catch-up

Stand: 2026-08-31

Branch: `codex/v1-canonical-recovery`

## Ursache

Die zuletzt wirksame Birthday-Funktion aus Migration `20260809001000` wies
ein Geschenk ausschliesslich zu, wenn der lokale Geburtstag exakt
`local_today + 14` entsprach. Ein Kunde, der sich erst innerhalb der folgenden
14 Tage registrierte oder seine Restaurant-Membership aktivierte, konnte das
Fenster deshalb dauerhaft verpassen.

Die noch fruehere Migration vom 14.07. enthielt zwar bereits ein Fenster,
wurde aber spaeter zuerst durch den manuellen Draw und danach durch die
exakte automatische 14-Tage-Zuteilung ersetzt. Sie ist historische Evidenz,
nicht der aktive Vertrag.

## Geaenderte Dateien

- `supabase/migrations/20260831001000_birthday_gift_14_day_catch_up.sql`
- `tests/birthday-gift-14-day-catch-up.test.mjs`
- `docs/05_CUSTOMER_PORTAL.md`
- `docs/13_SMART_REWARD_ENGINE.md`
- `docs/17_CTO_ENTSCHEIDUNGEN.md`
- `docs/V1_CURRENT_CANONICAL_PRODUCT_CONTRACT.md`
- `docs/19_CHANGELOG.md`
- dieser Bericht

## Was wurde geaendert

- Ein interner `assign_birthday_gift_if_eligible(...)`-Helper ist die einzige
  Autoritaet fuer Eligibility, Pool-Auswahl, Jahres-Deduplizierung, Audit und
  Transaktions-E-Mail.
- Das inklusive Restaurant-Lokalzeitfenster reicht von heute bis heute plus
  14 Kalendertage.
- Der taegliche Birthday-Job verwendet denselben Helper fuer alle aktiven
  Restaurantkunden.
- Eine neue kanonische Customer-Account-Membership loest die Pruefung sofort
  nach dem Insert aus. Spaetere relevante Birthday-/Aktivstatus-Aenderungen
  verwenden denselben Helper, sofern die Account-Membership besteht.
- Ein zusaetzlicher Unique Index erzwingt genau eine Birthday-Zuteilung pro
  Customer, Restaurant und Geburtstagsjahr, unabhaengig von der Branch-Spalte.
- Das bestehende 29.-Februar-Verhalten ueber `v1_birthday_date(...)` bleibt
  erhalten; ein Jahreswechsel wird korrekt auf das naechste Kalenderjahr
  aufgeloest.

## Was wurde nicht geaendert

- keine Welcome-Gift-, Punkte-, Visit-, Redemption- oder Referral-Logik
- kein neuer Reward-Pool
- keine Customer-UI-Aenderung
- keine automatische Rueckbuchung oder Sperre
- keine RLS-Abschwaechung und kein Browser-Grant fuer den internen Helper
- kein Frontend-/Worker-Deployment, keine Production- oder Stripe-Aktion

## Sicherheit und Datenbank

- Assignment nur fuer aktive Customer-Membership und aktives Restaurant.
- Reward-Auswahl bleibt restaurant-/branchgebunden und verlangt
  `is_starter_reward = true`, `birthday_pool_enabled = true`, `active = true`.
- Advisory Lock, Existenzpruefung und Unique Index schuetzen parallele
  Cron-/Activation-Aufrufe.
- Interner Helper und Triggerfunktionen sind fuer `public`, `anon` und
  `authenticated` vollstaendig widerrufen.
- E-Mail verwendet die bestehende idempotente Queue mit der Assignment-ID als
  Event-Key; ein Versandfehler rollt die Geschenkzuteilung nicht zurueck.

## Verifikation

- Birthday-Fokustests plus bestehende Gift-/Mail-Regression: `34/34 PASS`
- Gesamttests: `1178/1178 PASS`
- Typecheck: PASS
- Lint: PASS, 0 Fehler / 7 vorbestehende Warnungen
- Build: PASS, 2067 Module
- `git diff --check`: PASS
- Secret Scan im geaenderten Umfang: PASS
- Development/Test-Ziel: `bwhvfjuwixgwduoeqaya` (`wuxuai-bonus-staging`)
- Preflight-History: nur `20260831001000` lokal offen
- Preflight-Dry-Run: genau
  `20260831001000_birthday_gift_14_day_catch_up.sql`, keine Seeds/Rollen
- Migration: am 2026-08-31 erfolgreich auf Development/Test angewendet
- Post-Migration-History: lokal/remote bis `20260831001000` synchron
- Post-Dry-Run: PASS, Remote-Datenbank aktuell, keine offenen Migrationen
- DB-Linter `--level error`: PASS, 0 Ergebnisse
- Funktionsrechte live: `anon` und `authenticated` koennen weder den
  internen Assignment-Helper noch den Birthday-Cron ausfuehren
- Gesamttests nach Anwendung: `1178/1178 PASS`

### Development/Test-Live-Gates

Die Live-Pruefungen wurden im Supabase SQL Editor gegen das verknuepfte
Development/Test-Projekt ausgefuehrt. Jede pruefende Anweisung endete nach
allen Assertions absichtlich mit `P0001` und wurde dadurch vollstaendig
zurueckgerollt.

- Geburtstag +14/+10/+4/+1/heute: jeweils `assigned`
- Geburtstag +15: `not_eligible`
- zweiter Helper-Aufruf im selben Geburtstagsjahr: `already_assigned`
- genau ein Gift pro Customer/Restaurant/Geburtstagsjahr: PASS
- `issue_birthday_gifts(...)` Wiederholung: kein Duplikat, kanonischer
  `automatic_14_day_window`-Modus
- Restaurant-Lokalzeit bei abweichendem UTC-Kalendertag: PASS
- Feb 29 im Nicht-Schaltjahr 2027: kanonisch `2027-02-28`
- neuer Membership-Insert innerhalb des Vier-Tage-Fensters: sofort zugewiesen
- bestehende Transactional-E-Mail-Queue: PASS
- Punkte und Points-Transactions: unveraendert; kein Visit erforderlich
- Rollback-Nachkontrolle: 0 Testkunden, 0 Test-E-Mails verblieben

## Ergebnis

NORMAL 14-DAY ASSIGNMENT: PASS

LATE REGISTRATION CATCH-UP: PASS

4 DAYS BEFORE: PASS

1 DAY BEFORE: PASS

BIRTHDAY TODAY: PASS

15 DAYS BEFORE: NOT YET / PASS

ONE GIFT PER YEAR: PASS

IMMEDIATE MEMBERSHIP CHECK: PASS

DAILY CRON: PASS

EMAIL: PASS

DB MIGRATION: `20260831001000_birthday_gift_14_day_catch_up.sql` / DEVELOPMENT/TEST APPLIED

BUSINESS LOGIC CHANGE: BIRTHDAY ELIGIBILITY WINDOW ONLY

BIRTHDAY GIFT 14-DAY CATCH-UP: `FINAL LOCK`

PRODUCTION: `LOCKED`

STRIPE: `DEFERRED`

## Risiken

Keine offene Birthday-Catch-up-Releaseabweichung. Production bleibt bis zur
ausdruecklichen Founder-Freigabe gesperrt. Discovery Direct Join ist ein
separates Gate und wurde in dieser Aufgabe weder ausgefuehrt noch bewertet.

## Status

`FINAL LOCK` fuer Birthday Gift 14-Day Catch-up. Migration History, leerer
Post-Dry-Run, DB-Linter, Rechte, automatisierte Regression und echte
Development/Test-Datenbankpfade sind gruen. Production bleibt `LOCKED`.
