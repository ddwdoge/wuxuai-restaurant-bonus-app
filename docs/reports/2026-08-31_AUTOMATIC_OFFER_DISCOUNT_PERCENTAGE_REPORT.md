# WUXUAI Bonus P1 - Automatic Offer Discount Percentage

Stand: 2026-08-31

## Ursache

`restaurant_offers` lieferte bereits `current_price` und `previous_price`.
Die Kundenkarte, das Angebotsdetail, die Restaurantdetails und die
Owner-Vorschau renderten jedoch nur den aktuellen Preis. Dadurch blieb ein
gueltiger, vom Restaurant eingegebener Preisvorteil unsichtbar.

## Geaenderte Dateien

- `src/modules/offers/restaurantOffers.mjs`
- `src/modules/offers/restaurantOffers.d.mts`
- `src/modules/offers/restaurantOfferService.ts`
- `src/modules/customer/components/RestaurantOfferCard.tsx`
- `src/modules/customer/components/restaurant-offer-card.css`
- `src/modules/customer/PartnerRestaurantFinderPage.tsx`
- `src/modules/customer/partner-restaurant-finder.css`
- `src/modules/admin/pages/RestaurantOffersPage.tsx`
- `src/modules/admin/pages/restaurant-offers.css`
- `tests/restaurant-offers-v1.test.mjs`
- `tests/customer-horizontal-discovery-carousel.test.mjs`
- `tests/customer-horizontal-carousel-fixture.html`
- kanonische Produktdokumentation und Changelog

## Umsetzung

- `calculateOfferDiscountPercentage` ist die einzige mathematische Ableitung.
- `restaurantOfferPricePresentation` liefert die gemeinsame formatierte
  Kunden- und Owner-Darstellung.
- Gueltig ist nur `previous > current >= 0` bei positivem vorherigen Preis.
- Der Prozentwert wird auf ganze Zahlen gerundet und nicht gespeichert.
- Es wurde kein Owner-Prozentfeld hinzugefuegt.
- Ungueltige oder fehlende Vergleichspreise zeigen nur den aktuellen Preis.

## Unveraendert

- aktueller und vorheriger Preis als bestehende Datenquellen
- Owner-Hinweis zur rechtlichen Verantwortung
- Angebotsgueltigkeit, Wochentage, Zeitfenster, Aktivierung und Sichtbarkeit
- Memberships, Punkte, Gifts, Referral und Einloesung
- Datenbank, Migrationen, RLS, Worker, Production und Stripe

## Responsive-Pruefung

Die echte Offer-Carousel-Fixture wurde bei 320, 375, 390, 414, 430 und 1440
CSS-Pixel geprueft.

- `-66%`, `14,52 EUR` gestrichen und `5,00 EUR` sichtbar: PASS
- globales horizontales Overflow: 0 Pixel
- Preisgruppe innerhalb des Viewports: PASS
- Mobile und Desktop Screenshot-Pruefung: PASS

## Qualitaet

- gezielte Offer-/Finder-/Carousel-Tests: `62/62 PASS`
- Gesamttests: `1188/1188 PASS`
- Typecheck: PASS
- Lint: PASS, 0 Fehler / 7 bestehende Warnungen
- Build: PASS, 2068 Module
- Secret Scan: PASS
- Migration: NONE

## Status

`CODE LOCK`. Die Darstellung ist lokal implementiert und responsiv geprueft.
Es wurde kein Development/Test-Deployment und kein physischer Founder-Gate
ausgefuehrt.
