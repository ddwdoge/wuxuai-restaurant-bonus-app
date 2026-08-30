# A6 Preview Canonical Scale Report

Datum: 2026-08-30

## Ursache

`StarterKitPagePreview` positionierte Texte und QR-Flächen relativ zur
sichtbaren A6-Seite, während `RestaurantLogoStage` für `size-print` unabhängig
davon feste Maße von `184 × 82 px` verwendete. Quadratische und hohe Logos
erhielten zusätzlich feste Breiten von `82 px` bzw. `66 px`.

Bei kleinen mobilen Vorschauen war die kanonische Logo-Fläche bereits kleiner
als diese festen Werte. Die Logo-Stage lief deshalb aus ihrer vorgesehenen
Fläche in Restaurantname, Überschrift und Beschreibung. Smart-Logo wurde
außerdem über transformierte `getBoundingClientRect()`-Maße berechnet, was bei
einer äußeren Seitenskalierung eine zweite Skalierung erzeugt hätte.

## Geänderte Dateien

- `src/modules/admin/pages/QrCenterPage.tsx`
- `src/shared/components/RestaurantBrandIdentity.tsx`
- `src/shared/components/RestaurantLogoStage.tsx`
- `src/shared/lib/starterKitPages.mjs`
- `src/shared/lib/starterKitPages.d.mts`
- `src/styles.css`
- `tests/starter-kit-premium-print.test.mjs`
- `docs/19_CHANGELOG.md`
- dieser Bericht

## Was wurde geändert

- Die Vorschau besitzt einen festen inneren Canvas mit `1240 × 1748`.
- Ein `ResizeObserver` berechnet genau einen äußeren Skalierungsfaktor aus
  `sichtbare Breite / 1240` und wendet ihn am gemeinsamen Canvas-Root an.
- Logo, Restaurantname, Überschrift, Beschreibung, QR, Empfehlungsblock,
  Hinweis und Footer verwenden ausschließlich kanonische Koordinaten und
  werden gemeinsam skaliert.
- Die A6-Logo-Stage füllt exakt die kanonische Brand-Fläche `598 × 208`.
- Smart-Logo berechnet Zoom und Position anhand untransformierter
  `clientWidth`-/`clientHeight`-Werte vor der äußeren Skalierung.
- Geometrietests vergleichen normalisierte Brand-, Text- und QR-Verhältnisse
  für 320, 375, 390, 414, 430, 768, 1024, 1366 und 1440 Pixel.
- Kollisionsprüfungen decken alle drei A6-Seiten ab, einschließlich der
  Staff-Beschreibung und QR-Ruhezone.

## Was wurde nicht geändert

- PDF-Renderer und PDF-Geometrie
- A6-Format `105 × 148 mm`
- Brand-Größe im PDF
- QR-Größe, QR-Ruhezone und QR-Payloads
- Carousel-Geometrie mit 87 Prozent aktiver Seite
- Smart-Logo-Persistenzwerte
- Businesslogik, Supabase, RLS und Datenbank

## Verifikation

- Starter-Kit-Geometrietests: `16/16 PASS`
- Gesamttests: `1139/1139 PASS`
- Typecheck: PASS
- Lint: PASS
- Build: PASS
- `git diff --check`: PASS
- Supabase-Buildziel: `bwhvfjuwixgwduoeqaya.supabase.co`
- Migration: NONE
- RLS/Security: unverändert; keine Datenbankänderung

## Responsive Ergebnis

- Mobile 320/375/390/414/430: normalisierte Geometrie PASS
- Desktop 768/1024/1366/1440: normalisierte Geometrie PASS
- Page 1 Brand/Text/QR-Kollision: NO
- Page 2 Brand/Text/QR-Kollision: NO
- Page 3 Brand/Text/QR-Kollision: NO
- Staff Text/QR-Kollision: NO
- Carousel: PRESERVED

## Risiken

Die ausschließlich dem Founder vorbehaltene physische iPhone-Abnahme wurde am
30.08.2026 nach dem Development/Test-Deployment bestätigt:

- Seite 1: PASS
- Seite 2: PASS
- Seite 3: PASS
- Physical iPhone: PASS

Development/Test-Deployment:
`52aa8425-18fd-4480-bc44-1b2076bbfb21`

Deployed Commit:
`435a0c2273fcfebdf400d5b8e66b2c13f04ad20f`

Status: FINAL LOCK
