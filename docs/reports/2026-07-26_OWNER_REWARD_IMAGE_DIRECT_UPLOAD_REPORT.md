# Direkter Foto-Upload über Reward-Symbol – Bericht

Datum: 2026-07-26  
Branch: `codex/v13-legal-maps-hardening`  
Ausgangscommit: `6b3049c`

## Ursache und Ausgangslage

Rewards und Willkommensgeschenke besaßen bereits `image_url`, den öffentlichen
Bucket `restaurant-media` und tenantgebundene Owner-Storage-Policies. Die beiden
Formulare verwendeten jedoch getrennte kleine Dateifelder und duplizierte
Uploadlogik. WebP war im Bucket noch nicht als zulässiger MIME-Typ eingetragen.

## Geänderte Dateien

- `src/modules/admin/components/OwnerRewardImageUploader.tsx`
- `src/modules/admin/services/ownerRewardImageService.ts`
- `src/modules/admin/pages/RewardsPage.tsx`
- `src/modules/admin/pages/WelcomeGiftsPage.tsx`
- `src/modules/admin/admin-premium.css`
- `tests/owner-premium-rewards.test.mjs`
- `supabase/migrations/20260726001000_owner_reward_image_webp.sql`
- `docs/04_RESTAURANT_PORTAL.md`
- `docs/19_CHANGELOG.md`

## Umsetzung

- Der große Bildbereich öffnet per Klick, Enter oder Leertaste die native
  Dateiauswahl für JPG, PNG und WebP.
- Dateien werden clientseitig auf MIME-Typ und maximal 5 MB geprüft.
- Die lokale Vorschau verwendet eine Object-URL und wird beim Verwerfen oder
  Ersetzen freigegeben.
- Der Upload startet erst beim Speichern des Formulars.
- Objektpfade enthalten Restaurant-ID, fachlichen Ordner, Entitäts-Scope und
  eine zufällige UUID; Original-Dateinamen werden nicht verwendet.
- Schlägt das Speichern nach einem Upload fehl, wird nur das neue Objekt
  bereinigt. Die bestehende Datenbank-URL bleibt unverändert.
- Übersichtskarten und Kundenanzeige verwenden weiterhin das bestehende
  `image_url`-Feld.

## Security und Storage

Der bestehende Bucket und seine Policies werden wiederverwendet. Schreibzugriff
bleibt auf authentifizierte Owner-, Admin- und Manager-Rollen ihres Restaurants
begrenzt. `anon`, Customer-, Staff- und Plattformoberflächen erhalten keine
Upload-Funktion. Die additive Migration erweitert ausschließlich die
Bucket-MIME-Liste um `image/webp`; RLS und Policies werden nicht verändert.

## Validierung

- Typecheck: erfolgreich
- Lint: 0 Fehler, 7 bestehende Warnungen
- Tests: 139/139 erfolgreich
- Build: erfolgreich
- Responsive Komponentenprüfung: 390, 430, 768, 1024 und 1440 px
- Horizontaler Overflow: keiner (`scrollWidth === innerWidth`)
- Aktionsbuttons im Prüfharness: 48 px hoch
- Owner-Routenschutz: anonyme Navigation führt zum Restaurant-Login

## Migration und Live-Grenze

Migration erstellt: Ja.  
Staging-Projekt: `wuxuai-bonus-staging` (`bwhv…qaya`), Production: Nein.  
Dry-Run: ausschließlich `20260726001000_owner_reward_image_webp.sql`.  
Auf Staging angewendet: Ja, am 26.07.2026.  
Lokale/Remote-Migrationen synchron: Ja; keine Remote-only-Version, kein
Versionskonflikt und keine erkannte Drift.

## Authentifizierte Staging-Abnahme

Die neue Owner-UI ist noch uncommitted und wurde auf keine Staging-Web-App
bereitgestellt. In der lokalen App lag außerdem keine authentifizierte
Owner-Sitzung für ein isoliertes Testrestaurant vor. Deshalb wurden keine
Zugangsdaten erfunden, keine Security-Regeln umgangen und keine Live-Ergebnisse
behauptet.

- echter JPG-Upload: nicht durchgeführt
- echter PNG-Upload: nicht durchgeführt
- echter WebP-Upload: nicht durchgeführt
- Reload sowie Logout/Login: nicht durchgeführt
- Datei über 5 MB und falsche Typen: automatisiert geprüft, nicht live geprüft
- Netzwerk-/Storage-/Session-Fehler: im Code und automatisiert geprüft, nicht live simuliert
- Abbrechen und Ersetzen: im Code und automatisiert geprüft, nicht live geprüft
- Tenant-Isolation A/B: Policies geprüft, nicht mit zwei Live-Ownern ausgeführt
- Tastatur: Komponentenprüfung und automatisierter Test bestanden, nicht in authentifizierter Staging-UI
- physisches iPhone Safari: nicht durchgeführt

## Was nicht geändert wurde

- Kundenportal, Mitarbeiterportal und Plattformportal
- Reward-, Punkte-, Einlöse-, Auth- oder Audit-Geschäftslogik
- bestehende Storage-Policies und RLS
- Übersichtskarten

## Offene Risiken

- Die WebP-Bucketfreigabe ist auf Staging aktiv, der echte authentifizierte
  JPG-/PNG-/WebP-Upload ist aber noch nicht nachgewiesen.
- Die Owner-UI muss für den Test lokal mit einer echten Staging-Owner-Sitzung
  oder als kontrollierte Staging-Preview bereitgestellt werden.
- Fehlerfälle, Zwei-Tenant-Test, Logout/Login und physischer iPhone-Safari-Test
  bleiben offene Abnahme-Gates.

Commit erstellt: Nein.  
Status: BLOCKED
