# WUXUAI Admin Restaurant-Verwaltung Report

Datum: 2026-07-13  
Status: NOT READY

## Ziel

Eine interne WUXUAI Admin-Seite bauen, damit Plattformbetreiber Restaurants,
Testphasen, Abo-/Zahlungsstatus und Plattformstatus verwalten können.

Die Seite ist strikt getrennt vom Restaurant Portal und nicht für normale
Restaurantbesitzer sichtbar.

## Geänderte Dateien

- `src/app/App.tsx`
- `src/modules/auth/AuthProvider.tsx`
- `src/modules/auth/ProtectedRoute.tsx`
- `src/modules/platform/PlatformAdminPage.tsx`
- `src/modules/platform/platformAdminService.ts`
- `src/shared/types/domain.ts`
- `src/styles.css`
- `supabase/migrations/20260713002000_platform_admin_restaurant_management.sql`
- `docs/07_WUXUAI_ADMIN.md`
- `docs/14_DATABASE_ARCHITEKTUR.md`
- `docs/17_CTO_ENTSCHEIDUNGEN.md`
- `docs/19_CHANGELOG.md`

## Neue Route

- `/admin/platform`
- `/admin/platform/restaurants/:id`

Bestehende Kompatibilitätsroute bleibt erhalten:

- `/platform-admin`

## Rollenprüfung

Frontend:

- Plattformrollen werden getrennt von Restaurantrollen behandelt.
- Restaurant Owner ohne Plattformrolle sehen die Meldung:
  `Du hast keinen Zugriff auf diese Seite.`
- anon wird weiterhin zum Login geleitet.

Erlaubte Plattformrollen:

- platform_owner
- platform_admin
- app_admin
- super_admin
- wuxuai_admin
- support
- billing_admin
- security_admin
- viewer

Schreibaktionen sind nur für Schreibrollen sichtbar.

## Datenquellen

Bestehend:

- `get_platform_restaurants()`
- `update_platform_restaurant_subscription(...)`

Neu vorbereitet:

- `get_platform_restaurant_detail(input_restaurant_id)`

Alle Plattformdaten laufen über serverseitige RPCs mit Plattformrollenprüfung.
Es wurde keine Service Role im Frontend eingebaut.

## Migration

Erstellt:

- `20260713002000_platform_admin_restaurant_management.sql`

Inhalt:

- Plattformrollen um `app_admin`, `super_admin`, `wuxuai_admin` erweitert
- `current_platform_role()` / `is_platform_admin()` angepasst
- neue Detail-RPC `get_platform_restaurant_detail(input_restaurant_id)`
- Update-RPC-Schreibrollen konsistent erweitert
- Grants nur für `authenticated`, nicht für `anon`

Staging:

- `npx supabase db push --include-all` wurde ausgeführt.
- Ergebnis: fehlgeschlagen, weil `SUPABASE_ACCESS_TOKEN` nicht gesetzt ist.

```text
Access token not provided. Supply an access token by running supabase login
or setting the SUPABASE_ACCESS_TOKEN environment variable.
```

## Restaurantliste

Umgesetzt:

- echte Daten über Plattform-RPC
- Suche nach Name, Slug, Owner-E-Mail
- Filter: Alle, Aktiv, Pausiert, Gesperrt, Trial aktiv, Setup offen
- mobile Kartenliste
- Desktop-Liste mit Detailauswahl

## Restaurantdetails

Umgesetzt:

- Restaurantdaten
- Owner-Daten
- Branding / Logo
- Status
- Trial / Abo
- Setup abgeschlossen
- Customer-/Staff-/QR-Links
- Gäste
- Punkte heute
- Einlösungen heute
- Willkommensgeschenke aktiv
- Bonus Boost aktiv
- Audit-Auszug

## Statusverwaltung

Umgesetzt:

- Status ändern
- Optionen: Aktiv, Pausiert, Gesperrt
- Button: `Status speichern`
- Erfolg: `Restaurantstatus wurde gespeichert.`
- Fehler: `Änderung konnte nicht gespeichert werden.`

Keine Löschung in V1.

## Trial / Abo Anzeige

Umgesetzt:

- Testphase Start
- Testphase Ende
- verbleibende Tage
- Abo-Status
- Zahlungsstatus
- Hinweis `Abo-Verwaltung noch nicht aktiviert`, wenn keine Daten vorhanden sind

Stripe-Automation wurde nicht gebaut.

## RLS / Security Prüfung

Geprüft im Code:

- Plattform-Route nutzt `ProtectedRoute` mit `roleScope="platform"`.
- Plattform- und Restaurantrollen bleiben getrennt.
- RPCs prüfen Plattformrolle serverseitig.
- `anon` bekommt keine Grants auf Plattform-RPCs.
- Service Role wird im Frontend nicht verwendet.

Nicht vollständig geprüft:

- Migration konnte nicht auf Staging angewendet werden.
- Live-RLS/RPC-Test gegen Staging konnte deshalb nicht abgeschlossen werden.

## Mobile Prüfung

Code/CSS geprüft:

- mobile Kartenliste
- Filter umbrechen
- Buttons volle Breite unter 820px
- keine Tabellenpflicht auf Mobile

Nicht live geprüft:

- echte Plattformrolle fehlt in der aktuellen Testumgebung
- Migration nicht auf Staging angewendet

## Build-Ergebnis

`npm run build` erfolgreich.

## Was wurde nicht geändert

- Customer Portal
- Staff Portal
- Punkte sammeln
- Tages-PIN
- Punkteeinlösung
- Willkommensgeschenke
- Bonus Boost
- QR Center
- Onboarding
- Restaurant-Produktlogik
- Stripe-Automation
- Impersonation

## Offene Risiken

- Migration ist noch nicht auf Supabase Staging angewendet.
- Die neue Detail-RPC ist lokal im Code vorhanden, aber noch nicht live erreichbar.
- Plattformrolle und Owner-Blockierung wurden nicht live gegen Staging validiert.
- Statusänderung wurde nicht live persistiert, weil die Migration nicht angewendet werden konnte.

## Status

NOT READY
