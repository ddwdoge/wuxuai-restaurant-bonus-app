# WUXUAI Bonus - Global Smart Media Editor

Datum: 2026-08-28  
Branch: `codex/v1-canonical-recovery`  
Ausgangscommit: `1116319b1cb2acb597137ec12966651e2d1916bb`

## Ursache

Rewards und die darauf basierenden Willkommens- und Geburtstagsgeschenke
besaßen bereits normalisierte 16:9-Crop-Daten. Die Bedienung unterstützte aber
nur Maus-/Ein-Finger-Drag, einen großen Slider und grob normalisierte Positionen.
Angebote und öffentliche Restaurant-Titelbilder renderten dagegen nur die
Original-URL mit festem `object-fit: cover` und konnten keinen gespeicherten
Ausschnitt übernehmen. Dadurch gab es keinen einheitlichen Owner-Medienvertrag.

## Geänderte Dateien

- Gemeinsamer Kern: `src/shared/mediaPresentation.ts`,
  `src/shared/components/SmartMediaFrame.tsx`,
  `src/shared/components/SmartMediaEditor.tsx`,
  `src/shared/components/smart-media.css`
- Kompatibilität: `src/shared/rewardImageCrop.ts`,
  `src/shared/components/RewardImageFrame.tsx`,
  `src/modules/admin/components/OwnerRewardImageEditor.tsx`
- Angebote: `src/modules/admin/pages/RestaurantOffersPage.tsx`,
  `src/modules/offers/restaurantOfferService.ts`, Owner-/Customer-CSS und
  `src/modules/customer/components/RestaurantOfferCard.tsx`
- Titelbild: `src/modules/admin/pages/SettingsPage.tsx`, Partner-Finder-Service,
  Partner-Finder-Seite, Hero-Komponente und CSS
- Migration:
  `supabase/migrations/20260828001000_global_restaurant_media_presentation.sql`
- Tests: Reward-Crop-, Offer-, Hero- und neuer globaler Smart-Media-Vertrag

## Was wurde geändert

- Ein gemeinsamer 16:9-Fotovertrag mit Zoom und normalisierter X-/Y-Position.
- Direkter Maus-/Ein-Finger-Drag, Zwei-Finger-Pinch, Trackpad-/Mausrad-Zoom,
  Pfeiltasten sowie 44-Pixel-Plus-/Minus-Aktionen.
- 100 Prozent entspricht dem formatabhängigen, vollständig füllenden
  Cover-Minimum. Zoom darunter wird verhindert; maximal sind viermal
  Baseline innerhalb der bestehenden absoluten Grenze.
- `Automatisch einpassen` stellt zentriertes Cover her. `Zurücksetzen` holt den
  beim Öffnen gespeicherten Ausschnitt zurück.
- Unter 1280 x 720 Pixel erscheint ein nicht blockierender Qualitätshinweis.
- Angebote speichern den Ausschnitt über eine eng begrenzte, auditierte
  Owner-RPC. Duplikate übernehmen das Bild und seine Präsentation.
- Bei einem bereits vorhandenen Angebotsbild erscheint nur noch die direkt
  bearbeitbare Bildfläche. Eine zweite identische Upload-Vorschau wird nicht
  mehr gerendert; Bildwechsel und Entfernen bleiben kompakte Aktionen.
- Branch-Titelbilder speichern dieselben Werte über die bereits bestehende
  tenantgebundene Branch-Policy.
- Öffentliche Offer- und Finder-RPCs liefern nur die neuen Präsentationswerte.
- Defekte Titelbilder behalten den bestehenden Logo-Fallback ohne Browser-
  Fehlerbild oder sichtbaren Alt-Text.

## Was wurde nicht geändert

- Originaldateien werden weder verändert noch ersetzt.
- Smart Logo bleibt ein eigener `contain`-Vertrag.
- Keine Änderung an Offer-Sichtbarkeit/-Gültigkeit, Reward-Punkten,
  Gift-Eligibility, 15-Minuten-Einlösung, Referral oder Membership.
- Keine Service Role im Browser und keine Lockerung von RLS oder Tabellenrechten.
- Keine Production-Aktion, kein Push und kein Merge.

## Migration und Sicherheit

- Migration erstellt: **Ja**
- Migration auf Staging angewendet: **Ja**
- Staging Dry-Run: **PASS**, exakt eine ausstehende Migration (`20260828001000`)
- Lokale und entfernte Migrationshistorie nach Anwendung: **synchron**
- Reale Staging-DB-Linter-Fehler nach Migration: **0**
- Migration lokal ausgeführt: **Nein**, lokale Supabase-/Docker-Laufzeit fehlt
- RLS: **unverändert aktiv**
- Offer-Schreibrecht: `authenticated`, zusätzlich serverseitig
  `is_restaurant_admin(input_restaurant_id)` und Tenant-ID im Update
- Public-RPCs: ausschließlich veröffentlichte Offer-/Finder-Daten plus
  Präsentationsmetadaten; keine direkten DML-Grants

## Tests und Qualität

- Tests: **1057/1057 PASS**
- Typecheck: **PASS**
- Lint: **PASS mit 0 Fehlern und 7 bestehenden Warnungen**
- Production Build: **PASS**
- `git diff --check`: **PASS**
- Desktop/Tablet/Mobile-Verträge: statisch und durch bestehende responsive Tests
  geprüft
- Cloudflare-Staging-Deployment: **PASS**
- Letzte Deployment-Version: `94317515-1ac7-4a38-b710-e1450e4d2b5b`
- Physisches iPhone: Drag/Pinch und Editorbedienung vom Owner als **PASS**
  bestätigt
- Staging Save/Reload: Angebot und Reward **PASS**; jeweilige Original-URL blieb
  unverändert und die Ausgangswerte wurden nach dem Test wiederhergestellt
- Angebotsdialog nach dem iPhone-Befund live geprüft: genau ein Editor, kein
  zusätzlicher Uploader und genau ein Vorschaubild

## Risiken und offene Gates

- Reale Owner-Tests mit quadratischem, Hoch-, Quer-, sehr breitem, sehr hohem,
  hoch- und niedrigauflösendem Bild bleiben offen.
- Ein Gift mit echtem Bild war im aktuellen Staging-Tenant nicht vorhanden;
  deshalb ist der physische Gift-Bildtest weiterhin offen.
- Das aktuelle Restaurant-Titelbildfeld enthält historisch eine Nicht-Bild-URL.
  Der Fallback greift, aber ein realer Cover-Upload samt Save/Reload wurde in
  diesem Gate nicht hergestellt.
- Die neue Ein-Bild-Darstellung ist live technisch bestätigt; die abschließende
  Wahrnehmungsprüfung auf dem physischen iPhone bleibt nach dem letzten
  Deployment offen.
- Der Offer-Hauptdatensatz und seine Präsentation werden über zwei eng begrenzte
  RPC-Aufrufe gespeichert. Ein seltener Fehler im zweiten Aufruf lässt den
  Entwurf mit sicherem Center-Cover zurück; ein erneutes Speichern ist möglich.

## Ergebnis

SHARED SMART MEDIA EDITOR: PASS  
OFFER IMAGE: CODE PASS  
REWARD IMAGE: CODE PASS  
WELCOME GIFT IMAGE: CODE PASS / LIVE IMAGE FIXTURE OPEN  
BIRTHDAY GIFT IMAGE: CODE PASS / LIVE IMAGE FIXTURE OPEN  
RESTAURANT COVER: CODE PASS / LIVE UPLOAD OPEN  
DIRECT DRAG: PASS  
PINCH ZOOM: PASS  
AUTO FIT: PASS  
RESET: PASS  
16:9 CONTRACT: PASS  
EMPTY EDGES: NO (CODE CONTRACT)  
DISTORTION: NO (CODE CONTRACT)  
ORIGINAL FILE PRESERVED: PASS  
SAVE / RELOAD: OFFER AND REWARD PASS  
LEGACY MEDIA: PASS  
SHARED COMPONENT: PASS  
IPHONE SAFARI: INTERACTION PASS / FINAL ONE-IMAGE RECHECK OPEN  
BUSINESS LOGIC CHANGED: NO  
DB MIGRATION: `20260828001000_global_restaurant_media_presentation.sql`  
TESTS: 1057/1057 PASS  
GLOBAL RESTAURANT SMART MEDIA EDITOR READY: NO - COVER/GIFT/FINAL IPHONE GATES OPEN

Status: **NOT READY**
