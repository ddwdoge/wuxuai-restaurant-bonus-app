# WUXUAI Bonus V1 – Punkteeinlösung Prozentlogik Durchgang

Datum: 2026-07-12
Status: NOT READY

## Gelesene Bible-Dateien

- `AGENTS.md`
- `docs/00_START_HIER.md`
- `docs/04_RESTAURANT_PORTAL.md`
- `docs/05_CUSTOMER_PORTAL.md`
- `docs/09_FLOW_02_GAST_WERDEN.md`
- `docs/10_FLOW_03_BELOHNUNG_EINLOESEN.md`
- `docs/11_FLOW_04_PUNKTE_SAMMELN.md`
- `docs/13_SMART_REWARD_ENGINE.md`
- `docs/17_CTO_ENTSCHEIDUNGEN.md`
- `docs/18_CODEX_REGELN.md`
- `docs/reports/2026-07-12_ONBOARDING_PUNKTEEINLOESUNG_PROZENTLOGIK_REPORT.md`

Hinweis: `docs/21_CODEX_SELBSTKONTROLL_LOOP.md` existiert in diesem
Arbeitsstand nicht. Die Selbstkontroll-Regeln aus `AGENTS.md` wurden
angewendet.

## Ursache

Die Prozentlogik war im Onboarding sichtbar, wurde aber nicht dauerhaft als
eigene Restaurant-Einstellung gespeichert. Die Punkteeinlösungsseite rechnete
weiter mit der alten festen 10x-Logik (`price * 10`). Dadurch konnten
Punkteeinlösung und Customer Portal nicht sicher dieselbe Onboarding-Quote
verwenden.

## Gespeicherte Onboarding-Werte

Neue additive Spalte:

```text
loyalty_settings.redemption_return_rate
```

Erlaubte V1-Werte:

- Sparsam: 0,03
- Normal: 0,05
- Großzügig: 0,08
- Premium: 0,10

Onboarding speichert die gewählte Quote beim Abschluss in
`loyalty_settings.redemption_return_rate`.

## Berechnungsquelle

Neue oder bearbeitete Punkteeinlösungen berechnen:

```text
Geschätzte Konsumation = Produktpreis / Einlösequote
Benötigte Punkte = Geschätzte Konsumation / amount_per_point
```

`amount_per_point` bleibt die bestehende Punkte-pro-Euro-Grundlage. Die
Einlösequote ist davon getrennt.

## Geänderte Dateien

- `src/modules/admin/pages/RestaurantOnboarding.tsx`
- `src/modules/admin/pages/RewardsPage.tsx`
- `src/modules/onboarding/pilotOnboardingService.ts`
- `src/modules/loyalty/loyaltyService.ts`
- `src/shared/types/domain.ts`
- `supabase/migrations/20260712001000_loyalty_redemption_return_rate.sql`
- `docs/04_RESTAURANT_PORTAL.md`
- `docs/05_CUSTOMER_PORTAL.md`
- `docs/13_SMART_REWARD_ENGINE.md`
- `docs/17_CTO_ENTSCHEIDUNGEN.md`
- `docs/19_CHANGELOG.md`

## Geprüfte alte Logik

- `src/modules/admin/pages/RewardsPage.tsx` nutzte vorher `price * 10`.
- Diese aktive 10x-Berechnung wurde ersetzt durch `price / redemptionReturnRate`.
- Historische Changelog-Stelle zur 10x-Regel wurde als ersetzt markiert.

## Punkteeinlösungsseite Ergebnis

Die Seite `Punkteeinlösung` lädt `redemption_return_rate` über
`loadLoyaltySettings`.

Sie zeigt:

- `Einlösequote`
- `Geschätzte Konsumation bis zur Einlösung`
- `Benötigte Punkte`

Beim Produktpreiswechsel wird die Berechnung per React-State neu berechnet.
Beim Bearbeiten und Speichern wird `required_points` mit der aktuellen Quote
neu geschrieben.

## Customer Portal Ergebnis

Das Customer Portal nutzt weiterhin die serverseitig gespeicherten
`required_points` der aktiven Punkteeinlösungen.

Wenn Punkte fehlen:

- `remaining_points` kommt aus der sicheren Portal-RPC.
- Der fehlende Eurobetrag wird aus `remaining_points × amount_per_point`
  angezeigt.

Damit nutzt das Customer Portal dieselbe gespeicherte Punkteeinlösung, die aus
Produktpreis, Einlösequote und Punkte-pro-Euro-Regel berechnet wurde.

Die Portal-RPC `get_public_customer_portal` wurde in der neuen Migration
ergänzt, damit `redemption_return_rate` im Settings-Payload verfügbar ist.

## Testwerte 3/5/8/10 %

Produktpreis: 5,40 €

- Sparsam 3 %: 5,40 € / 0,03 = 180,00 €
- Normal 5 %: 5,40 € / 0,05 = 108,00 €
- Großzügig 8 %: 5,40 € / 0,08 = 67,50 €
- Premium 10 %: 5,40 € / 0,10 = 54,00 €

Diese Werte wurden per lokaler Rechenprüfung validiert.

## Build Ergebnis

`npm run build` erfolgreich.

## Migration

Migration erstellt:

```text
supabase/migrations/20260712001000_loyalty_redemption_return_rate.sql
```

Migration auf Staging angewendet: Nein.

Grund: In diesem Auftrag wurde kein Staging-Apply ausgeführt.

## Offene Risiken

- NOT READY bis die Migration auf Supabase Staging angewendet und die echte
  Speicherung gegen die Datenbank geprüft wurde.
- Bestehende aktive Punkteeinlösungen behalten ihre gespeicherten
  `required_points`, bis sie bearbeitet oder neu erstellt werden. Das ist
  sichtbar konsistent, aber alte Werte werden nicht automatisch rückwirkend
  migriert.

## Status

NOT READY
