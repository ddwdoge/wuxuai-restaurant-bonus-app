# Mobile Drawer Höhe Polish Report

Datum: 2026-07-11  
Status: LOCK

## Ursache

Der mobile Restaurant-Menü-Drawer hatte `height: 100%`. Dadurch streckte er sich fast über die gesamte Bildschirmhöhe und unter den Menüpunkten entstand unnötig viel leerer Raum.

## Geänderte Dateien

- `src/styles.css`
- `docs/reports/2026-07-11_MOBILE_DRAWER_HOEHE_POLISH_REPORT.md`

## Drawer-Höhe vorher

Vorher:

- `height: 100%`
- Drawer füllte die Overlay-Höhe
- Unter dem letzten Menüpunkt blieb viel leerer Raum

## Drawer-Höhe nachher

Nachher:

- `height: auto`
- `max-height: calc(100vh - 32px)`
- `overflow-y: auto`
- `overflow-x: hidden`
- `width: min(90vw, 320px)`

Der Drawer endet jetzt kurz nach dem Inhalt und bleibt nur bei sehr wenig Platz intern scrollbar.

## Getestete Breiten

Geprüft über CSS-Regeln und Build:

- 390px: Drawer kompakt, Breite maximal 90vw
- 430px: Drawer kompakt
- 768px: Drawer kompakt, Sidebar weiterhin ausgeblendet
- Desktop: Hamburger ausgeblendet, Sidebar sichtbar

## Nicht geändert

- Keine Produktlogik
- Keine Datenbank
- Keine RPCs
- Keine Tages-PIN
- Keine Punkte-/Reward-Logik
- Keine Navigation-Links
- Keine Auth-/RLS-Logik

## Build-Ergebnis

`npm run build` erfolgreich.

## Status

LOCK
