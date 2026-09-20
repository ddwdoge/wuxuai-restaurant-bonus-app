# Customer Redemption Presentation Image Contract Fix

Datum: 2026-09-20

Branch: `codex/v1-image-render-contract-fix`

Implementierungscommit: `6fce122f2b0ca16c107a10792665e96cf862fa97`

Staging Worker: `wuxuai-restaurant-bonus-app-staging`

Staging Version: `b4c4c476-57f4-4ad8-86da-f334e7e1d2d7`

## Ursache

Das aktive Customer-Präsentationsfenster für Punkte- und Geschenkeinlösungen
verwendete `RewardImageFrame` direkt. Die CSS-Sonderregel
`.premium-presentation-image .reward-image-frame { height: 100%; width: 100%; }`
war eine nachweisbare Abweichung vom gemeinsamen Customer-Gift-Vertrag über
`RewardImage`. Sie wurde eng beseitigt. Der anschließende reale Safari-Test
beweist jedoch, dass diese Abweichung nicht die alleinige Ursache des
abgeschnittenen unteren Bildinhalts „Linsensuppe“ war.

Die verbleibende Ursache liegt im gemeinsamen `SmartMediaFrame`-Vertrag:
Das Bild verwendet zwar `object-fit: contain`, wird danach aber mit
`coverScale * normalized.zoom` transformiert. Bei einem nicht-16:9-Quellbild
füllt diese vollständige Render-Skalierung den 16:9-Rahmen und schneidet
zwangsläufig Bildinhalt oben beziehungsweise unten ab. Im Staging-Screenshot
nach dem Deployment ist der Suppenteller sichtbar, der untere Schriftzug
„Linsensuppe“ fehlt aber vollständig.

URL, Fokus X/Y, gespeicherter Zoom und vollständiger
`--smart-media-render-scale` werden unverändert aus demselben
Präsentationsdatensatz an `SmartMediaFrame` weitergegeben. Es existieren in
diesem Pfad keine verbleibenden mobilen 3:2-, CSS-`cover`- oder
`--smart-media-crop-zoom`-Overrides. Eine Verkürzung auf den gespeicherten Zoom
würde jedoch dem ausdrücklich verlangten vollständigen Render-Scale und der
Owner-/Customer-Parität widersprechen. Deshalb wurde gemäß Stopbedingung keine
weitere Bildlogik erfunden.

## Read-only Bildflächeninventar

| Zustand | Renderer vor dem Fix | Bildvertrag / Ergebnis |
| --- | --- | --- |
| Geburtstagsgeschenk, aktive Einlösung | `activePointsPresentation` → direkter `RewardImageFrame` | Betroffene Sonderbindung; `gift_type = birthday` |
| Willkommensgeschenk, aktive Einlösung | derselbe `activePointsPresentation`-Renderer | Betroffene Sonderbindung; `gift_type = welcome` |
| Normale persönliche Geschenkeinlösung | derselbe serverseitige Gift-Präsentationspfad | Kein separater Bildrenderer vorhanden; Geschenktypen bleiben fachlich unverändert |
| Punkteeinlösung, aktive Einlösung | derselbe `activePointsPresentation`-Renderer | Betroffene Sonderbindung; ohne `gift_type` |
| „Bestätigung ausstehend“ | `premium-presentation-window` | Gemeinsame aktive 15-Minuten-Präsentation aller obigen Typen |
| Detail vor dem Start | `RewardImage` → `RewardImageFrame` → `SmartMediaFrame` | Bereits kanonischer 16:9-Vertrag; unverändert |
| Erfolgs-/Fehlerausgang | `premium-redemption-outcome` | Enthält aktuell kein Bild. Es wurde keine neue Bildfläche erfunden. |
| Historischer Einlösecode | `premium-redemption-code` | Enthält kein Bild; Legacy-Kompatibilität unverändert |

## Geänderte Dateien

- `src/modules/customer/CustomerPortal.tsx`
- `src/modules/customer/customer-premium.css`
- `tests/customer-redemption-presentation-image-contract.test.mjs`

## Was wurde geändert

- Die aktive Customer-Präsentation verwendet nun denselben `RewardImage`-
  Gift-Wrapper wie Customer-Karten und Detailansicht.
- Bild-URL sowie `image_position_x`, `image_position_y` und `image_zoom` werden
  unverändert aus `activePointsPresentation` übernommen.
- Der äußere Rahmen ist die alleinige Geometrieautorität mit `aspect-ratio:
  16 / 9`, `position: relative`, `min-height: 0` und `overflow: hidden`.
- Gift-Wrapper und `RewardImageFrame` füllen den Rahmen absolut über alle vier
  Insets. Die alte prozentuale Kindhöhe wurde entfernt.
- `SmartMediaFrame` behält `object-fit: contain`, Fokusposition, gespeicherten
  Zoom und die vollständige Render-Skalierung.

## Was wurde nicht geändert

- Countdown, Serverzeit und 15-Minuten-Fenster
- Swipe-Bestätigung, Critical-Dismiss-Schutz und Staff-Bestätigung
- Punkte-, Geschenk- und Präsentationsstatus
- Upload-, Entfernen-, Speicher- oder Crop-Metadatenlogik
- Single-Image-Editor
- RPCs, Datenbank, Migrationen, RLS oder Security
- Business-, Billing-, Country-, PRO- oder Entitlement-Logik
- bestehende oder aktive Präsentationsdatensätze
- Production Worker, Production Domain und DNS

## Prüfungen

- Focused Contract/Regression Tests: **52/52 PASS**
- Full Tests: **1866/1866 PASS**
- Typecheck: **PASS**
- Lint: **PASS**, 0 Fehler; 8 bereits vorhandene, scopefremde Warnungen
- Build: **PASS**, Vite 6.4.3, 2128 Module
- `git diff --check`: **PASS**
- Build-Variablen: nur im Speicher aus dem öffentlichen aktiven
  Staging-Bundle gelesen; keine Werte ausgegeben oder gespeichert

## Staging Ergebnis

- Deployment ausschließlich auf `wuxuai-restaurant-bonus-app-staging`: **PASS**
- Version: `b4c4c476-57f4-4ad8-86da-f334e7e1d2d7`
- Custom Domain HTTP: **200**
- Hauptasset: `/assets/index-Cqpv4Al7.js`
- SHA-256 Hauptasset:
  `47a6a83b03576bb2e11e57196c4dc40bcb9c6c2d2cdeac7a4e76889905d6cf4a`
- Customer CSS: `/assets/PremiumCustomerUi-f7p-RjGX.css`
- Ausgelieferter Vertrag: 16:9 **PASS**, relative Elterngeometrie **PASS**,
  absolut entkoppeltes Kind **PASS**, keine prozentuale Präsentations-Kindhöhe
  **PASS**

## QA und offene Risiken

Nach dem Deployment wurde die vorhandene Safari-Customer-Sitzung read-only
geprüft. Der bereits aktive kompakte Hinweis „Eine Überraschung für dich
anzeigen“ öffnete dieselbe bestehende Geburtstagspräsentation; es wurde keine
neue Einlösung gestartet. Der Status blieb „Bestätigung ausstehend“, der
Swipe-Regler blieb bei 0 und der Drawer wurde ohne Bestätigung geschlossen.

Physisches Ergebnis: **FAIL**. Der 16:9-Rahmen ist geometrisch stabil und der
Suppenteller vollständig sichtbar. Der zum Bild gehörende untere Schriftzug
„Linsensuppe“, der im Ausgangsscreenshot nur angeschnitten war, fehlt nach dem
Deployment vollständig. Die Akzeptanz „kein Abschneiden des Bildinhalts“ ist
damit nicht erfüllt.

Vor einer weiteren Produktänderung ist eine Founder-Entscheidung nötig:

1. Vollständigen Bildinhalt garantieren und dafür in dieser Präsentation auf
   den `coverScale`-Anteil verzichten; oder
2. den gemeinsamen vollständigen Render-Scale und den gespeicherten Ausschnitt
   priorisieren, womit nicht-16:9-Quellbilder weiterhin beschnitten werden.

Production, Datenbank und Migrationen blieben unverändert.

## Abschluss

- Aufgabe: 16:9-Vertrag für Customer-Geschenk- und Einlösungspräsentationen
- Build: Ja
- Migration: Keine
- Flow-Test: Ja – vorhandene Safari-Customer-Geburtstagspräsentation FAIL
- RLS/Security: Unverändert; keine Datenbankänderung
- Alte Logik geprüft: Ja
- Offene Risiken: fachliche Entscheidung zwischen vollständigem Bildinhalt und vollständigem Cover-Render-Scale
- Status: NOT READY

TASK-OWNED BACKGROUND PROCESSES STARTED: 0

TASK-OWNED BACKGROUND PROCESSES STOPPED: 0

TASK-OWNED BACKGROUND PROCESSES STILL RUNNING: 0

RETAINED PROCESS PURPOSE: NONE

RAM CLEANUP: PASS

UNRELATED NODE PROCESSES CHANGED: NO
