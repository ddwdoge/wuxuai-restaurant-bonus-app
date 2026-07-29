# Öffentliche Startseite – Auth-Token-Refresh 400 Fix

Datum: 2026-07-29

## Ursache

`AuthProvider` wird in `main.tsx` global über allen Routen eingebunden. Er rief
bisher beim Mounten unabhängig von der Route sofort `supabase.auth.getSession()`
auf. Gleichzeitig war `autoRefreshToken` global aktiviert. Damit konnte bereits
der Aufruf von `/` eine gespeicherte Supabase-Session initialisieren und bei
einem vom Auth-Server abgelehnten Refresh-Credential einen
`POST /auth/v1/token` mit HTTP 400 auslösen.

Der ursprünglich betroffene Klartext-Refresh-Token wurde aus Sicherheitsgründen
nicht aus Browser-Speichern ausgelesen oder dokumentiert. Deshalb lässt sich
nicht belastbar zwischen abgelaufen, widerrufen oder anderweitig ungültig
unterscheiden. Der konkrete auslösende Frontendpfad ist jedoch nachgewiesen.

## Geänderte Dateien

- `src/modules/auth/AuthProvider.tsx`
- `src/modules/auth/authRoutePolicy.mjs`
- `src/modules/auth/authRoutePolicy.d.mts`
- `src/shared/lib/supabase.ts`
- `tests/public-auth-refresh.test.mjs`
- `docs/19_CHANGELOG.md`

## Änderung

- Öffentliche Routen wie `/`, Login, Registrierung, Customer-Portal und
  Rechtsseiten rufen beim Start nicht mehr `getSession()` auf.
- Globaler automatischer Refresh ist deaktiviert und wird nur auf geschützten
  Admin-, Staff- und Plattform-Routen gezielt gestartet.
- Fehler und Promise-Rejections beim Session-Laden geschützter Routen werden
  abgefangen und führen zu einem sauberen ausgeloggten Zustand.
- Auth-State-Events für eine echte Anmeldung oder Abmeldung bleiben auch auf
  öffentlichen Login-/Registrierungsseiten funktionsfähig.
- Bestehende in-memory Sessions werden auf öffentlichen Seiten nicht pauschal
  gelöscht; dadurch bleiben bestehende Login-Weiterleitungen intakt.

## Was nicht geändert wurde

- Keine Datenbank- oder Migration
- Keine RLS-, Rollen- oder Auth-Server-Regel
- Keine Login-, Logout- oder Restaurant-Produktlogik
- Keine Secrets oder Tokenwerte gelesen, ausgegeben oder gespeichert

## Prüfung

- Öffentliche Startseite lokal geladen: erfolgreich
- Supabase-Auth-Fehler in der Browserkonsole: 0
- Sonstige Console Errors: 0
- Vorhandene React-Router-Zukunftshinweise: 2 Warnungen
- Typecheck: erfolgreich
- Lint: 0 Fehler, 7 bestehende Warnungen
- Tests: 273/273 erfolgreich
- Build: erfolgreich

Die Browseroberfläche lieferte keine vollständige Network-HAR. Der fehlende
öffentliche Session-Aufruf ist deshalb zusätzlich durch die Route-Policy und
automatisierte Tests abgesichert. Eine Prüfung der bereits veröffentlichten
Cloudflare-Version erfolgte nicht, da weder Push noch Deployment beauftragt
waren.

## Risiken

- Der konkrete Zustand des ursprünglich abgelehnten Refresh-Tokens ist nicht
  rekonstruierbar, ohne sensible Browserdaten auszulesen.
- Die Live-Seite verwendet den Fix erst nach einem späteren Deployment.

Status: CODE LOCK
