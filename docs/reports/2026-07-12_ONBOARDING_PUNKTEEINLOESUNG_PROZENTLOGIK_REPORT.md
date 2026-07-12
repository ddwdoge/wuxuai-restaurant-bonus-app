# WUXUAI Bonus V1 – Onboarding Punkteeinlösung Prozentlogik

Datum: 2026-07-12
Status: LOCK

## Ursache

Der Onboarding-Schritt 4 „Punkteeinlösung“ nutzte noch abstrakte
Großzügigkeitsfaktoren. Restaurantbesitzer sollen stattdessen klare
Rückgabe-Prozente sehen und verstehen, welcher Einlösewert aus erwarteter
Konsumation entsteht.

## Geänderte Dateien

- `src/modules/admin/pages/RestaurantOnboarding.tsx`
- `src/styles.css`
- `docs/04_RESTAURANT_PORTAL.md`
- `docs/08_FLOW_01_ONBOARDING.md`
- `docs/13_SMART_REWARD_ENGINE.md`
- `docs/17_CTO_ENTSCHEIDUNGEN.md`
- `docs/19_CHANGELOG.md`

## Was wurde geändert

- Schritt 4 bleibt sichtbar `Punkteeinlösung`.
- Die vier Auswahlkarten zeigen jetzt Rückgabequoten:
  - Sparsam: 3 %
  - Normal: 5 %
  - Großzügig: 8 %
  - Premium: 10 %
- Die Empfehlung berechnet:
  - Konsumation = Durchschnittsbon × Besuche
  - Einlösewert = Konsumation × Rückgabequote
- Beispiel `18 € × 5 Besuche` ergibt:
  - Sparsam: 2,70 €
  - Normal: 4,50 €
  - Großzügig: 7,20 €
  - Premium: 9,00 €
- Euro-Beträge werden deutsch formatiert.
- Die Karten enthalten kurze Restaurant-Erklärungen statt technischer Faktoren.

## Was wurde nicht geändert

- Keine Datenbankänderung.
- Keine RPC-Änderung.
- Keine Tages-PIN-Änderung.
- Keine Reward-Einlösung.
- Keine Willkommensgeschenk-Logik.
- Keine Bonus-Boost-Logik.
- Kein QR Center.
- Kein Customer Portal.
- Kein Staff Portal.

## Mobile Prüfung

Die Auswahlkarten bleiben im bestehenden responsiven Grid und wurden mit
gestapelten Textzeilen ergänzt. Texte können umbrechen, Karten dürfen in der
Höhe wachsen, und es wurde kein horizontales Layout eingeführt.

## Build Ergebnis

`npm run build` erfolgreich.

## Migration

Keine Migration erstellt.

## Staging Ergebnis

Nicht relevant, da keine Datenbank- oder RPC-Änderung.

## Risiken

Keine kritischen offenen Risiken im betroffenen Scope. Die Änderung betrifft
nur den Onboarding-Bonus-Designer und die zugehörige Dokumentation.

## Status

LOCK
