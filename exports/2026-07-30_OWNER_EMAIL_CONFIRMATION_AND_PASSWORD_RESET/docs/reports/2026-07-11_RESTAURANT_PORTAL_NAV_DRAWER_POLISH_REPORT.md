# Restaurant Portal Nav Drawer Polish Report

Datum: 2026-07-11  
Status: LOCK

## Ursache

Die vorherige Responsive-Regel schaltete die mobile Navigation erst bei `max-width: 820px`. Dadurch konnte auf Tablet-/kleinen Desktopbreiten eine unklare Zwischenlage entstehen. Zusätzlich war der Drawer zu breit und zu großzügig verteilt, wodurch die Navigation nicht kompakt genug wirkte.

## Geänderte Dateien

- `src/modules/admin/AdminLayout.tsx`
- `src/styles.css`
- `docs/reports/2026-07-11_RESTAURANT_PORTAL_NAV_DRAWER_POLISH_REPORT.md`

## Breakpoint-Regel

Neue Regel:

- `>= 1024px`: Sidebar sichtbar, Hamburger-Menü ausgeblendet
- `< 1024px`: Sidebar ausgeblendet, Hamburger-Menü sichtbar, Drawer verfügbar

Zusätzlich wird ein geöffneter Drawer bei Resize auf `>= 1024px` automatisch geschlossen.

## Desktop-Verhalten

- Linke Sidebar bleibt sichtbar.
- Hamburger-Menü ist ab 1024px nicht sichtbar.
- Header zeigt Logo, Restaurantname, `Restaurant Portal`, Status und Restaurant-Auswahl.
- Keine doppelte Navigation.

## Mobile-Verhalten

- Sidebar ist unter 1024px ausgeblendet.
- Button `Menü` ist sichtbar.
- Header-Texte bleiben getrennt und lesbar.
- Keine horizontale Scrollbar durch Navigation.

## Drawer Layout Fix

- Drawer auf maximal ca. 320px Breite reduziert.
- Auf sehr schmalen Geräten nutzt der Drawer fast die volle Breite mit Rand.
- Header ist kompakt.
- Links beginnen direkt unter dem Drawer-Header.
- Links stehen untereinander mit mindestens 44px Klickhöhe.
- Aktiver Link bleibt klar markiert.
- Klick außerhalb schließt den Drawer.
- Button `Schließen` schließt den Drawer.
- Escape-Taste schließt den Drawer.
- Klick auf Menüpunkt schließt den Drawer.

## Getestete Breiten

Geprüft über CSS-/Code-Regeln und Build:

- 390px: Sidebar ausgeblendet, Hamburger sichtbar, Drawer kompakt
- 430px: Sidebar ausgeblendet, Hamburger sichtbar, Drawer kompakt
- 768px: Sidebar ausgeblendet, Hamburger sichtbar
- 1024px: Sidebar sichtbar, Hamburger ausgeblendet
- Desktop größer: Sidebar sichtbar, Hamburger ausgeblendet

## Build-Ergebnis

`npm run build` erfolgreich.

## Nicht geändert

- Keine Produktlogik
- Keine Datenbank
- Keine RPCs
- Keine Tages-PIN
- Keine Punkte-/Reward-Logik
- Keine QR Center Logik
- Keine Staff Portal Logik
- Keine Auth-/RLS-Logik

## Offene Risiken

- Ein echter visueller Screenshot-Test sollte zusätzlich direkt im Browser oder auf Pilotgeräten geprüft werden. Der lokale Playwright-Browser-Cache war in dieser Umgebung nicht verfügbar.

## Status

LOCK
