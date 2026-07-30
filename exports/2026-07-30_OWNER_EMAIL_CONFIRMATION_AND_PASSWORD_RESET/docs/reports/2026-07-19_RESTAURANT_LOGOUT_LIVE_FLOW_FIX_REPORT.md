# Restaurant Logout Live Flow Fix Report

Datum: 2026-07-19  
Projekt: WUXUAI Bonus V1

## Ursache

Das Restaurant Portal hatte im `AdminLayout` keine sichtbare Logout-Aktion.
Der vorhandene `AuthProvider.signOut()` rief Supabase zwar auf, wertete Fehler
aber nicht aus und setzte Auth-, Rollen- und Restaurantzustand nicht
ausdrücklich synchron zurück. Geschützte Routen verwendeten außerdem `/login`
statt der geforderten Restaurant-Login-Route.

## Geänderte Dateien

- `src/modules/auth/AuthProvider.tsx`
- `src/modules/auth/ProtectedRoute.tsx`
- `src/modules/auth/LoginPage.tsx`
- `src/modules/tenant/TenantProvider.tsx`
- `src/modules/admin/AdminLayout.tsx`
- `src/app/App.tsx`
- `src/styles.css`
- `tests/restaurant-logout.test.mjs`
- `docs/04_RESTAURANT_PORTAL.md`
- `docs/19_CHANGELOG.md`
- `docs/reports/2026-07-19_RESTAURANT_LOGOUT_LIVE_FLOW_FIX_REPORT.md`

## Was wurde geändert

### Auth und Session

- Logout verwendet regulär `supabase.auth.signOut()`, damit Supabase die
  Sitzung serverseitig beendet.
- Falls die Online-Abmeldung fehlschlägt oder die Sitzung bereits fehlt, wird
  zusätzlich der lokale Supabase-Sessionzustand entfernt.
- Auth-Session, Benutzer, Restaurantrolle und Plattformrolle werden im
  `finally`-Block lokal gelöscht.
- Eine bereits fehlende Supabase-Sitzung wird als erfolgreicher lokaler Logout
  behandelt.
- Andere Fehler werden ohne technische Details als deutsche Meldung
  weitergegeben.

### Restaurantdaten

`TenantProvider` stellt `clearTenantState()` bereit. Die Funktion:

- invalidiert laufende Tenant-Anfragen,
- entfernt alle geladenen Restaurants,
- entfernt die aktive Restaurant-ID,
- entfernt Brandingdaten,
- beendet den Ladezustand.

Der Logout ruft diesen Reset vor und nach dem Supabase-Logout auf. Dadurch
bleiben beim Kontowechsel keine Restaurantdaten des vorherigen Kontos im
React-Zustand.

Im Projekt ist kein Query-Cache wie React Query oder SWR vorhanden. Ein
zusätzlicher Query-Cache-Reset war deshalb nicht erforderlich.

### Desktop

Oben rechts befindet sich ein Profilmenü mit Konto-E-Mail und dem Menüpunkt
„Abmelden“. Das Menü ist per Maus und Tastatur bedienbar, besitzt sichtbaren
Fokus und schließt über Escape oder Klick außerhalb.

### Mobil

„Abmelden“ befindet sich nach der Navigation am unteren Ende des mobilen
Drawers. Die Aktion besitzt mindestens 44 px Höhe. Während der Abmeldung ist
der Button gesperrt und zeigt „Abmeldung läuft...“.

### Routing und Fehler

- Neue Login-Aliasroute: `/restaurant/login`
- Nach Logout: Redirect mit `replace` auf `/restaurant/login`
- `ProtectedRoute` leitet ausgeloggte Aufrufe ebenfalls dorthin.
- Dadurch zeigt Browser-Zurück keine geschützten Daten; alte Admin-URLs werden
  erneut durch den Guard blockiert.
- Wenn die Online-Abmeldung fehlschlägt, bleibt die lokale Sitzung beendet und
  die Login-Seite zeigt eine ruhige deutsche Meldung.

## Was wurde nicht geändert

- keine Datenbank oder Migration
- keine RPC
- keine Punkte-, Tages-PIN- oder Punkteeinlösungslogik
- keine Restaurant-Navigation außerhalb des Logout-Zugangs
- keine Customer- oder Staff-Portal-Logik

## Prüfungen

### Automatisiert

- Auth-Reset: bestanden
- Tenant-Reset: bestanden
- Restaurant-Login-Redirect: bestanden
- Desktop- und Mobile-Logout im Layout: bestanden
- Gesamttests: 8 von 8 bestanden
- Typecheck: bestanden
- Lint: 0 Fehler, 12 bestehende Warnungen
- Build: bestanden

### Browser und Responsive

- Direkter Aufruf `/admin` ohne Sitzung: Redirect nach
  `/restaurant/login` bestanden.
- 390 px: kein horizontaler Überlauf.
- 1440 px: kein horizontaler Überlauf.

### Nicht vollständig live geprüft

Im Repository stehen keine nutzbaren Owner-/Manager-Testzugänge zur
Verfügung. Deshalb konnten folgende echte Auth-Flows nicht ausgeführt werden:

- Logout als Owner
- Logout als Manager
- Klick auf das Desktop-Profilmenü mit echter Sitzung
- Klick auf den mobilen Logout mit echter Sitzung
- Browser-Zurück nach echtem Logout
- Wechsel zwischen zwei echten Restaurantkonten

Die zugehörigen Zustands-, UI- und Guard-Verträge sind automatisiert geprüft,
aber nach der verbindlichen LOCK-Regel ersetzt das keinen echten
authentifizierten Flow-Test.

## Migration

Keine.

## Offene Risiken

- Authentifizierte Owner-/Manager-Livetests fehlen.
- Der Kontowechsel mit zwei echten Restaurantkonten ist noch nicht live
  bestätigt.
- Die bestehende Codebasis enthält 12 Lint-Warnungen außerhalb dieses Scopes.

## Status

**NOT READY**

Begründung: Der Code und die lokalen Prüfungen sind abgeschlossen, aber der
Founder fordert `LOCK` ausdrücklich nur nach erfolgreichen Owner-, Manager-,
Desktop-, Mobile-, Browser-Zurück- und Kontowechsel-Flows. Ohne echte
Testzugänge dürfen diese Prüfungen nicht behauptet werden.
