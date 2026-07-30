# Startseite Karten klickbar UI Fix Report

Datum: 2026-07-13

## Ursache

Die öffentliche Startseite hatte eine Gast-Karte mit nicht passender englischer/technischer Wirkung. Außerdem waren die Karten zwar als Links umgesetzt, wirkten aber visuell eher wie Info-Karten als klare Aktionen.

## Geänderte Dateien

- `src/modules/public/PublicHome.tsx`
- `src/app/App.tsx`
- `src/styles.css`
- `docs/19_CHANGELOG.md`

## Textänderungen

- Die Gast-Karte heißt jetzt `Gast-Bonus öffnen`.
- Der Untertitel lautet: `Für Gäste, die ihr Bonuskonto öffnen oder einen QR-Code scannen möchten.`
- Alle Karten zeigen eine kurze Aktion:
  - `Öffnen`
  - `Starten`
  - `Öffnen`
- `/customer` ohne Restaurant-Kontext zeigt jetzt die deutsche Seite `Bonus für Gäste`.

## Klickverhalten

- Die gesamte Karte ist jeweils die Klickfläche.
- Restaurant Login führt zu `/login`.
- `30 Tage kostenlos starten` führt zu `/register`.
- `Gast-Bonus öffnen` führt zu `/customer`.
- Hover, Pointer-Cursor und sichtbarer Tastatur-Fokus wurden ergänzt.

## Routing

- `/customer` rendert jetzt eine deutsche Gast-Info-Seite ohne Demo-Daten.
- `/customer/:slug` und `/w/:slug` bleiben unverändert und führen weiter ins echte Customer Portal.

## Mobile Prüfung

Geprüft mit 390px Mobile-Viewport:

- keine horizontale Scrollbar (`scrollWidth = 390`)
- Karten untereinander
- Texte brechen sauber um
- Klickflächen bleiben groß genug

Screenshots:

- `docs/reports/assets/2026-07-13_STARTSEITE_KARTEN_KLICKBAR_UI_FIX/01-startseite-desktop.png`
- `docs/reports/assets/2026-07-13_STARTSEITE_KARTEN_KLICKBAR_UI_FIX/02-customer-ohne-token-desktop.png`
- `docs/reports/assets/2026-07-13_STARTSEITE_KARTEN_KLICKBAR_UI_FIX/03-startseite-mobile.png`
- `docs/reports/assets/2026-07-13_STARTSEITE_KARTEN_KLICKBAR_UI_FIX/04-customer-ohne-token-mobile.png`

## Build Ergebnis

`npm run build` erfolgreich.

## Nicht geändert

- keine Datenbank
- keine RPCs
- keine Auth-Logik
- keine Customer-Token-Logik
- keine QR-Logik
- keine Tages-PIN-Logik
- keine Punkte- oder Punkteeinlösungslogik
- keine Willkommensgeschenk-Logik

## Offene Risiken

Keine kritischen offenen Risiken im Scope dieser UI-Aufgabe.

## Status

LOCK
