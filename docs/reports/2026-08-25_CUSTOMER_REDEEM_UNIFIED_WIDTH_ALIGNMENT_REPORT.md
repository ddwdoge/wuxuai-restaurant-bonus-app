# WUXUAI Bonus – Customer Redeem Unified Width / Alignment Report

## Ursache

Die Einlöseseite hatte keinen ausdrücklich benannten gemeinsamen Breitenvertrag
für Restaurantkopf und die direkten Inhaltsblöcke. Zusätzlich verwendete das
Reward-Grid bereits auf kleinen Mobilbreiten zwei Spalten. Dadurch wirkten
Überschrift, Tabs, Punktezeile, Hinweis und Reward-Bereich optisch unterschiedlich
breit, obwohl sie im selben äußeren Customer-Container lagen.

## Bestehender Layoutvertrag vor dem Fix

- Customer-Seitencontainer: `width: 100%`, mobil `max-width: 460px`, horizontale
  Innenabstände `16px` beziehungsweise `12px` bis 380 px.
- Ab 768 px: `max-width: 720px` und horizontale Innenabstände `24px`.
- Restaurantkopf: direktes Kind des Customer-Seitencontainers, ohne eigenen
  expliziten Breitenvertrag.
- Redeem-Inhalte: direkte Kinder von `.premium-view-stack`, ohne gemeinsamen
  ausdrücklich benannten Redeem-Containervertrag.
- Tabs: zweispaltiges Grid mit zwei gleich großen Spalten.
- Reward-Grid: vor dem Fix auch mobil zweispaltig, erst unter 340 px einspaltig.
- Bottom-Navigation: fixiert; der Seitencontainer reserviert weiterhin `112px`
  plus Safe Area am unteren Rand.

## Geänderte Dateien

- `src/modules/customer/CustomerPortal.tsx`
- `src/modules/customer/customer-premium.css`
- `tests/customer-redeem-layout.test.mjs`
- `docs/reports/2026-08-25_CUSTOMER_REDEEM_UNIFIED_WIDTH_ALIGNMENT_REPORT.md`

## Was wurde geändert

- Die Einlöseseite erhält den Seitenzustand `.premium-redemption-page`.
- Der bestehende View-Stack ist als `.premium-redemption-content` der eine
  kanonische Redeem-Inhaltscontainer.
- Restaurantkopf, Redeem-Container und alle direkten Redeem-Blöcke verwenden
  ausdrücklich `width: 100%`, `max-width: 100%` und `min-width: 0`.
- Tabs, Punktezeile, Hinweis, Reward-Grid und Empty State teilen damit dieselben
  Außenkanten.
- Das Reward-Grid ist von 320 bis 767 px einspaltig und ab 768 px zweispaltig.
- Bis 380 px stapelt die Punkte-/Anzahlzeile kontrolliert.
- Bestehendes Bildverhältnis `16 / 9`, CTA-Mindesthöhe `44px`, Abstände und
  Bottom-Navigation bleiben erhalten.

## Was wurde nicht geändert

- keine Redemption-Businesslogik
- keine Reward-Eligibility
- keine Punkteberechnung
- keine Welcome- oder Birthday-Gift-Logik
- kein 15-Minuten-Präsentationsfenster
- keine Customer-Authentifizierung
- keine Navigation oder Navigation-Handler
- keine Datenbankmigration
- kein Staging- oder Production-Deployment
- kein Stripe

## Responsive Browserprüfung

Die Layoutstruktur wurde mit repräsentativen langen Inhalten in Chromium geprüft.
Gemessen wurden die Außenkanten von Restaurantkopf, Titel, Tabs, Punktezeile,
Hinweis und Reward-Bereich.

| Breite | gemeinsame Inhaltsbreite | Tabs je | Reward-Spalten | Overflow |
| ---: | ---: | ---: | --- | --- |
| 320 px | 296 px | 142,5 px | 1 | Nein |
| 375 px | 351 px | 170 px | 1 | Nein |
| 390 px | 358 px | 173,5 px | 1 | Nein |
| 414 px | 382 px | 185,5 px | 1 | Nein |
| 430 px | 398 px | 193,5 px | 1 | Nein |
| 768 px | 672 px | 330,5 px | 2 | Nein |
| 1024 px | 672 px | 330,5 px | 2 | Nein |
| 1440 px | 672 px | 330,5 px | 2 | Nein |

Beide Tabzustände verwenden denselben äußeren Container und dasselbe Tabpanel.
Der Empty State ist dieselbe `PremiumCard` im gleichen Redeem-Inhaltscontainer;
ein Wechsel kann daher keine Seitenbreitenverschiebung erzeugen.

## Qualität

- Tests: 973/973 PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler, 7 bestehende Warnungen
- Build: PASS
- `git diff --check`: PASS
- Desktop geprüft: Ja, 1024 und 1440 px
- Tablet geprüft: Ja, 768 px
- Mobile geprüft: Ja, 320, 375, 390, 414 und 430 px

## Risiken

Die Layoutänderung wurde lokal mit einer repräsentativen Redeem-Darstellung und
automatisierten Strukturtests geprüft. Ein authentifizierter Staging-Test mit
echten Rewards wurde in diesem Auftrag nicht durchgeführt; deshalb ist der Status
maximal `CODE LOCK` und nicht `FINAL LOCK`.

## Status

CODE LOCK
