# Restaurant Portal Responsive Navigation Fix Report

Datum: 2026-07-11  
Status: LOCK

## Gelesene Bible-Dateien

- `AGENTS.md`
- `docs/00_START_HIER.md`
- `docs/04_RESTAURANT_PORTAL.md`
- `docs/06_STAFF_PORTAL.md`
- `docs/15_DESIGN_SYSTEM.md`
- `docs/17_CTO_ENTSCHEIDUNGEN.md`
- `docs/18_CODEX_REGELN.md`

Hinweis: `docs/21_CODEX_SELBSTKONTROLL_LOOP.md` ist im Repository nicht vorhanden. Der Selbstkontroll-Loop wurde nach `AGENTS.md`, `docs/18_CODEX_REGELN.md` und den bisherigen Report-Standards angewendet.

## Ursache

Die mobile Media Query hat die Desktop-Sidebar nicht ausgeblendet, sondern als obere Grid-Navigation weiter angezeigt. Dadurch wurden Menüpunkte bei schmalen Breiten zusammengedrückt. Zusätzlich lagen Header-Branding, Status und Restaurant-Auswahl in einer flexiblen Zeile ohne saubere mobile Struktur.

## Geänderte Dateien

- `src/modules/admin/AdminLayout.tsx`
- `src/styles.css`
- `docs/reports/2026-07-11_RESTAURANT_PORTAL_RESPONSIVE_NAVIGATION_FIX_REPORT.md`

## Desktop-Verhalten

- Linke Sidebar bleibt auf Desktop sichtbar.
- Navigation enthält weiterhin:
  - Dashboard
  - Belohnungen
  - Willkommensgeschenke
  - Gäste
  - QR Center
  - Mitarbeiter
  - Einstellungen
- Hamburger-Menü ist auf Desktop ausgeblendet.

## Mobile-Verhalten

- Sidebar wird bei schmalen Breiten ausgeblendet.
- Im Header erscheint ein Button `Menü`.
- Header nutzt eine zweispaltige mobile Struktur:
  - Restaurantlogo und Restaurantname links
  - Menübutton rechts
  - Status und Restaurant-Auswahl darunter
- Restaurantname, `WUXUAI Bonus` und `Restaurant Portal` bleiben getrennte sichtbare Zeilen.

## Hamburger-Menü Umsetzung

- Neuer mobiler Drawer mit Titel `Restaurant Menü`.
- Button `Schließen` schließt den Drawer.
- Klick außerhalb schließt den Drawer.
- Routenwechsel schließt den Drawer automatisch.
- Drawer nutzt dieselben Navigationsziele wie die Desktop-Sidebar.

## Navigation-Fix

Die Navigation wird nicht mehr in eine schmale obere Zeile gepresst. Mobile nutzt nur noch Drawer-Navigation.

## KPI-Grid Prüfung

Dashboard-KPI-Karten bleiben Mobile First:

- Standard: 1 Spalte
- ab 640px: 2 Spalten
- ab 1120px: 5 Spalten
- Texte nutzen `overflow-wrap`

## Geprüfte Breiten

Geprüft über Code-/CSS-Regeln und Build:

- 390px Mobile
- 430px Mobile
- 768px Tablet
- 1024px Desktop
- normaler Desktop

Browser-Automation konnte wegen fehlendem lokalem Playwright-Browser-Cache nicht ausgeführt werden. Der Code wurde statisch gegen die geforderten Breakpoints geprüft, und `npm run build` ist erfolgreich.

## Nicht geändert

- Keine Produktlogik
- Keine Datenbanklogik
- Keine RPCs
- Keine Punkte-Logik
- Keine Reward-Logik
- Keine Tages-PIN-Logik
- Keine Staff-Portal-Logik

## Build-Ergebnis

`npm run build` erfolgreich.

## Offene Risiken

- Ein echter visueller Screenshot-Test sollte nach Verfügbarkeit eines lokalen Browser-Runners oder direkt im Pilotgerät wiederholt werden.

## Status

LOCK
