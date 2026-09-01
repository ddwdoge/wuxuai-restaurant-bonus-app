# Smart Logo Editor V2 - Auto-Fit Baseline / Preview Scale Fix

## Ursache

Die Hauptvorschau verwendete eine feste, bis zu 520 Pixel breite und nur 120 Pixel hohe LogoStage. `object-fit: contain` musste das reale 1562 x 1007 Pixel große Testlogo deshalb nach der Höhe begrenzen. Der sichtbare Inhalt belegte nur einen kleinen Teil der vermeintlichen Sicherheitsfläche. Gleichzeitig zeigte der Editor den direkt gespeicherten absoluten Skalierungswert als Prozentzahl; ein automatisch erkannter Rand-Ausgleich konnte dadurch fälschlich wie eine manuelle Vergrößerung wirken. Die vier Kontextkarten waren nur 68 Pixel hoch und zeigten die relevanten Logo-Zonen zu klein.

## Geänderte Dateien

- `src/shared/logoPresentation.mjs`
- `src/shared/logoPresentation.d.mts`
- `src/shared/components/RestaurantLogoStage.tsx`
- `src/modules/admin/pages/SettingsPage.tsx`
- `src/styles.css`
- `tests/owner-smart-logo-presentation.test.mjs`
- `docs/19_CHANGELOG.md`
- `design-qa.md`

## Was wurde geändert

- 100 Prozent wird im Editor relativ zur ermittelten Auto-Fit-Basis berechnet.
- Manuelle Skalierung wird als Faktor auf die Auto-Fit-Basis angewendet; die gespeicherten absoluten Präsentationswerte bleiben kompatibel.
- `Automatisch einpassen` setzt die ermittelte Basis einschließlich eines sicheren, bildbasierten Positionsausgleichs.
- Transparente und einheitlich helle Außenränder werden beim Laden des gespeicherten Logos konservativ geprüft.
- Die Haupt-Sicherheitsfläche folgt dem echten Seitenverhältnis des geladenen Bildes und ist auf Desktop 190 bis 220 Pixel hoch.
- Gäste-Header, Restaurantdetails, QR Starter Kit und Mitarbeiter-Header zeigen größere, fokussierte Logo-/Namensbereiche.
- `Zurücksetzen` stellt weiterhin den Zustand beim Öffnen des Editors wieder her.

## Was wurde nicht geändert

- Keine Punkte-, Reward-, Referral-, Auth- oder Tenant-Logik.
- Keine QR-Payloads, Routen oder Starter-Kit-PDF-Logik.
- Keine Änderung am gespeicherten Smart-Logo-Ausgabevertrag der echten Customer-, Staff-, Detail- und Print-Oberflächen.
- Keine RLS-, RPC- oder Datenbankänderung.

## Staging-Ergebnis

- Deployment: `e2a87191-d3b3-4e4c-93cd-0c7b37ee883d`
- Echtes Owner-Konto und bestehendes WUXUAI/DONGDONG WU Logo geprüft.
- 100 -> 120 -> 80 Prozent: korrekt und synchron in fünf Vorschauen.
- Position 50 -> 55 Prozent: korrekt; Auto Fit stellt 100/50/50 wieder her.
- Speichern mit 110/55/45, Reload und exakte Wiederherstellung: PASS.
- Ursprungszustand 100/50/50 gespeichert, erneut geladen und bestätigt.
- Responsive ohne globalen horizontalen Overflow: 390, 430, 768, 1024, 1366 und 1440 Pixel.

## Tests

- Tests: 1043/1043 PASS
- Typecheck: PASS
- Lint: PASS mit 0 Fehlern und 7 bestehenden Warnungen
- Build: PASS
- `git diff --check`: PASS
- Diff Secret Scan: PASS

## Risiken

- Die automatische Erkennung heller Außenränder ist bewusst konservativ. Nicht einheitliche fotografische Hintergründe werden nicht als Rand behandelt.
- Square, Tall und transparente Randfälle sind durch die automatisierten Format-/Placement-Verträge geprüft; der Live-Staging-Save/Reload erfolgte mit dem ausdrücklich verlangten realen Wide-Logo.

## Status

FINAL LOCK auf Staging. Production bleibt gesperrt. Stripe bleibt zurückgestellt.
