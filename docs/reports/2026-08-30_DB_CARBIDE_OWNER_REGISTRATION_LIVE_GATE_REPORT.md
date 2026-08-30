# DB Carbide Owner Registration Live Gate Report

Datum: 2026-08-30
Umgebung: WUXUAI Bonus Entwicklungs-/Testumgebung
Supabase-Projekt: `bwhvfjuwixgwduoeqaya`

## Auftrag

Den bestehenden DB-Carbide-Testaccount ohne Duplikat durch den finalen Owner-Registration-Live-Gate pruefen:

Accountstatus, E-Mail-Bestaetigung, Login, Organization, Restaurant, Branch, Admin-Link, Owner-Portal-Hydration, Legal Operator sowie Trial-Start und Trial-Ende.

## Ergebnis

- Bestehende Authkonten fuer `info@dbcarbide.com`: 1
- E-Mail bestaetigt: PASS
- Owner-Login / aktive authentifizierte Sitzung: PASS
- Organization: vorhanden, aktiv und mit dem Owner verknuepft
- Restaurant: `Kaffee db carbide`, aktiv und mit Organization sowie Owner verknuepft
- Primaere Branch: `DB Carbide Testrestaurant`, aktiv und mit Restaurant sowie Organization verknuepft
- Admin-Link: Rolle `owner`; User-, Restaurant-, Organization- und Branch-Scope gueltig
- Onboarding: `completed`
- Owner-Portal-Hydration: PASS ohne manuellen Refresh oder Retry
- `Restaurantdaten konnten nicht geladen werden`: NO
- Legal Operator: `DB CARBIDE`, Rechtsform `GmbH`
- Legal Operator mit Organization verknuepft: PASS
- Geschaeftsanschrift: kanonische Restaurant-/Branch-Beziehung gespeichert
- Checkbox in der Owner-UI: checked, enabled und korrekt beschriftet
- FN: leer und optional
- UID: leer und optional
- Legal Readiness: Unternehmensdaten, Dokumente und Veroeffentlichung erledigt
- Kundenregistrierung: freigegeben
- Bonusprogramm: aktiv

## Trial

- Status: `trialing`
- Start: `2026-08-30 10:00:04.628018+00`
- Ende: `2026-11-30 10:00:04.628018+00`
- Datenbanknachweis `trial_ends_at = trial_started_at + interval '3 months'`: TRUE
- Owner-UI: `30.08.2026` bis `30.11.2026`
- Preis: `59 EUR pro Monat exkl. USt.`
- Automatische Abrechnung: nicht aktiv
- Stripe: DEFERRED

## Sicherheit und Datenintegritaet

- Kein neuer Authaccount erstellt
- Keine neue Organization erstellt
- Kein neues Restaurant erstellt
- Keine neue Branch erstellt
- Keine Daten gespeichert oder veraendert
- Keine Migration ausgefuehrt
- Production nicht beruehrt

## Qualitaetsbasis

- Tests: 1132/1132 PASS
- Typecheck: PASS
- Lint: 0 Fehler, 7 bestehende Warnungen
- Build: PASS
- Live-Worker: `f5f314f8-6ce7-488a-bb64-c8a7733265ad`
- Commit: `8be3df14f00b4e18cb8d781c2ee594385da5315a`

## Status

OWNER REGISTRATION LIVE GATE: FINAL LOCK
Production: LOCKED
Stripe: DEFERRED
