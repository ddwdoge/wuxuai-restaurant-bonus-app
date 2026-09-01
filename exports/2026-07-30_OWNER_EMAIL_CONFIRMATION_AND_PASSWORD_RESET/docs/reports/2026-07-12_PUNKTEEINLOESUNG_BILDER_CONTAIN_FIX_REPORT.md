# Punkteeinlösung Bilder Contain Fix Report

Datum: 2026-07-12  
Status: LOCK

## Problem

Hochgeladene Produktbilder in Punkteeinlösungen wurden in mehreren Karten mit `object-fit: cover` angezeigt. Dadurch wurden echte Speisenfotos angeschnitten, zum Beispiel bei Hochformat- oder Querformatbildern.

## Ursache

Die Bildbereiche in Admin- und Customer-Portal hatten feste Medienflächen und füllten diese per hartem Cropping. Das war für generische Vorschaubilder brauchbar, aber falsch für echte Restaurant-Produktfotos.

## Geänderte Dateien

- `src/styles.css`
- `docs/04_RESTAURANT_PORTAL.md`
- `docs/05_CUSTOMER_PORTAL.md`
- `docs/15_DESIGN_SYSTEM.md`
- `docs/19_CHANGELOG.md`

## Betroffene Komponenten

### Restaurant Portal

- Gespeicherte Punkteeinlösungen in `RewardsPage`
- Foto-Vorschau im Punkteeinlösungs-Wizard
- Vorschaukarte im Punkteeinlösungs-Wizard

### Customer Portal

- Karten im Bereich `Mit Punkten einlösbar`
- gemeinsame Kunden-Bildkomponente für sichtbare Punkteeinlösungen

Willkommensgeschenk-spezifische Admin-Karten wurden nicht frei umgebaut. Die gemeinsame Kunden-Bildkomponente wurde jedoch mit verbessert, weil sie auch dort verwendet wird.

## Neue Bildregel

Für Punkteeinlösungsbilder gilt jetzt:

- `object-fit: contain`
- `object-position: center`
- helles ruhiges Medienfeld
- definierte Medienhöhe
- originales Seitenverhältnis bleibt erhalten
- kein hartes Zuschneiden echter Speisenbilder
- Leerraum im Medienfeld ist erlaubt

Geänderte CSS-Bereiche:

- `.reward-management-image img`
- `.reward-standard-image img`
- `.reward-preview-image img`
- `.customer-reward-image img`

## Desktop / Tablet / Mobile Prüfung

Statisch geprüft:

- Desktop: gespeicherte Punkteeinlösungen nutzen `height: clamp(180px, 24vw, 240px)`.
- Tablet: Medienfelder skalieren innerhalb derselben kontrollierten Höhe.
- Mobile: gespeicherte Punkteeinlösungen bleiben bei `180px` und zeigen Bilder vollständig.
- Customer Portal: Produktbilder nutzen `height: clamp(160px, 28vw, 210px)`.
- Keine neuen festen Breiten erzeugen horizontales Scrollen.
- Karten behalten ein kontrolliertes Layout.

## Build-Ergebnis

`npm run build` erfolgreich.

Wichtige Ausgabe:

- `RewardsPage-BOQmrBtw.js`: 13.16 kB, gzip 4.53 kB
- `CustomerPortal-BcUo-xyr.js`: 26.85 kB, gzip 7.73 kB
- `index-Dyky6CXi.css`: 41.96 kB, gzip 7.72 kB

## Offene Risiken

- Es wurde keine visuelle Browser-Screenshot-Prüfung mit echten hochgeladenen Speisenbildern ausgeführt.
- Admin-spezifische Willkommensgeschenk-Bildkarten behalten ihre bestehende Darstellung, weil der Auftrag auf Punkteeinlösungen begrenzt war.

## Status

LOCK
