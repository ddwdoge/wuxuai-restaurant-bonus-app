# Customer Mobile UI/UX Responsive Stabilization

Datum: 23.08.2026  
Branch: `codex/v1-release-finishing-sprint`  
Ausgangscommit: `f8bcdb1`

## Ursache

Die restaurantbezogene Customer-Shell setzte gleichzeitig `height: 100dvh`,
`overflow: hidden` und einen eigenen vertikalen Scrollcontainer ein. Das war
bei dynamischen Safari-Browserleisten, kleinen Displayhöhen und der festen
Bottom-Navigation fehleranfällig. Im Finder fehlte auf Mobile und Tablet ein
ausreichender unterer Inhaltsabstand; das ausgewählte Restaurant-Bottom-Sheet
lag direkt am Viewportende. Mehrere vierteilige KPI-Zeilen und Einzeilenregeln
ließen langen Inhalt bei 320 bis 430 Pixeln zu wenig Raum.

## Geänderte Dateien

- `src/modules/customer/customer-premium.css`
- `src/modules/customer/central-customer.css`
- `src/modules/customer/partner-restaurant-finder.css`
- `src/modules/customer/partner-restaurant-map.css`
- `tests/customer-premium-design.test.mjs`
- `tests/customer-mobile-responsive-stabilization.test.mjs`
- `docs/19_CHANGELOG.md`
- dieser Report

## Was wurde geändert

- Die Customer-Shell verwendet `min-height` und normalen Dokumentfluss; der
  innere feste Viewport-Scrollcontainer wurde entfernt.
- Seiteninhalt reserviert Bottom-Navigation plus `safe-area-inset-bottom`.
- Karten, Punktekarte, Vorteilskacheln, Mitgliedskarte, Überschriften und
  Abstände wurden mobil kompakter gestaltet.
- Zentrale Lokal-KPIs wechseln bis 430 Pixel auf ein 2x2-Raster.
- Lange Restaurant-, Reward-, Adress- und Kontotexte dürfen umbrechen.
- Finder-Controls verwenden bis 420 Pixel eine sichere Einzelspalte; Chips
  bleiben horizontal scrollbar und mindestens 44 Pixel hoch.
- Mobile Kartenfläche wurde vergrößert; das Detail-Bottom-Sheet endet oberhalb
  der Bottom-Navigation.
- Tablet nutzt für das restaurantbezogene Portal bis zu 720 Pixel Breite und
  bestehende zweispaltige Reward-Grids.
- `prefers-reduced-motion` und vorhandene Fokuszustände bleiben aktiv.

## Was wurde nicht geändert

Auth, Kundenregistrierung, Restaurantkontext, Punkte, Rewards,
Willkommensgeschenke, Geburtstag, Einlösung, Präsentationsfenster, E-Mail,
RLS, Datenbank, RPCs, APIs, Cron, Stripe sowie Owner-, Staff- und
Plattformportal wurden nicht verändert. Es gibt keine Migration.

## Automatisierte Prüfung

Die neue Regression prüft normalen Seitenfluss, Safe-Area-Abstände,
320-/380-/420-/430-Pixel-Breakpoints, Long-Content-Umbruch, Map-Bottom-Sheet,
Mindestbreiten und den Erhalt der bestehenden Customer-Handler.

Ergebnis:

- Tests: 715/715 bestanden
- Typecheck: bestanden
- Lint: 0 Fehler, 8 bereits bestehende Warnungen
- Build: bestanden
- `git diff --check`: bestanden

## Browserprüfung

Die lokal erreichbare Customer-Login-Shell wurde bei 320x568, 360x640,
375x667, 390x844, 393x852, 414x896, 430x932, 768x1024 und 1024x1366 sowie
in drei Querformaten geprüft. Ergebnis: kein horizontaler Overflow,
mindestens 44 Pixel hohe sichtbare Aktionen und korrektes vertikales Scrollen.

Die geschützten Ansichten leiteten ohne lokale Kundensitzung erwartungsgemäß
nach `/customer/login` weiter. Customer Home, Meine Lokale, Finder mit echten
Ergebnissen, Rewards, Gifts, Account und Live Redemption konnten deshalb nicht
als authentifizierter visueller Browserflow abgenommen werden. Ihre realen
Komponenten- und CSS-Verträge sind automatisiert geprüft; dies ersetzt keine
physische iPhone-/PWA-Abnahme.

## Ergebnismatrix

```text
CUSTOMER HOME:
PASS (Code/Regression), authentifizierte visuelle Abnahme offen

DISCOVER MAP:
PASS (Code/Regression), authentifizierte visuelle Abnahme offen

DISCOVER LIST:
PASS (Code/Regression), authentifizierte visuelle Abnahme offen

MY RESTAURANTS:
PASS (Code/Regression), authentifizierte visuelle Abnahme offen

REWARDS:
PASS (Code/Regression), authentifizierte visuelle Abnahme offen

GIFTS:
PASS (Code/Regression), authentifizierte visuelle Abnahme offen

ACCOUNT:
PASS (Code/Regression), authentifizierte visuelle Abnahme offen

BOTTOM NAV:
PASS

VERTICAL SCROLL:
PASS

SAFE AREA:
PASS (CSS/Browser-Matrix), physisches iPhone offen

320px:
PASS

375px:
PASS

390px:
PASS

414px:
PASS

430px:
PASS

768px:
PASS

1024px:
PASS

LONG CONTENT:
PASS (Regression)

NO HORIZONTAL OVERFLOW:
PASS für erreichbare Customer-Shell; geschützte Datenansichten visuell offen

NO CONTENT HIDDEN BEHIND NAV:
PASS (Layoutvertrag)

BUSINESS LOGIC UNCHANGED:
YES

DB MIGRATION:
NONE

TESTS:
715/715 PASS

TYPECHECK:
PASS

LINT:
PASS, 0 Fehler und 8 bestehende Warnungen

BUILD:
PASS

CUSTOMER UI RESPONSIVE READY:
NO
```

## Offene Risiken

- Authentifizierte visuelle Abnahme mit echten, anonymisierten Staging-Daten.
- Physischer Test in Mobile Safari und installierter PWA inklusive dynamischer
  Browserleisten, Home Indicator und Live-Redemption-Drawer.

Status: **NOT READY** bis diese beiden visuellen Gates abgeschlossen sind.
