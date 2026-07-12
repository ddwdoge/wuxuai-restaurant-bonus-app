# Belohnungen Bild und Bearbeiten UX Fix Report

Datum: 2026-07-07

## Ursache

Auf der Belohnungen-Seite hatten gespeicherte Belohnungskarten keinen fest kontrollierten Bildbereich. Hochgeladene Bilder konnten dadurch zu viel Raum einnehmen und die Karte optisch sprengen.

Beim Klick auf "Bearbeiten" wurden die Daten zwar in den Wizard geladen, die Seite blieb aber bei der gespeicherten Karte. Dadurch war für Restaurantbesitzer nicht klar sichtbar, dass oben der Bearbeitungsbereich aktualisiert wurde.

## Geänderte Dateien

- `src/modules/admin/pages/RewardsPage.tsx`
- `src/styles.css`
- `docs/reports/2026-07-07_BELOHNUNGEN_BILD_UND_BEARBEITEN_UX_FIX_REPORT.md`

## Bild-Skalierungs-Fix

Gespeicherte Belohnungskarten haben jetzt einen festen Bildrahmen:

- Desktop: 200 px Höhe
- Tablet: 180 px Höhe
- Mobile: 160 px Höhe

Das Bild bleibt im Rahmen und nutzt:

- `object-fit: cover`
- `object-position: center`
- `overflow: hidden`

Wenn kein Bild vorhanden ist, bleibt das vorhandene Kategorie-Icon sichtbar. Die Karte bleibt kompakt und wächst nicht durch Originalbildgrößen.

## Bearbeiten-Scroll-Fix

Beim Klick auf "Bearbeiten":

- Belohnung wird in den Wizard geladen.
- Bearbeitungsmodus wird gesetzt.
- Kategorie, Name, Preis, Bild und Status werden übernommen.
- Die Seite scrollt automatisch per Smooth Scroll zum Wizard.
- Der Wizard erhält kurz eine dezente grüne Hervorhebung.
- Das Preisfeld wird fokussiert und markiert.
- Der Buttontext lautet im Bearbeitungsmodus "Änderungen speichern".
- Nach dem Speichern erscheint "Belohnung aktualisiert."

## Produktregeln

Unverändert:

- Restaurantbesitzer geben keine Punkte manuell ein.
- Punkte werden automatisch aus dem Preis berechnet.
- Keine Aktionen.
- Keine Kampagnen.
- Keine neue Produktlogik.

## Responsive Prüfung

Geprüft per CSS-Review und Build:

- Mobile: Bildhöhe 160 px, Karten bleiben kompakt.
- Tablet: Bildhöhe 180 px.
- Desktop: Bildhöhe 200 px.
- Buttons können umbrechen und bleiben innerhalb der Karte.
- Kein neuer horizontaler Scroll-Auslöser wurde eingebaut.

## Build Ergebnis

`npm run build` erfolgreich.

## Offene Risiken

- Es wurde keine Browser-Screenshot-Prüfung mit echten hochgeladenen Extrembildern durchgeführt.
- Sehr ungewöhnliche SVG-Dateien können weiterhin inhaltlich leer wirken, werden aber nicht mehr die Karte vergrößern.

## Status

LOCK
