# Design QA - Customer Redeem Screenshot Sync

## Referenz

- `IMG_2539.PNG`: `Alle Belohnungen`
- `IMG_2540.PNG`: `Meine Belohnungen`
- Primaerer Vergleich: physischer iPhone-Viewport der bereitgestellten Screenshots

## Scope

Geprueft wurde ausschliesslich die strukturelle Synchronisierung von Restaurant-
Header, Titelblock, Tabs, Punktezeile, Hinweis und Content-Grenze. Farben,
Typografie, Reward-Design und Bottom Navigation wurden nicht neu gestaltet.

## Befund vor dem Fix

Der Grid-Seitencontainer verwendete `min-height: 100dvh`, war jedoch nicht oben
verankert. Bei dem kurzen Empty State verteilte Safari freien Platz auf die
automatischen Grid-Zeilen. Dadurch wurden Header und vertikale Abstaende nur im
Tab `Meine Belohnungen` gestreckt. Der Empty State lag ausserdem nicht im selben
Content-Grid wie die Reward-Karten.

## Vergleich nach dem Fix

Bei 320, 375, 390, 414, 430, 768, 1024 und 1440 Pixel stimmen fuer beide Tabs
jeweils X, Y und Breite von Header, Titel, Tabs, Punktezeile, Hinweis und
Content-Start ueberein. Die Hoehen aller gemeinsamen Elemente sind ebenfalls
identisch. Nur die erlaubte Inhaltshoehe unterhalb der Content-Grenze variiert.

Bei 390 Pixel:

| Element | X | Y | Breite | Hoehe |
| --- | ---: | ---: | ---: | ---: |
| Header | 16 | 12 | 358 | 60 |
| Titel | 16 | 92 | 358 | 60.117 |
| Tabs | 16 | 168.117 | 358 | 52 |
| Punktezeile | 16 | 236.117 | 358 | 47 |
| Hinweis | 16 | 299.117 | 358 | 84.5 |
| Content-Start | 16 | 399.617 | 358 | variabel |

Neue Vergleichsaufnahmen:

- `docs/reports/assets/2026-08-25_redeem-all-390.png`
- `docs/reports/assets/2026-08-25_redeem-mine-390.png`

## Ergebnis

- P0: keine
- P1: keine
- P2: keine
- Globaler horizontaler Overflow: keiner
- Tabwechsel-Layout-Shift: keiner
- final result: passed
