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

---

# Design QA - Compact Smart Logo Editor V2

## Referenz

- `ChatGPT Image 27. Aug. 2026, 22_05_34.png`
- Vergleichszustand: reales breites Logo mit internem Weissraum, 125 Prozent,
  X/Y zentriert

## Vergleich

- P0: keine
- P1: keine
- P2: keine
- P3: Die Verwendungsvorschauen sind bewusst kompakter als in der konzeptionellen
  Referenz, damit der gesamte Ablauf bei 1280 x 720 und 1366 x 768 ohne Scrollen
  im Editorinhalt sichtbar bleibt.
- Zentrierter Workspace, kompakter Kopf und fest sichtbarer Footer stimmen mit
  dem ausgewaehlten Zielbild ueberein.
- Das reale Logo ist im gestrichelten Bearbeitungs-Sicherheitsrahmen sichtbar.
- Groesse und X-/Y-Position aktualisieren alle fuenf LogoStage-Instanzen sofort.
- Vier gleich grosse Vorschaukarten verwenden den gemeinsamen Produktiv-Renderer.
- 390 und 430 Pixel stapeln Steuerungen und Vorschauen mit festem Footer.
- 768 und 1024 Pixel behalten drei Steuerungen und vier Vorschauen pro Zeile.
- Keine Browserfehler; nur bestehende React-Router-v7-Zukunftswarnungen.

## Ergebnis

- final result: passed
