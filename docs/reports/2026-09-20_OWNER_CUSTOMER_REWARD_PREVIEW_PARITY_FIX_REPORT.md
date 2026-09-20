# WUXUAI Bonus – Owner/Customer Reward Preview Parity Fix

Datum: 2026-09-20
Branch: `codex/v1-image-render-contract-fix`
Ausgangspunkt: `bdf2263dee9d52ae6586d484f4d1ee7aa6dc7285`
Customer-Preview-Commit: `1989df8bd71b6a2b082ee6de623ed79681b3b365`
Finaler Owner-Listen-Paritätscommit: `638c0531e48efd0b730eab62f1bd233913875e9a`

## Ursache

Bild-URL und Crop-Metadaten waren bereits identisch gebunden. Fokus X/Y und gespeicherter Zoom liefen in allen Flächen durch `rewardImageCropFromRecord`; `SmartMediaFrame` berechnete denselben 16:9-Cover-Basis-Scale und den vollständigen Render-Scale `coverScale × zoom`. Auch `object-fit: contain`, Transform und Transform-Origin waren gemeinsam.

Die Abweichung lag ausschließlich im Präsentationspfad:

- Die separate Owner-Vorschau baute eine eigene `.premium-customer-reward-preview`-Karte statt des echten Customer-`RewardCard`.
- Die Owner-Liste setzte im interaktiven Bildbutton den nackten `RewardImageFrame` ein, während die Customer-Karte zusätzlich den kanonischen `RewardImage`-Wrapper verwendete.
- Dadurch konnte Safari in der Owner-Liste einen anderen initialen beziehungsweise effektiven Bild-Scale zeigen, obwohl URL und gespeicherte Crop-Werte identisch waren.

## Geänderte Dateien

- `src/modules/admin/pages/RewardsPage.tsx`
- `src/modules/admin/components/OwnerRewardImageUploader.tsx`
- `src/modules/admin/admin-premium.css`
- `tests/owner-customer-reward-preview-parity.test.mjs`
- `tests/customer-image-render-contract.test.mjs`
- `docs/19_CHANGELOG.md`

## Was wurde geändert

- Die read-only Vorschau „So sehen Gäste dieses Angebot im Kundenportal“ verwendet jetzt den echten Customer-`RewardCard`.
- Der Vorschau-`RewardCard` erhält dieselbe `image_url` und denselben `rewardImageCropFromRecord`-Wert wie die Customer-Karte.
- Es wird kein `onOpen` übergeben: kein Tracking, kein Öffnen, keine Einlösung und keine Schreibaktion.
- Die Owner-Listenfläche verwendet innerhalb des unveränderten Upload-/Edit-Buttons denselben Customer-`RewardImage`-Pfad.
- Der optionale `media`-Slot des Uploaders betrifft nur die gespeicherte Punkteeinlösungs-Liste; alle bisherigen Aufrufer behalten den bisherigen `RewardImageFrame`-Fallback.
- Die Preview-Shell setzt nur neutrale Containerwerte und überschreibt weder Seitenverhältnis noch Bild-Fit oder Transform.

## Was wurde nicht geändert

- Safari-Reflow-Fix in Schritt 5
- Schritt 4 und Single-Image-Editor
- Gespeicherte Bilder, Fokus- oder Zoom-Metadaten
- Upload-, Entfernen-, Speicher- oder Einlösungslogik
- Customer-Tracking und Customer-Aktionen
- Business-, Security-, Billing- oder Entitlement-Logik
- Country Gate und AT-/PRO-Lock
- Datenbank, RLS, RPCs und Migrationen
- Production

## Prüfungen

### Automatisiert

- Focused Tests: 34/34 PASS
- Full Tests: 1861/1861 PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler; 8 unveränderte Bestandswarnungen
- Build mit Vite 6.4.3: PASS, 2128 Module
- `git diff --check`: PASS
- Secret Scan: keine Zugangsdaten im Änderungsscope
- Migration `20260915003000_test_tenant_contract_hardening.sql`: unverändert
- Migrations-SHA-256: `5ff37ab21bab8b3727587d9370dbd581c391d9260f661b7ca0ca860d6f00db91`

### Staging und Safari

- Finaler Worker: `wuxuai-restaurant-bonus-app-staging`
- Finale Version: `ea3bf13d-97d5-413f-bec9-a7aaba9652f5`
- Deployment-Message: `Owner list customer preview parity commit 638c053`
- Aktives Hauptasset: `assets/index-BwOukWrH.js`
- Hauptasset SHA-256 lokal/remote: `a1d95812e6d9c1ebfd1c6029b1745db8153969ff2d4c0ed106474953dd89d328`
- Aktiver Rewards-Chunk: `assets/RewardsPage-CUlZ7QLu.js`
- Rewards-Chunk SHA-256 lokal/remote: `b97002867b2f2012b389df003f8dc89f0047aea9185e6ca023d21a5c11ad8b05`
- Aktives Customer-CSS SHA-256: `8a7dc6dbac13afa13d9ce403b52ce6648d9ebabf03973eb1035101d9e4b11167`
- Bytevergleich Hauptasset und Rewards-Chunk: PASS
- Echte Owner-Staging-Sitzung in Safari/macOS: PASS
- Owner-Liste und separate Kundenportal-Vorschau zeigen dieselbe relative Objektgröße, Fokusposition und denselben sichtbaren 16:9-Ausschnitt: PASS
- Unterschiedliche Containerbreiten skalieren proportional und verändern den normalisierten Ausschnitt nicht: PASS
- Schritt 5 mit 50 Tastendrücken: Mediengeometrie stabil; nur Textumbruch
- Drawer ohne Speichern geschlossen; persistierter Name und Kategorie blieben gegenüber dem Testbeginn unverändert
- Kein Bild hochgeladen, entfernt oder gespeichert

## Risiko und Restgate

Die echte Customer-Karte wurde nicht verändert; Owner-Liste und Owner-Vorschau verwenden nun direkt deren Präsentationskomponenten. Eine post-deployment Customer-Sitzung war in den verfügbaren Browsern nicht aktiv. Der neue Paritätsfix muss deshalb noch auf dem echten iPhone im Customer-Portal gegen Owner-Liste, Schritt 5 und separate Vorschau bestätigt werden. Bis dahin kein FINAL LOCK.

## Ergebnis

- Aufgabe: Owner-Listen-/Kundenportal-Vorschau-Parität
- Build: Ja
- Migration: Keine; `20260915003000` unverändert und nicht angewendet
- Flow-Test: Ja, Owner Staging in Safari/macOS; physischer iPhone-Customer-Retest offen
- RLS/Security: Ja, Scope geprüft und unverändert
- Alte Logik geprüft: Ja
- Report: `docs/reports/2026-09-20_OWNER_CUSTOMER_REWARD_PREVIEW_PARITY_FIX_REPORT.md`
- Prüf-ZIP: `exports/2026-09-20_OWNER_CUSTOMER_REWARD_PREVIEW_PARITY_FIX.zip`
- Offene Risiken: echter iPhone-Paritätstest im Customer-Portal
- Status: CODE LOCK

TASK-OWNED BACKGROUND PROCESSES STARTED: 0
TASK-OWNED BACKGROUND PROCESSES STOPPED: 0
TASK-OWNED BACKGROUND PROCESSES STILL RUNNING: 0
RETAINED PROCESS PURPOSE: NONE
RAM CLEANUP: PASS
UNRELATED NODE PROCESSES CHANGED: NO
