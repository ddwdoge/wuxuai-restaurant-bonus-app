# Physischer iPhone-Staff-QR: Rendering-Fix

Datum: 2026-08-25  
Branch: `codex/v1-canonical-recovery`  
Codebasis: `a13c11866dc283665d978cb7448c455515704243`  
Umgebung: Cloudflare Staging und Supabase `bwhv…qaya`

## Ursache

Die Staff-URL und ihre Route waren korrekt. Der Fehler lag vor Authentifizierung
und Autorisierung in der optischen QR-Ausgabe:

- Das Staff-SVG wurde im QR Center mit 180 Pixeln und im Onboarding mit 178
  Pixeln gerendert.
- `qrcode.react` verwendet ohne explizite Konfiguration standardmaessig null
  Randmodule. Damit beruehrten die aeusseren Datenmodule direkt den SVG-Rand.
- Die PDF-Konvertierung uebernahm dieses randlose SVG und skalierte ein
  960-Pixel-Zwischenbild mit aktivierter Canvas-Glaettung auf 610 beziehungsweise
  820 Pixel.
- Nur der separate PNG-Download legte nachtraeglich Weissraum ausserhalb des
  randlosen QR an. Bildschirm, Download und Druck verwendeten deshalb keinen
  einheitlichen Maschinenlesbarkeitsvertrag.

Der reale iPhone-Fehler trat damit bei einer kleinen, randlosen und je nach
Ausgabepfad unterschiedlich skalierten Matrix auf. Staff Auth, Routing,
Membership und RLS waren an diesem Fehler nicht beteiligt.

## Nutzlast und Dekodierung

Der Staff-QR kodiert ausschliesslich die sichere oeffentliche Struktur:

`https://bonus.wuxuaisbi.com/staff/login?restaurant=<slug>`

Fuer den getesteten Slug besteht die Nutzlast aus 71 Zeichen und erzeugt bei
Fehlerkorrekturstufe M ein 37-mal-37-Datenraster. Mit der neuen Ruhezone besteht
das SVG aus 45-mal-45 Modulen.

Ein automatisierter ZXing-Test baut das von `qrcode.react` erzeugte SVG-Raster
pixelgenau nach und dekodiert es wieder. Ergebnis:

- Staff-QR: exakt auf die Staff-Login-URL dekodiert
- Neue-Gaeste-QR: exakt auf die Restaurant-Kundenroute dekodiert
- keine Authdaten, PINs, Membership-IDs oder Tokens in der Staff-Nutzlast

## Umsetzung

- Gemeinsame Komponente `OperationalQrCode` fuer QR Center und Onboarding
- Schwarz `#000000` auf deckendem Weiss `#ffffff`
- vier saubere Randmodule auf allen vier Seiten
- Fehlerkorrektur M ohne Logo, Overlay, Transparenz oder Verlauf
- 270 Pixel native Bildschirmgroesse; beim Staff-Raster exakt sechs CSS-Pixel
  pro Modul
- PNG: 1080 Pixel QR-Raster in einer 1260-Pixel-Datei
- QR-Center-PDF: 630 Pixel QR-Flaeche
- Onboarding-Starter-Kit: 900 Pixel QR-Flaeche
- Canvas-Glaettung auf allen QR-Rasterpfaden deaktiviert
- keine CSS-Hochskalierung eines kleinen Ausgangsbilds

## Geaenderte Dateien

- `src/shared/components/OperationalQrCode.tsx`
- `src/shared/lib/operationalQr.mjs`
- `src/shared/lib/operationalQr.d.mts`
- `src/modules/admin/pages/QrCenterPage.tsx`
- `src/modules/admin/pages/RestaurantOnboarding.tsx`
- `src/styles.css`
- `tests/operational-qr-rendering.test.mjs`
- `tests/onboarding-customer-qr-preview-removal.test.mjs`
- `docs/19_CHANGELOG.md`
- `docs/reports/2026-08-25_PHYSICAL_IPHONE_STAFF_QR_RENDERING_FIX_REPORT.md`

## Responsive und Staging

- 390 Pixel: kein horizontaler Overflow, QR 270 mal 270 Pixel
- 430 Pixel: kein horizontaler Overflow, QR 270 mal 270 Pixel
- visuelle Rastergrenzen: scharf, ohne Modulinterpolation
- Cloudflare Worker: `wuxuai-restaurant-bonus-app`
- aktive Staging-Version: `5cfcf3ae-0bcd-4501-a292-f4496dacca27`
- Domain liefert den neuen QR-Chunk und neuen Asset-Einstieg aus
- Production: nicht veraendert

Beim ersten physischen Starter-Kit-Gate wurde ein unabhaengiger Blob-Lifecycle-
Fehler reproduziert: Das PDF wurde nach 60 Sekunden widerrufen und ein spaeter
ladender Tab zeigte `ERR_FILE_NOT_FOUND`. Der PDF-Link bleibt nun fuer die
Lebensdauer der QR-Center-Seite gueltig und wird erst bei `pagehide` freigegeben.
Der QR-Inhalt und die PDF-Erzeugung selbst waren davon nicht betroffen.

## Qualitaet

- Tests: 917/917 PASS
- gezielte QR-Tests: 22/22 PASS
- Typecheck: PASS
- Lint: 0 Fehler, 7 bestehende Warnungen
- Build: PASS
- `git diff --check`: PASS
- Datenbankmigration: keine
- Businesslogik: unveraendert

## Physisches Abnahme-Gate

Die technische Rendering-Korrektur ist auf Staging aktiv. Fuer `FINAL LOCK`
muessen mit der nativen iPhone-Kamera noch real bestaetigt werden:

1. Neue-Gaeste-QR im QR Center wird erkannt.
2. Mitarbeiter-QR im QR Center wird erkannt und oeffnet `/staff/login`.
3. heruntergeladener Mitarbeiter-QR wird erkannt.
4. Mitarbeiterseite im Starter-Kit-PDF beziehungsweise Ausdruck wird erkannt.
5. Owner gelangt fuer das eigene Restaurant in den erlaubten Staff-Flow.
6. Staff gelangt nach persoenlicher Anmeldung in den Staff-Flow.

Bis zur realen Bestaetigung gilt `CODE LOCK`, nicht `FINAL LOCK`.

## Status

`NOT READY` fuer physischen Final Lock. Die korrigierte Staging-Version ist
bereit fuer den unmittelbaren iPhone-Kameratest.
