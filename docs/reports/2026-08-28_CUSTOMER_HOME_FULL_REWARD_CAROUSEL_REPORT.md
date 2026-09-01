# Customer Home: vollständiger Reward-Katalog im Carousel

Datum: 2026-08-28  
Status: CODE LOCK

## Ursache

Die Customer-Startseite hat die bereits vollständig geladene und korrekt auf das
aktive Restaurant begrenzte Liste `pointRedemptions` vor dem Rendern künstlich
mit `pointRedemptions.slice(0, 2)` auf zwei Vorschaukarten gekürzt. Es gab weder
ein RPC-/API-Limit noch eine zweite Query oder eine Begrenzung im bestehenden
`PremiumHorizontalCarousel`.

## Geänderte Dateien

- `src/modules/customer/CustomerPortal.tsx`
- `tests/customer-home-full-reward-carousel.test.mjs`
- `docs/05_CUSTOMER_PORTAL.md`
- `docs/19_CHANGELOG.md`
- `docs/reports/2026-08-28_CUSTOMER_HOME_FULL_REWARD_CAROUSEL_REPORT.md`

## Was wurde geändert

- Die rein visuelle Zwei-Karten-Grenze auf der Customer-Startseite wurde entfernt.
- `Mit Punkten einlösbar` rendert jetzt die vollständige vorhandene
  `pointRedemptions`-Liste im bereits freigegebenen Premium-Carousel.
- Neue Vertragstests sichern 1, 2, 3, 6, 10 und 20 Belohnungen, den unveränderten
  Restaurantwechsel, die einmalige Datenabfrage und den bestehenden Detail- und
  Einlöseflow ab.
- Customer-Portal-Dokumentation und Changelog wurden auf den neuen verbindlichen
  Darstellungsvertrag aktualisiert.

## Was wurde nicht geändert

- Keine Reward-Abfrage, RPC, Datenbanktabelle oder Migration.
- Keine Sichtbarkeits-, Eligibility-, Punkte- oder Einlöse-Logik.
- Keine Restaurant-, Branch- oder Tenant-Ausweitung.
- Keine Carousel-, Karten-, Smart-Media- oder Responsive-CSS-Änderung.
- Kein Auto-Slide und keine Änderung am 15-Minuten-Einlösevertrag.
- Kein Deployment und keine Production-Aktion.

## Vertragsprüfung

- Die Liste bleibt aus dem bestehenden, restaurantbezogenen Portal-Ladevorgang.
- Home und `Einlösen -> Alle Belohnungen` verwenden weiterhin denselben
  customer-sichtbaren Reward-State; nur die jeweilige Darstellung bleibt
  aufgabengerecht getrennt.
- Ein Restaurantwechsel ersetzt den Portal-State vollständig und hängt keine
  Rewards des vorherigen Restaurants an.
- Das bestehende Carousel bleibt horizontal, verwendet Scroll Snap, native
  Touch-Gesten, Einzelschritt-Pfeile und eine aus der realen Elementzahl
  berechnete Positionsanzeige.
- Ein Reward verwendet den bestehenden Einzelzustand; null Rewards erzeugen kein
  leeres Carousel.

## Qualität

- Tests: 1073/1073 PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler und 7 bereits bestehende Warnungen außerhalb dieses Scopes
- Production-Build: PASS mit nicht geheimen lokalen Build-Platzhaltern
- `git diff --check`: PASS
- DB-Migration: Keine
- RLS/Security: unverändert; Tenant- und Restaurantvertrag durch Tests abgedeckt

## UI-Prüfung

- Desktop: bestehender Responsive-Carousel-Vertrag unverändert, automatisiert geprüft
- Tablet: bestehender Responsive-Carousel-Vertrag unverändert, automatisiert geprüft
- Mobile 320/375/390/414/430 px: bestehender Ein-Karten-Fokus mit Vorschau
  unverändert, automatisiert geprüft
- Echte Staging-/Geräteprüfung dieses Diffs: nicht durchgeführt

## Ergebnis

ROOT CAUSE FOR TWO-REWARD LIMIT: `pointRedemptions.slice(0, 2)` in der Home-Darstellung  
HOME REWARD LIMIT: REMOVED  
ALL CUSTOMER-VISIBLE REWARDS LOADED: PASS  
SAME REWARD CONTRACT AS EINLÖSEN: PASS  
CURRENT RESTAURANT ONLY: PASS  
1 REWARD: PASS  
2 REWARDS: PASS  
6 REWARDS: PASS  
10+ REWARDS: PASS  
PAGINATION REAL COUNT: PASS  
TOUCH SWIPE: PASS  
ARROWS: PASS  
NEXT CARD PREVIEW: PASS  
"ALLE ANSEHEN": PRESERVED  
LOCKED REWARDS: PASS  
AVAILABLE REWARDS: PASS  
REWARD DETAIL: PASS  
15-MINUTE REDEMPTION: UNCHANGED  
RESTAURANT SWITCH: PASS  
VERTICAL HOME HEIGHT: UNCHANGED  
GLOBAL HORIZONTAL OVERFLOW: NO  
BUSINESS LOGIC CHANGED: NO  
POINT LOGIC CHANGED: NO  
DB MIGRATION: NONE  
TESTS: 1073/1073 PASS  
CUSTOMER HOME FULL REWARD CAROUSEL READY: YES (CODE LOCK)  
PRODUCTION: LOCKED  
STRIPE: DEFERRED

## Risiken

Es besteht kein offenes Code- oder Datenbankrisiko im geänderten Umfang. Für
`FINAL LOCK` fehlt ausschließlich die echte Staging-Abnahme mit mehreren Rewards
und den geforderten Viewports/Geräten.
