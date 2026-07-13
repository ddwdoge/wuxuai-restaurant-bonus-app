# 2026-07-13 Live Environment Demo Mode / Slug Fix Report

## Ursache

Der vorherige Live-E2E-Test hat gezeigt, dass die Workers-Live-App unter `https://wuxuai-restaurant-bonus-os.dongdongwu4899.workers.dev` im Demo-/Fallback-Modus lief:

- `/login` zeigte `Demo-Modus aktiv.`
- `/admin/settings` zeigte das Demo-Restaurant `Kai Sushi`.
- `/w/akakiko-hietzing` und `/customer/akakiko-hietzing` konnten keine echten Restaurantdaten laden.
- Owner-/Staff-/QR-/RPC-Flows waren dadurch nicht live prüfbar.

Technische Ursache im Code: Fehlende oder ungültige Supabase-Umgebungsvariablen führten bisher nicht nur lokal, sondern auch im Production-Build zu Demo-User, Demo-Tenant und Demo-Service-Fallbacks.

## Gelesene Grundlagen

- `AGENTS.md`
- `docs/00_START_HIER.md`
- `docs/04_RESTAURANT_PORTAL.md`
- `docs/05_CUSTOMER_PORTAL.md`
- `docs/06_STAFF_PORTAL.md`
- `docs/09_FLOW_02_GAST_WERDEN.md`
- `docs/11_FLOW_04_PUNKTE_SAMMELN.md`
- `docs/13_SMART_REWARD_ENGINE.md`
- `docs/18_CODEX_REGELN.md`
- `docs/reports/2026-07-13_LIVE_APP_E2E_WORKFLOW_BUG_TEST_REPORT.md`

Hinweis: `docs/21_CODEX_SELBSTKONTROLL_LOOP.md` ist im Repository nicht vorhanden. Die Selbstkontroll-Regeln stehen in `AGENTS.md`.

## Geänderte Dateien

- `src/shared/lib/supabase.ts`
- `src/modules/auth/AuthProvider.tsx`
- `src/modules/auth/LoginPage.tsx`
- `src/modules/auth/registerOwnerService.ts`
- `src/modules/tenant/TenantProvider.tsx`
- `src/modules/onboarding/pilotOnboardingService.ts`
- `src/modules/loyalty/loyaltyService.ts`
- `src/modules/rewards/rewardService.ts`
- `src/modules/campaigns/campaignService.ts`

## Was wurde geändert

- Neuer zentraler Zustand `isLocalDemoMode`: Demo-Modus ist nur noch erlaubt, wenn Supabase nicht konfiguriert ist und die App im lokalen Vite-Dev-Modus läuft.
- Neue deutsche Fehlermeldung für Live/Production ohne Supabase:
  `Live-Daten konnten nicht geladen werden. Bitte prüfe die Supabase-Verbindung.`
- Auth-Fallback gehärtet:
  - kein Demo-User mehr in Production ohne Supabase
  - keine Owner-Rolle mehr in Production ohne Supabase
  - keine Platform-Rolle mehr in Production ohne Supabase
- Login gehärtet:
  - Demo-E-Mail nur noch im lokalen Demo-Modus
  - Production ohne Supabase zeigt Live-Daten-Fehler statt Demo-Modus
  - Anmelden-Button wird bei fehlender Live-Verbindung deaktiviert
- Registrierung gehärtet:
  - lokale Demo bleibt möglich
  - Production ohne Supabase erstellt keinen Fake-Owner und kein Fake-Restaurant
- Tenant-Fallback gehärtet:
  - `Kai Sushi` wird nur noch im lokalen Demo-Modus geladen
  - Production ohne Supabase setzt keine Demo-Restaurants
- Onboarding-Fallback gehärtet:
  - Demo-Onboarding nur lokal
  - Production ohne Supabase wirft klare Live-Daten-Fehler
- Customer-/Staff-/Reward-relevante Service-Fallbacks gehärtet:
  - Demo-Kunden, Demo-Punkte, Demo-Punkteeinlösungen und Demo-Referrals werden nur noch im lokalen Demo-Modus zurückgegeben
  - Production ohne Supabase liefert keine Fake-Daten mehr
- Campaign-Service als alter V1-Restpfad abgesichert:
  - keine Public-Campaign-Demo-Daten in Production ohne Supabase

## Was wurde nicht geändert

- Keine neue Produktlogik
- Keine Datenbankänderung
- Keine Migration
- Keine RPC-Änderung
- Keine RLS-Änderung
- Keine QR-, Tages-PIN-, Punkte-, Punkteeinlösungs-, Willkommensgeschenk- oder Bonus-Boost-Logik
- Kein Cloudflare-Deployment aus diesem Workspace
- Keine Secrets wurden gelesen oder in Dateien geschrieben

## Env-Konfiguration geprüft

Code-seitig geprüft:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `isSupabaseConfigured`
- `import.meta.env.DEV`
- Demo-/Fallback-Nutzung in Auth, Tenant, Onboarding, Loyalty, Rewards und Campaigns

Workspace-Befund:

- `.env.local` existiert lokal, wurde nicht geöffnet und nicht exportiert.
- Es gibt keine `wrangler.toml`.
- Es gibt keinen `deploy`-, `wrangler`- oder `pages deploy`-Script in `package.json`.
- Cloudflare Workers/Pages-Variablen konnten aus diesem Workspace nicht direkt eingesehen werden.

## Cloudflare / Workers Variablen

Nicht vollständig prüfbar.

Begründung:

- Keine Cloudflare-Projektkonfiguration im Repository gefunden.
- Keine deploybare Workers/Pages-Konfiguration im Workspace vorhanden.
- Ohne Cloudflare-Projektzugriff kann nicht verifiziert werden, ob `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` in der Live-Umgebung gesetzt sind.

## Echter Restaurant-Slug

Nicht erfolgreich live verifiziert.

Der vorherige Live-E2E-Test zeigte:

- `/w/akakiko-hietzing` lädt kein echtes Restaurant.
- `/customer/akakiko-hietzing` lädt kein echtes Restaurant.

Dieser Code-Fix verhindert Demo-Fallbacks, ersetzt aber keinen fehlenden Supabase-/Cloudflare-Live-Env-Deploy.

## Customer Portal Ergebnis

Code-seitig:

- Customer Portal nutzt weiterhin Supabase RPC `get_public_customer_portal`.
- Ohne Supabase gibt es keinen Demo-Fallback auf `Kai Sushi`.
- Bei fehlender Supabase-Konfiguration wird kein Fake-Kunde erzeugt.

Live:

- Nicht erfolgreich neu verifiziert, weil kein Live-Deploy aus diesem Workspace durchgeführt wurde.

## QR Center Link Ergebnis

Nicht live prüfbar.

Begründung:

- Owner/Admin-Zugang wurde nicht bereitgestellt.
- Live-App war laut vorherigem E2E-Test im Demo-Fallback.
- QR Center konnte dadurch nicht gegen echte Supabase-Daten geprüft werden.

## Owner / Staff Zugang Ergebnis

Nicht prüfbar.

Begründung:

- Keine Staging-Zugangsdaten für Owner/Admin/Staff im Workspace.
- Kein Fake-Login gebaut.
- Kein Demo-Login mehr für Production vorgesehen.

## Supabase RPC Ergebnis

Nicht live geprüft.

Betroffene relevante RPCs bleiben im Code angebunden:

- `register_restaurant_customer`
- `get_public_customer_portal`
- `get_today_restaurant_pin`
- `collect_bonus_points`
- `redeem_customer_reward`
- `create_referral_link`
- `get_public_referral`
- `register_referral_customer`

Ohne Live-Supabase-Env-/Deployment-Nachweis kann keine echte RPC-Erreichbarkeit bestätigt werden.

## RLS Grundprüfung

Code-seitig keine direkte Public-Table-Umstellung vorgenommen.

Nicht live geprüft:

- anon-Zugriff
- fremder authenticated User
- Owner nur eigenes Restaurant
- Tages-PIN nicht öffentlich lesbar

## Build Ergebnis

`npm run build` erfolgreich.

Letzter Build:

```text
tsc -b && vite build
✓ built
```

## Sicherheitsprüfung

- Kein Supabase Service Role Key im Frontend eingeführt.
- Kein Supabase-Access-Token in `AGENTS.md`, `docs`, `src`, `supabase`, `package.json` oder `package-lock.json` gefunden.
- `.env.local` wurde nicht gelesen und wird nicht exportiert.
- Production ohne Supabase zeigt keine Demo-Daten mehr, sondern stoppt mit Fehler/leerem Auth-Zustand.

## Offene Risiken

1. **Kritisch:** Live-App wurde nach dem Code-Fix nicht deployed. Die Workers-URL kann weiterhin den alten Build ausliefern.
2. **Kritisch:** Cloudflare Workers/Pages Variablen konnten nicht geprüft werden.
3. **Kritisch:** Echter Slug `akakiko-hietzing` wurde nach Deployment nicht live erfolgreich verifiziert.
4. **Kritisch:** Owner/Admin/Staff-Zugang fehlt für Live-Portal- und QR-Center-Prüfung.
5. **Kritisch:** Supabase RPCs und RLS wurden nicht live gegen Staging geprüft.
6. **Mittel:** Einige lokale Demo-Daten bleiben für lokale Entwicklung im Code vorhanden. Sie sind jetzt an `isLocalDemoMode` gekoppelt und sollten nicht in Production aktiv werden.

## Status

NOT READY

Grund: Code-Fix ist gebaut, aber Live-Deployment, Cloudflare-Env, echter Customer-Slug, RPCs, Owner/Staff-Zugang und RLS wurden nicht erfolgreich live verifiziert.
