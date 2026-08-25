# Global Post-Login Session / Stale Tab Hydration Fix

Datum: 2026-08-25  
Branch: `codex/v1-canonical-recovery`  
Ausgangscommit: `54534cf50375e73db410ffe9f7d4da1fddd10a8b`

## Ursache

Die Anmeldung und die globale Portalautorisierung waren zwei voneinander
getrennte asynchrone Ablaeufe. `signInWithPassword()` lieferte eine gueltige
Session, `signIn()` setzte `session` und `user` und kehrte danach sofort zur
Loginseite zurueck. Die serverseitige Aufloesung von Restaurantrolle,
Plattformrolle und `get_current_portal_access()` startete erst ueber einen
nachgelagerten React-Effect. Die Loginseite konnte deshalb bereits navigieren,
waehrend der globale Kontext noch die anonyme beziehungsweise leere
Autorisierung enthielt.

Der Tenant-Provider lud ausserdem nur bei einer Aenderung des `user`-Objekts neu.
Bei einer bereits bekannten Identitaet aus einem lange geoeffneten Tab, einem
Token-Refresh oder einer BFCache-Wiederherstellung war damit keine gezielte
erneute Tenant-Hydration garantiert. Das erklaert die Kombination aus gueltiger
Anmeldung, leerer Erstansicht und erfolgreichem manuellem Refresh.

Klassifikation: Kombination aus A, B, D und F der Aufgabenbeschreibung. Es gab
keinen Nachweis fuer einen stale Supabase-Client, RLS-Fehler oder eine
serverseitige Cookie-/Session-Differenz.

## Geaenderte Dateien

- `src/modules/auth/AuthProvider.tsx`
- `src/modules/auth/StaffRestaurantRouteGate.tsx`
- `src/modules/customer/CustomerAuthPage.tsx`
- `src/modules/tenant/TenantProvider.tsx`
- `src/app/App.tsx`
- `tests/global-post-login-hydration.test.mjs`
- `docs/19_CHANGELOG.md`
- dieser Bericht

## Was wurde geaendert

- `signIn()` bestaetigt nach erfolgreicher Supabase-Anmeldung die autoritative
  Restaurantrolle, Plattformrolle und den Portalzugriff und wartet auf diesen
  Abschluss, bevor der aufrufende Loginpfad navigieren kann.
- Parallele Autorisierungsaufloesungen werden pro Benutzer zusammengefuehrt;
  veraltete Ergebnisse duerfen keinen neueren Benutzer- oder Revalidierungsstand
  ueberschreiben.
- Der Customer-Login verwendet jetzt denselben zentralen `signIn()`-Vertrag wie
  Owner und Staff. `confirmPassword` und der Signup-Flow bleiben unberuehrt.
- Eine `contextRevision` laedt ausschliesslich auth-abhaengige Restaurant- und
  Brandingdaten neu. Unabhaengige Anwendungsdaten werden nicht global geleert.
- `SIGNED_IN`, `TOKEN_REFRESHED` und weitere Sessionereignisse aktualisieren
  weiterhin genau einen zentral registrierten Auth-Listener und stossen die
  Autorisierungsaufloesung deterministisch an.
- `pageshow` mit `event.persisted = true` sowie die Rueckkehr in einen sichtbaren
  geschuetzten Tab validieren Session und Portalzugriff kontrolliert neu.
- Tenant- und Staff-Kontextfehler zeigen einen lokalen Button `Erneut versuchen`
  und behalten die gueltige Sitzung.

## Was wurde nicht geaendert

- Keine Rollen aus Local Storage, `user_metadata` oder `app_metadata`.
- Keine Aenderung an RLS, Grants, RPCs, Supabase-Schema oder Migrationen.
- Keine Service-Role im Browser und kein Full-Page-Reload als Loginloesung.
- Keine Aenderung an Referral, Punkten, Rewards, QR Center oder Redemption.
- Keine Production-Aktion und keine Stripe-Arbeit.

## Sicherheit

- Portalzugriff bleibt serverseitig ueber `get_current_portal_access()` und die
  bestehenden Membership-/Platform-Admin-Vertraege autoritativ.
- Protected Routes warten auf Auth- und Rollenaufloesung, bevor Portalinhalte
  gerendert werden.
- Temporaere Netzwerk- und 5xx-Fehler loeschen keine gueltige Session.
- Der vorhandene Guard loescht weiterhin nur bei strukturierten ungueltigen
  Refresh-Token-Fehlern den lokalen Auth-Zustand.
- Wrong-Portal-Zustaende werden vor geschuetzten Customer-/Owner-/Staff-/Platform-
  Inhalten angezeigt.

## Qualitaet

- Tests: **996/996 PASS**
- Typecheck: **PASS**
- Lint: **PASS, 0 Fehler**, 7 bereits vorhandene Warnungen
- Build: **PASS**, 2039 Module transformiert
- `git diff --check`: **PASS**
- Secret Scan des geaenderten Umfangs: **PASS**
- DB-Migration: **NONE**
- Vollstaendiger Pruef-Export:
  `exports/2026-08-25_GLOBAL_POST_LOGIN_SESSION_HYDRATION_FIX.zip`
  (864 Dateien, ohne Git, Abhaengigkeiten, Build-Ausgaben, `.env`, Dumps und
  weitere ZIP-Dateien)

## Testabdeckung

Automatisiert geprueft sind:

- zentrale Reihenfolge Session -> Autorisierung -> Navigation,
- Owner-, Staff- und Customer-Loginintegration,
- genau ein Auth-State-Listener,
- Single-Flight fuer parallele Autorisierungsaufloesung,
- BFCache- und Visibility-Revalidierung ohne `setTimeout` oder Reload,
- gezielte Tenant-Invalidierung,
- Loading- und Retry-Zustaende,
- Wrong-Portal-Guards,
- bestehende Auth-, Customer-, Refresh-Token-, Staff- und RLS-Vertraege.

## Staging und Mobile

Der neue Build wurde in dieser Aufgabe nicht auf Staging deployed. Der vom
Founder real reproduzierte stale-tab-Zustand ist damit ursachlich erklaert und
automatisiert abgesichert, aber noch nicht mit diesem neuen Build auf einem
physischen iPhone Safari wiederholt. Offen bleiben die geforderten fuenf
Owner-Wiederholungen sowie die realen Customer-, Staff- und Platform-Admin-
Sessions inklusive Back/Forward/BFCache.

## Ergebnis

GLOBAL ROOT CAUSE: Navigation vor abgeschlossener globaler Autorisierung plus
fehlende gezielte Tenant-Rehydrierung bei gleicher Identitaet/BFCache  
STALE TAB REPRODUCED: YES - realer Founder-Befund; neuer Build noch nicht live
gegengeprueft  
AUTH SESSION SYNC: PASS  
AUTH LISTENER: PASS  
CACHE INVALIDATION: PASS  
BFCACHE HANDLING: PASS - Code und Tests  
CUSTOMER FIRST LOAD: PASS - Code und Tests / Live-Gate offen  
STAFF FIRST LOAD: PASS - Code und Tests / Live-Gate offen  
OWNER FIRST LOAD: PASS - Code und Tests / Live-Gate offen  
PLATFORM ADMIN FIRST LOAD: PASS - Code und Tests / Live-Gate offen  
WRONG PORTAL: PASS - Code und Tests  
BLANK SCREEN: NO - in den abgesicherten Codepfaden  
MANUAL REFRESH REQUIRED: NO - in den abgesicherten Codepfaden  
LOADING STATE: PASS  
RETRY STATE: PASS  
IPHONE SAFARI: FAIL - neuer Build noch nicht physisch geprueft  
BUSINESS LOGIC CHANGED: NO  
DB MIGRATION: NONE  
TESTS: 996/996 PASS  
GLOBAL POST-LOGIN HYDRATION READY: NO - Staging-/iPhone-Gate offen  
PRODUCTION: LOCKED  
STRIPE: DEFERRED

## Status

**CODE LOCK** - lokale Implementierung und Qualitaetstore bestanden. Kein FINAL
LOCK ohne Staging-Deployment und physischen iPhone-Safari-Test.

## AGENTS-Abschluss

- Aufgabe: Globale Post-Login-Session- und Stale-Tab-Hydration
- Build: Ja
- Migration: Keine
- Flow-Test: Automatisiert ja, physischer Staging-Test nein
- RLS/Security: Ja, bestehende Vertraege regressionsgeprueft; keine DB-Aenderung
- Alte Logik geprueft: Ja
- Report: `docs/reports/2026-08-25_GLOBAL_POST_LOGIN_SESSION_HYDRATION_FIX_REPORT.md`
- Pruef-ZIP: `exports/2026-08-25_GLOBAL_POST_LOGIN_SESSION_HYDRATION_FIX.zip`
- Offene Risiken: physischer iPhone-Safari- und realer Vier-Rollen-Staging-Test
- Status: CODE LOCK
