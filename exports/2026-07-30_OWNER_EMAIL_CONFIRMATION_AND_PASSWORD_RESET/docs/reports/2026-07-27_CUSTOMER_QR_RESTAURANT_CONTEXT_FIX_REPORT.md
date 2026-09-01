# Customer QR Restaurant Context Fix

Datum: 2026-07-27  
Branch: `codex/v13-legal-maps-hardening`  
Ausgangscommit: `8ad50bd65e01ccb9271984b3dc26a6316c2f5767`

## Ursache

Der Customer-Portal-Slug wurde bereits aus React Router gelesen und alle
serverseitigen Portal-, Reward- und Punkteaufrufe waren restaurantbezogen.
Kundenzugänge waren ebenfalls pro Restaurant gespeichert. Die URL-Quelle war
jedoch nur implizit über `useParams` in der Portal-Komponente abgesichert. Es
gab keinen zentralen Vertrag, der parameterlose oder reservierte Customer-Pfade
vor jeder Portalinitialisierung ablehnt, und keine ausdrückliche
Neuinitialisierung beim Wiederherstellen einer Safari-BFCache-Seite.

Ein global gespeicherter aktiver Restaurantkontext wurde nicht gefunden.
`public/sw.js` besitzt keinen Fetch-Handler und cached keine Portalantworten.

## Geänderte Dateien

- `src/app/App.tsx`
- `src/modules/customer/CustomerPortal.tsx`
- `src/modules/customer/customerScanContext.mjs`
- `src/modules/customer/customerScanContext.d.mts`
- `src/modules/public/PublicHome.tsx`
- `tests/customer-qr-restaurant-context.test.mjs`
- `tests/customer-active-restaurant-context.test.mjs`
- `docs/19_CHANGELOG.md`

Die bereits offenen Änderungen am mobilen QR-/Registrierungsflow wurden nicht
verworfen. Das Geburtstagsfeld wurde auf den vorherigen nativen Projektstand
zurückgesetzt und in diesem Auftrag fachlich nicht verändert.

## Umsetzung

- Ein zentraler Parser akzeptiert nur gültige aktuelle Pfade
  `/customer/:restaurantSlug` und `/w/:restaurantSlug`.
- `/customer`, fehlende/ungültige Slugs und reservierte Unterseiten erzeugen
  keinen Restaurantkontext und starten keine Restaurantservices.
- Der validierte URL-Slug und der Routentyp werden explizit an das Portal
  übergeben. React-State oder gespeicherte Restaurantdaten können ihn nicht
  ersetzen.
- Der Instanzschlüssel enthält Routentyp, Restaurant-Slug, URL-Kundenzugang und
  eine Safari-History-Revision. A → B remountet deshalb das Portal vollständig.
- Bei einer aus dem BFCache wiederhergestellten Seite erzwingt `pageshow` eine
  Neuinitialisierung aus der aktuell sichtbaren URL.
- Retry und manuelles Wiederholen behalten nur Slug und Kundenzugang des
  aktuellen Aufrufs. Ein Routenwechsel bricht den alten Retry ab.
- Kundenzugänge bleiben pro Restaurant erhalten. Es wird kein globales
  `activeRestaurant`, `lastRestaurant` oder ähnlicher Schlüssel gespeichert.
- Der parameterlose Gast-Einstieg zeigt den geforderten QR-Hinweis.

## Verifikation

- Reale lokale Staging-Daten, 390 px:
  - `/w/wuxuai-cafehous` zeigt `wuxuai cafehous`.
  - Wechsel zu `/w/wuxuai-food` zeigt `Wuxuai food`; Restaurant A ist nicht
    mehr im DOM.
  - Reload auf Restaurant B zeigt weiterhin nur Restaurant B.
  - `/customer` zeigt den QR-Hinweis und keinen alten Restaurantnamen.
  - Browser Zurück/Vorwärts wechselt korrekt zwischen Restaurant-URL und
    parameterlosem Gast-Einstieg.
- Gültiger A → B → parameterloser Flow: 0 Console-Errors.
- Horizontaler Overflow bei 390 px: keiner.
- Der absichtlich geprüfte ungültige Slug zeigte neutral
  `Restaurant wurde nicht gefunden.` und keine Daten von Restaurant A.

## Sicherheit und Abgrenzung

- Punkte und Rewards werden weiterhin mit dem validierten aktuellen
  `restaurantSlug` an bestehende serverseitige RPCs übergeben.
- Kundenzugänge werden nicht restaurantübergreifend verwendet.
- Aktive Einlösungen bleiben restaurant- und tokenbezogen gescopet.
- Keine Datenbank-, Migration-, RPC-, RLS-, Auth-, Tages-PIN-, Punkte- oder
  Geburtstagslogik geändert.
- Keine Service-Role und keine Secrets im Frontend.

## Offene Risiken

- Die Browserprüfung nutzt die lokale Chromium-basierte App-Prüfung. Ein
  physischer iPhone-Safari-Test einschließlich Kamera-App und echtem BFCache
  bleibt als manuelle Geräteabnahme offen.
- Es wurde kein neues Kundenkonto erzeugt und keine echte Punktebuchung
  ausgeführt. Die serverseitige Restaurantbindung ist durch vorhandene Tests
  und Migration geprüft, der komplette physische Staging-Punkteflow bleibt
  offen.

## Qualität

- Typecheck: erfolgreich
- Lint: 0 Fehler, 7 bereits bestehende Warnungen
- Tests: 178/178 erfolgreich
- Build: erfolgreich
- Migration: keine
- RLS/Security: unverändert

Status: `CHANGES_REQUIRED` bis zur physischen Safari-Abnahme.
