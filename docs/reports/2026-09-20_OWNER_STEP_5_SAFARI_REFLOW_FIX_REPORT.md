# WUXUAI Bonus – Owner Step 5 Safari Reflow Fix

Datum: 2026-09-20
Branch: `codex/v1-image-render-contract-fix`
Ausgangspunkt: `149ffc4aa684b318bbb74c3bedde4517e3eaf097`
Implementierungs-Commit: `e87c13d27f211773609910f13eca36fa8b05dc3b`

## Ursache

In der Owner-Vorschau von Schritt 5 „Letzte Angaben prüfen“ traf ein eigener 16:9-Elternrahmen auf den allgemeinen Vertrag `.premium-customer-reward-preview.large > div { height: 100%; }`. Safari konnte die prozentuale Kindhöhe beim Re-Render des Formulars erneut in die Höhenauflösung des Elternrahmens einbeziehen. Dadurch entstand eine Größenrückkopplung: Jeder Tastendruck konnte die Vorschau-Medienfläche weiter vergrößern.

## Geänderte Dateien

- `src/modules/admin/admin-premium.css`
- `tests/owner-reward-final-preview-reflow.test.mjs`
- `docs/19_CHANGELOG.md`

## Was wurde geändert

- Ausschließlich im Scope `.premium-owner-editor` wurde der äußere Vorschau-Medienrahmen als alleinige Geometrieautorität festgelegt:
  - `position: relative`
  - `width: 100%`
  - `aspect-ratio: 16 / 9`
  - `min-height: 0`
  - `overflow: hidden`
- Der eingebettete `.reward-image-frame` füllt diesen Rahmen rückkopplungsfrei mit `position: absolute` und `inset: 0`.
- Die problematische prozentuale Kindhöhe wurde in diesem Scope mit `height: auto` neutralisiert.
- Vertragstests sichern Elterngeometrie, absolute Kind-Einbettung und unveränderte Bild-/Crop-Datenbindung.

## Was wurde nicht geändert

- Bestehender gemeinsamer 16:9-Bildvertrag
- `SmartMediaFrame` und `RewardImageFrame`
- Bild-URL, Fokusposition, gespeicherter Zoom und `--smart-media-render-scale`
- Single-Image-Editor und Crop-Metadaten
- Upload-, Entfernen- und Speicherlogik
- Drawer- und Keyboard-Vertrag
- Customer-Renderer
- Business-, Security-, Billing- und Entitlement-Logik
- Country Gate und AT-/PRO-Lock
- Datenbank, RPCs, RLS und bestehende Migrationen
- Production

## Prüfungen

### Automatisiert

- `git diff --check`: PASS
- Focused Tests: 72/72 PASS
- Full Tests: 1856/1856 PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler; 8 unveränderte Bestandswarnungen
- Build mit Node 24.18.0 und Vite 6.4.3: PASS, 2128 Module
- Chromium und WebKit bei 320/375/390/430/767/768/1024/1440 CSS-px: PASS
- 50 sequenzielle Tastendrücke: exakt 0 CSS-px Abweichung bei Medienbreite und Medienhöhe
- 16:9, `contain`, Fokusposition und vollständiger Transform: PASS
- ResizeObserver-Ereignisse der Medienfläche nach Stabilisierung: 0
- Runtime-/Observer-Loop-Fehler: 0
- Keine JavaScript-Höhenmessung und kein neuer `ResizeObserver`

### Safari Owner Staging

- Echte eingeloggte Owner-Sitzung für `Wuxuai test only`: bestätigt
- Punkteeinlösung `gratis Menü`, Schritt 5 „Letzte Angaben prüfen“: geprüft
- Vor dem Tippen: 16:9-Medienfläche und vollständiges Sushi-Bild stabil
- Exakt 50 sequenzielle Tastendrücke im Namensfeld: Medienfläche blieb unverändert; nur der lange Text brach um und ließ die Karte inhaltsgerecht wachsen
- Ruhekontrolle nach dem Tippen: kein nachlaufender Reflow
- Drawer ohne Speichern geschlossen
- Persistenzkontrolle in der Owner-Liste: weiterhin `gratis Menü`, Kategorie `SUSHI`
- Kein Bild hochgeladen, entfernt oder gespeichert
- Hinweis: Dies war echtes Safari auf macOS. Ein echtes iPhone wurde durch Codex nicht ferngesteuert und wird daher nicht als bestanden behauptet.

### Staging-Artefakte

- Worker: `wuxuai-restaurant-bonus-app-staging`
- Version: `3900e27c-67ce-4e3c-bb63-122f23f4a25d`
- Deployment-Message: `Owner Safari reflow fix commit e87c13d27f211773609910f13eca36fa8b05dc3b`
- Aktives Hauptasset: `assets/index-Djr7qmmr.js`
- Hauptasset SHA-256 lokal/remote: `570db1e5ebb90fff1bbda7915f61cc329aa160366b5b66058ee695aa7da738bb`
- Aktives Admin-CSS: `assets/AdminLayout-D4f7i9E4.css`
- Admin-CSS SHA-256 lokal/remote: `63fb967633eb7d595c3602845d51ea24a8fcb64c158c78e18ad03a78d63f95d2`
- Bytevergleich beider aktiver Assets: PASS

## Migration und Sicherheit

- Migration erstellt: Nein
- Migration verändert: Nein
- Migration auf Staging angewendet: Nein
- `20260915003000_test_tenant_contract_hardening.sql` unverändert
- Migrations-SHA-256: `5ff37ab21bab8b3727587d9370dbd581c391d9260f661b7ca0ca860d6f00db91`
- RLS/RPC/Security: im CSS-Scope nicht berührt
- Production: unverändert

## Risiko und Restgate

Der reproduzierte Owner-Safari-Defekt ist auf Staging behoben. Das separat geforderte echte-iPhone-Restgate bleibt offen, bis der Founder denselben Ablauf auf dem physischen Gerät bestätigt. Deshalb wird kein FINAL LOCK gemeldet.

## Ergebnis

- Aufgabe: Owner-Schritt-5-Safari-Reflow-Fix
- Build: Ja
- Migration: Keine; `20260915003000` unverändert und nicht angewendet
- Flow-Test: Ja, echte Owner-Staging-Sitzung in Safari/macOS; echtes iPhone offen
- RLS/Security: Ja, Scope geprüft und unverändert
- Alte Logik geprüft: Ja
- Report: `docs/reports/2026-09-20_OWNER_STEP_5_SAFARI_REFLOW_FIX_REPORT.md`
- Prüf-ZIP: `exports/2026-09-20_OWNER_STEP_5_SAFARI_REFLOW_FIX.zip`
- Offene Risiken: physischer iPhone-Retest noch durch Founder zu bestätigen
- Status: CODE LOCK

TASK-OWNED BACKGROUND PROCESSES STARTED: 2
TASK-OWNED BACKGROUND PROCESSES STOPPED: 2
TASK-OWNED BACKGROUND PROCESSES STILL RUNNING: 0
RETAINED PROCESS PURPOSE: NONE
RAM CLEANUP: PASS
UNRELATED NODE PROCESSES CHANGED: NO
