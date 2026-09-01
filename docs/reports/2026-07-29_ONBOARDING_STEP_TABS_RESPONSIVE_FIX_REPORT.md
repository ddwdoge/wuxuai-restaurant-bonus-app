# Onboarding Step Tabs Responsive Fix

Datum: 29.07.2026  
Branch: `codex/v13-legal-maps-hardening`

## Ursache

Die Step-Navigation verwendete ein `auto-fit`-Grid mit nur `42px`
Mindesthöhe. Lange einteilige Titel wie „5. Willkommensgeschenke“ besaßen
keinen begrenzten zweizeiligen Label-Container und konnten deshalb optisch aus
dem Tab ragen.

## Geänderte Dateien

- `src/modules/admin/pages/RestaurantOnboarding.tsx`
- `src/styles.css`

## Änderung

- Step-Titel liegen in einem eigenen zentrierten Label-Element.
- Titel werden auf maximal zwei Zeilen begrenzt.
- Lange Wörter dürfen innerhalb des verfügbaren Tabs sicher umbrechen.
- Alle Tabs haben dieselbe Höhe von `58px` und eine identische Breite je
  Breakpoint.
- Mobile verwendet zwei, Tablet vier und breiter Desktop sieben gleich breite
  Grid-Spalten.
- Schriftgröße und Darstellung kurzer Titel bleiben unverändert.

## Nicht geändert

- Onboarding-Logik und Reihenfolge
- Validierung und Speicherung
- Datenbank, RPCs und RLS
- andere Portale

## Prüfung

- Typecheck: erfolgreich
- Lint: 0 Fehler, 6 bestehende Warnungen
- Tests: 315 von 315 erfolgreich
- Build: erfolgreich
- `git diff --check`: erfolgreich

Die responsive CSS-Struktur wurde für Mobile, Tablet und Desktop geprüft. Eine
authentifizierte visuelle Browserabnahme des Owner-Onboardings bleibt offen.

## Status

`CODE LOCK`
