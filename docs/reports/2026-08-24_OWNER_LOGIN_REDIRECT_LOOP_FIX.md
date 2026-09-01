# Owner Login Redirect Loop Fix

Datum: 2026-08-24  
Branch: `codex/v1-canonical-recovery`  
Ausgangscommit: `919141181223aa414ef004a09aa3f02637f2b7fd`

## Ursache

Der reproduzierte Problemaccount war in Supabase Auth erfolgreich angemeldet,
hatte aber weder ein Restaurant noch eine `restaurant_members`-Zuordnung. Der
bisherige Restaurant-Route-Guard behandelte diesen fehlenden Tenantzugang wie
eine Navigation ohne Berechtigung und leitete kommentarlos auf `/` um. Dadurch
wirkte die erfolgreiche Anmeldung wie ein Login-Loop, obwohl die Auth-Session
nicht verloren ging.

Zusätzlich verließ sich `signIn()` nach erfolgreicher Supabase-Anmeldung auf das
asynchrone Auth-Event, bevor die lokale Provider-Session gesetzt wurde. Diese
Race Condition konnte unmittelbar nach dem Login einen kurzzeitig veralteten
Guard-Zustand erzeugen.

Ein gültiger reiner Owner wurde auf Staging separat geprüft und erreichte
`/admin` korrekt. Die Platform-Admin-Härtung war nicht die Ursache.

## Geänderte Dateien

- `src/modules/auth/AuthProvider.tsx`
- `src/modules/auth/ProtectedRoute.tsx`
- `tests/owner-login-redirect-loop.test.mjs`
- `docs/19_CHANGELOG.md`
- `docs/reports/2026-08-24_OWNER_LOGIN_REDIRECT_LOOP_FIX.md`

## Änderung

- Erfolgreiche Supabase-Sessions werden vor der nachfolgenden Navigation direkt
  in den Auth-Provider übernommen.
- Restaurantrollen stammen ausschließlich aus der autoritativen
  `restaurant_members`-Zuordnung; `app_metadata` wird nicht als Rollenquelle
  verwendet.
- Temporäre Fehler beim Restaurantrollen-Lookup erhalten einen eigenen sicheren
  Fehlerzustand mit Retry. Die bestehende Session bleibt erhalten.
- Authentifizierte Konten ohne Restaurantzuordnung erhalten einen verständlichen
  Hinweis statt einer stillen Weiterleitung auf `/` oder `/restaurant/login`.
- Platform-Admin-Rollen bleiben ausschließlich an den bestehenden
  serverseitigen Rollenvertrag gebunden.
- `completePendingOwnerRegistration()` bleibt ohne Pending-Datensatz ein No-op
  und der bestehende Trial-/Onboarding-Vertrag bleibt unverändert.

## Live-Staging-Prüfung

Reiner Owner:

`/restaurant/login -> /admin -> /admin/rewards -> /admin/customers -> /admin/reports -> /admin/settings`

- Authentifizierung erfolgreich
- Dashboard sichtbar
- Refresh auf geschützter Route behält die Session
- direkter Aufruf von `/admin` erfolgreich
- falsches Passwort bleibt auf `/restaurant/login` und zeigt eine sichere
  Fehlermeldung

Gemischte Rolle:

- `/platform-admin` weiterhin autorisiert
- `/admin` führt bei unvollständigem Restaurantsetup korrekt nach
  `/admin/onboarding`
- kein Rollenüberschreiben und kein Redirect zur Login-Seite

Der lokal ergänzte Fehlerzustand für ein Auth-Konto ohne Restaurantzuordnung
wurde automatisiert geprüft, aber nicht deployt. Production bleibt gesperrt.

## Sicherheit

- keine Route Guards entfernt
- keine unauthentifizierten Zugriffe erlaubt
- keine Rolle aus Local Storage oder User Metadata vertraut
- keine RLS-, Grant- oder Datenbankänderung
- keine Tokens oder Zugangsdaten protokolliert
- Customer-, Staff-, Referral- und Redemption-Verträge unverändert

## Ergebnis

ROOT CAUSE: Authentifizierter Problemaccount ohne Restaurant/Membership wurde
vom Restaurant-Guard irreführend auf `/` umgeleitet; zusätzlich bestand eine
Post-Sign-in-Hydration-Race-Condition.

LOGIN LOOP REPRODUCED: YES (als irreführende Root-Weiterleitung, nicht als
Sessionverlust)

AUTH SUCCESS: PASS

SESSION CREATED: PASS

SESSION PERSISTENCE: PASS

OWNER PROFILE: PASS (gültiger Owner); FAIL (gemeldeter Problemaccount ohne
Owner-Tenant-Vertrag)

RESTAURANT CONTEXT: PASS

PENDING OWNER REGISTRATION: PASS

TRIAL/STATUS LOGIC: PASS

ONBOARDING REDIRECT: PASS

ROUTE GUARD: PASS

PLATFORM ADMIN CHANGE CAUSED OWNER REGRESSION: NO

OWNER-ONLY LOGIN: PASS

MIXED ROLE LOGIN: PASS

REFRESH: PASS

DIRECT DASHBOARD URL: PASS

BAD PASSWORD: PASS

OWNER DASHBOARD: PASS

CUSTOMER AUTH REGRESSION: PASS

STAFF AUTH REGRESSION: PASS

PLATFORM ADMIN REGRESSION: PASS

DB MIGRATION: NONE

TESTS: 837/837 PASS

TYPECHECK: PASS

LINT: PASS, 0 Fehler und 7 bestehende Warnungen

BUILD: PASS

OWNER LOGIN READY: YES (Code; kein Production-Deployment)

PRODUCTION: LOCKED

STRIPE: DEFERRED

## Offene Risiken

- Der lokale Fehler-/Retry-Zustand ist noch nicht auf Staging ausgerollt.
- Das verwaiste Auth-Konto benötigt eine bewusste Supportentscheidung:
  Restaurantzuordnung herstellen oder den nicht mehr benötigten Auth-Zugang
  administrativ bereinigen. Der Fix erstellt absichtlich keinen Tenant.
- Ein physischer Mobile-Safari-Test wurde in diesem Lauf nicht durchgeführt.

Status: **CODE LOCK**
