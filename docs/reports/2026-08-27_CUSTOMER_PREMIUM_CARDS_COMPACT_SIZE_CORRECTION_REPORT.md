# Customer Premium Cards - Compact Size Correction

## Ursache

Die gemeinsame Carousel-Navigation war bereits vorhanden, aber die Karten selbst
verwendeten konkurrierende Geometrien. Offer-Karten stapelten Gültigkeit,
Zeitplan, Zeitraum, Preis und CTA mit großzügigen Abständen. Die Customer-
Startseite zeigte Punkteeinlösungen weiterhin als zwei kleine Karten nebeneinander.

## Geänderte Dateien

- `src/modules/customer/CustomerPortal.tsx`
- `src/modules/customer/components/PremiumCustomerUi.tsx`
- `src/modules/customer/components/RestaurantOfferCard.tsx`
- `src/modules/customer/components/premium-horizontal-carousel.css`
- `src/modules/customer/components/restaurant-offer-card.css`
- `src/modules/customer/customer-premium.css`
- `tests/customer-horizontal-carousel-fixture.html`
- `tests/customer-horizontal-discovery-carousel.test.mjs`
- `tests/customer-redeem-screenshot-sync.test.mjs`
- `tests/restaurant-offers-v1.test.mjs`
- `docs/05_CUSTOMER_PORTAL.md`
- `docs/15_DESIGN_SYSTEM.md`
- `docs/19_CHANGELOG.md`

## Was wurde geändert

- Kanonische Tokens: 83 Prozent Mobile-Breite, 13 Pixel Abstand, 18 Pixel Radius,
  12 Pixel Innenabstand und 16:9-Medien.
- Offer, Reward, Welcome Gift und Birthday Gift verwenden dieselbe kompakte
  Kartenklasse.
- Offer-Titel und -Beschreibung sind auf zwei Zeilen begrenzt; Gültigkeit und
  Zeitplan stehen in einer kompakten Metazeile.
- Startseiten-Punkteeinlösungen nutzen den gemeinsamen Swipe-Carousel statt eines
  mobilen Zwei-Spalten-Rasters.
- Pfeile, Positionsanzeige, Scroll Snap, Tastatursteuerung und native Touch-
  Navigation bleiben erhalten. Es gibt keine automatische Rotation.

## Visuelle Prüfung

Das kontrollierte Browser-Fixture verwendet absichtlich lange Owner-Inhalte.
Bei 390 Pixel wurden gemessen:

| Modul | Kartenbreite | Vorschau nächste Karte | Höhe | Medienverhältnis |
| --- | ---: | ---: | ---: | ---: |
| Aktuelles & Angebote | 82,5 % | 13,6 % | 367 px | 1,78 |
| Mit Punkten einlösbar | 82,5 % | 13,6 % | 346 px | 1,78 |
| Dein Geschenk | 82,5 % | 13,6 % | 346 px | 1,78 |

320, 375, 390, 414, 430, 768, 1024 und 1440 Pixel wurden ohne globalen
horizontalen Overflow vermessen. Auf Mobile bleibt die nächste Karte zwischen
12,8 und 13,9 Prozent sichtbar. Die Karten bleiben auch mit Langtexten unter
400 Pixel und gehören sichtbar derselben Größenklasse an.

## Was wurde nicht geändert

- Offer-Sichtbarkeit und Offer-Gültigkeit
- Reward- oder Gift-Eligibility
- Punkte, Referral und Einlösungslogik
- 15-Minuten-Präsentation
- Datenbank, RPCs, RLS und Migrationen

## Qualität

- Tests: 1023/1023 PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler; 7 bereits bestehende Warnungen
- Production-Build: PASS
- `git diff --check`: PASS
- Browsermessung: PASS
- Secret-Scan: PASS

## Risiken

Die Prüfung erfolgte mit einem kontrollierten lokalen Browser-Fixture. Ein
physischer Staging-iPhone-Test ist für einen FINAL LOCK weiterhin erforderlich.

Status: CODE LOCK
