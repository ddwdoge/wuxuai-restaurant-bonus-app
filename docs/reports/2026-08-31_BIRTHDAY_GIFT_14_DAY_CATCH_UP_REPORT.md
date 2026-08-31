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
- kein Deployment, keine Production- oder Stripe-Aktion

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
- Migration: erstellt, nicht auf Development/Test angewendet
- Migration History / DB-Linter nach Anwendung: noch offen
- echter Development/Test-Flow: noch offen

## Ergebnis

NORMAL 14-DAY ASSIGNMENT: CODE PASS

LATE REGISTRATION CATCH-UP: CODE PASS

4 DAYS BEFORE: PASS

1 DAY BEFORE: PASS

BIRTHDAY TODAY: PASS

15 DAYS BEFORE: NOT YET / PASS

ONE GIFT PER YEAR: PASS

IMMEDIATE MEMBERSHIP CHECK: CODE PASS

DAILY CRON: CODE PASS

EMAIL: CODE PASS

DB MIGRATION: `20260831001000_birthday_gift_14_day_catch_up.sql` / NOT APPLIED

BUSINESS LOGIC CHANGE: BIRTHDAY ELIGIBILITY WINDOW ONLY

BIRTHDAY GIFT 14-DAY CATCH-UP: `CODE LOCK / STAGING GATE OPEN`

PRODUCTION: `LOCKED`

STRIPE: `DEFERRED`

## Risiken

Vor Anwendung muss Development/Test auf bestehende doppelte Birthday-Gifts
ueber verschiedene Branch-Werte geprueft werden, damit der staerkere Unique
Index kontrolliert und ohne Datenbereinigung angewendet werden kann. Erst nach
Migration History, DB-Linter und echten +14/+4/heute-/Deduplizierungsproben ist
ein `FINAL LOCK` zulaessig.

## Status

`CODE LOCK`. Die Implementierung und automatisierte Regression sind gruen.
Die additive Migration ist noch nicht auf Development/Test angewendet; deshalb
kein `FINAL LOCK`.
