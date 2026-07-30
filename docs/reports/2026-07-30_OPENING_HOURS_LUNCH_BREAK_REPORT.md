# V1 Öffnungszeiten mit Mittagspause

Datum: 30.07.2026  
Branch: `release/v1-restaurant-bonus`

## Ursache und Ausgangszustand

Öffnungszeiten wurden bereits als restaurantbezogenes `jsonb` in
`restaurants.opening_hours` gespeichert. Das bestehende Modell enthielt pro
Wochentag nur `enabled`, `open` und `close`; die Datenbankstruktur selbst ist
jedoch flexibel genug für additive Felder. Deshalb war keine Migration nötig.

## Umsetzung

- Gemeinsamer Öffnungszeiten-Editor für Onboarding und Einstellungen.
- Standardmäßig ein Öffnungsblock `von`/`bis`.
- Optionaler Button `Mittagspause hinzufügen`.
- Nach Aktivierung: automatisch vorgeschlagene Öffnungszeit 1, Mittagspause und Öffnungszeit 2.
- Maximal zwei Öffnungsblöcke pro Tag.
- Serverseitig gespeicherte Altwerte ohne Pausenfelder werden beim Lesen
  normalisiert und unverändert als ein Block behandelt.
- Validierung blockiert leere Zeiten, umgekehrte Zeiträume, Überlappungen und
  einen zweiten Block vor Ende der Pause.
- Ein zentraler Helper berechnet Vorschläge nur für Tagesöffnungen ab acht
  Stunden und erhält mindestens 90 Minuten Öffnung vor und nach der Pause.
- Bereits gespeicherte Pausen werden nicht neu berechnet. Beim Entfernen wird
  der zweite Block wieder korrekt mit dem ersten zu einer Tagesöffnung verbunden.
- Die Kundenansicht im Partnerrestaurant-Finder zeigt beide Blöcke. Während
  einer Pause erscheint `Momentan Mittagspause – wieder geöffnet ab HH:MM`.
- Die Tagesauswertung verwendet `Europe/Vienna`.

## Geänderte Bereiche

- `src/shared/openingHours.mjs`
- `src/shared/openingHours.d.mts`
- `src/shared/components/OpeningHoursEditor.tsx`
- `src/modules/admin/pages/RestaurantOnboarding.tsx`
- `src/modules/admin/pages/SettingsPage.tsx`
- `src/modules/customer/PartnerRestaurantFinderPage.tsx`
- `src/styles.css`
- `tests/opening-hours-lunch-break.test.mjs`

## Nicht geändert

- keine Datenbankmigration
- keine RLS- oder Tenant-Regel
- keine Auth-, Punkte-, Reward-, PIN- oder QR-Logik
- keine bestehenden Restaurant-IDs oder gespeicherten Altwerte

## Prüfungen

- bestehender Einzelblock bleibt kompatibel
- aktivierter Standardtag bleibt aktiviert
- zwei gültige Blöcke werden akzeptiert
- Überschneidungen werden blockiert
- geschlossene Tage verlangen keine Zeit
- Kundenhinweis und Mittagspausenstatus werden getestet

## Qualitätsergebnis

- Typecheck: erfolgreich
- Lint: 0 Fehler, 6 bestehende Warnungen
- Tests: 355/355 erfolgreich
- Build: erfolgreich
- `git diff --check`: erfolgreich
- Responsive Browserprüfung: 390, 430, 768 und 1440 px ohne horizontalen
  Overflow auf der öffentlich erreichbaren Formularoberfläche
- Browserkonsole: 0 Fehler

## Offene Prüfung

Die automatisierte responsive Prüfung ersetzt keinen physischen Test der
nativen Zeitfelder auf einem iPhone mit Mobile Safari. Dieser bleibt Teil der
visuellen Freigabe.
