# WUXUAI Bonus – Einlöse-Renderer-Paritätsfix und Restgate

Datum: 2026-09-20

Branch: `codex/v1-image-render-contract-fix`

Implementierungscommit: `6b50b62236371899c09d604004d91d194cd0a572`

Staging Worker: `wuxuai-restaurant-bonus-app-staging`

Staging Version: `55206790-1a1b-414f-8d69-d17156f3891f`

## ROOT CAUSE

Die Einlöse-/Geschenkpräsentation verwendete als einzige Bildfläche den
presentationsspezifischen Prop `renderScaleMode="contain"`. Dieser Sonderweg
ersetzte den gemeinsamen vollständigen Render-Scale
`coverScale * normalized.zoom` durch `1` und deaktivierte dadurch den
gespeicherten Crop-Zoom. Owner-Liste, Owner-Vorschau, Bearbeitung, Customer-
Karte und Customer-Detail verwendeten dagegen weiterhin den kanonischen
`RewardImageFrame`-/`SmartMediaFrame`-Vertrag.

## Geänderte Dateien

- `src/shared/components/SmartMediaFrame.tsx`
- `src/shared/components/RewardImageFrame.tsx`
- `src/modules/customer/components/PremiumCustomerUi.tsx`
- `src/modules/customer/CustomerPortal.tsx`
- `tests/customer-image-render-contract.test.mjs`
- `tests/customer-redemption-presentation-image-contract.test.mjs`

## Rendererpfad vorher/nachher

Vorher:

`activePointsPresentation` → `RewardImage(renderScaleMode="contain")` →
`RewardImageFrame(renderScaleMode)` → `SmartMediaFrame` → Scale-1-Override.

Nachher:

`activePointsPresentation` → `RewardImage` → `RewardImageFrame` →
`SmartMediaFrame` → `coverScale * normalized.zoom`.

Der ausschließlich für die Präsentation eingeführte Prop und seine
Weiterleitung wurden vollständig entfernt. Es wurde keine neue Bildlogik
eingeführt und keine CSS-Regel geändert.

## Renderer-Inventar

| Fläche | Renderer / Vertrag |
| --- | --- |
| Punkteeinlösung Owner-Liste | `RewardImage` → `RewardImageFrame` → `SmartMediaFrame` |
| Bearbeitung Schritt 4 | `OwnerRewardImageEditor` mit gemeinsamem Crop-Vertrag |
| Bearbeitung Schritt 5 | `RewardImageFrame`, entkoppelter stabiler 16:9-Elternrahmen |
| Owner-Vorschau | Customer-`RewardCard` → `RewardImage` → gemeinsamer Medienkern |
| Customer-Einlösen-Karte | `RewardCard` → `RewardImage` → gemeinsamer Medienkern |
| Customer-Einlösen-Detail | `RewardImage` → gemeinsamer Medienkern |
| Punkteeinlösepräsentation | `RewardImage` → gemeinsamer Medienkern |
| Willkommensgeschenk-Präsentation | identischer `activePointsPresentation`-Pfad |
| Geburtstagsgeschenk-Präsentation | identischer `activePointsPresentation`-Pfad |

## OWNER PREVIEW ↔ REDEMPTION PARITY

**PASS auf Desktop-Staging.** In Chrome wurde die Owner-Vorschau für
„Gratis Getränk“ geöffnet. In Safari wurde derselbe bereits bestehende
Customer-Vorgang geöffnet. Beide zeigten denselben normalisierten Ausschnitt
und dieselbe relative Glasgröße im festen 16:9-Rahmen. Keine nachträgliche
Berührung oder Größenkorrektur war erforderlich.

## REWARD PRESENTATION PARITY

**PASS im Code- und Vertragsgate.** Punktpräsentation, Owner-Flächen,
Customer-Karte und Detail verwenden dieselbe Bild-URL-/Crop-Bindung und
denselben gemeinsamen Render-Scale. Es existiert kein Scale-1-Sonderweg mehr.

## GIFT PRESENTATION PARITY

**PASS im gemeinsamen Rendererpfad.** Willkommens- und Geburtstagsgeschenke
werden über denselben `activePointsPresentation`-Renderer wie
Punkteeinlösungen dargestellt. Gift-Typ, Berechtigung und Statuslogik wurden
nicht verändert.

## 16:9 STABILITY

**PASS.** Der äußere Präsentationsrahmen bleibt `aspect-ratio: 16 / 9`,
`position: relative`, `min-height: 0` und `overflow: hidden`. Das innere Element
bleibt absolut entkoppelt; es existiert keine `height: 100%`-Rückkopplung.
Automatisiert geprüft wurden 320, 360, 375, 390, 415, 430, 767, 768, 1024 und
1440 px sowie 50 identische Re-Renders mit exakt unveränderter Medienhöhe.

## FOCUS/ZOOM/TRANSFORM PARITY

**PASS.** Bild-URL, `image_position_x`, `image_position_y`, gespeicherter
`image_zoom`, normalisierte Objektposition, `object-fit: contain`,
Transform-Origin und `coverScale * normalized.zoom` laufen auf allen
betroffenen Flächen durch denselben Renderer.

## SAFARI/WEBKIT

**PASS auf Safari/macOS Staging.** Der bestehende Vorgang wurde nach Reload
geöffnet, visuell gegen die Chrome-Owner-Vorschau verglichen und anschließend
ausschließlich über X geschlossen. Kein Layout-Sprung oder Reflow-Loop wurde
beobachtet.

## REAL IPHONE

**PASS – Founder physical confirmation.** Der Founder hat den echten
iPhone-Safari-Test als bestanden bestätigt: Bildausschnitt, Fokus, Zoom und
Position waren identisch, der 16:9-Rahmen blieb stabil und es war keine
Berührung zur nachträglichen Größenkorrektur erforderlich. Diese Aussage ist
Founder-supplied physical iPhone evidence; Codex hat den physischen Test nicht
selbst durchgeführt.

## SWIPE VALUE

`0` vor dem Schließen. Es wurde nicht gewischt oder bestätigt.

## WRITES EXECUTED

Keine Produkt- oder Datenwrites während QA. Öffnen und Schließen der bestehenden
Präsentation rufen laut Regressionstest keine Start-, Confirm-, Save-, Insert-,
Update-, Upload- oder Remove-Funktion auf.

## Gespeicherte Daten verändert

Nein. Keine neue Einlösung, keine Bestätigung, kein Upload, kein Entfernen,
keine Crop-Änderung und keine Speicherung.

## Founder Final Evidence

```text
REAL IPHONE SAFARI: PASS – Founder physical confirmation
OWNER PREVIEW ↔ REDEMPTION PARITY: PASS
SWIPE VALUE: 0
CONFIRMATION EXECUTED: NO
DATA WRITES: NO
IMAGE RENDER CONTRACT: FINAL LOCK
```

## Tests und Gates

- Source-Provenienz vor Änderung: **PASS**
- Focused Renderer/Security Tests: **118/118 PASS**
- Full Tests: **1868/1868 PASS**
- Sprachen DE/EN/FR/IT/ES/ZH/KO: **PASS**
- Typecheck: **PASS**
- Lint: **PASS**, 0 Fehler; 8 bestehende scopefremde Warnungen
- Build: **PASS**, Vite 6.4.3, 2128 Module
- `git diff --check`: **PASS**
- Kein presentationsspezifischer Scale-1-/Contain-Prop: **PASS**
- Keine Safari-/Mobile-CSS-Sonderregel: **PASS**
- Keine `ResizeObserver`-Ergänzung: **PASS**
- Wiederholtes Anzeigen/Schließen schreibfrei: **PASS**
- Asset-Abgleich lokal/aktiv: **bytegleich**
- Secret-Scan des Prüf-ZIP: **PASS**

## Deployment

- Commit: `6b50b62236371899c09d604004d91d194cd0a572`
- Staging-Version: `55206790-1a1b-414f-8d69-d17156f3891f`
- Aktives Hauptasset: `/assets/index-Cqpv4Al7.js`
- SHA-256: `47a6a83b03576bb2e11e57196c4dc40bcb9c6c2d2cdeac7a4e76889905d6cf4a`
- Lokales und aktives Asset: **bytegleich**
- Production geändert: **Nein**
- Migration: **Keine; `20260915003000` unverändert und nicht angewendet**

## Nicht verändert

- Timer und 15-Minuten-Fenster
- Swipe-, Bestätigungs- und Critical-Dismiss-Vertrag
- Punkte, Ledger, Geschenkberechtigung und Status
- Business-, Security-, Billing-, Country- und Entitlement-Logik
- Single-Image-Editor, Upload-, Entfernen- und Speicherlogik
- Datenbank, RLS, RPCs und Migrationen
- Production

## Abschließender Status

**IMAGE RENDER CONTRACT: FINAL LOCK**

TASK-OWNED BACKGROUND PROCESSES STARTED: 0

TASK-OWNED BACKGROUND PROCESSES STOPPED: 0

TASK-OWNED BACKGROUND PROCESSES STILL RUNNING: 0

RETAINED PROCESS PURPOSE: NONE

RAM CLEANUP: PASS

UNRELATED NODE PROCESSES CHANGED: NO
