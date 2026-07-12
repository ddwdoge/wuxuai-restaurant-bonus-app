# Mitarbeiter-Seite KPI-Karten Klicklogik Report

Datum: 2026-07-12  
Status: LOCK

## Gelesene Grundlagen

- `AGENTS.md`
- `docs/00_START_HIER.md`
- `docs/06_STAFF_PORTAL.md`
- `docs/17_CTO_ENTSCHEIDUNGEN.md`
- `docs/18_CODEX_REGELN.md`

Hinweis: `docs/21_CODEX_SELBSTKONTROLL_LOOP.md` ist im Repository nicht vorhanden. Die Selbstkontroll-Regeln wurden aus `docs/17_CTO_ENTSCHEIDUNGEN.md` und `docs/18_CODEX_REGELN.md` angewendet.

## Ursache

Die Mitarbeiter-Seite zeigte drei KPI-/Info-Karten, aber keine Karte hatte eine klare Bedienlogik. Dadurch war unklar, ob die Karten klickbar sind oder nur informieren sollen.

## Geänderte Dateien

- `src/modules/admin/pages/StaffPage.tsx`
- `src/styles.css`

## Tages-PIN Karte

Die Karte `Tages-PIN` ist jetzt eine echte klickbare Karte. Sie führt zur vorhandenen Team-Tablet-/Tages-PIN-Funktion über `/staff/:slug`.

Sichtbarer Hinweis:

- `Team Tablet öffnen`

Die Karte besitzt:

- Pointer-Cursor
- Hover-Effekt auf Desktop
- Pfeil-Hinweis
- tap-freundliche Fläche auf Mobile

## Team Karte

Die Karte `Team` bleibt bewusst nicht klickbar, weil die vollständige Mitarbeiterverwaltung in V1 noch nicht fertig ist.

Sichtbarer Hinweis:

- `Für V1 ist das Team Tablet bereits nutzbar.`
- `Mitarbeiterverwaltung folgt`

Es gibt keinen Fake-Link und keinen toten Button.

## Heutige Aktivität

Die Karte `Heutige Aktivität` bleibt bewusst nicht klickbar. Es gibt aktuell keine saubere Detailansicht ohne Risiko von Demo-/Fake-Daten.

Sichtbarer Hinweis:

- `Aktivitätsdetails folgen.`
- `Bald verfügbar`

Damit wird keine leere Detailansicht und kein Fake-Drawer geöffnet.

## Mobile Prüfung

Die Karten bleiben im bestehenden Mobile-First-Grid:

- Mobile: 1 Spalte
- Desktop: 3 Spalten ab vorhandenem Breakpoint
- keine neue horizontale Scrolllogik
- keine gequetschten Buttons
- klickbare Karte hat große Touch-Fläche

## Nicht geändert

- Tages-PIN-Erstellung
- Tages-PIN-Sicherheit
- Punkte-Logik
- Staff Tablet Logik
- Datenbank
- RPC
- Auth
- RLS

## Build Ergebnis

`npm run build` erfolgreich.

Wichtige Ausgabe:

- `StaffPage-BInkRA7B.js`: 2.01 kB, gzip 0.74 kB
- Build abgeschlossen ohne TypeScript- oder Vite-Fehler.

## Offene Risiken

Keine kritischen Risiken im Scope.

Die Aktivitätskarte kann erst klickbar werden, wenn eine echte Tagesaktivitäts-Detailansicht ohne Demo-Daten verbindlich angebunden ist.

## Status

LOCK
