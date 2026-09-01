# WUXUAI Bonus - QR Center / Starter Kit Global Branding Consistency

Datum: 2026-08-28  
Branch: `codex/v1-canonical-recovery`  
Staging Worker Version: `e7d84541-6cff-46c9-b847-e328f31b5da0`

## Ursache

Im QR-System waren drei voneinander abweichende Renderpfade aktiv:

- Druckvorschau: `StarterKitPagePreview` verwendete `RestaurantLogoStage` mit browserseitigen, seitenverhaeltnisabhaengigen Padding- und Transform-Regeln.
- Einzelne QR-Codes: `renderQrBrandBlock` verwendete einen separaten `RestaurantLogoStage`-Header mit eigener fester Kontextgroesse.
- PDF: `drawQrPrintPage` zeichnete ueber `drawLogo` und `logoCanvasPlacement` mit einer eigenen Canvas-Geometrie.

Obwohl Vorschau und PDF bereits dieselben A6-Seitenkoordinaten verwendeten, wurde die eigentliche Bildplatzierung unterschiedlich berechnet. Dadurch war die Marke in der Vorschau sichtbar kleiner als in der PDF. Auf der Mitarbeiterseite begann der QR-Rahmen zudem zu nah am zweizeiligen Beschreibungstext; da der QR-Rahmen nach dem Text gezeichnet wird, konnte er die zweite Zeile ueberdecken.

## Geaenderte Dateien

- `src/modules/admin/pages/QrCenterPage.tsx`
- `src/shared/components/RestaurantBrandIdentity.tsx`
- `src/shared/components/RestaurantLogoStage.tsx`
- `src/shared/components/restaurant-logo-stage.css`
- `src/shared/lib/starterKitPages.mjs`
- `src/shared/lib/starterKitPages.d.mts`
- `src/styles.css`
- `tests/owner-smart-logo-presentation.test.mjs`
- `tests/starter-kit-premium-print.test.mjs`

## Was wurde geaendert

- Eine gemeinsame `RestaurantBrandIdentity`-Abstraktion fuer A6 und einzelne QR-Karten eingefuehrt.
- Browser und PDF verwenden fuer die Markenplatzierung denselben `logoCanvasPlacement`-Vertrag.
- Die genehmigte PDF-Mastergeometrie unveraendert zentral beibehalten:
  - Canvas: `1240 x 1748`
  - Markenflaeche: `x 321`, `y 106`, `598 x 208`
  - Markenbreite: `48,2258 %` der Seitenbreite
  - Markenoberkante: `6,0641 %` der Seitenhoehe
  - QR: `x 280`, `y 610`, `680 x 680`, Rahmenabstand `44`
- Vorschau skaliert die A6-Seite als Einheit und berechnet keine eigene Logogroesse mehr.
- Einzelne Gast- und Mitarbeiter-QR-Karten verwenden denselben kanonischen Markenvertrag.
- Mitarbeiterbeschreibung auf einen explizit begrenzten Zweizeilenblock gesetzt und weiter vom unveraenderten QR-Rahmen entfernt.
- Mehrsprachige Textgrenzen fuer DE, EN, FR, IT und ES sowie lange Restaurantnamen getestet.
- Weisser Seitenhintergrund, QR-Geometrie, QR-Payloads und kanonischer Dateiname beibehalten.

## Was wurde nicht geaendert

- Keine QR-Payloads oder Routen.
- Keine Gastregistrierung, Staff-Authentifizierung oder Tages-PIN-Logik.
- Keine Referral-, 2x-Bonus- oder Membership-Logik.
- Keine RLS-, Tenant- oder Datenbankaenderung.
- Keine Production-Aktion und keine Stripe-Arbeit.

## Renderer-Audit

DRUCKVORSCHAU RENDERER: `StarterKitPagePreview` -> `RestaurantBrandIdentity variant="a6"` -> `RestaurantLogoStage placementMode="canonical"`  
STANDALONE QR RENDERER: `renderQrBrandBlock` -> `RestaurantBrandIdentity variant="qr-card"` -> `RestaurantLogoStage placementMode="canonical"`  
PDF RENDERER: `buildQrCenterStarterKitPdf` -> `drawQrPrintPage` -> `drawLogo` -> `logoCanvasPlacement`  
ACTIVE LEGACY QR BRAND RENDERERS: `0`

## Tests und Build

- Tests: `1094/1094 PASS`
- Typecheck: PASS
- Lint: PASS, `0` Fehler; `7` bereits bestehende Warnungen ausserhalb dieses Scopes
- Production Build: PASS
- `git diff --check`: PASS
- Secret-Scan des Diffs: PASS
- DB-Migration: NONE

## Staging und visuelle Pruefung

- Staging-Version aktiviert: `e7d84541-6cff-46c9-b847-e328f31b5da0`
- QR Center mit echter Owner-Sitzung geladen: PASS
- Drei A6-Vorschauen: PASS
- Einzelne Gast-/Staff-QR-Karten: PASS
- Normalisierte Vorschaugeometrie aller drei Seiten: PASS innerhalb Browser-Rendertoleranz
- Erste echte PDF-Pruefung nach der initialen Anpassung: Seite 1 PASS, Seite 2 PASS, Seite 3 FAIL wegen verbleibender Textnaehe
- Daraufhin Textblock weiter nach oben verschoben und Schutzabstand vergroessert; Regressionstest und Staging-Vorschau PASS
- Der finale nachjustierte PDF-Blob konnte vom In-App-Browser nicht als lokale Datei an die Pruefumgebung uebergeben werden. Deshalb wird der abschliessende echte PDF-Nachweis nicht als PASS behauptet.

## Ergebnis

ONE CANONICAL BRAND CONTRACT: PASS  
ACTUAL PDF BRANDING PRESERVED: PASS  
DRUCKVORSCHAU BRAND MATCH: PASS  
PAGE 1 PREVIEW/PDF: PASS  
PAGE 2 PREVIEW/PDF: PASS  
PAGE 3 PREVIEW/PDF: CODE PASS / FINAL FILE VERIFICATION OPEN  
STANDALONE GUEST BRAND: PASS  
STANDALONE STAFF BRAND: PASS  
STAFF DESCRIPTION COLLISION: CODE/Preview NO / FINAL PDF FILE OPEN  
STAFF DESCRIPTION READABLE: PASS IN PREVIEW  
QR QUIET ZONE: UNCHANGED  
QR SIZE: UNCHANGED  
WHITE BACKGROUND: PASS  
CANONICAL PDF FILENAME: PASS  
DE / EN / FR / IT / ES: PASS (automatisierter Layoutvertrag)

## Risiken

Offen ist nur die visuelle Kontrolle der final neu heruntergeladenen PDF-Seite 3. Hierfuer muss die kanonische PDF einmal aus dem aktiven Staging-QR-Center heruntergeladen und Seite 3 geoeffnet werden. Bis dieser Nachweis erfolgt, gilt kein FINAL LOCK.

Status: **CODE LOCK / NOT FINAL READY**
