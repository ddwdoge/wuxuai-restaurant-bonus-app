# Kontextbezogene Hilfe im Restaurant-Onboarding

Datum: 2026-07-30
Branch: `release/v1-restaurant-bonus`

## Ursache

Der bisherige Drawer `So funktioniert's` fasste Restaurantname,
Öffnungszeiten, Punkteeinlösung und Willkommensgeschenke gemeinsam zusammen.
Dadurch erklärte er unabhängig vom aktiven Schritt auch spätere Inhalte und
half bei der aktuellen Entscheidung nur eingeschränkt.

## Änderung

- Drawer-Titel auf `Hilfe zu diesem Schritt` geändert
- Hilfebutton kompakt als `Hilfe` bezeichnet
- für alle sieben Onboarding-Schritte einen eigenen Inhalt ergänzt
- pro Schritt vier kurze Sätze und eine kleine Zeit- oder Tippzeile
- Drawer-Beschreibung zeigt aktuelle Schrittnummer und Schrittname
- einmaliges automatisches Öffnen und manuelles Wiederöffnen beibehalten

## Nicht geändert

- keine Businesslogik
- keine Formularvalidierung
- keine Navigation oder Schrittreihenfolge
- keine Datenbank, Migration, RLS oder Tenant-Logik

## Qualität

- Typecheck: erfolgreich
- Lint: 0 Fehler
- Tests: 343/343 erfolgreich
- neue Hilfe-Vertragstests: 3
- Build: erfolgreich
- `git diff --check`: erfolgreich

Der erste Buildversuch fand eine lokal leere Drittanbieterdatei unter
`node_modules`. Eine saubere, unveraenderte Lockfile-Installation mit
`npm ci` stellte die Abhaengigkeiten wieder her; danach war der Build
erfolgreich. Projekt- und Lockfile wurden dadurch nicht geaendert.

## Pruefexport

`exports/2026-07-30_ONBOARDING_CONTEXT_HELP.zip`

Das ZIP enthaelt das vollstaendige Projekt ohne Git-Metadaten,
`node_modules`, Build-Ausgaben, Umgebungsdateien, Supabase-Tempdaten und alte
ZIP-Artefakte.

## Status

`CODE_LOCK`
