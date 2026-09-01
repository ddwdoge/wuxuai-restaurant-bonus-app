# WUXUAI Bonus - Starter Kit PDF Logo und Referral Print

Datum: 2026-08-27
Branch: `codex/v1-canonical-recovery`

## Ursache

Die neue A6-PDF-Erzeugung verwendete zwar bereits die kanonischen Smart-Logo-
Metadaten, stellte ein quadratisches Logo in der Stage `360 x 118` aber sichtbar
zu klein dar. Der bestehende Referral-Hinweis war nur ein Fliesstext auf Seite 1;
Seite 2 enthielt keinen Hinweis. Die gemeinsame App-LogoStage zeigte bei
quadratischen Logos ausserdem den Hintergrund ihrer breiten Headerflaeche als
graue Seitenbereiche.

## Referenzvergleich

Geprueft wurden die beiden gelieferten dreiseitigen A6-PDFs:

- `restaurant-starter-kit-a6 (4).pdf`: saubere neue Smart-Logo-Darstellung,
  Logo zu klein, Referral nur als Ein-Text-Block
- `restaurant-starter-kit-a6.pdf`: staerkere Logo-Praesenz und zwei
  Referral-Vorteile, aber veraltete dritte Laufzeit-Zelle und operative
  QR-Beschriftungen

Die neue Umsetzung kombiniert die saubere Smart-Logo-Darstellung mit der
staerkeren Markenpraesenz und dem aktualisierten evergreen Referral-Vertrag.

## Geaenderte Dateien

- `src/modules/admin/pages/QrCenterPage.tsx`
- `src/modules/admin/pages/RestaurantOnboarding.tsx`
- `src/shared/components/restaurant-logo-stage.css`
- `tests/starter-kit-premium-print.test.mjs`
- `tests/owner-smart-logo-presentation.test.mjs`
- `docs/04_RESTAURANT_PORTAL.md`
- `docs/15_DESIGN_SYSTEM.md`
- `docs/19_CHANGELOG.md`

## Was wurde geaendert

- A6-LogoStage von `360 x 118` auf `460 x 160` vergroessert. Fuer ein
  quadratisches Logo steigt die nutzbare visuelle Hoehe damit um rund 35,6
  Prozent; breite und hohe Logos bleiben proportional adaptiv.
- Restaurantname, Zielgruppenlabel, Headline und Beschreibung kompakt neu
  ausgerichtet. Der QR bleibt bei `680 x 680` Pixel und an `y = 548`.
- Beide Gaesteseiten zeigen den Block `Freunde einladen lohnt sich` mit genau
  zwei Zellen: `Du bekommst - 2x Punkte` und
  `Dein Freund bekommt - 2x Punkte`.
- Darunter steht ausschliesslich:
  `Aktiv nach dem ersten qualifizierten Besuch deines Freundes.`
- Es werden keine Referral-Tage gedruckt. Die Staff-Seite enthaelt keinen
  Referralblock und behaelt `Nur fuer Mitarbeiter - Nicht fuer Gaeste`.
- Der Onboarding-Export verwendet vorhandene Fit-, Scale- und X-/Y-Metadaten
  und zeichnet keinen eigenen weissen Logo-Rahmen mehr.
- Geladene App-Logos erhalten keinen kuenstlichen Stage-Hintergrund. Header-,
  Detail-, Vorschau- und Print-Stage passen ihre Geometrie an das erkannte
  Seitenverhaeltnis an. Ein fester Hintergrund in der Bilddatei wird nicht
  entfernt.

## Was wurde nicht geaendert

- keine QR-Payload oder Route
- keine QR-Groesse oder Ruhezone
- keine Referral-Businesslogik, Qualifikation oder Laufzeitberechnung
- keine Auth-, Tenant-, RLS- oder Storage-Regel
- keine Datenbankmigration
- keine Production-Aktion und keine Stripe-Arbeit

## Visuelle QA

Die gelieferten PDFs wurden mit Poppler bei 120 dpi gerendert. Zusaetzlich wurde
eine dreiseitige A6-QA-PDF mit der finalen Geometrie erzeugt und erneut als PNG
gerendert.

- Seite 1: Logo, QR, zwei Referral-Zellen und Footer ohne Ueberlappung
- Seite 2: gleicher Referralvertrag, QR bleibt dominant
- Seite 3: Logo und Staff-QR ohne Referralinhalt
- A6-Seitengroesse: `297.64 x 419.53 pt`
- gedruckte Referral-Laufzeiten: 0
- Legacy-Labels: 0

Die QA-PDF verwendet fuer die Benefit-Icons geometrische Platzhalter; die App-
Canvas-Ausgabe rendert die festgelegten Zeichen `🔥` und `👥` mit dem
plattformseitigen Emoji-Font.

## Tests und Build

- gezielte Print-, QR- und Smart-Logo-Tests: 20/20 PASS
- vollstaendige Tests: 1041/1041 PASS
- Typecheck: PASS
- Lint: PASS (0 Fehler, 7 bestehende Warnungen)
- Build: PASS
- `git diff --check`: PASS
- Secret-Scan: PASS

## Risiken

- Ein echter A6-Ausdruck und nativer iPhone-Kamera-Scan wurden in diesem
  Code-Gate noch nicht durchgefuehrt.
- Die finalen Canvas-Aenderungen sind noch nicht auf Staging ausgerollt. Daher
  ist ein FINAL LOCK vor Deployment und physischer Pruefung nicht zulaessig.

## Status

Businesslogik geaendert: Nein

DB-Migration: Keine

Production: LOCKED

Stripe: DEFERRED

Status: CODE LOCK nach erfolgreichen Qualitaetsgates, kein FINAL LOCK vor
Staging- und physischem A6-Test.
