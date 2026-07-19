# Desktop Header UI Anpassung

Datum: 2026-07-19

## Ursache

Status, Restaurantauswahl und Benutzerprofil verwendeten im Desktop-Header
unterschiedliche Höhen und Informationshierarchien. Der Restaurantstatus war
nur als kleines technisches Wort sichtbar. Das Profil zeigte ausschließlich
die E-Mail-Adresse.

## Geänderte Dateien

- `src/modules/admin/AdminLayout.tsx`
- `src/modules/tenant/TenantSwitcher.tsx`
- `src/styles.css`
- `tests/desktop-admin-header.test.mjs`
- `docs/04_RESTAURANT_PORTAL.md`
- `docs/19_CHANGELOG.md`
- `docs/reports/2026-07-19_DESKTOP_HEADER_UI_ANPASSUNG_REPORT.md`

## Was wurde geändert

### Desktop-Komponenten

- Status-Badge mit Statuspunkt und den vorhandenen Restaurantstatuswerten
  `active`, `draft` und `suspended`
- verständliche Anzeigen `Aktiv`, `Einrichtung offen` und `Gesperrt`
- Restaurantauswahl mit Label, bestehendem Icon und unverändertem
  `setActiveRestaurantId`-Handler
- Profil mit Avatar-Initial, vorhandenem Namen aus `user_metadata.full_name`
  beziehungsweise E-Mail-Kurzform und vorhandener Restaurantrolle
- einheitliche Höhe von 56 px, einheitlicher Radius und einheitliche Borders
- Ellipsis für lange Restaurantnamen, Auswahltexte und Profilnamen

### Mobile Schutz

Alle neuen Layoutregeln liegen in `@media (min-width: 1024px)`. Der bisherige
mobile Status bleibt als eigenes Element bestehen. Unter `1024 px` bleiben
Desktop-Profil und Desktop-Badge verborgen; Hamburger, Tenant-Auswahl und
Drawer verwenden weiterhin die vorhandenen Regeln. Drawer-Code und mobile
Navigation wurden nicht geändert.

## Was wurde nicht geändert

- keine Authentifizierung oder Rollenlogik
- kein Restaurantwechsel oder Tenant-Kontext
- kein Logout-Handler
- keine Route Guards
- keine mobile Navigation und kein Drawer
- keine Sidebar, KPIs oder Businesslogik
- keine Datenbank, Migration oder RPC

## Responsive-Prüfung

Lokale Browsermessung mit langen Restaurant- und Profilnamen:

| Breite | Ergebnis |
| --- | --- |
| 1440 px | Drei Desktop-Elemente sichtbar, jeweils 56 px hoch, kein Überlauf |
| 1280 px | Drei Desktop-Elemente sichtbar, jeweils 56 px hoch, kein Überlauf |
| 1024 px | Drei Desktop-Elemente sichtbar, jeweils 56 px hoch, kein Überlauf |
| 390 px | Desktop-Badge und Desktop-Profil verborgen; mobiler Status und Menü sichtbar |

`documentElement.scrollWidth` entsprach bei allen geprüften Breiten exakt der
Viewportbreite.

## Funktionsprüfung

- Restaurantwechsel: Handler-Verbindung automatisiert geprüft
- Profilmenü: Öffnungs-Handler automatisiert geprüft
- Logout: vorhandener Handler und Redirect automatisiert geprüft
- Owner-/Manager-Anzeige: Rollen-Mapping automatisiert geprüft
- Route Guard ohne Sitzung: `/admin` leitet korrekt zu `/restaurant/login`

Ein echter interaktiver Owner-/Manager-Test mit Restaurantwechsel und Logout
konnte nicht durchgeführt werden, weil im Repository kein vorgesehenes
authentifiziertes Testkonto verfügbar ist. Es wurden keine Zugangsdaten erzeugt
oder verändert.

## Qualität

- `npm run lint`: erfolgreich, 0 Fehler, 12 bereits bestehende Warnungen
- `npm run typecheck`: erfolgreich
- `npm test`: erfolgreich, 13 von 13 Tests
- `npm run build`: erfolgreich

## Migration

Keine.

## Offene Risiken

Der echte interaktive Owner-/Manager-Flow ist ohne Testkonto nicht vollständig
bestätigt. Nach Bereitstellung einer Testsession müssen Restaurantwechsel,
Profilmenü und Logout einmal im echten Desktop-Portal geprüft werden.

## Status

NOT READY
