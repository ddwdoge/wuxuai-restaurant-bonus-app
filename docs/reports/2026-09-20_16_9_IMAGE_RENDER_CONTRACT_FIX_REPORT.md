# WUXUAI Bonus – 16:9 Image Render Contract Fix

Datum: 2026-09-20
Branch: `codex/v1-image-render-contract-fix`
Basis: `f2e7fbef9ba00e6405c808e5274e30ca2090eadb`
Implementierungs-Commit: `9f963ece68fa25727afe456fadde0c9ab9da0554`

## Ursache

Der gemeinsame `SmartMediaFrame`-Vertrag war bereits auf 16:9, `contain`, gespeicherte Fokusposition und vollständige `--smart-media-render-scale` ausgelegt. Zwei Customer-spezifische Stylesheets überschrieben diesen Vertrag mobil jedoch mit 3:2, `object-fit: cover` und teilweise mit der verkürzten Variable `--smart-media-crop-zoom`. Dadurch konnten Owner-, Vorschau-, Customer-Karten- und Detailflächen für denselben Datensatz unterschiedliche Geometrie und sichtbare Ausschnitte zeigen.

## Geänderte Dateien

- `src/modules/customer/customer-compact.css`
- `src/modules/customer/customer-block-a.css`
- `tests/customer-image-render-contract.test.mjs`
- `tests/customer-block-a.test.mjs`
- `tests/phase6-mobile-reference.test.mjs`
- `docs/05_CUSTOMER_PORTAL.md`
- `docs/15_DESIGN_SYSTEM.md`
- `docs/19_CHANGELOG.md`
- `docs/V1_AUSTRIA_LAUNCH_MASTER_CONTRACT.md`
- `docs/V1_CURRENT_CANONICAL_PRODUCT_CONTRACT.md`

## Was wurde geändert

- Mobile 3:2-Overrides aus beiden Customer-Stylesheets entfernt.
- Customer-spezifisches `object-fit: cover` entfernt.
- Customer-spezifischen Transform über `--smart-media-crop-zoom` entfernt.
- Bestehenden gemeinsamen Vertrag wieder wirksam gemacht:
  - 16:9
  - `object-fit: contain`
  - dieselbe Bild-URL
  - dieselbe Fokusposition
  - gespeicherter Zoom
  - vollständige `--smart-media-render-scale`
- Fokussierte Vertragstests für Punkteeinlösungen, Angebote und bildtragende Willkommensgeschenke ergänzt.
- Veraltete 3:2-/Cover-Vertragsaussagen an die ausdrückliche Founder-Freigabe vom 20.09.2026 angepasst.

## Was wurde nicht geändert

- `SmartMediaFrame` und `RewardImageFrame`
- Single-Image-Editor und Crop-Metadaten
- Upload-, Entfernen- und Speicherlogik
- Drawer- und Keyboard-Vertrag
- Business-, Security-, Billing- und Entitlement-Logik
- Country Gate und AT-/PRO-Lock
- Datenbank, RPCs, RLS und bestehende Migrationen
- Production

## Prüfungen

### Statisch und automatisiert

- `git diff --check`: PASS
- Focused Tests: 166/166 PASS
- Full Tests: 1853/1853 PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler; 8 unveränderte Bestandswarnungen
- Build mit Node 24.18.0: PASS, 2128 Module
- Migration `20260915003000_test_tenant_contract_hardening.sql`: byte-unverändert
- Migrations-SHA-256: `5ff37ab21bab8b3727587d9370dbd581c391d9260f661b7ca0ca860d6f00db91`

### Browser-Geometrie

Chromium und WebKit wurden mit den echten Projekt-CSS-Dateien geprüft:

- Breiten: 320, 375, 390, 430, 767, 768, 1024 und 1440 CSS-px
- 16:9: PASS
- `object-fit: contain`: PASS
- gespeicherte Fokusposition: PASS
- vollständiger Zoom-Transform: PASS
- 50 Textänderungen: exakt 0 CSS-px Abweichung bei Medienbreite und Medienhöhe
- ResizeObserver-Ereignisse der Medienfläche nach Stabilisierung: 0
- Runtime-/Observer-Loop-Fehler: 0
- Breakpoint 767/768: PASS

### Staging

- Worker: `wuxuai-restaurant-bonus-app-staging`
- Version: `f41aba79-cd16-4113-bc29-34dc3f808290`
- Deployment-Message: `16:9 image contract commit 9f963ece68fa25727afe456fadde0c9ab9da0554`
- Aktives Hauptasset: `assets/index-DRWk4DKg.js`
- Hauptasset SHA-256 lokal/remote: `9cad0ae36380a1791837c1ce151c7241aacf8a3eabf8148afaf00bc80ccc0115`
- Premium-CSS SHA-256 lokal/remote: `8a7dc6dbac13afa13d9ce403b52ce6648d9ebabf03973eb1035101d9e4b11167`
- Block-A-CSS SHA-256 lokal/remote: `bad965cee25c2af476dbe749579936f794cfcabf580f64b5faf0879bf969fb97`
- Customer-Angebotskarte und Angebotsdetail read-only sichtbar geprüft: PASS
- Customer-Punkteeinlösungskarte und Detail read-only sichtbar geprüft: PASS
- Customer-Geschenkflächen sichtbar; aktive Testgeschenke verwenden aktuell Fallbackbilder
- Kein Formular gespeichert, kein Bild hochgeladen oder entfernt

## Geräte- und Sprachstatus

- Desktop geprüft: Ja
- Tablet geprüft: Ja, automatisiert bei 768 px
- Mobile geprüft: Ja, automatisiert bei 320/375/390/430/767 px
- Chrome/Chromium geprüft: Ja
- Safari/WebKit geprüft: Ja, automatisiert
- DE/EN/FR/IT/ES/ZH/KO: automatisierte bestehende Renderer-/Drawer-Tests PASS
- Echtes iPhone: offen; nach Staging-Deployment durch Founder ohne Speichern zu prüfen
- Owner-Staging-UI: offen; die vorhandene Chrome-Sitzung war im Customer-Bereich gültig, nicht im Owner-Bereich

## Migration und Sicherheit

- Migration erstellt: Nein
- Migration verändert: Nein
- Migration auf Staging angewendet: Nein
- `20260915003000` bleibt ausschließlich lokal vorhanden
- RLS/RPC/Security: nicht verändert
- Production: nicht verändert

## Risiken und Restgates

1. Der physische iPhone-Test des Bearbeiten-Drawers mit 50 Tastendrücken ist noch offen.
2. Die Owner-Liste und Owner-Bearbeitungsvorschau konnten nach dem Deployment nicht in einer gültigen Owner-Sitzung sichtbar gegengeprüft werden. Quellvertrag, fokussierte Tests und gemeinsame Renderer-Bindung sind grün.
3. Es wurde kein Push ausgeführt; der Branch und Commit liegen lokal vor.

## Ergebnis

Der enge Renderer-Fix ist implementiert, vollständig lokal gegatet, eng committed und ausschließlich auf Staging deployt. Wegen der beiden physischen Restgates wird kein FINAL LOCK gemeldet.

- Aufgabe: Gemeinsamer 16:9-Bildrenderer-Vertrag
- Build: Ja
- Migration: Keine; `20260915003000` unverändert und nicht angewendet
- Flow-Test: Ja, Customer Staging read-only; Owner und echtes iPhone offen
- RLS/Security: Ja, unverändert; kein Datenbankzugriff
- Alte Logik geprüft: Ja
- Report: `docs/reports/2026-09-20_16_9_IMAGE_RENDER_CONTRACT_FIX_REPORT.md`
- Prüf-ZIP: `exports/2026-09-20_16_9_IMAGE_RENDER_CONTRACT_FIX.zip`
- Offene Risiken: echter iPhone-Test und sichtbare Owner-Staging-Gegenprüfung
- Status: CODE LOCK

TASK-OWNED BACKGROUND PROCESSES STARTED: 6
TASK-OWNED BACKGROUND PROCESSES STOPPED: 6
TASK-OWNED BACKGROUND PROCESSES STILL RUNNING: 0
RETAINED PROCESS PURPOSE: NONE
RAM CLEANUP: PASS
UNRELATED NODE PROCESSES CHANGED: NO
