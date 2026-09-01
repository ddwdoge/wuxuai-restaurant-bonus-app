# Customer Map Drawer Layering Fix

Datum: 2026-08-23  
Branch: `codex/v1-release-finishing-sprint`  
Ausgangscommit: `b60ee29`

## Ursache

Der bisherige mobile Restaurantdetailbereich war mit `position: fixed` und
`z-index: 35` innerhalb der Finder-Seite gerendert. Leaflet vergibt in seinem
eigenen DOM dagegen abgestufte Layerwerte bis `z-index: 1000`, unter anderem
für Marker, Popups und Controls. Da der Karten-Parent keinen isolierten
Stacking-Kontext besaß, konnten diese Leaflet-Layer trotz der festen Position
optisch und interaktiv vor den Detailbereich gelangen.

`ROOT CAUSE: Der mobile Detailbereich lag mit z-index 35 im Seitenbaum, während
Leaflet-Panes und Controls bis z-index 1000 ohne isolierenden Karten-Stacking-
Context gerendert wurden.`

## Umsetzung

- Die mobile Kartenansicht rendert das Restaurantdetail über den vorhandenen
  `AppDrawer`, der mittels React Portal direkt unter `document.body` liegt.
- `.partner-map-panel` und `.partner-map-runtime` bilden mit `isolation:
  isolate` und `z-index: 0` einen begrenzten Karten-Stacking-Kontext.
- Das bestehende Overlay liegt auf Layer 90 und fängt Pointer- und Touch-Events
  über der gesamten Seite ab. Die Bottom-Navigation bleibt auf Layer 40.
- Der Drawer verwendet internen `overflow-y: auto`, Momentum Scrolling,
  kontrolliertes Overscroll-Verhalten, `100dvh` und iOS Safe Areas.
- Beim Schließen wird der Drawer vollständig aus dem DOM entfernt, der
  Body-Scroll wiederhergestellt und die Karte erneut interaktiv.
- Desktop und Listenansicht behalten ihre bestehende Inline-Darstellung.

## Geänderte Dateien

- `src/modules/customer/PartnerRestaurantFinderPage.tsx`
- `src/modules/customer/partner-restaurant-finder.css`
- `src/modules/customer/partner-restaurant-map.css`
- `tests/customer-map-drawer-layering.test.mjs`
- `tests/customer-mobile-responsive-stabilization.test.mjs`
- `tests/public-premium-drawer.test.mjs`
- `docs/19_CHANGELOG.md`
- `docs/reports/2026-08-23_CUSTOMER_MAP_DRAWER_LAYERING_FIX.md`

## Verifikation

Ein langer Restaurantdetailinhalt wurde zusammen mit simulierten Leaflet-Tiles,
Marker, Popup und Controls bis `z-index: 1000` gegen die realen App-Styles
geprüft. Bei geöffnetem Drawer traf `elementFromPoint` über dem sichtbaren
Leaflet-Control ausschließlich Drawer-Inhalt. Nach dem Schließen traf derselbe
Punkt wieder das Leaflet-Control. Der Body-Scroll-Lock wurde dabei entfernt.

| Viewport | Layering | Scroll/CTA | Overflow |
| ---: | :---: | :---: | :---: |
| 320 px | PASS | PASS | keiner |
| 375 px | PASS | PASS | keiner |
| 390 px | PASS | PASS | keiner |
| 393 px | PASS | PASS | keiner |
| 414 px | PASS | PASS | keiner |
| 430 px | PASS | PASS | keiner |
| 768 px | PASS | PASS | keiner |

- Gezielte Tests: 22/22 PASS
- Gesamttests: 728/728 PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler
- Build: PASS
- `git diff --check`: PASS

## Nicht geändert

- Restaurant-Suche und Filter
- Geocoding und Koordinaten
- öffentliche Restaurantfreigabe
- Punkte, Rewards und Geschenke
- Customer-Kontext und Auth
- APIs, RPCs, RLS und Datenbank

## Risiken

- Die responsive Prüfung erfolgte automatisiert in einem Chromium-basierten
  Browser mit iPhone-nahen Viewports. Ein erneuter physischer iPhone-Safari-Test
  auf dem ursprünglich betroffenen Gerät bleibt als finales Geräte-Gate offen.
- Es wurde keine Staging- oder Production-Bereitstellung durchgeführt.

## Ergebnis

```text
DRAWER ABOVE MAP: PASS
TILE PANE BELOW DRAWER: PASS
MARKER PANE BELOW DRAWER: PASS
POPUP PANE BELOW DRAWER: PASS
LEAFLET CONTROLS BELOW DRAWER: PASS
DRAWER VERTICAL SCROLL: PASS
LONG CONTENT: PASS
DRAWER CTA CLICKABLE: PASS
MAP POINTER EVENTS WHILE DRAWER OPEN: BLOCKED
MAP INTERACTIVE AFTER CLOSE: PASS
BOTTOM NAV: PASS
SAFE AREA: PASS
BUSINESS LOGIC CHANGED: NO
DB MIGRATION: NONE
MAP DRAWER UI READY: YES
```
