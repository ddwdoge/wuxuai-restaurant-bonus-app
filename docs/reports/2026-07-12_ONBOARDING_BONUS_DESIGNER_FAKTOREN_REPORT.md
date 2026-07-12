# Onboarding Bonus-Designer Faktoren Report

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

Im Onboarding-Schritt **Belohnen** muessen die finalen V1-Grosszuegigkeitsfaktoren verwendet werden:

- Sparsam: 0,8
- Normal: 1,0
- Grosszuegig: 1,1
- Premium: 1,2

## Geaenderte Dateien

- `src/modules/admin/pages/RestaurantOnboarding.tsx`
- `docs/04_RESTAURANT_PORTAL.md`
- `docs/13_SMART_REWARD_ENGINE.md`
- `docs/17_CTO_ENTSCHEIDUNGEN.md`
- `docs/19_CHANGELOG.md`
- `docs/reports/2026-07-12_ONBOARDING_BONUS_DESIGNER_FAKTOREN_REPORT.md`

## Umsetzung

In `RestaurantOnboarding.tsx` wurde `generosityMultiplier` fixiert:

- `Sparsam: 0.8`
- `Normal: 1`
- `Großzügig: 1.1`
- `Premium: 1.2`

Die Empfehlung berechnet sich jetzt aus:

```text
Durchschnittsbon × gewünschte Besuche bis erste Freude × Großzügigkeitsfaktor
```

Der alte separate Prozentwert fuer den Empfehlungsbetrag wurde entfernt.

## Beispielrechnung

Geprueft mit:

```text
Durchschnittsbon: 18 €
Besuche: 5
Basis: 90 €
```

Ergebnis:

- Sparsam: 72 €
- Normal: 90 €
- Grosszuegig: 99 €
- Premium: 108 €

## Empfehlung

Der Empfehlungstext zeigt weiterhin eine einfache deutsche Restaurant-Sprache:

`Empfohlenes Bonusziel: ca. ... €`

Leere Eingaben fuer Durchschnittsbon oder Besuchszahl werden weiterhin defensiv auf mindestens `1` normalisiert. Dadurch bricht die Berechnung nicht.

## Mobile Pruefung

Es wurden keine neuen Layoutmodule gebaut. Die bestehenden vier Auswahlkarten bleiben im vorhandenen responsiven `choice-grid`. Der Text wurde nicht verlaengert, so dass die mobile Darstellung nicht zusaetzlich belastet wird.

## Nicht geaendert

- Keine Datenbankmigration.
- Keine RPC-Aenderung.
- Keine Tages-PIN-Logik.
- Keine Bonus-Boost-Logik.
- Keine Reward-Engine-Komplettumstellung.

## Validierung

- Sparsam Faktor 0,8: Ja
- Normal Faktor 1,0: Ja
- Grosszuegig Faktor 1,1: Ja
- Premium Faktor 1,2: Ja
- Beispiel 18 × 5 korrekt: Ja
- Keine kaputte Berechnung bei leerem Durchschnittsbon: Ja
- Keine kaputte Berechnung bei leerer Besuchszahl: Ja
- Mobile statisch geprueft: Ja
- `npm run build`: erfolgreich

## Offene Risiken

Keine offenen Risiken fuer diesen engen Scope.

Status: LOCK
