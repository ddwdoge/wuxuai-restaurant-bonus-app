# WUXUAI BONUS P1 - Discovery Direct Join CTA Visibility Report

Datum: 2026-08-31

## Ursache

`PartnerRestaurantFinderPage` rendert die Restaurantdetails mit `AppDrawer` per
React-Portal direkt unter `document.body`. Der Drawer liegt damit ausserhalb
der `.customer-premium-shell` und erbte deren Variablen
`--premium-primary`, `--premium-primary-dark`, `--premium-primary-light` und
`--premium-primary-soft` nicht.

Der Link `Bonusprogramm beitreten` war im DOM vorhanden, vollbreit, 48 Pixel
hoch und anklickbar. Seine Deklaration
`background: var(--premium-primary)` wurde wegen der fehlenden Variable jedoch
ungueltig, waehrend `color: #ffffff` wirksam blieb. Auf dem weissen Drawer
entstand dadurch die physisch beobachtete unsichtbare, aber klickbare Flaeche.

## Geaenderte Dateien

- `src/modules/customer/partner-restaurant-finder.css`
- `tests/customer-discovery-direct-join.test.mjs`
- `tests/customer-map-drawer-layering.test.mjs`
- `docs/19_CHANGELOG.md`
- `docs/reports/2026-08-31_DISCOVERY_DIRECT_JOIN_CTA_VISIBILITY_REPORT.md`

## Was wurde geaendert

- Der bereits vorhandene Theme-Vertrag des portalgerenderten Detail-Drawers
  definiert nun die vier fehlenden Primary-Tokens aus den vorhandenen Gold-
  Tokens.
- Regressionstests sichern die Portal-Vererbung, Primary-/Secondary-Kontraste,
  48-Pixel-Touchflaechen, Safe-Area-Padding und die unveraenderte CTA-Reihenfolge.

## Was wurde nicht geaendert

- keine Join-, Legal-Consent-, Membership- oder Idempotenzlogik
- kein aktiver Restaurantwechsel und keine Eligibility-Logik
- keine Visits, Punkte, Welcome Gifts oder Referral-Zuordnung
- keine Birthday-, Point-Anomaly-, Multi-Role-, Rewards-, Offers-, QR- oder
  Starter-Kit-Aenderung
- keine Datenbank, Migration, RLS, Production- oder Stripe-Aktion

## Responsive-Pruefung

Ein lokaler Browser-Test verwendete die echten Repository-Styles und denselben
Body-Portal-Aufbau wie `AppDrawer`.

| Breite | Join sichtbar | Join Hoehe | Route sichtbar | Ueberlappung | Globales Overflow |
| ---: | :---: | ---: | :---: | :---: | :---: |
| 320 | PASS | 48 px | PASS | NO | NO |
| 375 | PASS | 48 px | PASS | NO | NO |
| 390 | PASS | 48 px | PASS | NO | NO |
| 414 | PASS | 48 px | PASS | NO | NO |
| 430 | PASS | 48 px | PASS | NO | NO |

Gemessener Primary-Kontrastvertrag:

- Hintergrund: `rgb(191, 143, 54)` / `#bf8f36`
- Text: `rgb(255, 255, 255)` / `#ffffff`
- Drawer-Bottom-Padding: `18px + env(safe-area-inset-bottom)`
- Action-Reihenfolge: Join Primary, Route Secondary

## Pruefergebnis

- Betroffene Tests: `16/16 PASS`
- Gesamttests: `1178/1178 PASS`
- Typecheck: PASS
- Lint: PASS, 0 Fehler; 7 bekannte Warnungen ausserhalb dieses Scopes
- Build: PASS, 2067 Module
- `git diff --check`: PASS
- Migration: NONE
- Development/Test-Deployment: nicht ausgefuehrt
- Physical iPhone: PENDING, ausschliesslich Founder-Gate

## Sicherheit und Risiken

Der DOM-Zielpfad und alle serverseitigen Join-Vertraege sind unveraendert.
Es wurden nur CSS-Custom-Properties im bereits tenantneutralen Drawer-Theme
erganzt. Bis zum Development/Test-Deployment und physischen Founder-Test bleibt
Discovery Direct Join nicht im Final Lock.

## Abschluss

- Aufgabe: Unsichtbaren Discovery Direct Join CTA im mobilen Drawer beheben
- Build: Ja
- Migration: Keine
- Flow-Test: Ja, lokaler DOM-/CSS-Responsive-Test; Live- und Physical-Gate offen
- RLS/Security: Ja, serverseitige Verbindung unveraendert und Contract-Tests gruen
- Alte Logik geprueft: Ja
- Report: `docs/reports/2026-08-31_DISCOVERY_DIRECT_JOIN_CTA_VISIBILITY_REPORT.md`
- Pruef-ZIP: `exports/2026-08-31_DISCOVERY_DIRECT_JOIN_CTA_VISIBILITY.zip`
- Offene Risiken: Development/Test-Deployment und physischer iPhone-Founder-Gate
- Status: CODE LOCK
