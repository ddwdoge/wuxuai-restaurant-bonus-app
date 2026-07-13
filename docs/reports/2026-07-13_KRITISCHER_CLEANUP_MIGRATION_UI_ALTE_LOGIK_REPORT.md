# WUXUAI Bonus V1 - Kritischer Cleanup Migration, UI-Text und alte Logik

Datum: 2026-07-13  
Status: **LOCK**

## Gelesene Bible-Dateien

- `AGENTS.md`
- `docs/00_START_HIER.md`
- `docs/18_CODEX_REGELN.md`
- `docs/19_CHANGELOG.md`
- `docs/14_DATABASE_ARCHITEKTUR.md`
- `docs/23_API_RPC_REGELN.md`
- `docs/24_SECURITY_PRIVACY.md`
- `docs/04_RESTAURANT_PORTAL.md`
- `docs/08_FLOW_01_ONBOARDING.md`
- `docs/reports/2026-07-13_APP_BEWERTUNG_BUG_VERBINDUNG_WORKFLOW_TEST_REPORT.md`

Hinweis:

`docs/21_CODEX_SELBSTKONTROLL_LOOP.md` existiert in diesem Repository nicht. Die Selbstkontroll-Regeln wurden aus `AGENTS.md`, `docs/17_CTO_ENTSCHEIDUNGEN.md` und `docs/18_CODEX_REGELN.md` angewendet.

## Ursache NOT READY

Der Audit vom 2026-07-13 fand drei technische Blocker:

1. zwei Supabase-Migrationen hatten dieselbe Versionsnummer `20260712001000`
2. die öffentliche Startseite enthielt den englischen sichtbaren UI-Text `Customer QR / Bonus`
3. `loadSetupChecklist` nutzte noch Campaign-/Coupon-Pfade als V1-Setup-Kriterium

Zusätzlich war der Staging-Migrationsstand zuerst nicht über die Supabase CLI prüfbar, weil kein `SUPABASE_ACCESS_TOKEN` vorhanden war. Nach Bereitstellung eines temporären Tokens wurde `db push` erfolgreich ausgeführt.

## Doppelte Migration Analyse

Vorher:

```text
supabase/migrations/20260712001000_loyalty_redemption_return_rate.sql
supabase/migrations/20260712001000_welcome_gifts_status_update_fix.sql
```

Aus dem Report `2026-07-12_WILLKOMMENSGESCHENKE_UNIQUE_CONSTRAINT_FIX_REPORT.md`:

- `20260712001000_welcome_gifts_status_update_fix.sql` wurde auf Staging angewendet.
- Remote-Migrationsliste bestätigte `20260712001000`.
- Der Welcome-Gift-Unique-Constraint-Fix hat Status `FINAL LOCK`.

Aus dem Report `2026-07-12_PUNKTEEINLOESUNG_PROZENTLOGIK_DURCHGANG_REPORT.md`:

- `20260712001000_loyalty_redemption_return_rate.sql` wurde lokal erstellt.
- Migration auf Staging angewendet: Nein.

## Lösung Migrationstimestamp

Die bereits auf Staging angewendete Migration wurde nicht umbenannt:

```text
supabase/migrations/20260712001000_welcome_gifts_status_update_fix.sql
```

Die nicht auf Staging bestätigte Einlösequoten-Migration wurde auf einen neuen eindeutigen Timestamp verschoben:

```text
supabase/migrations/20260712002000_loyalty_redemption_return_rate.sql
```

Lokale Prüfung:

```text
ls supabase/migrations | awk -F_ '{print $1}' | sort | uniq -d
```

Ergebnis:

```text
keine Ausgabe
```

Damit existiert im Repository kein doppelter Migrationstimestamp mehr.

## Supabase Migration Status

Geprüft:

```text
npx supabase migration list
npx supabase db push --include-all
```

Zwischenergebnis ohne Token:

```text
Access token not provided. Supply an access token by running supabase login or setting the SUPABASE_ACCESS_TOKEN environment variable.
```

Ergebnis nach temporärer Token-Bereitstellung:

```text
Applying migration 20260712002000_loyalty_redemption_return_rate.sql...
Finished supabase db push.
```

Bewertung:

- Supabase CLI und Projektlink sind grundsätzlich vorhanden.
- `db push` wurde nach Token-Bereitstellung erfolgreich ausgeführt.
- Die lokale Versionskollision ist behoben.
- Die neue Einlösequoten-Migration wurde auf Staging angewendet.

## UI-Text-Fix

Geändert:

```text
Customer QR / Bonus
```

zu:

```text
Bonus-QR für Gäste
```

Datei:

```text
src/modules/public/PublicHome.tsx
```

Prüfung:

```text
rg -n "Customer QR / Bonus|Customer QR" src/modules/public
```

Ergebnis:

```text
keine Treffer
```

## Weitere UI-Texte geprüft

Geprüft in den betroffenen Bereichen:

- `src/modules/public`
- `src/modules/admin/pages/RestaurantOnboarding.tsx`
- `src/app/App.tsx`

Gefunden:

- kein sichtbarer Treffer für `Customer QR / Bonus`
- keine neue englische UI durch diesen Cleanup

Nicht geändert:

- interne Funktionsnamen
- technische Code-Bezeichner
- Dokumentationsstellen, die den entfernten Fehler bewusst zitieren

## loadSetupChecklist Analyse

Vorher nutzte `loadSetupChecklist`:

- `demoCampaigns`
- `demoCoupons`
- Tabelle `coupons`
- Tabelle `campaigns`
- `firstCampaignActive`
- `qrReady: activeCampaigns > 0`

Problem:

V1 hat Aktionen/Kampagnen aus dem Onboarding entfernt. QR-Bereitschaft darf nicht von aktiven Kampagnen abhängen.

## Entfernte / isolierte alte Logik

Geändert in:

```text
src/modules/onboarding/pilotOnboardingService.ts
```

Neu:

- `loadSetupChecklist` fragt keine `campaigns` mehr ab.
- `loadSetupChecklist` fragt keine `coupons` mehr ab.
- `firstCampaignActive` wurde aus `SetupChecklist` entfernt.
- `firstRewardCreated` zählt nur aktive Starter-Rewards.
- `qrReady` ist nicht mehr an aktive Campaigns gekoppelt.

Zusätzlich in:

```text
src/modules/admin/pages/RestaurantOnboarding.tsx
```

- Onboarding nutzt keinen `slugifyCampaign`-Import mehr.
- Ein lokaler `slugifyRestaurant`-Helfer erzeugt den Restaurant-Slug.
- Flow 01 hängt dadurch nicht mehr an `campaignService`.

Prüfung:

```text
rg -n "slugifyCampaign|campaignService|Customer QR / Bonus|firstCampaignActive|demoCampaigns|demoCoupons|activeCampaigns|campaigns\\.count|coupons\\.count" src/modules/onboarding src/modules/public src/modules/admin/pages/RestaurantOnboarding.tsx
```

Ergebnis:

```text
keine Treffer
```

## Geänderte Dateien

- `src/modules/public/PublicHome.tsx`
- `src/modules/onboarding/pilotOnboardingService.ts`
- `src/modules/admin/pages/RestaurantOnboarding.tsx`
- `supabase/migrations/20260712002000_loyalty_redemption_return_rate.sql`
- `supabase/migrations/20260712001000_loyalty_redemption_return_rate.sql` entfernt durch Umbenennung
- `docs/19_CHANGELOG.md`
- `docs/reports/2026-07-13_KRITISCHER_CLEANUP_MIGRATION_UI_ALTE_LOGIK_REPORT.md`

Hinweis:

Im Arbeitsbaum existieren bereits ältere uncommitted Änderungen aus vorherigen Onboarding-Fixes. Diese wurden nicht zurückgesetzt.

## Was wurde nicht geändert

- keine Tabellen gelöscht
- keine RLS-Policy geändert
- keine RPC-Logik geändert
- keine Tages-PIN-Logik geändert
- keine Punkte-Logik geändert
- keine Willkommensgeschenk-Zufallslogik geändert
- keine Bonus-Boost-Logik geändert
- keine Aktionen oder Kampagnen zurückgebracht
- keine vollständigen Legacy-Module gelöscht

## Build Ergebnis

Ausgeführt:

```text
npm run build
```

Ergebnis:

```text
erfolgreich
```

## Staging-Migration Ergebnis

Angewendet:

```text
20260712002000_loyalty_redemption_return_rate.sql
```

Ergebnis:

```text
Finished supabase db push.
```

Kein `FINAL LOCK`, weil dieser Cleanup nicht den kompletten Live-E2E-Pilotflow getestet hat.

## Offene Live-Test-Risiken

Diese Flows brauchen weiterhin echten Staging-Test:

- Registrierung → Kundenkonto
- Willkommensgeschenk locked/unlocked
- Punkte sammeln mit Tages-PIN
- Tages-PIN Brute-Force-Schutz und Tageslimit
- Punkteeinlösung
- Customer Portal nach Einlösung
- Staff Portal Prüfung
- RLS/Security mit echten Rollen

## Validierung

- Doppelte Migrationstimestamp lokal entfernt: Ja
- Supabase Migrationshistorie live geprüft: Teilweise über `db push` bestätigt
- `db push` versucht: Ja
- `db push` erfolgreich: Ja
- Englischer UI-Text entfernt: Ja
- Weitere UI-Texte im betroffenen Bereich geprüft: Ja
- `loadSetupChecklist` ohne Campaign/Coupon-Pfade: Ja
- Alte V1-fremde Setup-Logik isoliert: Ja
- Build erfolgreich: Ja

## Status

**LOCK**

Begründung:

Der technische Cleanup ist umgesetzt, der Build ist erfolgreich und die offene Migration wurde auf Supabase Staging angewendet. Für `FINAL LOCK` bleiben die im Report genannten vollständigen Live-E2E-Flows separat offen.
