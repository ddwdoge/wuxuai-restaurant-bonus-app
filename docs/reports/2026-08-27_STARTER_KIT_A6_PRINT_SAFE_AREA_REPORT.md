# WUXUAI Bonus - Starter Kit A6 Print Safe Area

Datum: 2026-08-27
Branch: `codex/v1-canonical-recovery`

## Ursache

Der reale PDF-Ausdruck zeigte, dass die neue Smart-Logo-Groesse korrekt war,
die LogoStage im QR-Center-Export aber nur rund 2,9 mm unter der physischen
Oberkante begann. Eine Farblinie lag direkt an der Papierkante und der Footer
hatte ebenfalls keinen belastbaren Druckabstand. Der Onboarding-Generator
zeichnete A6-Inhalt bisher in eine A4-MediaBox (`595 x 842 pt`).

## Geaenderte Dateien

- `src/modules/admin/pages/QrCenterPage.tsx`
- `src/modules/admin/pages/RestaurantOnboarding.tsx`
- `tests/starter-kit-premium-print.test.mjs`
- `docs/04_RESTAURANT_PORTAL.md`
- `docs/15_DESIGN_SYSTEM.md`
- `docs/19_CHANGELOG.md`

## Was wurde geaendert

- Beide PDF-Wege verwenden `297.64 x 419.53 pt`, entsprechend
  `105 x 148 mm` A6.
- QR-Center: LogoStage bei 8,98 mm, horizontaler Inhaltsrand bei 8,13 mm und
  Footer-Basislinie bei 8,30 mm Abstand zur unteren Kante.
- Onboarding: LogoStage bei 9,96 mm, Kartenoberkante bei 8,02 mm,
  horizontaler Inhaltsrand bei 8,47 mm und Footer-Basislinie bei 9,28 mm.
- Die obere Farblinie direkt an der Papierkante wurde in beiden Generatoren
  entfernt.
- Header, Beschreibung und QR-Rahmen wurden vertikal neu verteilt. Die
  LogoStage bleibt unveraendert gross; QR-Abmessung und QR-Ruhezone bleiben
  unveraendert.

## Was wurde nicht geaendert

- keine Logo-Fit-, Scale- oder X-/Y-Metadaten
- keine QR-Payload, Route, QR-Groesse oder Ruhezone
- keine Referral-Logik, Laufzeit oder Qualifikation
- keine Staff-, Auth-, Tenant-, RLS- oder Storage-Logik
- keine Datenbankmigration
- keine Production- oder Stripe-Aktion

## PDF-QA

- Seiten: 3
- MediaBox: `297.64 x 419.53 pt`
- physische Seitengroesse: `105 x 148 mm`
- obere LogoStage: 8,98 mm beziehungsweise 9,96 mm
- horizontale Sicherheitsraender: mindestens 8,13 mm
- unterer Footer-Abstand: mindestens 8,30 mm
- obere Randlinie: entfernt
- QR-Groesse und QR-Ruhezone: unveraendert
- Referralblock: innerhalb des sicheren Druckbereichs
- Staff-Seite: ohne Referralblock

## Tests und Build

- gezielte Print-, QR- und Smart-Logo-Tests: 21/21 PASS
- vollstaendige Tests: 1042/1042 PASS
- Typecheck: PASS
- Lint: PASS (0 Fehler, 7 bestehende Warnungen)
- Build: PASS
- `git diff --check`: PASS
- Secret-Scan: PASS

## Risiken

- Die neue Datei wurde massgenau erzeugt und gerendert, aber noch nicht erneut
  auf einem realen A6-Blatt bei 100 Prozent ausgedruckt.
- Die Aenderung ist noch nicht auf Staging ausgerollt.

## Status

Businesslogik geaendert: Nein

DB-Migration: Keine

Production: LOCKED

Stripe: DEFERRED

Status: CODE LOCK nach erfolgreichen Qualitaetsgates; kein FINAL LOCK vor
Staging- und physischem A6-Test.
