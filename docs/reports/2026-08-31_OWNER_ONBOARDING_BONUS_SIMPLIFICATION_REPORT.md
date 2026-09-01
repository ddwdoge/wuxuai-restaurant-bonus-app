# WUXUAI Bonus P1 - Owner Onboarding Bonus Simplification Report

Stand: 2026-08-31
Branch: `codex/v1-canonical-recovery`

## Ursache

Die kontrollierten Zahlenfelder `averageBill` und `firstRewardVisits` setzten
einen leeren Eingabe-Zwischenzustand durch `Number(value) || 1` sofort auf
eins zurueck. Dadurch liess sich besonders die Besuchszahl mobil nicht normal
ueberschreiben. `firstRewardVisits` und `firstRewardType` hatten keine
Laufzeitwirkung. `averageBill` speiste neben der Vorschau nur historische
`loyalty_rules`, die im kanonischen `amount_based`-Flow nicht ausgefuehrt
werden. Die echte Owner-Entscheidung ist `redemption_return_rate`.

## Geaenderte Dateien

- `src/modules/admin/pages/RestaurantOnboarding.tsx`
- `src/modules/auth/RegisterPage.tsx`
- `tests/v1-restaurant-baseline.test.mjs`
- `tests/owner-onboarding-bonus-simplification.test.mjs`
- aktuelle Vertrags-, Readiness- und Changelog-Dokumentation

## Was wurde geaendert

- Durchschnittsbon, Besuchszahl und wirkungslose Einloeseart aus der sichtbaren
  Owner-Auswahl entfernt.
- Feste Referenz 20 EUR mal fuenf Besuche gleich 100 EUR verwendet.
- Bestehende Stufen 3, 5, 8 und 10 Prozent und die Speicherung der gewaehlten
  Rueckgabequote erhalten.
- Referenzwerte klar als unverbindliches Rechenbeispiel bezeichnet.
- Optionale Telefonnummer in der Owner-Registrierung als empfohlene
  Mobiltelefonnummer mit Zukunftshinweis bezeichnet.

## Was wurde nicht geaendert

- Punktebuchung, Multiplikatoren, Einloesung, Balances oder Reward Unlocking
- Welcome Gift, Birthday Gift, Referral, Commercial Contract oder Legal Flow
- SMS-Versand, SMS-Provider oder Marketingeinwilligung
- bestehende abgeschlossene Restaurants; der vorhandene Completed-Early-Return
  bleibt erhalten
- Datenbank, Migration, RLS, Production oder Stripe

## Status

## Responsive-Pruefung

Playwright hat die vereinfachte Onboarding-Geometrie mit echtem Mobile-
Viewport und das gebaute Registrierungsbundle geprueft.

| Breite | Onboarding Overflow | Auswahl sichtbar | Telefon sichtbar |
| ---: | :---: | :---: | :---: |
| 320 | NO | PASS | PASS |
| 375 | NO | PASS | PASS |
| 390 | NO | PASS | PASS |
| 414 | NO | PASS | PASS |
| 430 | NO | PASS | PASS |
| 768 | NO | PASS | PASS |
| 1440 | NO | PASS | PASS |

Die Auswahlkarten waren mindestens 112 Pixel hoch. Das reale
Registrierungsfeld war bei jeder Breite sichtbar, `type=tel`, nicht required
und ohne globalen horizontalen Overflow.

## Pruefergebnis

- Tests: 1191/1191 PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler; 7 bekannte Warnungen ausserhalb dieses Scopes
- Build: PASS, 2068 Module; lokale nicht-produktive Build-Platzhalter
- `git diff --check`: PASS
- High-confidence Secret Scan im geaenderten Umfang: PASS
- Migration: NONE
- RLS/Security: unveraendert; keine DB-, RPC- oder Grant-Aenderung
- Development/Test-Deployment: nicht ausgefuehrt
- Production: LOCKED
- Stripe: DEFERRED
- Pruef-ZIP: `exports/2026-08-31_OWNER_ONBOARDING_BONUS_SIMPLIFICATION.zip`

Development/Test-Deployment und ein Live-Gate sind nicht Bestandteil dieses
Auftrags. Der aktuelle kanonische Release-Status bleibt deshalb CODE LOCK.

Status: **CODE LOCK**
