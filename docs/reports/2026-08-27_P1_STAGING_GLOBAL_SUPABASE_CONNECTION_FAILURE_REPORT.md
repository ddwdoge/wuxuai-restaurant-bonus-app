# P1 Staging - globale Supabase-Verbindung

Datum: 2026-08-27  
Projekt: WUXUAI Bonus V1  
Supabase Staging: `bwhvfjuwixgwduoeqaya`  
Production: LOCKED  
Stripe: DEFERRED

## Ursache

Der zuvor aktive Cloudflare-Deployment-Build
`f5739bf0-6eba-43a3-acaf-ccd4f6865495` wurde ohne exportierte
`VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` erzeugt. Die lokale
Staging-Konfiguration war korrekt vorhanden, aber die Variablen waren nicht in
die Umgebung des Vite-Prozesses exportiert.

Der ausgelieferte Entry-Chunk `/assets/index-Bx_fjkC_.js` enthielt deshalb
weder die Staging-Projektreferenz noch eine gültige Supabase-Konfiguration,
sondern den Platzhalter `your-anon-key`. `src/shared/lib/supabase.ts` erzeugte
daraufhin bewusst keinen Client. Die Login-Seiten zeigten deshalb den Zustand
"Live-Daten konnten nicht geladen werden" und sperrten die Anmeldung.

Vor dem Login existierte kein fehlgeschlagener Supabase-Request: Der Fehler
trat bereits bei der Client-Initialisierung im Browser auf. Historische
Browsermeldungen aus älteren Chunks waren nicht die Ursache dieses Ausfalls.

## Diagnose

- Live-HTML vor dem Fix: HTTP 200
- Live-JavaScript vor dem Fix: HTTP 200
- Fehlender Request vor dem Fix: keiner, da `supabase === null`
- Supabase DNS/TLS: erreichbar
- Supabase Auth `/auth/v1/settings`: HTTP 200 mit bestätigtem Staging-Key
- PostgREST-Safe-Query: HTTP 200
- Datenbankerreichbarkeit: PASS
- Cloudflare Worker: reicht statische Assets aus und verändert weder Supabase-
  URLs noch Auth-Header; keine Proxy- oder Rewrite-Ursache

## Wiederherstellung

Der unveränderte autoritative Quellstand wurde mit explizit exportierter,
bereits vorhandener Staging-Konfiguration gebaut und ausschließlich auf
Cloudflare Staging ausgerollt.

- Quell-HEAD: `f9406c9582e5bb379d19be853b6ddd28d33da06c`
- Neuer Deployment: `bd990985-96e9-43be-875f-89f0a6b3eaa0`
- Deployment-Zeit: 2026-08-27 00:33:32 Europe/Vienna
- Neuer Entry-Chunk: `/assets/index-skkqQMH_.js`
- Live-HTML: HTTP 200, `no-cache`
- Live-Chunk: enthält die bestätigte Staging-Projektreferenz und gültige
  öffentliche Supabase-Konfiguration

Es wurden keine Secrets in Report, Logs oder Repository geschrieben.

## Live-Prüfung nach Recovery

- Restaurant-Login: Live-Daten-Hinweis verschwunden, Anmeldung wieder aktiv
- Customer-Login: Formular aktiv, kein Verbindungsfehler
- Staff-Login: Restaurant-Slug wird live zu `Kaffee Konditorei bäckerei`
  aufgelöst, Formular aktiv
- Platform Admin anonym: erwartungsgemäß zur Restaurant-Anmeldung umgeleitet
- Supabase Auth: UP
- Supabase REST/PostgREST: UP
- Supabase Datenbank: UP

Echte Passwortanmeldungen wurden nicht automatisiert, da keine Zugangsdaten
gelesen, geraten oder protokolliert werden dürfen. Die abschließende Prüfung
auf physischem Windows und iPhone sowie positive Owner-, Customer-, Staff- und
Platform-Admin-Sitzungen bleibt daher ein manueller Akzeptanzschritt.

## Geänderte Dateien

- `docs/19_CHANGELOG.md`
- `docs/reports/2026-08-27_P1_STAGING_GLOBAL_SUPABASE_CONNECTION_FAILURE_REPORT.md`

## Was nicht geändert wurde

- Anwendungscode und Businesslogik
- Supabase-Schema, Migrationen, RLS, Grants und RPCs
- Auth-Benutzer, Rollen, Memberships, Customer- oder Staff-Daten
- Production und Stripe

## Qualität

- Tests: 1013/1013 PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler und 7 bestehende Warnungen
- Build: PASS mit bestätigter Staging-Konfiguration
- `git diff --check`: PASS
- DB-Migration: NONE

## Risiken

- Die Build-Pipeline muss die beiden Vite-Variablen bei jedem Staging-Build
  explizit bereitstellen; Cloudflare-Worker-Runtime-Variablen ersetzen die
  Vite-Compile-Time-Konfiguration nicht.
- Physische Windows-/iPhone-Prüfung und positive Credential-E2E-Sitzungen sind
  noch durch den Benutzer zu bestätigen.

Status: NOT READY fuer FINAL LOCK; STAGING-KONNEKTIVITAET WIEDERHERGESTELLT
