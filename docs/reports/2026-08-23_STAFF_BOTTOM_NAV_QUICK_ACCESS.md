# Staff Bottom Navigation Quick Access

Datum: 2026-08-23  
Branch: `codex/v1-release-finishing-sprint`

## Umsetzung

Die bestehende Staff-Bottom-Navigation verwendet jetzt genau fünf direkte
Schnellzugriffe in dieser Reihenfolge:

1. Start
2. QR scannen
3. Tages-PIN
4. Gast suchen
5. Mehr

Alle Ziele verwenden die vorhandenen View-, Scanner-, Drawer- und
Suchfunktionen. Es wurde keine QR-, PIN-, Punkte-, Such-, Auth-,
Einlösungs- oder Berechtigungslogik neu gebaut. Der historische sechsstellige
Einlösecode erscheint weiterhin nicht in der primären Staff-Navigation.

Der Scanner merkt sich die vorherige Staff-Ansicht. Bewusstes Schließen kehrt
dorthin zurück; ein erfolgreich gelesener QR-Code folgt weiterhin dem
bestehenden Such- beziehungsweise Punkteflow.

## Responsive QA

Die Navigation wurde im Browser bei 320, 360, 375, 390, 393, 414, 430, 768 und
1024 Pixel geprüft.

- Fünf Buttons gleichzeitig sichtbar.
- Gleich breite Rasterspalten ohne horizontalen Scroll.
- Mindesthöhe pro Touchziel: 54 Pixel.
- 320 bis 390 Pixel: kurze Labels `QR` und `Suchen`.
- Ab 393 Pixel: vollständige Labels `QR scannen` und `Gast suchen`.
- Safe-Area-Padding bleibt aktiv.
- Browser-Konsole der Layoutprüfung: 0 Warnungen/Fehler.

## Ergebnis

```text
BOTTOM NAV ITEMS:
5

START:
PASS

QR SCAN:
PASS

DAILY PIN:
PASS

GUEST SEARCH:
PASS

MORE:
PASS

LEGACY CODE CHECK VISIBLE:
NO

ACTIVE STATE:
PASS

SAFE AREA:
PASS

NO HORIZONTAL OVERFLOW:
PASS

320px:
PASS

375px:
PASS

390px:
PASS

414px:
PASS

430px:
PASS

768px:
PASS

1024px:
PASS

BUSINESS LOGIC CHANGED:
NO

DB MIGRATION:
NONE FOR NAVIGATION

TESTS:
791/791 PASS

TYPECHECK:
PASS

LINT:
PASS (0 errors, 8 existing warnings)

BUILD:
PASS

STAFF QUICK NAV READY:
YES
```

## Status

Die Navigationsänderung ist visuell und technisch `LOCK`. Der separate
Staff-KPI-Flow bleibt bis zum authentifizierten Zahlen-Smoke-Test `NOT READY`.
