# Customer Redemption Presentation Image Contract Fix

Datum: 2026-09-20

Branch: `codex/v1-image-render-contract-fix`

Implementierungscommits:

- `6fce122f2b0ca16c107a10792665e96cf862fa97` – gemeinsamer Renderer und stabile 16:9-Geometrie
- `29051a612f88ed2eba615c213ecad2845c76c9e7` – presentationsspezifischer Contain-Modus
- `8edb371` – vollständiger Bildinhalt ohne Cover- oder Crop-Zoom-Skalierung

Staging Worker: `wuxuai-restaurant-bonus-app-staging`

Staging Version: `fb824057-620b-447e-b6ea-49dbb16b9eec`

## Ursache

Das aktive Customer-Präsentationsfenster für Punkte- und Geschenkeinlösungen
wich zunächst durch einen direkt eingebetteten `RewardImageFrame` und eine
prozentuale Kindhöhe vom gemeinsamen Gift-Renderer ab. Nach Beseitigung dieser
Abweichung blieb Bildinhalt dennoch abgeschnitten: `SmartMediaFrame` verwendete
trotz `object-fit: contain` anschließend die Transform-Skalierung
`coverScale * normalized.zoom`.

Der erste presentationsspezifische Versuch entfernte nur `coverScale`, ließ
aber den gespeicherten Crop-Zoom aktiv. Der reale Safari-Test zeigte, dass ein
Zoom größer als 1 weiterhin den unteren Bildinhalt abschneidet. Für die
freigegebene fachliche Anforderung „vollständiger Bildinhalt“ muss deshalb in
dieser Präsentation die gesamte Transform-Skalierung neutral sein. Der finale
Contain-Modus setzt `--smart-media-render-scale` ausschließlich dort auf `1`.
Die Bildquelle und Fokusmetadaten bleiben unverändert gebunden; im
Präsentationsmodus werden weder Cover-Basismaßstab noch Crop-Zoom angewendet.

## Read-only Bildflächeninventar

| Zustand | Renderer | Finaler Bildvertrag |
| --- | --- | --- |
| Geburtstagsgeschenk, aktive Einlösung | `activePointsPresentation` → `RewardImage` → `RewardImageFrame` → `SmartMediaFrame` | 16:9, `contain`, Render-Scale 1 |
| Willkommensgeschenk, aktive Einlösung | derselbe Präsentationsrenderer | 16:9, `contain`, Render-Scale 1 |
| Normale persönliche Geschenkeinlösung | derselbe serverseitige Gift-Präsentationspfad | 16:9, `contain`, Render-Scale 1 |
| Punkteeinlösung, aktive Einlösung | derselbe Präsentationsrenderer | 16:9, `contain`, Render-Scale 1 |
| „Bestätigung ausstehend“ | `premium-presentation-window` | stabile, inhaltsunabhängige 16:9-Medienfläche |
| Detail vor dem Start | bestehender `RewardImage`-Vertrag | unverändert; Standardmodus bleibt `cover` |
| Erfolgs-/Fehlerausgang | `premium-redemption-outcome` | aktuell ohne Bild; keine neue Bildfläche erzeugt |
| Historischer Einlösecode | `premium-redemption-code` | ohne Bild; unverändert |

## Geänderte Dateien

- `src/shared/components/SmartMediaFrame.tsx`
- `src/shared/components/RewardImageFrame.tsx`
- `src/modules/customer/components/PremiumCustomerUi.tsx`
- `src/modules/customer/CustomerPortal.tsx`
- `src/modules/customer/customer-premium.css`
- `tests/customer-redemption-presentation-image-contract.test.mjs`

## Was wurde geändert

- Die aktive Customer-Präsentation verwendet den gemeinsamen `RewardImage`-
  Gift-Wrapper.
- Der äußere Rahmen ist alleinige Geometrieautorität mit `aspect-ratio: 16 / 9`,
  `position: relative`, `min-height: 0` und `overflow: hidden`.
- Gift-Wrapper und innerer Renderer füllen den Rahmen absolut; die frühere
  prozentuale Kindhöhe wurde entfernt.
- `SmartMediaFrame` erhielt einen optionalen `renderScaleMode`. Der bestehende
  Standard bleibt `cover`, sodass andere Bildverbraucher unverändert bleiben.
- Ausschließlich die aktive Einlöse-/Geschenkpräsentation verwendet
  `renderScaleMode="contain"`; dort ist der Transform-Scale exakt `1`.
- Das Bild bleibt proportional, unverzerrt und vollständig sichtbar. Freie
  Randflächen sind ausdrücklich zulässig.

## Was wurde nicht geändert

- Bild-URL sowie gespeicherte Fokus- und Crop-Metadaten
- Single-Image-Editor, Upload-, Entfernen- oder Speicherlogik
- Countdown, Serverzeit und 15-Minuten-Fenster
- Swipe-Bestätigung, Critical-Dismiss-Schutz und Staff-Bestätigung
- Punkte-, Geschenk- und Präsentationsstatus
- RPCs, Datenbank, Migrationen, RLS oder Security
- Business-, Billing-, Country-, PRO- oder Entitlement-Logik
- bestehende oder aktive Präsentationsdatensätze
- Production Worker, Production Domain und DNS

## Prüfungen

- Finaler Focused Contract/Regression-Lauf: **31/31 PASS**
- Full Tests: **1867/1867 PASS**
- Typecheck: **PASS**
- Lint: **PASS**, 0 Fehler; 8 bereits vorhandene, scopefremde Warnungen
- Build: **PASS**, Vite 6.4.3, 2128 Module
- `git diff --check`: **PASS**
- Build-Variablen: nur im Speicher aus dem öffentlichen aktiven
  Staging-Bundle gelesen; keine Werte ausgegeben oder gespeichert

## Staging Ergebnis

- Deployment ausschließlich auf `wuxuai-restaurant-bonus-app-staging`: **PASS**
- Version: `fb824057-620b-447e-b6ea-49dbb16b9eec`
- Hauptasset: `/assets/index-CdteXqqm.js`
- SHA-256 Hauptasset:
  `5506ee2cbba2c3dbd575f003c826121391cc0901f3bce1b693b03a48e2567b3a`
- Lokales und ausgeliefertes Hauptasset: **bytegleich**
- Production: **unverändert**
- Datenbank/Migrationen: **unverändert / nicht angewendet**

## Physischer Safari-Test

Die bestehende angemeldete Customer-Sitzung wurde nach dem Deployment neu
geladen. Es wurde ausschließlich die bereits aktive Präsentation über
„Gratis Getränk anzeigen“ geöffnet. Es wurde keine neue Einlösung gestartet,
nicht gewischt und nichts bestätigt oder gespeichert.

Ergebnis: **PASS**. Der 16:9-Rahmen blieb stabil. Das hochformatige Bild wurde
vollständig und proportional innerhalb des Rahmens angezeigt; freie
Seitenflächen blieben sichtbar. Der wichtige Text „Bier“ am unteren Bildrand
war vollständig sichtbar und nicht abgeschnitten. Der Status blieb
„Bestätigung ausstehend“, der Swipe-Regler blieb bei `0`. Anschließend wurde
die Ansicht über „Ansicht schließen“ geschlossen.

Der konkrete frühere Datensatz mit „Linsensuppe“ war nach Ablauf der früheren
Präsentation nicht mehr als bestehende aktive Präsentation verfügbar und wurde
gemäß QA-Sperre nicht erneut eingelöst. Die technisch identische aktive
Willkommensgeschenk-Präsentation belegt den finalen gemeinsamen Renderer mit
einem ebenfalls texttragenden Hochformatbild.

## Abschluss

- Aufgabe: Vollständiger Bildinhalt in Customer-Einlöse-/Geschenkpräsentationen
- Build: Ja
- Migration: Keine
- Flow-Test: Ja – bestehende Safari-Customer-Präsentation PASS
- RLS/Security: Unverändert; keine Datenbankänderung
- Alte Logik geprüft: Ja
- Offene Risiken: Der abgelaufene konkrete „Linsensuppe“-Datensatz wurde nicht erneut eingelöst; gemeinsamer aktiver Renderer mit vergleichbarem Hochformat-/Textbild physisch bestanden
- Status: LOCK

TASK-OWNED BACKGROUND PROCESSES STARTED: 0

TASK-OWNED BACKGROUND PROCESSES STOPPED: 0

TASK-OWNED BACKGROUND PROCESSES STILL RUNNING: 0

RETAINED PROCESS PURPOSE: NONE

RAM CLEANUP: PASS

UNRELATED NODE PROCESSES CHANGED: NO
