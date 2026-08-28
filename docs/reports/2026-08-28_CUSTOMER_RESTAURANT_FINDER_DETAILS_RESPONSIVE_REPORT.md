# WUXUAI Bonus - Customer Restaurant Finder / Details Responsive Report

Datum: 2026-08-28

## Ursache

### Mobiles Restaurantbild

Der Customer-Detail-Hero hatte eine feste Hoehe von `112px`, waehrend der gemeinsame Smart-Media-Renderer den gespeicherten Ausschnitt fuer das kanonische Restaurant-Cover-Format `16:9` berechnet. Auf einem breiten mobilen Drawer entstand dadurch eine deutlich breitere reale Medienbuehne als der berechnete 16:9-Ausschnitt. Das Bild fuellte nur den mittleren Bereich; links und rechts wurden die cremefarbenen Hintergrundflaechen sichtbar.

Die Bild-URL, Smart-Media-Metadaten und der gemeinsame Renderer waren bereits korrekt verdrahtet. Die lokale Wrapper-Geometrie war die Abweichung.

### Desktop-Restaurantdetails

Der Detailinhalt wurde nur auf Mobile im bestehenden `AppDrawer` geoeffnet. Ab `768px` wurde derselbe lange Detailblock direkt unter der Ergebnisliste in der rechten Finder-Spalte gerendert. Diese Spalte lebt in einem auf `100dvh` begrenzten Grid mit eigenem Overflow. Dadurch erschien der Detailblock wie eine aufgeklappte Ergebnis-Karte und sein unterer Inhalt wurde im sichtbaren Desktop-Layout abgeschnitten.

## Geaenderte Dateien

- `src/modules/customer/PartnerRestaurantFinderPage.tsx`
- `src/modules/customer/partner-restaurant-finder.css`
- `tests/customer-map-drawer-layering.test.mjs`
- `tests/customer-restaurant-hero-image.test.mjs`

## Was wurde geaendert

- Der Restaurant-Hero verwendet nun die kanonische `16:9`-Buehne statt einer festen Hoehe.
- Der bestehende `RestaurantHeroImage` und `SmartMediaFrame` bleiben die einzige Cover-Darstellung.
- Gespeicherte Zoom- und Positionswerte werden unveraendert weitergereicht.
- Restaurantdetails werden bei jeder Breite im bestehenden `AppDrawer` geoeffnet.
- Mobile bleibt ein Bottom Drawer.
- Desktop verwendet denselben Inhalt in einem rechten Drawer mit maximal `560px` Breite und sicherem Viewport-Rand.
- Der Drawer-Body bleibt intern vertikal scrollbar.
- Das Schliessen setzt nur die aktuelle Auswahl zurueck; Suche, Filter, Kartenansicht und geladene Ergebnisse bleiben erhalten.
- Regressionstests sichern den gemeinsamen Drawer, die fehlende Desktop-Kartenexpansion, internen Scroll und das kanonische Cover-Format ab.

## Was wurde nicht geaendert

- keine Businesslogik
- keine Finder-Suche oder Sortierung
- keine Karten- oder Geocoding-Logik
- keine Punkte-, Besuchs-, Reward-, Offer- oder Referral-Logik
- keine Authentifizierung
- keine RLS- oder Tenant-Regeln
- keine Datenbankmigration
- keine Smart-Media-Speicherwerte oder RPCs
- kein Production- oder Staging-Deployment

## Pruefergebnis

- Tests: `1075/1075 PASS`
- Typecheck: `PASS`
- Lint: `PASS` mit `0` Fehlern und `7` bereits vorhandenen Warnungen
- Build: `PASS`
- `git diff --check`: `PASS`
- Secret-Scan des Diffs: `PASS`

## Responsive Bewertung

Die Implementierung ist fuer `320`, `375`, `390`, `414`, `430`, `768`, `1024`, `1366x768` und `1440x900` strukturell abgesichert:

- unter `768px`: volle Drawer-Breite und Bottom-Sheet-Verhalten
- ab `768px`: rechter Drawer, maximal `560px`, mit `48px` sicherem Viewport-Rand
- Hero: immer `16:9` und volle Inhaltsbreite
- Drawer-Body: eigener `overflow-y: auto`
- Overlay: oberhalb der Customer Bottom Navigation

Ein echter physischer iPhone-Safari-Test und ein echter Desktop-Chrome-Test des neuen Builds sind erst nach einem freigegebenen Staging-Deployment moeglich.

## Risiken

- Der Code ist nicht auf Staging deployed; deshalb ist ein realer Owner-vs-Customer-Crop-Vergleich des geaenderten Builds noch offen.
- Der physische iPhone-Test fuer Cover, Scroll und Close ist noch offen.
- Der reale Desktop-Test fuer bis zum Ende erreichbare Inhalte ist noch offen.

## Status

`CODE LOCK`

`CUSTOMER RESTAURANT DETAILS RESPONSIVE FINAL READY: NO - STAGING UND REAL DEVICE GATE OFFEN`

`PRODUCTION: LOCKED`

`STRIPE: DEFERRED`
