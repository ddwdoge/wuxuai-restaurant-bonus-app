# QR Center A6 Druckvorlagen Fix Report

Datum: 2026-07-11  
Status: LOCK

## Gelesene Bible-Dateien

- `AGENTS.md`
- `docs/00_START_HIER.md`
- `docs/04_RESTAURANT_PORTAL.md`
- `docs/15_DESIGN_SYSTEM.md`
- `docs/17_CTO_ENTSCHEIDUNGEN.md`
- `docs/18_CODEX_REGELN.md`

Hinweis: `docs/21_CODEX_SELBSTKONTROLL_LOOP.md` ist im Repository nicht vorhanden. Der Selbstkontroll-Loop wurde nach den vorhandenen Codex-Regeln und bisherigen Report-Standards angewendet.

## Geänderte Dateien

- `src/modules/admin/pages/QrCenterPage.tsx`
- `src/styles.css`
- `docs/reports/2026-07-11_QR_CENTER_A6_DRUCKVORLAGEN_FIX_REPORT.md`

## Umsetzung

### A6 PDF

Das QR Center erzeugt jetzt ein echtes PDF-Blob mit A6-Hochformatseiten.

Format:

- 105 mm x 148 mm
- PDF-Seitenformat A6
- Druckoptimierte Canvas-Größe
- QR-Codes groß und mittig
- Restaurantlogo proportional dargestellt
- Footer: `Powered by WUXUAI Bonus`

### Jede QR-Vorlage eigene Seite

Das Starter Kit enthält vier eigene A6-Seiten:

1. Neue Gäste QR
2. Bonuspunkte sammeln / Kassa QR
3. Kassa-Aufsteller
4. Mitarbeiter QR

### Bonus Boost auf Kundenseiten

Auf den drei gastbezogenen Druckseiten wird unter dem QR-Code ein kompakter Bonus-Boost-Hinweis angezeigt:

- Freunde einladen lohnt sich
- Du bekommst 2× Punkte
- Dein Freund bekommt 2× Punkte
- 30 Tage Bonus Boost
- Aktiv nach dem ersten Besuch des Freundes

Die Mitarbeiterseite enthält diesen Hinweis bewusst nicht.

### QR Center UI

Das QR Center zeigt:

- Hauptaktion: `Starter Kit als PDF öffnen`
- Neue Gäste QR
- Kassa QR
- Kassa-Aufsteller
- Mitarbeiter QR

Der Hauptbutton öffnet das PDF in einem neuen Browser-Tab. Falls der Browser das Öffnen blockiert, wird das PDF als Datei heruntergeladen.

Zusätzlich bleiben PNG-Downloads pro QR sichtbar. SVG ist nicht als Hauptaktion eingebaut.

## Nicht geändert

- Keine Datenbankänderung
- Keine neue Migration
- Keine RPC-Änderung
- Keine QR-URL-Logik geändert
- Keine Punkte-Logik geändert
- Keine Tages-PIN-Logik geändert
- Keine neue Business-Regel

## Responsive Prüfung

- Vier QR-Karten brechen auf kleineren Desktop-/Tabletbreiten zweispaltig um.
- Auf Mobile werden die QR-Karten einspaltig dargestellt.
- Texte in QR-Karten umbrechen.
- Keine technische URL wird sichtbar unter den QR-Codes angezeigt.

## Build

`npm run build` erfolgreich.

## Offene Risiken

- Die tatsächliche Scanbarkeit hängt im Pilot zusätzlich von Druckerqualität, Papiergröße und Laminierung ab.
- Wenn ein externes Logo wegen fehlender CORS-Freigabe nicht in Canvas gezeichnet werden kann, fällt die PDF-Erzeugung automatisch auf das WUXUAI/Initial-Logo zurück.

## Status

LOCK
