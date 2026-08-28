# WUXUAI Bonus – Starter Kit WYSIWYG QR Center Report

Datum: 2026-08-28  
Branch: `codex/v1-canonical-recovery`  
Basis-Commit: `a78e1b60e5e9e50393d1ec01d01a564246c239c4`  
Staging Deployment: `2a3ee7bf-5145-4195-94d7-6be1720c9602`

## Ursache

Die QR-Center-Ansicht zeigte vereinfachte Web-Karten, während das A6-PDF aus einer getrennten Canvas-Seitenstruktur erzeugt wurde. Inhalt, Reihenfolge und Geometrie waren doppelt definiert. Deshalb konnte die Bildschirmvorschau nicht verbindlich dem Download entsprechen.

## Geänderte Dateien

- `src/shared/lib/starterKitPages.mjs`
- `src/shared/lib/starterKitPages.d.mts`
- `src/shared/lib/starterKitFilename.mjs`
- `src/shared/lib/starterKitFilename.d.mts`
- `src/modules/admin/pages/QrCenterPage.tsx`
- `src/modules/admin/pages/RestaurantOnboarding.tsx`
- `src/styles.css`
- `tests/starter-kit-premium-print.test.mjs`
- `tests/starter-kit-filename.test.mjs`
- `tests/operational-qr-rendering.test.mjs`
- `tests/v1-qr-center-flow.test.mjs`

## Was wurde geändert

- Ein kanonisches Starter-Kit-Seitenmodell definiert Inhalt, Reihenfolge und A6-Geometrie.
- QR-Center-Vorschau und QR-Center-PDF verwenden dieselben drei Seitendefinitionen.
- Die Vorschau zeigt `Neu hier?`, `Bonusprogramm entdecken` und `Mitarbeiterbereich` als skalierte A6-Seiten im Verhältnis `105:148`.
- Smart Logo, Restaurantname, QR-Zuordnung, Referral-Inhalt, Staff-Hinweis und Footer werden aus gemeinsamen Verträgen bezogen.
- Die Papiergrundfläche ist auf allen Seiten `#FFFFFF`.
- Einzelne Roh-QRs sind separat gekennzeichnet und werden als PNG heruntergeladen.
- Der PDF-Dateiname folgt dem kanonischen Format `WUXUAI-Starter-Kit_<Restaurant>_<YYYY-MM-DD>.pdf`.

## Was wurde nicht geändert

- Keine QR-Payloads oder Routen geändert.
- Keine Punkte-, Referral-, Staff- oder Customer-Businesslogik geändert.
- Keine Datenbankmigration, RLS- oder RPC-Änderung.
- Keine Production-Aktion und keine Stripe-Arbeit.

## Verifikation

- Zieltests: PASS
- Autoritative Tests: `1091/1091 PASS`
- Typecheck: PASS
- Lint: PASS, 0 Fehler, 7 bereits bekannte Warnungen
- Production Build: PASS
- Staging Deployment: PASS
- Live DOM: exakt drei Kernseiten, drei QR-Codes und vollständige deutsche Inhalte
- Live A6-Verhältnis: `0.7095`, entsprechend `105:148`
- Live Papierfarbe: `rgb(255, 255, 255)` auf allen drei Seiten
- Globaler horizontaler Overflow: keiner bei Mobile-, Tablet- und Desktop-Prüfung
- Seiteninterner Overflow: keiner auf allen drei Seiten

## Responsive Prüfung

- Mobile: PASS, horizontale Vorschau mit nächster Seite
- Tablet: PASS
- Desktop: PASS, drei gleich große Seiten im Raster

## Risiken

- Der reale physische A6-Ausdruck und ein Pixelvergleich eines manuell gespeicherten PDFs sind noch durch den Nutzer zu bestätigen. Die Browser-Automation kann Blob-Downloads nicht verlässlich als lokale Datei für diesen physischen Gate persistieren.
- Der Onboarding-Download übernimmt das gemeinsame Inhaltsmodell, verwendet aber weiterhin seinen bestehenden hochauflösenden Canvas-Renderer.

Status: CODE LOCK
