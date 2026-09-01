# Customer Mobile Chips & Logo Fix

Datum: 2026-08-23  
Branch: `codex/v1-release-finishing-sprint`  
Ausgangscommit: `efff6d9`

## Ursache

- Die Lokalkarte in „Meine Lokale“ stellte Restaurantlogos mit `object-fit:
  cover` in einem quadratischen Container mit `overflow: hidden` dar. Breite
  Markenlogos wurden dadurch beschnitten.
- Die Filterreihen in „Meine Lokale“ und „Lokale entdecken“ waren zwar
  horizontal scrollbar, besaßen aber weder eine explizite einzeilige
  Flex-Regel noch einen sicheren rechten Scroll-Abstand. Der letzte Chip konnte
  deshalb am mobilen Rand abgeschnitten wirken.

## Geänderte Dateien

- `src/modules/customer/central-customer.css`
- `src/modules/customer/customer-premium.css`
- `src/modules/customer/partner-restaurant-finder.css`
- `tests/customer-mobile-chips-logo.test.mjs`
- `docs/19_CHANGELOG.md`
- `docs/reports/2026-08-23_CUSTOMER_MOBILE_CHIPS_LOGO_FIX.md`

## Umsetzung

- Beide Customer-Filterleisten sind einzeilig, horizontal scrollbar und haben
  sichere Innen- sowie Scroll-Abstände. Chips schrumpfen nicht, bleiben 44 px
  hoch und die mobile Scrollbar wird nur visuell ausgeblendet.
- Logo-Container sind customer-spezifisch breiter als hoch. Bilder verwenden
  `object-fit: contain`, ihre natürliche Proportion sowie `max-width` und
  `max-height`; beschneidendes `overflow: hidden` wurde an diesen Containern
  entfernt.
- Karten begrenzen sich auf die verfügbare Breite. Lange Restaurantnamen,
  Adressen und Detailtexte dürfen umbrechen; bestehende KPI- und Aktionslayouts
  bleiben erhalten.
- Fallbacks ohne Logo und die bestehende Bottom-Navigation mit Safe Area bleiben
  unverändert funktionsfähig.

## Responsive Prüfung

Lokale Browserprüfung mit mehreren Chips, einem 4:1-Logo, langem Namen, langer
Adresse und fehlendem Logo:

| Breite | Seiten-Overflow | Letzter Chip erreichbar | Logo vollständig | Touchhöhe |
| ---: | :---: | :---: | :---: | :---: |
| 320 px | Nein | Ja | Ja | 44 px |
| 360 px | Nein | Ja | Ja | 44 px |
| 375 px | Nein | Ja | Ja | 44 px |
| 390 px | Nein | Ja | Ja | 44 px |
| 393 px | Nein | Ja | Ja | 44 px |
| 414 px | Nein | Ja | Ja | 44 px |
| 430 px | Nein | Ja | Ja | 44 px |
| 768 px | Nein | Ja | Ja | 44 px |
| 1024 px | Nein | Ja | Ja | 44 px |

Das 4:1-Testlogo wurde im 58 × 48 px großen Container als 58 × 22 px großes
Bild inklusive Innenabstand gerendert; der nutzbare Bildinhalt behielt damit
sein Seitenverhältnis. `document.documentElement.scrollWidth` entsprach in
allen geprüften Breiten exakt der Viewportbreite.

## Tests und Qualität

- Neue Regressionstests: 5
- Gesamttests: 720/720 erfolgreich
- Typecheck: erfolgreich
- Lint: 0 Fehler, 8 bestehende Warnungen
- Build: erfolgreich
- `git diff --check`: erfolgreich
- Browserkonsole der visuellen Prüfansicht: 0 Fehler

## Nicht geändert

- Business-Logik
- Datenbank und Migrationen
- API und RPCs
- Auth-, Reward-, Punkte- und Geschenklogik
- Owner-, Staff-, Plattform- und Onboarding-Oberflächen
- Production- oder Staging-Umgebung

## Risiken

- Die visuelle Matrix wurde lokal mit den echten Customer-Styles und gezielten
  Extremdaten geprüft. Ein physischer iPhone-Safari-Test mit authentifizierten
  Staging-Daten war nicht Bestandteil dieser lokalen Änderung.
- Die im Auftrag erwähnte Bildreferenz war im bereitgestellten Anhang nicht als
  Bilddatei enthalten; umgesetzt wurde anhand der verbindlichen textlichen
  Größen- und Layoutregeln.

Status: `LOCK`
