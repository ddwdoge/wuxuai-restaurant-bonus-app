# Customer Rewards - horizontaler Swipe-Carousel

Datum: 2026-08-27  
Bereich: Customer Portal / Einlösen und Customer Home  
Production: LOCKED  
Stripe: DEFERRED

## Ursache

Mehrere Customer-Angebote und Belohnungen wurden vertikal als Grid gestapelt.
Dadurch wuchs die mobile Start- beziehungsweise Einlöseseite mit jeder Karte
weiter. Angebote und Rewards besaßen zudem keine gemeinsame horizontale
Discovery-Sprache.

## Was wurde geändert

- Gemeinsamen `PremiumHorizontalCarousel` für Angebote und Belohnungen
  eingeführt.
- Native horizontale Scrollfläche mit Scroll Snap und verborgenem dekorativem
  Scrollbalken umgesetzt.
- Mobile Kartenbreite auf 86 Prozent festgelegt; damit bleibt rund 10 bis 11
  Prozent der nächsten Karte sichtbar.
- Vor-/Zurück-Steuerung mit 44-Pixel-Touchzielen, exakt einem Kartenschritt,
  deutscher Beschriftung und Tastatursteuerung ergänzt.
- Kompakte Position `1 / 3` ohne automatische Rotation ergänzt.
- Beide Reward-Tabs verwenden identische Geometrie und starten beim Wechsel
  kontrolliert bei der ersten Karte.
- Einzelkarte bleibt vollbreit ohne Pfeile oder Position. Bei null persönlichen
  Belohnungen bleibt der bestehende Empty State außerhalb des Carousels.
- Titel sind innerhalb des Carousels auf zwei Zeilen begrenzt; Bilder behalten
  das kontrollierte 16:9-Format.

## Was wurde nicht geändert

- Reward-Eligibility, Punktewerte und Lock-Status
- Detail- und Einlösehandler
- finale Kundenbestätigung und 15-Minuten-Präsentation
- Offer-Sichtbarkeit, Restaurant-Scope und Datenquellen
- Customer Auth, Bottom Navigation und Tab-Struktur
- Datenbank, Migrationen, RLS und RPCs

## Visuelle Prüfung

Browsermessung mit echtem CSS und schwierigen langen Inhalten:

| Breite | Globaler Überlauf | Horizontales Browsing | Ergebnis |
| --- | --- | --- | --- |
| 320 | Nein | Ja | PASS |
| 375 | Nein | Ja | PASS |
| 390 | Nein | Ja | PASS |
| 414 | Nein | Ja | PASS |
| 430 | Nein | Ja | PASS |
| 768 | Nein | Ja, ca. 1,7 Karten | PASS |
| 1024 | Nein | Ja, ca. 2,1 Karten | PASS |
| 1440 | Nein | Ja, ca. 2,1 Karten | PASS |

Bei 390 Pixel wurden 85,5 Prozent reale Kartenbreite und 10,9 Prozent sichtbare
Vorschau der nächsten Karte gemessen. Alle Pfeile messen 44 Pixel.

## Geänderte Dateien

- `src/modules/customer/components/PremiumHorizontalCarousel.tsx`
- `src/modules/customer/components/premium-horizontal-carousel.css`
- `src/modules/customer/CustomerPortal.tsx`
- `src/modules/customer/customer-premium.css`
- `tests/customer-horizontal-discovery-carousel.test.mjs`
- `tests/customer-horizontal-carousel-fixture.html`
- `tests/customer-redeem-layout.test.mjs`
- `docs/05_CUSTOMER_PORTAL.md`
- `docs/15_DESIGN_SYSTEM.md`
- `docs/19_CHANGELOG.md`

## Risiken und Staging

Die Responsive-Geometrie ist lokal in Chromium geprüft. Ein authentifizierter
Customer-Staging-Test mit realem Finger-Swipe und echten Reward-Daten wurde in
dieser Aufgabe nicht durchgeführt. Daher maximal CODE LOCK, kein FINAL LOCK.

## Qualität

- Tests: 1020/1020 PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler und 7 bestehende Warnungen
- Build: PASS
- `git diff --check`: PASS
- DB-Migration: NONE

Status: CODE LOCK
