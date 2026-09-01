# WUXUAI Bonus - Customer Home Full Offer Carousel Report

Datum: 2026-08-28

## Ursache

Die Customer-Startseite begrenzte den restaurantbezogenen Angebotskatalog an drei Stellen künstlich:

- Der öffentliche Angebotsabruf wurde mit `limit = 5` ausgeführt.
- Die Darstellung verwendete `restaurantOffers.slice(0, 3)`.
- Das View-Telemetrie-Handling iterierte über die ersten drei Angebote.

Die autoritative Angebots-RPC unterstützt bereits bis zu 100 Einträge. Sichtbarkeit, Gültigkeit, Sortierung und Mandantenzuordnung waren nicht die Ursache und wurden nicht verändert.

## Geänderte Dateien

- `src/modules/customer/CustomerPortal.tsx`
- `tests/customer-home-full-offer-carousel.test.mjs`
- `tests/restaurant-offers-v1.test.mjs`

## Was wurde geändert

- Customer Home lädt den vollständigen autoritativen Angebotskatalog mit dem bestehenden Maximalwert 100.
- Alle zurückgegebenen sichtbaren Angebote werden im bestehenden `PremiumHorizontalCarousel` dargestellt.
- Der bestehende Link `Alle ansehen` bleibt bei mehr als drei Angeboten erhalten.
- Beim Restaurantwechsel werden Angebotsliste und geöffnetes Angebotsdetail vor dem neuen Abruf geleert. Inhalte des vorherigen Restaurants können dadurch nicht kurz sichtbar bleiben.
- Das Telemetrie-Ereignis wird nur für das erste sichtbare Angebot ausgelöst. Die Änderung erzeugt keinen zusätzlichen Request pro Angebot.
- Tests decken 1, 2, 3, 4, 7, 10 und 20 Angebote, echte Positionsanzahl, Einzel-/Leerzustand, Restaurantwechsel und den bestehenden Smart-Media-/Detailvertrag ab.

## Was wurde nicht geändert

- Keine Angebots-, Veröffentlichungs-, Aktivierungs- oder Gültigkeitslogik.
- Keine Änderung für Entwürfe, deaktivierte oder abgelaufene Angebote.
- Keine Änderung an Tageszeit-, Wochentag- oder Upcoming-Darstellung.
- Keine Änderung am Angebotsdetail oder Smart-Media-Crop.
- Keine neue Carousel-Implementierung, keine automatische Rotation.
- Keine Datenbankmigration, keine RLS-, RPC- oder Grant-Änderung.
- Keine Production-Aktion und keine Stripe-Arbeit.

## Responsive Prüfung

Der bestehende gemeinsame Carousel-Vertrag wurde automatisiert geprüft:

- 320, 375, 390, 414 und 430 px: eine Hauptkarte mit Vorschau der nächsten Karte, native Swipe- und Scroll-Snap-Geometrie.
- 768 px: mehrere Karten innerhalb der bestehenden Inhaltsbreite.
- 1024 und 1440 px: mehrere Karten mit horizontaler Navigation.
- Einzelkarte ohne künstliche Pfeile oder Pagination.
- Leerzustand ohne leeres Carousel.
- Kein vertikales Stapeln aller Angebote und keine globale Seitenbreite durch das Carousel.

Eine erneute physische Staging-Prüfung dieser neuen Änderung steht noch aus; deshalb wird kein FINAL LOCK vergeben.

## Prüfergebnisse

- Gezielte Regression: 49/49 PASS
- Autoritative Tests: 1084/1084 PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler und 7 bereits bestehende Warnungen außerhalb des Scopes
- Production Build: PASS
- `git diff --check`: PASS
- Datenbankmigration: NONE
- RLS/Security: unverändert; restaurantbezogener bestehender öffentlicher Angebotsvertrag wird weiterverwendet

## Risiken

- Der Abruf ist weiterhin auf den bestehenden sicheren RPC-Maximalwert 100 begrenzt. Für V1 liegt dies deutlich oberhalb des vorgesehenen Angebotsumfangs.
- Der aktualisierte Build wurde für diese Aufgabe noch nicht auf Staging ausgerollt und nicht physisch auf iPhone Safari geprüft.

## Status

CODE LOCK
