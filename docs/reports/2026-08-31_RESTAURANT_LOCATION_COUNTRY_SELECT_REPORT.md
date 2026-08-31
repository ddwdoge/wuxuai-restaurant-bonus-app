# Restaurant Location Country Select Report

Datum: 2026-08-31

## Ursache

Die Owner-Seite `Standort & Restaurantsuche` band `branches.country` direkt an
ein freies Textfeld mit `maxLength={2}`. Dadurch sah der Owner technische Codes
wie `AT`, erhielt keine Laendersuche und konnte beliebige Zwei-Zeichen-Werte
eingeben. Beim Laden und Speichern setzte die Seite fehlende Werte ausserdem
stillschweigend auf `AT`.

## Geaenderte Dateien

- `src/shared/countries.mjs`
- `src/shared/countries.d.mts`
- `src/shared/components/CountrySelect.tsx`
- `src/modules/admin/pages/SettingsPage.tsx`
- `src/styles.css`
- `tests/restaurant-location-country-select.test.mjs`
- aktuelle kanonische Produkt-, Portal-, CTO- und Changelog-Dokumentation

## Was wurde geaendert

- Eine zentrale vollstaendige Liste aller 249 ISO-3166-1-Alpha-2-Codes
  eingefuehrt.
- Sichtbare Laendernamen werden per `Intl.DisplayNames` fuer DE, EN, FR, IT
  und ES erzeugt und ueber alle fuenf Sprachen durchsuchbar gemacht.
- Das freie Standortfeld durch eine ARIA-Combobox mit Suche, Listbox,
  Tastaturnavigation und mindestens 44 Pixel hohen Optionen ersetzt.
- Freie Eingabe leert den kanonischen Wert; erst eine echte Auswahl setzt einen
  gueltigen ISO-Code.
- Implizite `AT`-Fallbacks entfernt und Save-/Geocoding-Vorpruefung auf die
  kanonische ISO-Liste begrenzt.

## Was wurde nicht geaendert

- `branches.country` und alle Save-Payloads bleiben ISO Alpha-2.
- Nominatim erhaelt weiterhin denselben ISO-Code im bestehenden
  `countrycodes`-Filter.
- Keine Aenderung an Publication Readiness, Legal Readiness, Addresspflichten,
  Koordinaten, Map Marker, Restaurant Discovery, RLS oder Tenant-Scope.
- Keine Datenbankmigration und keine Production-/Stripe-Aktion.

## Migration

Keine. Der bestehende kanonische Stringwert ist bereits ISO Alpha-2; nur seine
Owner-Eingabe und lokalisierte Darstellung wurden geaendert.

## Verifikation

- Fokussierte Country-/Geocoding-Tests: 12/12 PASS
- Typecheck: PASS
- Vollstaendige Testsuite: 1214/1214 PASS
- Lint: PASS, 0 Fehler; 7 unveraenderte Bestandswarnungen
- Production-Build: PASS
- `git diff --check`: PASS
- Secret Scan der 35 geaenderten/unversionierten Dateien: PASS, 0 Treffer
- Geaenderte Migrationsdateien: 0
- Reale lokale React-/Chromium-Pruefung bei 320, 375, 390, 414 und 430 px:
  PASS. Suchfeld 48 px, Optionen 44 px, kein horizontaler Overflow.
- `AT` wird als `Oesterreich` angezeigt; Suche nach `Germany` waehlt `DE`.
  Sprachwechsel und Suche nach `Schweiz` zeigen `Switzerland`, waehrend der
  kanonische Wert `CH` bleibt. Keyboard-Auswahl per Enter: PASS.

## Risiken

- Physischer Founder-Test bleibt ausstehend.

Status: CODE LOCK. Der physische Founder-Gate bleibt PENDING.
