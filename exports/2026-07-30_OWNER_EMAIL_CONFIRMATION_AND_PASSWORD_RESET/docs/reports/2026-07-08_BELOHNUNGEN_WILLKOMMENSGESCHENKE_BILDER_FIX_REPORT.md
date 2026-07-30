# Belohnungen und Willkommensgeschenke Bilder Fix Report

Datum: 2026-07-08

## Ursache

Nach dem Onboarding haben Willkommensgeschenke und neue Belohnungen oft keine hochgeladene `image_url`, weil V1 bewusst mit WUXUAI Standardbildern startet. Die Verwaltungsseiten haben in diesem Fall nur einfache Emoji-Fallbacks angezeigt. Dadurch wirkte es so, als ob kein Bild vorhanden ist.

## Geänderte Dateien

- `src/modules/admin/pages/RewardsPage.tsx`
- `src/modules/admin/pages/WelcomeGiftsPage.tsx`
- `src/styles.css`

## Fix

- Belohnungen zeigen jetzt bei fehlendem Foto eine WUXUAI Standardbild-Fläche passend zur Kategorie.
- Willkommensgeschenke zeigen ebenfalls eine WUXUAI Standardbild-Fläche passend zur Kategorie.
- Editor-Vorschau für Willkommensgeschenke nutzt denselben Standardbild-Fallback.
- Kategorien mit eigenem Standardstil:
  - Getränk
  - Kaffee
  - Dessert
  - Vorspeise
  - Hauptspeise
  - Sushi
  - Menü
  - Eigene Belohnung

## Produktlogik

Nicht geändert:

- Keine neue Produktlogik.
- Keine neuen Module.
- Keine Aktionen.
- Keine Kampagnen.
- Keine Punkte-Eingabe.
- Keine Datenbankänderung.

## Build Ergebnis

`npm run build` erfolgreich.

## Offene Risiken

- Echte hochgeladene Bilder hängen weiterhin von erfolgreichem Supabase Storage Upload ab.
- Dieser Fix betrifft die Restaurant-Portal-Verwaltungsseiten, nicht die Customer-Portal-Darstellung.

## Status

LOCK
