# Partnerrestaurant-Finder mit OpenStreetMap

Datum: 2026-07-23
Status: **READY_FOR_STAGING**

## Ausgangslage

- Ausgangsbranch: `codex/fix-qr-restaurant-context`
- Ausgangscommit: `c6e8fcf`
- Feature-Branch: `codex/partner-restaurant-finder`
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

## Supabase-Status

`npx supabase db push --dry-run` war erfolgreich und zeigt ausschließlich:

`20260723001000_partner_restaurant_finder.sql`

Die Migration wurde nicht angewendet. Es wurden keine Produktionsdaten verändert.

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

- Migration noch nicht auf einem eindeutig bestätigten Staging-Projekt angewendet.
- Public-RPCs und echte Partnerdaten deshalb noch nicht live gegen Staging getestet.
- Owner-Einstellungen noch nicht mit authentifiziertem Staging-Owner geprüft.
- Physischer Mobile-Safari- und installierter PWA-Test stehen aus.
- Reale Standortberechtigung wurde nicht erteilt; Ablehnung/Fallback und Entfernung sind automatisiert beziehungsweise ohne präzise Standortübertragung geprüft.
- Das öffentliche Cover wird in V1 als HTTPS-URL gepflegt; ein eigener Bild-Upload wurde bewusst nicht ergänzt.

## Entscheidung

Der Code ist build- und testbereit für die Staging-Migration und den anschließenden echten Staging-Flow. Ohne angewendete Migration und Live-Verifikation ist der Status nicht `READY_FOR_FINAL_LOCK`.

Status: **READY_FOR_STAGING**
