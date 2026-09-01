# Staff QR Primary Action UI

Datum: 2026-08-23  
Branch: `codex/v1-release-finishing-sprint`  
Ausgangscommit: `d123615`

## Ursache

Die vierstellige Tages-PIN war als große dunkle Karte mit mindestens 252 Pixel
Höhe die dominante Komponente der Staff-Startseite. Der bereits vorhandene
Kunden-QR-Scanner war erst im späteren Bereich `Schnell starten` erreichbar.
Damit entsprach die visuelle Reihenfolge nicht mehr dem freigegebenen
restaurantgesteuerten Punkteflow.

## Geänderte Dateien

- `src/modules/staff/StaffTablet.tsx`
- `src/modules/staff/staff-premium.css`
- `tests/staff-qr-primary-action-ui.test.mjs`
- `docs/19_CHANGELOG.md`

## Umsetzung

- Der vorhandene `startQrScanner()` ist direkt nach der Begrüßung über die
  goldene Hauptaktion `QR-Code scannen` erreichbar.
- Kamera, QR-Auswertung, restaurantbezogene Kundensuche, Punkte-Vorschau und
  finale Punktegutschrift verwenden unverändert die vorhandenen Handler und
  Services.
- Ein synchroner Ref-Guard sowie der deaktivierte Ladezustand verhindern eine
  Mehrfachauslösung beim Öffnen der Kamera.
- Die PIN-Karte ist weiß, kompakt und zeigt vier gleich große Ziffernfelder,
  den Nutzungshinweis und `Gültig bis 23:59`.
- Heute-KPIs und Gast-Suche bleiben unterhalb der beiden Prioritätsaktionen.
- Die Bottom-Navigation bleibt bei `Start`, `Tages-PIN` und `Mehr`, da die neue
  Priorisierung keinen zusätzlichen Routingpfad benötigt.

## Responsive QA

Die neuen Staff-Klassen wurden in einer temporären Renderprobe bei 320, 375,
390, 414, 430, 768 und 1024 Pixel geprüft.

- horizontaler Overflow: keiner
- abgeschnittene Aktionsbeschriftungen: keine
- QR-CTA: 52 Pixel hoch
- mobile Reihenfolge: QR vor PIN
- Tablet/Desktop: QR und PIN nebeneinander, QR visuell primär
- Bottom-Navigation: vollständig sichtbar
- Browser-Konsole: keine Fehler oder Warnungen

Ein echter Kamerastart auf physischem Smartphone beziehungsweise Tablet wurde
in diesem Code-Lauf nicht durchgeführt. Die bestehende Kamera- und
Punkte-Businesslogik wurde nicht verändert.

## Qualität

- gezielte Staff-Regressionen: 15/15 erfolgreich
- vollständige Testsuite: 773/773 erfolgreich
- Typecheck: erfolgreich
- Lint: 0 Fehler, 8 bestehende Warnungen
- Production-Build: erfolgreich
- `git diff --check`: erfolgreich

## Abschluss

```text
QR PRIMARY ACTION: PASS
QR ABOVE PIN: YES
QR EXISTING FLOW REUSED: YES
DAILY PIN: PASS
PIN COMPACT: PASS
PIN VALIDITY: PASS
TODAY KPIS: PASS
GUEST SEARCH: PASS
BOTTOM NAV: PASS
320px: PASS
375px: PASS
390px: PASS
414px: PASS
430px: PASS
768px: PASS
1024px: PASS
BUSINESS LOGIC CHANGED: NO
DB MIGRATION: NONE
TESTS: 773/773 PASS
TYPECHECK: PASS
LINT: PASS (0 Fehler, 8 bestehende Warnungen)
BUILD: PASS
STAFF UI READY: YES
```

Der Staff-UI-Code ist für die visuelle Prüfung bereit. Ein finaler Flow-Lock
setzt zusätzlich einen echten Kamera- und QR-Test auf dem Zielgerät voraus.
