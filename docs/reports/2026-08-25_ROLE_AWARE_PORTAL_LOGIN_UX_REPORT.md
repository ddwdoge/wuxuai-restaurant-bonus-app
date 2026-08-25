# WUXUAI Bonus - Rollenbewusste Portal-Anmeldung

Datum: 2026-08-25  
Branch: `codex/v1-canonical-recovery`  
Ausgangscommit: `5ac164a6d8f067abd947912f47191b63d55fe59b`

## Ursache

Nach einer erfolgreichen Supabase-Anmeldung wurde bislang zuerst die jeweilige
Portallogik geladen. Ein gueltiges Staff-Konto im Customer-Portal rief dadurch
`get_customer_account()` auf und zeigte dessen korrekten Fehler
`CUSTOMER_PROFILE_INCOMPLETE` als vermeintlichen Datenbank- oder Ladefehler.
Authentifizierung und Portalautorisierung waren in der UI nicht klar getrennt.

## Umsetzung

- `get_current_portal_access()` ermittelt die voneinander unabhaengigen
  Customer-, Owner-, Staff- und Platform-Admin-Zugriffe ausschliesslich aus
  autoritativen serverseitigen Beziehungen.
- Die Funktion ist `SECURITY DEFINER`, verwendet den festen `search_path`
  `public, pg_temp` und ist nur fuer `authenticated` ausfuehrbar.
- Customer-, Owner-, Staff- und Platform-Admin-Routen pruefen die bestaetigte
  Berechtigung vor dem Rendern ihrer Fachkomponenten.
- Ein Rollenfehler zeigt eine kompakte deutsche Karte mit nur serverseitig
  bestaetigtem Portalziel und der Aktion `Mit anderem Konto anmelden`.
- Der Kontowechsel fuehrt einen lokalen Supabase-Sign-out aus und navigiert mit
  `replace`, damit kein alter Portalzustand im Verlauf aktiv bleibt.
- Legitime Mehrfachrollen bleiben erhalten; es wird keine globale Einzelrolle
  erzwungen.

## Geaenderte Dateien

- `src/app/App.tsx`
- `src/modules/auth/AuthProvider.tsx`
- `src/modules/auth/LoginPage.tsx`
- `src/modules/auth/ProtectedRoute.tsx`
- `src/modules/auth/StaffLoginPage.tsx`
- `src/modules/auth/WrongPortalNotice.tsx`
- `src/modules/auth/portalAccessUx.mjs`
- `src/modules/auth/portalAccessUx.d.mts`
- `src/modules/customer/CustomerAuthPage.tsx`
- `src/modules/public/public-entry-premium.css`
- `supabase/migrations/20260825007000_role_aware_portal_access.sql`
- `tests/role-aware-login-ux.test.mjs`
- `docs/19_CHANGELOG.md`

## Sicherheitspruefung

- Keine Rollenableitung aus `user_metadata`, `app_metadata`, E-Mail oder
  Local Storage.
- Keine Rollenoffenlegung vor erfolgreicher Authentifizierung.
- Platform Admin bleibt an eine aktive Zeile in `platform_admins` gebunden.
- Staff-Zugriff bleibt restaurantbezogen; Owner-Zugriff auf den eigenen
  Staff-Bereich verwendet die bestehende Owner-/Admin-/Manager-Beziehung.
- Anon hat kein `EXECUTE`, `authenticated` hat das benoetigte `EXECUTE`.
- Kein Service-Role-Schluessel im Browser und keine RLS-Deaktivierung.

## Migration und Staging

- Migration: `20260825007000_role_aware_portal_access.sql`
- Bestaetigtes Projekt: `wuxuai-bonus-staging` (`bwhv...qaya`)
- Dry-Run: PASS, ausschliesslich Migration `07000`
- Auf Staging angewendet: Ja
- Lokale/Remote-Migrationshistorie: synchron
- DB-Linter: 0 Fehler
- Production: nicht veraendert

## Tests und Qualitaet

- Rollen- und Nachrichtenmatrix: PASS
- Customer-Fach-RPC bei bestaetigtem Rollenfehler verhindert: PASS
- Kontowechselvertrag: PASS
- Mehrfachrollen: PASS
- Tests: 981/981 PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler und 7 bestehende Warnungen
- Build: PASS
- `git diff --check`: PASS
- Secret Scan: PASS

Die neue UI wurde nicht auf Cloudflare ausgerollt. Deshalb ist die physische
Live-Matrix fuer 320, 375, 390, 414, 430, 768 und 1024 Pixel noch offen. Die
Komponenten- und CSS-Tests decken den mobilen Vertrag ab, ersetzen aber keinen
echten Staging-Browsertest.

## Nicht geaendert

- Customer-Registrierung und E-Mail-Bestaetigung
- Staff-Einladung und Staff-QR-Vertrag
- Owner-, Referral-, Punkte-, Reward- und Redemption-Logik
- bestehende Tenant-RLS und Rollenbeziehungen
- Production und Stripe

## Risiken

- Bis zum Deployment kann die Live-App weiterhin den bisherigen generischen
  Fehler anzeigen.
- Fuer einen Final Lock fehlen reale Sitzungen fuer jede positive und negative
  Portal-Kombination sowie die vollstaendige mobile Live-Matrix.
- Die auf Staging angewendete Migration muss vor dem naechsten Repository-Push
  zusammen mit dem Code committed werden, damit Remote-DB und Git nicht
  auseinanderlaufen.

## Ergebnis

- ROLE-AWARE LOGIN UX: PASS im Code und auf der Staging-Datenbank
- ROLE DISCLOSURE BEFORE AUTH: NO
- WRONG PORTAL RPC CALL PREVENTED: PASS
- DB MIGRATION: `20260825007000_role_aware_portal_access.sql`
- ROLE-AWARE PORTAL LOGIN READY: NO, Live-Deployment und physische Matrix offen
- PRODUCTION: LOCKED
- STRIPE: DEFERRED
- Status: CODE LOCK
