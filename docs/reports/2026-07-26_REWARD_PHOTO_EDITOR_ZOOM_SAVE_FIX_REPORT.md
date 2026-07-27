# Reward-Fotoeditor: Zoom-out und Speichern

Datum: 2026-07-26
Branch: `codex/v13-legal-maps-hardening`
Ausgangscommit: `82a0f18`

## Ursache

Der Fotoeditor begrenzte `image_zoom` in UI, Normalisierung und vorbereiteter Datenbank-Constraint auf `1..4`. Gleichzeitig verwendete die Darstellung `object-fit: cover`. Damit war Verkleinern unter den bereits zugeschnittenen Cover-Zustand technisch ausgeschlossen.

Der HTTP-400-Fehler beim Speichern entstand nachweislich, weil die lokale additive Migration `20260726002000_reward_image_crop_metadata.sql` auf dem verknüpften Staging-Projekt noch fehlte. Die Update-Query schrieb deshalb in die dort noch unbekannten Spalten `image_zoom`, `image_position_x`, `image_position_y`, `image_aspect_ratio` und `image_crop_version`.

## Änderungen

- Dynamisches Mindestzoom wird aus natürlicher Bildgröße und dem festen 16:9-Rahmen berechnet.
- `Einpassen` zeigt das vollständige Foto; bei quadratischen Bildern liegt das Mindestzoom beispielsweise bei `0.5625`.
- Die gemeinsame Owner-/Kunden-Darstellung verwendet `contain` als vollständige Quelle und einen berechneten Cover-Faktor. Zoom `1` behält die bisherige Cover-Darstellung, kleinere Werte zeigen mehr vom Original.
- Minus und Plus sind an den tatsächlichen dynamischen Grenzen deaktiviert.
- Crop-Werte werden sicher in `0.1..4` normalisiert und gespeichert.
- Ein fehlender Backendvertrag erhält einen typisierten Fehler. Der Drawer zeigt eine ruhige deutsche Meldung und verhindert weitere Speicherrequests bis zum Schließen.
- Uploadfehler räumen eine neu hochgeladene Datei weiter auf; das bisherige Bild und alle fachlichen Reward-Daten bleiben unverändert.

## Betroffene Dateien

- `src/shared/rewardImageCrop.ts`
- `src/shared/components/RewardImageFrame.tsx`
- `src/shared/components/reward-image-frame.css`
- `src/modules/admin/components/OwnerRewardImageEditor.tsx`
- `src/modules/admin/pages/RewardsPage.tsx`
- `src/modules/admin/pages/WelcomeGiftsPage.tsx`
- `src/modules/admin/admin-premium.css`
- `src/modules/rewards/rewardService.ts`
- `supabase/migrations/20260726002000_reward_image_crop_metadata.sql`
- `tests/reward-image-crop.test.mjs`

## Staging

- Projekt: `wuxuai-bonus-staging`
- Project Ref: `bwh…qaya` (maskiert)
- Dry-Run: ausschließlich `20260726002000_reward_image_crop_metadata.sql`
- Migration angewendet: Ja
- Remote-Migrationsliste danach synchron: Ja
- Generiertes Remote-Schema enthält alle fünf Crop-Spalten: Ja
- Production-Migration: Nein
- RLS-/Policy-Änderung: Nein

## Prüfung

- Typecheck: erfolgreich
- Lint: 0 Fehler, 7 bestehende Warnungen
- Tests: 164/164 erfolgreich
- Build: erfolgreich
- Alter Dev-Server auf Port 4192 beendet und aktueller Vite-Stand neu gestartet
- Unauthentifizierter Route-Guard leitet korrekt auf `/restaurant/login`

## Offene Abnahme

Eine authentifizierte Owner-Sitzung war in der kontrollierbaren Browserinstanz nicht vorhanden. Deshalb konnten Auswahl einer realen JPG-/PNG-/WebP-Datei, tatsächliches Speichern, Reload und Logout/Login mit einem bestehenden Staging-Reward noch nicht live ausgeführt werden. Es wurden keine Testkonten oder Reward-Daten ohne Freigabe erzeugt.

## Status

`CHANGES_REQUIRED` bis der authentifizierte Staging-Speicherflow inklusive Reload bestätigt wurde.
