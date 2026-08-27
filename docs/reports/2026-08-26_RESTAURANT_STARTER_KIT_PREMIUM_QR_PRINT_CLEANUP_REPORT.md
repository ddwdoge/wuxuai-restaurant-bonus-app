# WUXUAI Bonus - Restaurant Starter Kit Premium QR Print Cleanup

Datum: 2026-08-26  
Branch: `codex/v1-canonical-recovery`  
Ausgangscommit: `f9406c9582e5bb379d19be853b6ddd28d33da06c`  
Staging-Version: `f5739bf0-6eba-43a3-acaf-ccd4f6865495`  
Production: `LOCKED`  
Stripe: `DEFERRED`

## Ursache

Der bestehende dreiseitige QR-Center-Export zeigte operative
Platzierungshinweise direkt unter dem QR. Der Referral-Bereich bestand aus drei
kleinen Karten und enthielt die veraltete feste Angabe `30 Tage`. Der
Onboarding-Export nutzte parallel eine abweichende vierseitige Darstellung mit
derselben veralteten Aussage.

## Geaenderte Dateien

- `src/modules/admin/pages/QrCenterPage.tsx`
- `src/modules/admin/pages/RestaurantOnboarding.tsx`
- `tests/starter-kit-premium-print.test.mjs`
- `docs/00_START_HIER.md`
- `docs/08_FLOW_01_ONBOARDING.md`
- `docs/15_DESIGN_SYSTEM.md`
- `docs/19_CHANGELOG.md`
- dieser Bericht

## Was wurde geaendert

- Beide Starter-Kit-Ausgaben verwenden drei QR-Druckseiten.
- Seite 1 zeigt `Neu hier?`, den Willkommenshinweis, den Gast-QR und einen
  einzigen ruhigen Referral-Block.
- Seite 2 bleibt als minimale Seite `Bonusprogramm entdecken` ohne
  Platzierungslabel oder Referral-Wiederholung.
- Seite 3 verwendet den persoenlichen Mitarbeiter-Login-Hinweis und
  `Nur fuer Mitarbeiter · Nicht fuer Gaeste` ausserhalb des QR-Rahmens.
- QR-Flaechen bestehen nur aus weissem Hintergrund, feiner Goldkontur,
  groesserer Ruhezone und dem unverzerrten QR.
- Restaurantname, Ueberschrift, Beschreibung und Sekundaerhinweise besitzen
  eine klarere typografische Hierarchie.
- Der Footer wurde diskret vergroessert.
- Die festen Referral-Tagesangaben wurden aus aktiver Starter-Kit-Dokumentation
  und beiden Generatoren entfernt.

## Was wurde nicht geaendert

- keine QR-Payload
- keine Gast-, Staff- oder Legacy-Route
- keine Restaurant- oder Rollenlogik
- keine Punkte-, Referral-, Reward- oder Tages-PIN-Logik
- keine Datenbank, Migration, RLS oder RPC
- kein Production-Deployment

## PDF- und QR-Verifikation

Mit dem echten Produktionsgenerator wurde ein QA-PDF mit einem absichtlich
langen Restaurantnamen erzeugt:

- Seiten: 3
- Format: A6, `297.64 x 419.53 pt`
- PDF-Version: 1.4
- Verschluesselung/JavaScript: nein
- visuelle Kontrolle aller drei gerenderten Seiten: bestanden
- Ueberlappung oder abgeschnittener Text: nicht festgestellt
- QR-Rahmen enthalten keinen Text: bestanden
- QR-A6-Render bei 200 dpi: alle drei Payloads exakt decodiert
- auf 390 Pixel Seitenbreite skalierter PDF-Render: alle drei Payloads exakt
  decodiert
- Seite 1 und 2: unveraenderte Restaurant-Gast-URL
- Seite 3: unveraenderte individuelle Staff-Login-URL

Ein realer physischer Scan mit der nativen iPhone-Kamera und ein echter
Papierausdruck koennen nicht durch den automatisierten Render ersetzt werden
und bleiben deshalb als manuelles Abnahme-Gate offen.

## Qualitaet

- fokussierte QR-/Starter-Kit-Tests: 17/17 bestanden
- vollstaendige autoritative Tests: 1013/1013 bestanden
- Typecheck: bestanden
- Lint: 0 Fehler, 7 bestehende Warnungen
- Build: bestanden
- `git diff --check`: bestanden
- DB-Migration: keine

## Finale Klassifikation

```text
PAGE 1 PREMIUM: PASS
PAGE 2 PREMIUM: PASS
PAGE 3 PREMIUM: PASS
"FUER DEN EINGANG": REMOVED
"FUER TISCH ODER FLYER": REMOVED
"FUER DEN TEAM": REMOVED
STAFF INTERNAL LABEL: PASS
QR QUIET SPACE: PASS
QR SIZE: PASS
REFERRAL BLOCK SIMPLIFIED: PASS
STALE REFERRAL DURATION COPY: 0
TYPOGRAPHY: PASS
THREE-PAGE CONSISTENCY: PASS
IPHONE QR SCAN: NOT PHYSICALLY TESTED
BUSINESS LOGIC CHANGED: NO
DB MIGRATION: NONE
TESTS: 1013/1013 PASS
STARTER KIT PRINT DESIGN FINAL READY: NO - PHYSICAL IPHONE/PAPER GATE OPEN
PRODUCTION: LOCKED
STRIPE: DEFERRED
```

## Status

`CODE LOCK / STAGING VISUALLY VERIFIED`

`FINAL LOCK` bleibt bis zum physischen iPhone- und Papier-Scan offen.
