# WUXUAI BONUS P1 - Customer Home Multi-Gift Carousel

Stand: 2026-08-31

## Ursache

Die kanonische Portal-Antwort enthielt bereits alle gültigen persönlichen
Geschenkzuweisungen. Customer Home reduzierte diese Liste jedoch mit zwei
`find()`-Aufrufen auf höchstens ein Birthday- und ein Welcome-Geschenk. Der
anschließende bedingte Renderpfad `Birthday sonst Welcome` zeigte davon nur
eine Karte. Sobald ein Birthday Gift vorhanden war, blieb das gleichzeitig
gültige Welcome Gift unsichtbar.

## Geänderte Dateien

- `src/modules/customer/CustomerPortal.tsx`
- `src/modules/customer/customerGiftPresentation.mjs`
- `src/modules/customer/customerGiftPresentation.d.mts`
- `tests/customer-home-multiple-active-gifts-carousel.test.mjs`
- `tests/customer-horizontal-carousel-fixture.html`
- `docs/05_CUSTOMER_PORTAL.md`
- `docs/17_CTO_ENTSCHEIDUNGEN.md`
- `docs/19_CHANGELOG.md`
- `docs/V1_CURRENT_CANONICAL_PRODUCT_CONTRACT.md`
- `docs/reports/2026-08-31_CUSTOMER_HOME_MULTI_GIFT_CAROUSEL_REPORT.md`

## Was wurde geändert

- Alle aktiven, nicht eingelösten, nicht gestarteten und nicht abgelaufenen
  Starter-Gift-Zuweisungen werden aus der bestehenden Portal-Reward-Liste
  gesammelt.
- Birthday steht vor Welcome; weitere Gift-Typen folgen stabil nach Gültigkeit
  und Zuweisungs-ID.
- Die Startseite verwendet den bestehenden `PremiumHorizontalCarousel` mit
  nativer horizontaler Navigation, Scroll Snap, Pfeilen und Positionsanzeige.
- Jede Karte behält Bild, Titel, Gift-Typ, Status, Metadaten sowie ihren
  bestehenden Detail- und Einlösehandler.
- Die Überschrift lautet pluralfähig `Deine Geschenke`; bei mehreren Karten
  nennt die Unterzeile die tatsächliche Anzahl.

## Was wurde nicht geändert

- keine Gift-Zuweisung
- kein Birthday-Catch-up
- keine Welcome-Gift-Logik
- keine Einlöse- oder 15-Minuten-Präsentationslogik
- keine Punkte oder Visits
- keine Audit- oder E-Mail-Logik
- keine Datenbank, RLS, RPCs oder Migration
- kein Deployment

## Prüfung

- gezielte Carousel- und Customer-Home-Tests: 23/23 PASS
- vollständige Tests: 1185/1185 PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler und 7 bestehende Warnungen
- Build: PASS, 2068 Module
- `git diff --check`: PASS

Responsive Fixture mit Birthday plus Welcome:

- 320: PASS
- 375: PASS
- 390: PASS
- 414: PASS
- 430: PASS
- jeweils 2 Karten: PASS
- nächster Kartenanschnitt: PASS
- Touchziele mindestens 44 Pixel: PASS
- Text-Clipping: NEIN
- globaler horizontaler Overflow: NEIN
- horizontaler Scroll bei 390 Pixel: `0 -> 246`, PASS

## Staging und Risiken

- Realer Development/Test-Kunde Welcome plus Birthday: PENDING
- Physischer iPhone-Swipe: PENDING
- Welcome- und Birthday-Einlösung live nach Deployment: PENDING
- Production: LOCKED
- Stripe: DEFERRED

## Status

`CODE LOCK`

Kein `FINAL LOCK`, bevor der aktuelle Build auf Development/Test deployed und
der reale Customer-Home-Fall einschließlich physischem iPhone bestätigt wurde.
