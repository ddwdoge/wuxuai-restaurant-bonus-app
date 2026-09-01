# Restaurant-Slug-Duplikat beim Onboarding-Abschluss

Datum: 2026-07-29  
Branch: `codex/v13-legal-maps-hardening`

## Ursache

Der Button **„Restaurant starten“** ruft in `RestaurantOnboarding.tsx` den Service
`completePilotOnboarding` auf. Dieser Service verwendete bisher zwei Pfade:

- bei vorhandener `restaurantId`: `UPDATE public.restaurants`
- bei fehlender `restaurantId`: `INSERT INTO public.restaurants`

Zusätzlich erzeugte die Oberfläche beim Abschluss den Slug erneut aus dem aktuell
eingegebenen Restaurantnamen und schrieb ihn in den Restaurantdatensatz. Dadurch
konnte sowohl der INSERT-Fallback als auch ein UPDATE mit neu erzeugtem Slug gegen
`restaurants_slug_key` laufen und PostgreSQL-Fehler `23505` auslösen.

## Geänderte Dateien

- `src/modules/admin/pages/RestaurantOnboarding.tsx`
- `src/modules/onboarding/pilotOnboardingService.ts`
- `src/modules/onboarding/restaurantOnboardingActivation.mjs`
- `src/modules/onboarding/restaurantOnboardingActivation.d.mts`
- `tests/restaurant-slug-duplicate-fix.test.mjs`
- `docs/reports/2026-07-29_RESTAURANT_SLUG_DUPLICATE_FIX.md`

## Was wurde geändert

1. Der Onboarding-Abschluss verlangt zwingend die bereits vorhandene
   `restaurantId` aus dem Tenant-Kontext.
2. `completePilotOnboarding` enthält keinen `restaurants`-INSERT mehr.
3. Das bestehende Restaurant wird am Ende über `UPDATE ... WHERE id = restaurantId`
   auf `status = 'active'` und `onboarding_status = 'completed'` gesetzt.
4. Der Aktivierungs-Patch enthält weder `slug` noch `owner_id`; der bestehende Slug
   bleibt unverändert.
5. QR-URLs im Starter-Kit verwenden `activeRestaurant.slug` und keine lokale
   Neuberechnung aus dem Namen.
6. Ein synchroner In-Flight-Guard blockiert Doppelklicks vor dem zweiten Request.
7. Bereits abgeschlossene Aktivierungen werden nur gelesen und nicht erneut
   ausgeführt.
8. Ein alter `ready`-Zwischenstand wird nochmals vollständig abgearbeitet, damit
   frühere Teilfehler repariert werden können.
9. Branding und Loyalty Settings bleiben Upserts. Loyalty Rules, Starter Rewards
   und Staff-Datensätze werden bei einem Retry anhand stabiler fachlicher Schlüssel
   wiederverwendet beziehungsweise aktualisiert.
10. Der bestehende Legal-Generator dedupliziert Dokumentversionen anhand des
    Dokument-Hashes; er bleibt vor dem finalen Aktivierungs-UPDATE.

## Inventur der Restaurant-Erzeugung

Aktive Frontend-Onboarding-Aktivierung:

- kein `INSERT INTO restaurants`
- kein `supabase.from("restaurants").insert(...)`
- kein `createRestaurant`, `createRestaurantDraft`, `duplicateRestaurant` oder
  `ensureRestaurant` im Abschlussflow

Migrationen mit Restaurant-INSERT:

- `20260706001000_owner_registration_trial.sql` (historische RPC-Version)
- `20260706006000_fix_owner_trial_subscription_upsert.sql` (historische RPC-Version)
- `20260713004000_live_go_hardening_rate_limit_owner_race.sql` (aktuelle RPC-Version)

Die aktuelle Funktion `start_restaurant_owner_trial` legt nur dann ein Restaurant
an, wenn für den Owner noch keines existiert. Andernfalls aktualisiert sie den
vorhandenen Datensatz. Das ist der vorgesehene Erstregistrierungsflow und wurde
nicht verändert.

## Tests

Neue Regressionstests:

- neues Restaurant bleibt Aufgabe des idempotenten Owner-Registrierungs-RPC
- Onboarding ohne bestehende Restaurant-ID wird blockiert
- bestehendes Restaurant wird aktiviert
- Slug bleibt bei Aktivierung unverändert
- erneute Aktivierung ist idempotent
- Doppelklick wird synchron blockiert
- Rules und Rewards werden anhand stabiler Schlüssel wiederverwendet

Ergebnisse:

- Typecheck: erfolgreich
- Lint: 0 Fehler, 6 bestehende Warnungen
- Tests: 324/324 erfolgreich
- Build: erfolgreich
- `git diff --check`: erfolgreich

## Was wurde nicht geändert

- keine Datenbankmigration
- keine RPC-Signatur oder RPC-Logik
- keine RLS- oder Security-Policy
- keine Customer-, Staff-, Punkte-, Reward- oder Tages-PIN-Logik
- kein Push, Merge oder Deployment

## Risiken

Der Codepfad und die Regressionen sind lokal geprüft. Ein authentifizierter echter
Onboarding-Abschluss gegen Staging wurde in diesem Auftrag nicht ausgeführt. Daher
ist dies ein Code-Lock, kein Final-Lock.

## Status

`CODE LOCK`
