# WUXUAI Bonus - Customer Redeem Screenshot Pixel Sync

Datum: 2026-08-25
Branch: `codex/v1-canonical-recovery`
Ausgangscommit: `a2c99043ed6fd301c3070c7dcedf80bb0963bf90`

## Ursache

Der gemeinsame `.customer-page-container` ist ein CSS-Grid mit
`min-height: 100dvh`. Ohne `align-content: start` streckte Safari bei dem kurzen
Tab `Meine Belohnungen` die automatischen Grid-Zeilen auf die freie
Viewporthoehe. Deshalb waren Restaurant-Header und vertikale Abstaende nur im
Empty-State-Screenshot hoeher. Zusaetzlich wurde der Empty State ausserhalb des
Grid-Wrappers der Reward-Karten gerendert.

## Geaenderte Dateien

- `src/modules/customer/CustomerPortal.tsx`
- `src/modules/customer/customer-premium.css`
- `tests/customer-redeem-screenshot-sync.test.mjs`
- `tests/redeem-layout-fixture.html`
- `docs/reports/assets/2026-08-25_redeem-all-390.png`
- `docs/reports/assets/2026-08-25_redeem-mine-390.png`
- `design-qa.md`
- `docs/19_CHANGELOG.md`

## Was wurde geaendert

- Reward-Karten und Empty State liegen jetzt im selben dauerhaft gerenderten
  `.premium-redemption-grid`.
- Seitencontainer und Redeem-Inhalt werden mit `align-content: start` oben
  verankert.
- Der Tabwechsel tauscht nur Zaehlertext und Inhalt innerhalb der gemeinsamen
  Content-Grenze aus.
- Ein Vertragstest sichert die einmalige gemeinsame Seitenschale, den einen
  Content-Wrapper sowie Mobile-/Desktop-Gridregeln ab.

## Was wurde nicht geaendert

- Punkte und Eligibility
- Reward-Laden und gespeicherte Belohnungen
- 15-Minuten-Praesentation
- Customer Auth
- Reward-Karten-Design
- Typografie, Farben und Restaurant-Header-Design
- Bottom Navigation und Navigation
- Datenbank, RPCs und RLS

## Visuelle Pruefung

Die beiden bereitgestellten physischen iPhone-Screenshots wurden als Golden
Reference verwendet. Beide Zustande wurden danach mit derselben Produktions-CSS
bei 320, 375, 390, 414, 430, 768, 1024 und 1440 Pixel gerendert und per DOM-
Geometrie verglichen.

In jeder Breite waren fuer beide Tabs identisch:

- Header X/Y/Breite/Hoehe
- Titel X/Y/Breite/Hoehe
- Tabs X/Y/Breite/Hoehe
- Punktezeile X/Y/Breite/Hoehe
- Hinweis X/Y/Breite/Hoehe
- Content X/Y/Breite
- aeussere Breite und linke Kante der ersten Reward-/Empty-State-Karte

Keiner der acht Viewports hatte horizontalen Overflow. Auf Desktop belegen
Reward-Karte und Empty State denselben ersten Track des zweispaltigen Grids.

## Qualitaet

- Tests: 985/985 PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler und 7 bestehende Warnungen
- Build: PASS
- `git diff --check`: PASS vor Berichtserstellung
- DB-Migration: keine
- RLS/Security: unveraendert

## Finale Ausgabe

- GOLDEN SCREENSHOT REFERENCE USED: YES
- SHARED PAGE SHELL: PASS
- HEADER SYNCHRONIZED: PASS
- TITLE SYNCHRONIZED: PASS
- TABS SYNCHRONIZED: PASS
- POINTS ROW SYNCHRONIZED: PASS
- INFO NOTICE SYNCHRONIZED: PASS
- CONTENT START Y: PASS
- CONTENT LEFT EDGE: PASS
- CONTENT RIGHT EDGE: PASS
- REWARD CARD WIDTH: PASS
- EMPTY STATE WIDTH: PASS
- TAB SWITCH LAYOUT SHIFT: NO
- BOTTOM NAV: PASS
- 320: PASS
- 375: PASS
- 390: PASS
- 414: PASS
- 430: PASS
- 768: PASS
- 1024: PASS
- 1440: PASS
- GLOBAL HORIZONTAL OVERFLOW: NO
- BUSINESS LOGIC CHANGED: NO
- DB MIGRATION: NONE
- TESTS: 985/985 PASS
- CUSTOMER REDEEM SCREENSHOT SYNC FINAL: YES
- PRODUCTION: LOCKED
- STRIPE: DEFERRED
- Status: CODE LOCK
