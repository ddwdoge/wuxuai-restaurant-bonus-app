# V1 Pflichtfelder einheitlich kennzeichnen

Datum: 30.07.2026  
Branch: `release/v1-restaurant-bonus`

## Ursache

Pflichtfelder waren in mehreren V1-Formularen technisch validiert, aber nicht
überall sichtbar und barrierefrei einheitlich gekennzeichnet. Teilweise wurden
native `required`-Attribute ohne sichtbaren Hinweis verwendet, während andere
Formulare eigene Beschriftungsmuster hatten.

## Gemeinsame Lösung

`FormLabel` rendert für fachlich verpflichtende Felder `Label *` und ergänzt
den nicht nur farblich vermittelten Screenreader-Text `Pflichtfeld`.
`RequiredFieldsNote` zeigt am Beginn eines Formularbereichs:

> Mit * gekennzeichnete Felder sind Pflichtfelder.

Optionale Felder können einheitlich mit `Optional` markiert werden. Die
eigentliche Formularvalidierung verwendet weiterhin native Constraints und
bestehende serverseitige Prüfungen.

## Geprüfte und angepasste Bereiche

- öffentliche Restaurant-Anmeldung und Login
- Owner-Onboarding einschließlich Rechtliches, Aussehen, Öffnungszeiten und
  Punkteeinlösung
- Restaurantdaten, Branding, Standort und Öffnungszeiten
- Punkteeinlösungen und Willkommensgeschenke
- Bonusprogramm und Freundschaftsbonus
- Kundenregistrierung und Empfehlungsregistrierung
- Kunden-Supportänderungen
- Legal Center und Programmende
- Staff-Suche, Punktebuchung, Codeprüfung und Tages-PIN

## Validierung und Barrierefreiheit

- sichtbares Sternchen direkt nach dem Feldnamen
- zusätzlicher Screenreader-Text `Pflichtfeld`
- `aria-required="true"` an fachlich verpflichtenden Eingaben
- natives `required`, sofern das bestehende Formular dies sinnvoll unterstützt
- geschlossene Wochentage verlangen keine Zeitfelder
- aktivierte Mittagspause verlangt beide Öffnungsblöcke
- Onboarding fokussiert beim blockierten Weiter-Schritt das erste festgestellte
  ungültige Feld
- Fehlermeldungen bleiben direkt am betroffenen Formularbereich sichtbar

## Nicht geändert

- keine Migration
- keine RLS- oder Security-Regel
- keine serverseitige Businesslogik
- keine Pflicht aus optionalen Marketing- oder Geburtstagsangaben gemacht

## Qualitätsergebnis

- Typecheck: erfolgreich
- Lint: 0 Fehler, 6 bestehende Warnungen
- Tests: 355/355 erfolgreich
- Build: erfolgreich
- `git diff --check`: erfolgreich
- Responsive Browserprüfung: 390, 430, 768 und 1440 px ohne horizontalen
  Overflow
- geprüfte öffentliche Hauptaktion: 52 px Touchhöhe
- Browserkonsole: 0 Fehler

## Offene Prüfung

Die automatisierte Browserprüfung deckt responsive Breiten und Tastatursemantik
ab. Ein physischer Mobile-Safari-Test sowie eine vollständige Screenreader-
Abnahme bleiben Teil der visuellen beziehungsweise Accessibility-Freigabe.
