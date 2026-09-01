# KPI-Inhalte auf Drawer umbauen

Datum: 2026-07-19

## Ursache

Die Bearbeitung gespeicherter Punkteeinlösungen und Willkommensgeschenke lud
Formulare an einer anderen Position derselben Seite. Besonders mobil war nach
dem Klick nicht sofort erkennbar, dass ein Bearbeitungszustand geöffnet wurde.

Dashboard- und Plattform-KPIs besitzen im aktuellen V1-Code keine
Detailansichten und bleiben deshalb bewusst nicht klickbar. Die Tages-PIN-Karte
ist eine echte Navigation zum Team Tablet und bleibt ebenfalls unverändert.

## Umgebaute Seiten

- `Punkteeinlösung`: Bearbeiten einer gespeicherten Punkteeinlösung
- `Willkommensgeschenke`: Bearbeiten eines gespeicherten Geschenks

## Gemeinsame Drawer-Komponente

Neu: `src/shared/components/AppDrawer.tsx`

Enthalten:

- React-Portal in `document.body`
- `role="dialog"`, `aria-modal`, Titel- und Beschreibungsbezug
- Schließen über X, Escape und Overlay
- Fokus-Trap für Tab und Umschalt+Tab
- Fokus-Rückgabe zum auslösenden Button
- gesperrtes Hintergrundscrollen
- separater scrollbarer Body
- optionaler fester Footer für Aktionen

## Entfernte Inline-Bereiche

- Der Willkommensgeschenk-Editor wird nicht mehr oberhalb der Kartenliste
  eingeblendet und scrollt nicht mehr automatisch dorthin.
- Der Bearbeitungsmodus der Punkteeinlösung verwendet nicht mehr den Wizard an
  der oberen Seitenposition. Die Neuerstellung bleibt bewusst als bestehender
  Hauptbereich auf der Seite erhalten.
- Die aktive Ursprungskarte erhält während des geöffneten Drawers eine dezente
  Markierung.

## Wiederverwendete Logik

- `loadRewardOffers`
- `saveRewardOffer`
- `setRewardOfferActive`
- vorhandene Wizard-Schritte, Berechnung und Formularzustände
- vorhandener Upload über `restaurant-media`

Keine Daten-, Speicher-, Punkte- oder Statuslogik wurde neu gebaut.

## Responsive-Ergebnis

Browsermessung der echten `AppDrawer`-Komponente:

| Viewport | Drawerbreite | Ergebnis |
| --- | ---: | --- |
| 390 px | 390 px | Fullscreen, Footer sichtbar, kein Überlauf |
| 768 px | 520 px | unter 80 %, Footer sichtbar, kein Überlauf |
| 1024 px | 420 px | rechter Drawer, Footer sichtbar, kein Überlauf |
| 1440 px | 520 px | rechter Drawer, Footer sichtbar, kein Überlauf |

Die Drawerhöhe entsprach jeweils der Viewporthöhe. Der Dokument-Scrollbereich
war nie breiter als der Viewport.

## Accessibility

- bevorzugter Fokus landet im ersten sinnvollen Formularfeld
- Tab vom letzten Element springt zum Schließen-Button
- Escape schließt und setzt den Fokus auf den Auslöser zurück
- X und Overlay wurden im Browser erfolgreich geprüft
- Animationen werden bei `prefers-reduced-motion` deaktiviert

## Qualität

- `npm run lint`: erfolgreich, 0 Fehler, 12 bestehende Warnungen
- `npm run typecheck`: erfolgreich
- `npm test`: erfolgreich, 19 von 19 Tests
- `npm run build`: erfolgreich

## Geänderte Dateien

- `src/shared/components/AppDrawer.tsx`
- `src/modules/admin/pages/RewardsPage.tsx`
- `src/modules/admin/pages/WelcomeGiftsPage.tsx`
- `src/styles.css`
- `tests/kpi-drawer-ux.test.mjs`
- `docs/04_RESTAURANT_PORTAL.md`
- `docs/15_DESIGN_SYSTEM.md`
- `docs/19_CHANGELOG.md`
- `docs/reports/2026-07-19_KPI_DRAWER_UX_LOOP_REPORT.md`

## Migration

Keine.

## Offene Risiken

Die Drawer-Interaktion und Responsive-Darstellung wurden lokal real im Browser
geprüft. Ein authentifizierter Supabase-Test mit echtem Speichern und erneutem
Laden beider Formulararten war ohne vorgesehenes Owner-Testkonto nicht
durchführbar. Die bestehenden Servicefunktionen wurden unverändert
weiterverwendet und automatisiert auf ihre Verbindung geprüft.

## Status

NOT READY
