# WUXUAI Bonus V1 – Partnerlokal-Finder mit Punkten und Karte

Datum: 03.08.2026
Branch: `codex/restaurant-controlled-points-flow`
Ausgangscommit: `5173a9d1bf353fc2ed02fcc4cd9280ec04814b60`

## Ursache und Ausgangslage

Der vorhandene Partnerrestaurant-Finder nutzte bereits Leaflet, OpenStreetMap,
eine Karten- und Listenansicht sowie eine optionale Standortfreigabe. Öffentliche
Standorte wurden über `get_public_partner_restaurants()` geladen. Anschließend
wurde pro Restaurant ein weiterer RPC-Aufruf für den persönlichen
Mitgliedschaftsstatus ausgeführt. Das erzeugte eine N+1-Abfragefolge und ließ
Filter, eine zentrale Reward-Fortschrittsschwelle und eine vollständige
Mittagspausenanzeige offen.

Standorte sind als `branches` mit Restaurantzuordnung modelliert. Koordinaten,
Adresse, öffentliche Kurzbeschreibung, Coverbild und `is_discoverable` sind
bereits vorhanden. Öffnungszeiten, Sondertage und Feiertage liegen am
Restaurant. Punkte, Besuche, Rewards und Kundenzugänge sind restaurantbezogen.

## Umsetzung

- Die Kundenseite heißt sichtbar `Lokale entdecken` und erklärt die getrennten
  Punktestände pro Lokal.
- Karte und barrierefreie Liste bleiben gleichwertige Ansichten.
- Sechs Filter sind vorhanden: Nähe, besucht, Punkte, Reward-Nähe, geöffnet und
  alle Partner.
- `Belohnung bald erreichbar` wird zentral ab 70 Prozent berechnet.
- Öffnungsstatus, Tageszeiten und Mittagspause verwenden `Europe/Vienna`.
- Marker besitzen zusätzlich zur Farbe sichtbare Symbole und zugängliche
  Statusbeschriftungen.
- Standortfreigabe erfolgt nur nach aktiver Aktion. Ohne Freigabe bleiben Suche,
  Karte und Liste nutzbar. Kundenkoordinaten werden nicht gespeichert.
- Externe Navigation verwendet einen Google-Maps-Weblink ohne API-Key.
- Bilder werden verzögert geladen.

## Daten- und Sicherheitsvertrag

Die additive Migration
`20260803004000_aggregate_partner_local_finder.sql` ergänzt
`get_partner_local_finder(jsonb, integer, integer)`.

Der RPC:

- liefert höchstens 100 Standorte pro Aufruf und unterstützt Offset;
- berücksichtigt nur aktive Restaurants, aktive Bonusprogramme, aktive und
  ausdrücklich auffindbare Standorte mit vollständiger Adresse und gültigen
  Koordinaten;
- schließt beendete beziehungsweise für Punktevergabe bereits geschlossene
  Programme aus;
- prüft jeden Kundenzugang serverseitig gegen Tokenhash, Restaurant, Ablauf und
  aktive Mitgliedschaft;
- liefert keine Namen, Telefonnummern, Geburtstage, Geräte-IDs, Klartexttoken
  oder Tokenhashes;
- gibt persönliche Punkte, Besuche und Rewards ausschließlich für den jeweils
  validierten Restaurantzugang zurück;
- verändert keine RLS-Policy und entzieht `public` die Ausführung;
- ist bewusst nur für `anon` und `authenticated` ausführbar;
- ersetzt im aktiven Finder die N+1-Abfragen durch einen gebündelten Payload.

Die bisherigen Finder-RPCs bleiben als Kompatibilitätsverträge erhalten.
Kartenklicks speichern keinen aktiven Restaurantkontext, registrieren keinen
Kunden, buchen keine Punkte und starten keine Einlösung. `Bonus öffnen` verwendet
nur den für diesen Restaurant-Slug gespeicherten Zugang. Der QR-Kontext bleibt
die einzige Quelle der Wahrheit für Punkte-Sammelvorgänge.

## Geänderte Dateien

- `src/modules/customer/PartnerRestaurantFinderPage.tsx`
- `src/modules/customer/PartnerRestaurantMap.tsx`
- `src/modules/customer/customerTokenStorage.ts`
- `src/modules/customer/partner-restaurant-finder.css`
- `src/modules/customer/partnerRestaurantFinder.d.mts`
- `src/modules/customer/partnerRestaurantFinder.mjs`
- `src/modules/customer/partnerRestaurantService.ts`
- `src/shared/openingHours.d.mts`
- `src/shared/openingHours.mjs`
- `supabase/migrations/20260803004000_aggregate_partner_local_finder.sql`
- `tests/partner-restaurant-finder.test.mjs`
- `tests/opening-hours-lunch-break.test.mjs`
- relevante Engineering-Bible-Dateien

Bereits vorher vorhandene, nicht zu dieser Aufgabe gehörende Änderungen im
Arbeitsbaum wurden weder verworfen noch inhaltlich übernommen.

## Tests und QA

- Fokustests Partnerfinder und Mittagspause: erfolgreich
- Gesamttests: 558/558 erfolgreich
- Typecheck: erfolgreich
- Lint: 0 Fehler, 6 bestehende Warnungen außerhalb des Finder-Scope
- Build: erfolgreich
- Supabase Dry-Run gegen `wuxuai-bonus-staging` (`bwhv…qaya`): erfolgreich;
  geplant wird ausschließlich `20260803004000_aggregate_partner_local_finder.sql`
- Migration angewendet: Nein
- RLS geändert: Nein

Die lokale App-Shell wurde bei 390, 430, 768, 1280 und 1440 Pixel geprüft.
Bei allen fünf Breiten entsprach `document.documentElement.scrollWidth` der
Viewportbreite; sichtbare Aktionen unterschritten 44 × 44 Pixel nicht. Der
Fehlerzustand bleibt bedienbar und ohne horizontalen Overflow.

Browser-Konsole: 0 Fehler; vorhanden sind ausschließlich bestehende React-
Router-Zukunftswarnungen. Netzwerk: der noch nicht migrierte Aggregat-RPC schlägt
im lokalen Lauf gegen Staging erwartungsgemäß fehl; deshalb wird dieser Lauf
nicht als erfolgreicher Daten-E2E gewertet.

Die vollständige datenreiche Kartenansicht kann lokal noch nicht gegen Staging
geprüft werden, weil der neue RPC bewusst noch nicht angewendet wurde. Ein
physischer Mobile-Safari- und installierter PWA-Test wurde in dieser Aufgabe
nicht durchgeführt.

## Offene Risiken

1. Staging-Migration und echter E2E mit mehreren freigegebenen Partnerlokalen
   sind noch offen.
2. Physischer Mobile-Safari-, PWA- und echter Standortfreigabetest sind offen.
3. Das bestehende Datenmodell besitzt keinen verlässlichen allgemeinen
   `is_test_restaurant`-Marker. Die Veröffentlichung wird aktuell durch aktive
   Readiness, aktives Bonusprogramm und explizites `is_discoverable` geschützt.
   Eine testrestaurantbezogene Ausnahme darf erst mit einem serverseitig
   vertrauenswürdigen Testmodus ergänzt werden.
4. Sonderöffnungszeiten werden nur dann strukturiert ausgewertet, wenn Datum
   und Zeitfenster maschinenlesbar vorliegen; unstrukturierte Freitexte werden
   nicht als sichere Öffnungsentscheidung interpretiert.

## Status

`READY_FOR_VISUAL_REVIEW`

Noch nicht `READY_FOR_STAGING_E2E`, weil die additive Migration nicht angewendet
und der echte mehrlokalige Staging-Flow nicht ausgeführt wurde.
