# WUXUAI Bonus - QR Center Mobile A6 Preview Carousel

Datum: 2026-08-30
Branch: `codex/v1-canonical-recovery`
Ausgangs-Commit: `d64094c80704329e54413a70d0cf8f6c687198a2`
Production: `LOCKED`
Stripe: `DEFERRED`

## Ursache

Die mobile Druckvorschau verwendete fuer jede Seite den Track
`minmax(250px, min(78vw, 300px))`. Diese Breite war an den Viewport und einen
festen Mindestwert statt an die echte Breite des QR-Center-Containers gebunden.
Bei 390 Pixel Viewport war der Container 362 Pixel breit, die A6-Seite aber nur
250 Pixel. Damit belegte sie rund 69 Prozent des Containers und zeigte rund
27 Prozent der Nachbarseite. Auf wechselnden Admin- und Safari-Breiten entstand
dadurch eine unzuverlaessige Zwischenansicht.

Zusaetzlich fehlten `scroll-snap-stop`, ein autoritativer aktiver Seitenindex,
Einzelschritt-Pfeile und eine Seitenanzeige. Die interne A6-Geometrie selbst war
nicht defekt.

## Geaenderte Dateien

- `src/modules/admin/pages/QrCenterPage.tsx`
- `src/styles.css`
- `tests/starter-kit-premium-print.test.mjs`
- `docs/19_CHANGELOG.md`

## Was wurde geaendert

- Mobile Seitenbreite auf containerbezogene 87 Prozent gesetzt.
- Abstand auf 12 Pixel und verpflichtendes `scroll-snap-type: x mandatory`
  mit `scroll-snap-stop: always` festgelegt.
- Pfeile `Vorherige Druckseite` und `Naechste Druckseite` mit mindestens
  44 x 44 Pixel Touchflaeche ergaenzt.
- Aktuelle Anzeige `1 / 3`, `2 / 3`, `3 / 3` ergaenzt.
- Links-/Rechts-Tastatursteuerung ergaenzt.
- Ab 768 Pixel auf ein vollstaendiges Drei-Spalten-Grid gewechselt.
- Der Carousel-Wrapper begrenzt seinen Paint- und Scrollbereich, damit keine
  globale horizontale Dokumentbreite entsteht.

## Was wurde nicht geaendert

- Kein Starter-Kit-Seiteninhalt.
- Kein PDF-Renderer und kein Dateiname.
- Keine A6-, Branding-, Smart-Logo- oder Smart-Media-Geometrie.
- Keine QR-Groesse, Ruhezone oder Payload.
- Keine Referral-, Staff-, Punkte-, Auth- oder Businesslogik.
- Keine Einzel-QR-Karten.
- Keine Datenbank oder Migration.

## Responsive Nachweis

Isolierter Browsernachweis mit der produktiven Carousel-Geometrie:

| Viewport | Kartenbreite | Naechste Seite | Dokument-Overflow |
| --- | ---: | ---: | --- |
| 320 | ca. 86 % | 9,4 % | Nein |
| 375 | ca. 86 % | 10,0 % | Nein |
| 390 | ca. 86 % | 10,1 % | Nein |
| 414 | ca. 86 % | 10,3 % | Nein |
| 430 | ca. 86 % | 10,4 % | Nein |
| 768 | Drei vollstaendige Seiten | Grid | Nein |
| 1024 | Drei vollstaendige Seiten | Grid | Nein |

Das gemessene Breiten-/Hoehenverhaeltnis ist durchgehend `0,70946` und stimmt
mit `105 / 148` ueberein.

## Qualitaet

- Starter-Kit-Fokustests: 19/19 PASS.
- Gesamttests: 1134/1134 PASS.
- Typecheck: PASS.
- Lint: PASS, 0 Fehler und 7 bestehende Warnungen.
- Build: PASS, 2061 Module transformiert.
- `git diff --check`: PASS.
- Migration: keine.

## Staging und physischer Test

- Development/Test-Deployment: noch nicht ausgefuehrt.
- Physisches iPhone: PENDING.
- Ein physischer PASS wird erst nach Founder-Bestaetigung fuer Seite 1,
  Swipe zu Seite 2 und 3, Rueckwaertsswipe, Pfeile und Pagination gemeldet.
- `docs/AI_IMPLEMENTATION_GUARDRAILS.md` fehlt weiterhin und wurde nicht
  rekonstruiert.

## Final Output

ROOT CAUSE: fester/viewportbezogener Track statt containerbezogener Seitenbreite
und fehlende kontrollierte Seitensteuerung

MOBILE PREVIEW MODE: CAROUSEL

A6 INTERNAL GEOMETRY: UNCHANGED

320: PASS

375: PASS

390: PASS

414: PASS

430: PASS

CURRENT PAGE FULLY VISIBLE: PASS

NEXT PAGE PREVIEW: 9,4-10,4 %

SWIPE: CODE PASS / PHYSICAL PENDING

SCROLL SNAP: PASS

ARROWS: PASS

PAGINATION: PASS

INITIAL PAGE ALIGNMENT: PASS

GLOBAL HORIZONTAL OVERFLOW: NO

DESKTOP: PASS

TABLET: PASS

PDF CONTENT: UNCHANGED

PDF GEOMETRY: UNCHANGED

QR PAYLOAD: UNCHANGED

BUSINESS LOGIC: UNCHANGED

DB MIGRATION: NONE

TESTS: 1134/1134 PASS

PHYSICAL IPHONE: PENDING

QR CENTER MOBILE PRINT PREVIEW READY: NO - Deployment und Founder-iPhone-Gate offen

PRODUCTION: LOCKED

STRIPE: DEFERRED

## Abschlussformat

- Aufgabe: QR Center Mobile A6 Print Preview Carousel
- Build: Ja
- Migration: Keine
- Flow-Test: Browser-Geometrie und automatisiert; physisches iPhone offen
- RLS/Security: Nicht geaendert
- Alte Logik geprueft: Ja
- Report: `docs/reports/2026-08-30_QR_CENTER_MOBILE_A6_PREVIEW_CAROUSEL_REPORT.md`
- Pruef-ZIP: `exports/2026-08-30_QR_CENTER_MOBILE_A6_PREVIEW_CAROUSEL.zip`
- Offene Risiken: Development/Test-Deployment und physischer iPhone-Test
- Status: CODE LOCK
