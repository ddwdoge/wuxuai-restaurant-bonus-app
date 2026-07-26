# Reward- und Willkommensgeschenk-Bilder – WYSIWYG-Ausschnitt

Datum: 2026-07-26
Branch: `codex/v13-legal-maps-hardening`
Ausgangscommit: `82a0f18`

## Ursache

Bislang wurde nur die Bild-URL gespeichert. Upload-Vorschau, Owner-Karte und Kundenportal verwendeten unterschiedliche Seitenverhältnisse und `object-fit`-Container. Dadurch konnte ein im Formular passend wirkendes Motiv nach dem Speichern anders oder abgeschnitten erscheinen. Eine persistente Zoom- oder Fokusposition gab es nicht.

## Darstellung vorher und nachher

- bisherige Upload-Vorschau: überwiegend 4:3
- bisherige Owner-Karten: ungefähr 16:8,5
- bisherige Kundenkarten/Details: je nach Ansicht 2:1, 16:10 oder etwa 1,35:1
- neue gemeinsame Darstellung: 16:9
- Altbilder ohne Metadaten: Zoom 1, Fokus mittig (0,5 / 0,5)

## Umsetzung

- gemeinsame `RewardImageFrame` für Owner-Karten, Owner-Vorschau und Kundenportal
- Owner-Editor mit Zoom 1–4, Pointer-/Touch-Verschieben, Pfeiltasten und Reset
- lokale Vorschau vor Upload; Abbrechen verwirft die neue Auswahl
- Bild-URL und Crop-Metadaten werden zusammen und tenantgebunden gespeichert
- Uploadfehler oder nachfolgender Datenbankfehler lassen das vorherige Bild bestehen
- sichtbare Texte und Bedienhinweise sind Deutsch

## Datenbank

Additive Migration: `20260726002000_reward_image_crop_metadata.sql`

Neue Felder auf `public.rewards`:

- `image_zoom`
- `image_position_x`
- `image_position_y`
- `image_aspect_ratio`
- `image_crop_version`

Die Migration ergänzt Wertebereiche und erweitert die bestehende öffentliche Portal-RPC um ausschließlich die Bildausschnitt-Metadaten. `EXECUTE` bleibt explizit auf `anon` und `authenticated` begrenzt; RLS-Policies wurden nicht verändert.

Der Staging-Dry-Run war erfolgreich und plante ausschließlich diese Migration. Die Migration wurde in diesem Auftrag zunächst nicht auf Staging angewendet.

Nachtrag vom 26.07.2026: Im anschließenden Reward-Fotoeditor-Fix wurde dieselbe Migration nach erneutem Dry-Run auf dem bestätigten Projekt `wuxuai-bonus-staging` angewendet. Die Remote-Migrationsliste und das generierte Remote-Schema bestätigen die fünf Crop-Spalten.

## Geänderte Bereiche

- `src/shared/rewardImageCrop.ts`
- `src/shared/components/RewardImageFrame.tsx`
- `src/shared/components/reward-image-frame.css`
- `src/modules/admin/components/OwnerRewardImageEditor.tsx`
- `src/modules/admin/components/OwnerRewardImageUploader.tsx`
- `src/modules/admin/components/PremiumOwnerRewardCard.tsx`
- `src/modules/admin/pages/RewardsPage.tsx`
- `src/modules/admin/pages/WelcomeGiftsPage.tsx`
- `src/modules/rewards/rewardService.ts`
- `src/shared/types/domain.ts`
- `src/modules/customer/CustomerPortal.tsx`
- `src/modules/customer/components/PremiumCustomerUi.tsx`
- `src/modules/customer/customer-premium.css`
- `supabase/migrations/20260726002000_reward_image_crop_metadata.sql`
- `tests/reward-image-crop.test.mjs`
- `tests/owner-premium-rewards.test.mjs`

## Prüfung

- Typecheck: erfolgreich
- Lint: 0 Fehler, 7 bereits bestehende Warnungen
- Tests: 156/156 erfolgreich
- Build: erfolgreich
- Migration-Dry-Run: erfolgreich
- RLS/Security: keine Policy-Lockerung; tenantgebundene Update-Filter und bestehende Storage-Policies beibehalten
- JPG/PNG/WebP: Dateitypvertrag und Validierung geprüft
- Accessibility: Editor fokussierbar, Pfeiltasten, sichtbare Buttons, ARIA-Beschriftungen und mindestens 44 px große Zoom-Aktionen

## Offene visuelle Abnahme

Der lokale Owner-Bereich leitete ohne vorhandene Owner-Sitzung auf den Login um. Deshalb konnten Upload, Speichern, Reload, Logout/Login und die Viewports 390/430/768/1024/1440 nicht authentifiziert im Browser abgenommen werden. Ein physischer Mobile-Safari-Test war ebenfalls nicht verfügbar. Die Datenbankmigration wurde nach diesem ursprünglichen Prüfstand auf Staging angewendet; der authentifizierte persistente Staging-Flow bleibt dennoch bewusst offen.

## Status

`READY_FOR_VISUAL_REVIEW`
