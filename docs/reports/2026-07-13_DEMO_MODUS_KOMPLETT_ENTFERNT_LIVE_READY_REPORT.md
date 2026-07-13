# WUXUAI Bonus V1 – Demo-Modus komplett entfernt Live Ready Report

Datum: 2026-07-13  
Status: NOT READY

## Ursache

Die Live-Test-Version durfte bei fehlender Supabase-Verbindung oder alten lokalen
Runtime-Zweigen noch Demo-Daten verwenden. Besonders kritisch waren aktive
Imports aus `demoData.ts`, Demo-User im Auth-Kontext, Demo-Tenant-Daten,
Demo-KPIs, Demo-Staff-Daten und Demo-Registrierungen.

## Geänderte Dateien

- `src/shared/lib/supabase.ts`
- `src/shared/lib/publicBaseUrl.ts`
- `src/shared/lib/demoData.ts`
- `src/modules/auth/AuthProvider.tsx`
- `src/modules/auth/LoginPage.tsx`
- `src/modules/auth/registerOwnerService.ts`
- `src/modules/tenant/TenantProvider.tsx`
- `src/modules/onboarding/pilotOnboardingService.ts`
- `src/modules/loyalty/loyaltyService.ts`
- `src/modules/rewards/rewardService.ts`
- `src/modules/campaigns/campaignService.ts`
- `src/modules/customer/CustomerPortal.tsx`
- `src/modules/admin/pages/AdminDashboard.tsx`
- `src/modules/admin/pages/LoyaltyPage.tsx`
- `src/modules/admin/pages/QrCenterPage.tsx`
- `src/modules/admin/pages/RestaurantOnboarding.tsx`
- `src/modules/staff/StaffTablet.tsx`
- `src/modules/staff/staffActivityService.ts`
- `src/modules/staff/validateStaffPin.ts`
- `docs/17_CTO_ENTSCHEIDUNGEN.md`
- `docs/19_CHANGELOG.md`
- `docs/21_PRODUCTION_GO_LIVE_PLAN.md`

## Was wurde geändert

- Der aktive lokale Demo-Modus wurde aus der Runtime entfernt.
- `demoUser`, Demo-Login und Demo-Rollen wurden aus `AuthProvider` entfernt.
- Tenant-Loading zeigt keine Demo-Restaurantdaten mehr.
- Onboarding speichert keine Demo-State-Daten mehr in `localStorage`.
- Loyalty-, Rewards-, Campaign-, Dashboard- und Staff-Services werfen bei
  fehlender Supabase-Verbindung eine deutsche Live-Daten-Fehlermeldung.
- `src/shared/lib/demoData.ts` wurde gelöscht.
- Customer Portal zeigt bei unbekanntem Slug eine deutsche Fehlerseite und lädt
  keine Demo-Daten.
- QR Center und Onboarding-Starter-Kit verwenden `VITE_APP_BASE_URL`, wenn
  gesetzt, sonst den aktuellen Origin.
- Cloudflare-Env-Regel dokumentiert:
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, optional `VITE_APP_BASE_URL`.

## Was wurde nicht geändert

- Keine Datenbankänderung.
- Keine RPC-Änderung.
- Keine Migration.
- Keine Tages-PIN-Logik.
- Keine Punkte-Logik.
- Keine Punkteeinlösungs-Logik.
- Keine Willkommensgeschenk-Logik.
- Keine Bonus-Boost-Logik.

## Prüfung

Code-Suche:

```text
rg "demoData|demoRestaurant|demoBranding|demoUser|Kai Sushi|isLocalDemoMode|wuxuai-demo-state|VITE_USE_DEMO_DATA|VITE_DEMO_MODE|demo-|demo|fake|dummy" src package.json vite.config.ts index.html
```

Ergebnis: keine Treffer.

Bundle-Suche:

```text
rg "Kai Sushi|demoData|demoRestaurant|demoBranding|demoUser|isLocalDemoMode|wuxuai-demo-state|demo-|Demo-Modus|demo@example|fake|dummy" dist
```

Ergebnis: keine Treffer.

Build:

```text
npm run build
```

Ergebnis: erfolgreich.

## Live-Prüfung

Live-URL:

```text
https://wuxuai-restaurant-bonus-os.dongdongwu4899.workers.dev/
```

Ergebnis:

- HTTP 200 erreichbar.
- Live-HTML verweist noch auf alte Assets, z. B. `index-BOgUQdSo.js`.
- Lokaler neuer Build erzeugt andere Assets, z. B. `index-BM1hqVYI.js`.

Bewertung:

Der neue Code ist lokal gebaut, aber die Worker-Live-Version ist noch nicht mit
diesem Build verifiziert. Deshalb kein LOCK.

## Migration

Keine Migration erstellt.

## RLS / Security

Keine RLS-Änderung. Sicherheitsprüfung im Scope:

- Keine Service Role im Frontend ergänzt.
- `SUPABASE_ACCESS_TOKEN` bleibt nicht Teil der Live-App.
- Customer-Slug-Laden bleibt RPC-/Supabase-basiert.
- Keine Demo-Daten als Ersatz für fehlende RLS- oder Verbindungsdaten.

## Offene Risiken

- Live-Deployment des neuen Builds wurde nicht durchgeführt.
- Cloudflare-Env-Variablen müssen live gesetzt/geprüft werden:
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, optional `VITE_APP_BASE_URL`.
- Erst nach Deployment muss `/w/akakiko-hietzing` live erneut gegen Supabase
  geprüft werden.

## Status

NOT READY
