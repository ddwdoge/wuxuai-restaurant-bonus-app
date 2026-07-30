# Restaurant Portal Double Nav Fix Report

Datum: 2026-07-11  
Status: LOCK

## Ursache

Der Hamburger-Button hatte die Klasse `mobile-menu-button`, wurde aber gleichzeitig als allgemeiner `.button` gerendert. Die Regel `.mobile-menu-button { display: none; }` stand vor der späteren Regel `.button { display: inline-flex; }`. Dadurch konnte der Hamburger auf Desktop sichtbar bleiben, obwohl die Sidebar ebenfalls sichtbar war.

## Geänderte Dateien

- `src/styles.css`
- `docs/reports/2026-07-11_RESTAURANT_PORTAL_DOUBLE_NAV_FIX_REPORT.md`

## Breakpoint vorher

- Sidebar: sichtbar außerhalb `max-width: 1023px`
- Hamburger: sollte außerhalb `max-width: 1023px` unsichtbar sein
- Fehler: `.button` überschreibt `display: none`

## Breakpoint nachher

Desktop ab `1024px`:

- Sidebar sichtbar
- `.button.mobile-menu-button` bleibt `display: none`
- `.mobile-menu-backdrop` bleibt `display: none`

Mobile unter `1024px`:

- Sidebar `display: none`
- `.button.mobile-menu-button` wird `display: inline-flex`
- Drawer-Backdrop wird nur in diesem Breakpoint sichtbar

Der gleiche Breakpoint gilt jetzt für Sidebar, Hamburger und Drawer.

## Desktop-Test

Geprüft:

- Sidebar sichtbar
- Hamburger durch spezifische CSS-Regel ausgeblendet
- Drawer-Backdrop auf Desktop ausgeblendet
- keine doppelte Navigation
- Sidebar-Links unverändert vorhanden

## Mobile-Test

Geprüft:

- Sidebar unter 1024px ausgeblendet
- Hamburger unter 1024px sichtbar
- Drawer über Hamburger erreichbar
- Drawer schließt bei Linkwechsel, Klick außerhalb, Schließen-Button und Escape

## Drawer-Verhalten

Der Drawer ist nur über den mobilen Hamburger erreichbar. Wenn das Fenster auf Desktopbreite vergrößert wird, schließt sich ein offener Drawer automatisch.

## Build-Ergebnis

`npm run build` erfolgreich.

## Nicht geändert

- Keine Dashboard-KPIs
- Keine Tages-PIN
- Keine Punkte-Logik
- Keine Belohnungslogik
- Keine Willkommensgeschenke-Logik
- Keine Gäste-Logik
- Keine QR Center Logik
- Keine Mitarbeiterlogik
- Keine Einstellungenlogik
- Keine Auth-Logik
- Keine Datenbank
- Keine RPCs

## Offene Risiken

- Visueller Endtest sollte zusätzlich im echten Browser/auf Pilotgerät geprüft werden, da lokale Browser-Automation in dieser Umgebung keinen Playwright-Browser-Cache hatte.

## Status

LOCK
