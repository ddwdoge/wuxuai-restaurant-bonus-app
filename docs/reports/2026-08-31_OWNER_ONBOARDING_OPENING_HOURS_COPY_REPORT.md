# Owner Onboarding Opening Hours Copy Report

## Ursache

Der kanonische Öffnungszeiten-Editor verlangte bisher die manuelle Eingabe für
jeden Wochentag. Eine gemeinsame Kopieraktion existierte weder im Onboarding
noch in den Einstellungen.

## Geänderte Dateien

- `src/shared/openingHours.mjs` und Typdeklaration
- `src/shared/components/OpeningHoursCopyAction.tsx`
- `src/modules/admin/pages/RestaurantOnboarding.tsx`
- `src/modules/admin/pages/SettingsPage.tsx`
- `src/styles.css`
- fokussierte Tests und aktuelle Vertragsdokumentation

## Was wurde geändert

Die vollständige Montagskonfiguration kann auf Dienstag bis Sonntag kopiert
werden. Abweichende Zielwerte verlangen eine Bestätigung. Das Onboarding hält
den kopierten Stand lokal und übernimmt ihn erst über `Weiter`; Einstellungen
verwenden weiterhin ausschließlich die vorhandene Speichern-Aktion.

## Was wurde nicht geändert

Öffnungszeitenmodell, Validierung, Restaurant-Zeitzone, öffentliche
Offen-/Geschlossen-Berechnung, Datenbank, RLS und Businesslogik blieben
unverändert.

## Prüfung

- Tests: 1199/1199 PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler und 7 bestehende Warnungen
- Build: PASS, 2069 Module mit nicht-produktiven Build-Platzhaltern
- Desktop und Tablet: gemeinsamer responsiver Komponentenvertrag geprüft
- Mobile 320/375/390/414/430: PASS, kein horizontaler Überlauf
- Touchflächen: 48 Pixel in der lokalen datenfreien Browser-Vorschau
- Development/Test-Preview: `http://127.0.0.1:4186/`, Schritt `Geöffnet`
- Preview-Vertrag: keine Anmeldung, keine Speicherung und keine
  Datenbankverbindung
- Migration: keine
- Production: nicht angefasst

## Status

`CODE LOCK`
