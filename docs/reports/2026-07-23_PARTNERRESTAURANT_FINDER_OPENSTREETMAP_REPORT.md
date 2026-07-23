# Partnerrestaurant-Finder mit OpenStreetMap

Datum: 2026-07-23
Status: **READY_FOR_REVIEW**

## Ausgangslage

- Ausgangsbranch: `codex/fix-qr-restaurant-context`
- Ausgangscommit: `c6e8fcf`
- Feature-Branch: `codex/partner-restaurant-finder`
- Feature-Commit: `083ef0d feat: add partner restaurant finder with OpenStreetMap`
- Die V1-Datenstruktur hat `restaurants` und eine über `branches.restaurant_id` eindeutig zugeordnete Hauptfiliale.
- Vor dieser Änderung gab es keine Standortkoordinaten, öffentliche Sichtbarkeitsfreigabe oder Kartenbibliothek.
- QR-Slug, Kundentoken, Punkte und aktive Einlösungen bleiben restaurantbezogen. Die Restaurantsuche verändert diesen Kontext nicht.

## Kartenentscheidung

- Verwendet: Leaflet 1.9, React-Leaflet 4.2 und Leaflet MarkerCluster.
- Kartenbasis: OpenStreetMap-Rasterkacheln mit sichtbarer Attribution.
- Google Maps JavaScript API: nicht verwendet.
- Google Places, Nearby Search, Routes und Distance Matrix: nicht verwendet.
- Google API-Key: nicht erforderlich.
- Externe Navigation verwendet ausschließlich sichere Google-Maps-URLs mit Koordinaten und `URLSearchParams`.

## Datenbank und RPC

Neue additive Migration:

`supabase/migrations/20260723001000_partner_restaurant_finder.sql`

Ergänzt an der V1-Hauptfiliale:

- Adresse, PLZ, Ort und Land
- Latitude und Longitude mit Wertebereichs-Constraints
- `is_discoverable` mit sicherem Standard `false`
- öffentliche Kurzbeschreibung und Cover-URL

Neue sichere RPCs:

- `get_public_partner_restaurants()` liefert ausschließlich aktive, freigegebene Partner mit gültigen Koordinaten und minimalen öffentlichen Daten.
- `get_customer_partner_membership(slug, token)` liefert nur nach serverseitiger Token-Restaurant-Prüfung Punkte, Besuche und Reward-Fortschritt für genau dieses Restaurant.

Es wurde keine Public-Select-Policy auf interne Restaurant-, Kunden- oder Mitgliedschaftstabellen ergänzt. RLS wurde nicht gelockert.

## Customer Portal

- Neue Route: `/customer/restaurants`
- Suche nach Restaurantname, Ort, PLZ und Adresse, einschließlich Umlaut-normalisierter Suche.
- Mobile Umschaltung zwischen Karte und Liste; Desktop mit Karte und Liste nebeneinander.
- Marker-Clustering und zugängliche Zustände für Partner, Mitgliedschaft, Punkte, fast erreichte und verfügbare Punkteeinlösungen.
- Marker-Klick öffnet nur eine lokale Detailkarte beziehungsweise ein Bottom Sheet.
- Standortfreigabe wird ausschließlich nach Klick auf „In meiner Nähe“ angefragt und nicht gespeichert.
- Entfernung wird lokal als Luftlinie berechnet.
- „Restaurant ansehen“ ist eine ausdrückliche Navigation; Marker-Klick registriert keinen Kunden und bucht keine Punkte.
- „In Google Maps öffnen“ verwendet `https://www.google.com/maps/dir/?api=1&destination=...` ohne API-Key.

## Owner Portal

Die bestehenden Einstellungen enthalten nun den Bereich „Standort & Restaurantsuche“ für die vorhandene Hauptfiliale:

- Adresse und Koordinaten pflegen
- öffentliche Kurzbeschreibung und Cover-URL pflegen
- Marker-Vorschau
- Sichtbarkeit explizit aktivieren oder deaktivieren
- Aktivierung nur bei vollständiger Adresse und gültigen Koordinaten

Die Update-Abfrage ist mit Filial-ID und Restaurant-ID gescopet; bestehende Owner-RLS bleibt die letzte Autorität. Es wurde keine neue Filialverwaltung gebaut.

## QR- und Redemption-Sicherheit

- Kartenwahl ändert keinen aktiven Restauranttoken.
- Keine automatische Registrierung, Punktebuchung oder Einlösung.
- Gespeicherte Kundentokens werden nur für denselben Restaurant-Slug verwendet.
- Membership-RPC validiert Token-Hash und Restaurant serverseitig.
- Aktive Einlösungen bleiben weiterhin restaurant- und tokenbezogen.
- Der bestehende QR-Kontext-Fix und seine Verhaltenstests bleiben grün.

## Validierung

- Gebietssuche „Wien“ mit lokalen kontrollierten Partnerdaten: 2 von 3 passenden Partnern korrekt gefunden.
- Markerzahl, Auswahl, Liste und Detailkarte: geprüft.
- Externer Google-Maps-Link: korrekt und ohne API-Key.
- Responsive Browser-QA: 390, 430, 768, 1024 und 1440 px.
- 390 px: `scrollWidth === innerWidth`, vollständige Überschrift, Suche 48 px, Kartensteuerung 44 px.
- Tablet: zweigeteilte Ansicht nutzt die verfügbare Breite.
- Desktop: Karte und Ergebnisliste ohne horizontalen Overflow.
- Browser-Console-Errors: 0.
- Unerwartete Network-Errors im kontrollierten lokalen Test: 0.
- Typecheck: erfolgreich.
- Lint: 0 Fehler, 7 bereits bestehende Warnungen.
- Tests: 103/103 erfolgreich.
- Build: erfolgreich.

## Staging-Abschluss

- Bestätigtes Projekt: `wuxuai-bonus-staging`
- Projekt-Ref: `bwhvfjuwixgwduoeqaya`
- Umgebung: ausschließlich Staging, keine Production-Migration.
- Migration `20260723001000_partner_restaurant_finder.sql` erfolgreich angewendet.
- Erneuter Dry-Run: Remote-Datenbank ist aktuell, keine ausstehende Migration.
- Public-RPC mit `anon`: HTTP 200 und ausschließlich freigegebene Finder-Felder.
- Direkter `anon`-Select auf `branches`: keine Zeilen sichtbar.
- Drei freigegebene Partnerstandorte vorbereitet: zwei in Wien, einer in Mödling.
- Ein aktiver Standort mit gültigen Koordinaten und `is_discoverable = false`
  blieb vollständig aus der öffentlichen RPC, Karte und Liste ausgeschlossen.

### Authentifizierter Owner-Test

- Temporären Owner ausschließlich für ein isoliertes Staging-Restaurant erstellt.
- Standortdaten, Adresse, Koordinaten, Kurzbeschreibung und Markervorschau geladen.
- Adresse, Koordinate, Beschreibung und Sichtbarkeit über die echte Owner-UI geändert und gespeichert.
- Deaktivierte Sichtbarkeit entfernte den Standort sofort aus der öffentlichen Suche.
- Standort anschließend auf den vorgesehenen Staging-Teststand zurückgesetzt und wieder freigegeben.
- Fremde Filiale mit Owner-JWT zu ändern ergab eine leere Update-Menge; der Datensatz blieb unverändert.
- Keine Multi-Filialverwaltung sichtbar; V1 bearbeitet nur den primären Standort.
- Temporäre Mitgliedschaft und Auth-Benutzer vollständig gelöscht.
- Erneute Anmeldung des gelöschten Benutzers schlug erwartungsgemäß fehl; geschützte Route leitete zurück.

### Kunden- und QR-Livetest

- Suche nach `Wien`: exakt zwei Wiener Partner.
- Suche nach `1030`, Restaurantname, Groß-/Kleinschreibung und Umlaut-Fallback `modling`: korrekt.
- Keine-Treffer-Suche: korrekt leer.
- Drei temporäre, als Testkunden markierte Restaurantmitgliedschaften lieferten getrennt:
  - Punkte: 25, 122 und 7
  - Besuche: 2, 2 und 1
  - sofort verfügbare Punkteeinlösung beim ersten Restaurant
  - `Nur noch 12 Punkte` beim zweiten Restaurant
- Keine restaurantübergreifende Punkteaddition.
- Externer Google-Maps-Link enthielt die richtigen Zielkoordinaten und keinen API-Key.
- QR-Regression mit aktiver Einlösung:
  - Code bei Restaurant A aktiv.
  - Wechsel zu Restaurant B zeigte weder Restaurant-A-Daten noch dessen Code.
  - Rückkehr zu A stellte denselben servervalidierten Code wieder her.
- Temporäre Testkunden, Tokens, Punktetransaktionen und der aktive Testcode wurden nach dem Test gelöscht.

### Responsive und PWA

- Staging-Daten bei 390, 430, 768, 1024 und 1440 px geprüft.
- `scrollWidth === innerWidth` auf allen fünf Breiten.
- Keine sichtbare Touchfläche unter 44 px außerhalb der vorgeschriebenen Kartenattribution.
- Production Preview bei 390 px: drei Partner, Attribution sichtbar, kein Overflow.
- `sw.js` im Production Preview mit HTTP 200 erreichbar.
- Physischer Mobile-Safari-Test: nicht verfügbar.
- Installierte PWA auf einem physischen Gerät: nicht verfügbar.
- Browser-Console-Errors über Finder-, Owner- und Kundenflows: 0.
- Unerwartete Network-Errors: 0. Zwei fehlerhafte Testdaten-Inserts wurden vor erfolgreicher Korrektur serverseitig vollständig mit HTTP 400 abgelehnt und erzeugten keine Teilzeilen.

## Supabase-Status

`npx supabase db push` war gegen das eindeutig bestätigte Staging-Projekt
erfolgreich. `npx supabase migration list` führt die Migration lokal und remote.
Der abschließende Dry-Run meldet eine aktuelle Remote-Datenbank. Es wurden keine
Produktionsdaten verändert.

## Geänderte Hauptdateien

- `src/modules/customer/PartnerRestaurantFinderPage.tsx`
- `src/modules/customer/PartnerRestaurantMap.tsx`
- `src/modules/customer/partner-restaurant-finder.css`
- `src/modules/customer/partnerRestaurantFinder.mjs`
- `src/modules/customer/partnerRestaurantService.ts`
- `src/modules/admin/pages/SettingsPage.tsx`
- `src/modules/customer/CustomerPortal.tsx`
- `src/app/App.tsx`
- `supabase/migrations/20260723001000_partner_restaurant_finder.sql`
- `tests/partner-restaurant-finder.test.mjs`

## Offene Risiken vor Final Lock

- Physischer Mobile-Safari- und installierter PWA-Test stehen aus.
- Reale Standortberechtigung wurde nicht erteilt; Ablehnung/Fallback und Entfernung sind automatisiert beziehungsweise ohne präzise Standortübertragung geprüft.
- Das öffentliche Cover wird in V1 als HTTPS-URL gepflegt; ein eigener Bild-Upload wurde bewusst nicht ergänzt.

## Entscheidung

Code, Migration, RLS-Negativtest, Owner-Flow, Kundenstatus und QR-Regression sind
auf Staging geprüft. Wegen des nicht verfügbaren physischen Mobile-Safari- und
installierten PWA-Tests wird kein `READY_FOR_FINAL_LOCK` behauptet.

Status: **READY_FOR_REVIEW**
