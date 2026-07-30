# Onboarding Schritt 4 Punkteeinloesung Report

Datum: 2026-07-12

Status: LOCK

## Gelesene Grundlagen

- `AGENTS.md`
- `docs/00_START_HIER.md`
- `docs/04_RESTAURANT_PORTAL.md`
- `docs/13_SMART_REWARD_ENGINE.md`
- `docs/17_CTO_ENTSCHEIDUNGEN.md`
- `docs/18_CODEX_REGELN.md`

Hinweis: `docs/21_CODEX_SELBSTKONTROLL_LOOP.md` ist im Repository nicht vorhanden.

## Ziel

Onboarding Schritt 4 soll sichtbar **Punkteeinlösung** heissen, nicht mehr
**Belohnen**.

## Geaenderte Dateien

- `src/modules/admin/pages/RestaurantOnboarding.tsx`
- `docs/04_RESTAURANT_PORTAL.md`
- `docs/13_SMART_REWARD_ENGINE.md`
- `docs/17_CTO_ENTSCHEIDUNGEN.md`
- `docs/19_CHANGELOG.md`
- `docs/reports/2026-07-12_ONBOARDING_SCHRITT_4_PUNKTEEINLOESUNG_REPORT.md`

## UI-Aenderungen

Onboarding Schritt 4:

- Step-Navigation: `Punkteeinlösung`
- Seitentitel: `Wie sollen Gäste Punkte einlösen?`
- Erklaerung: `Lege fest, ab wann Gäste ihre Punkte gegen ein Produkt einlösen können.`

Onboarding Schritt 5:

- bleibt unveraendert `Willkommens-Belohnungen`
- Willkommensgeschenke wurden nicht umbenannt

## Nicht geaendert

- keine Faktoren geaendert
- keine Berechnung geaendert
- keine Durchschnittsbon-Logik geaendert
- keine Besuchszahl-Logik geaendert
- keine Datenbank geaendert
- keine RPCs geaendert
- keine QR-Logik geaendert
- keine Willkommensgeschenk-Logik geaendert

## Validierung

- Schritt 4 heisst `Punkteeinlösung`: Ja
- Kein sichtbares `Belohnen` mehr in `RestaurantOnboarding.tsx`: Ja
- Seitentitel verstaendlich: Ja
- Schritt 5 bleibt Willkommensgeschenke: Ja
- Mobile statisch geprueft: Ja
- `npm run build`: erfolgreich

## Offene Risiken

Keine offenen Risiken fuer diesen engen Text-Scope.

Status: LOCK
