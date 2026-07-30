# 2026-07-13 Tenant Isolation Neuer Account / Alte Daten Fix Report

## Ursache

Der Bug entsteht durch eine Kombination aus zu weichem Frontend-Tenant-State und Demo-Fallbacks:

1. `TenantProvider` hielt beim User-Wechsel den alten `restaurants`-/`activeRestaurantId`-/`branding`-State, bis der neue Tenant-Load abgeschlossen war.
2. Alte asynchrone Tenant-Loads konnten nach einem User-Wechsel noch später zurückschreiben.
3. Restaurants wurden bisher breit aus `restaurants` geladen und erst im Frontend über `owner_id` und `restaurant_members` gefiltert.
4. Dashboard- und Service-Fallbacks konnten ohne Supabase Demo-KPIs anzeigen. Die Beispielwerte `3`, `180`, `1` entsprechen solchen Demo-Fallbacks.

Das ist für Multi-Tenant-Sicherheit kritisch, weil ein neuer Account niemals alte Restaurantdaten sehen darf, auch nicht kurzzeitig während Ladezuständen oder durch lokale/browserseitige Altzustände.

## Geänderte Dateien

- `src/modules/tenant/TenantProvider.tsx`
- `src/modules/admin/pages/AdminDashboard.tsx`
- `src/modules/loyalty/loyaltyService.ts`
- `src/modules/rewards/rewardService.ts`
- `src/modules/auth/AuthProvider.tsx`
- `src/modules/auth/LoginPage.tsx`
- `src/modules/auth/registerOwnerService.ts`
- `src/modules/onboarding/pilotOnboardingService.ts`
- `src/modules/campaigns/campaignService.ts`
- `src/shared/lib/supabase.ts`
- `docs/19_CHANGELOG.md`

## Betroffene Queries

### TenantProvider

Vorher:

- `restaurant_members` wurde für den User geladen.
- `restaurants` wurde breit geladen und danach im Frontend gefiltert.

Nachher:

- `restaurant_members` wird weiterhin für den aktuellen User geladen.
- `restaurants` wird serverseitig eingeschränkt geladen:
  - eigene Restaurants: `.eq("owner_id", userId)`
  - Mitgliedschaften: `.in("id", memberRestaurantIds)`
- Ergebnis wird dedupliziert.
- Nur Restaurants mit `owner_id === userId` oder expliziter Mitgliedschaft werden in den Tenant-State übernommen.

### Dashboard

Geprüft:

- `Neue Mitglieder heute`: filtert nach `customers.restaurant_id`.
- `Vergebene Bonuspunkte heute`: läuft über `loadRewardKpis(restaurantId)` und filtert nach `points_transactions.restaurant_id`.
- `Eingelöste Punkteeinlösungen`: filtert nach `customer_rewards.restaurant_id` und `coupon_redemptions.restaurant_id`.
- `Bonus Boost aktiv`: läuft über `get_bonus_boost_kpis(input_restaurant_id)`.
- `Wiederkehrende Gäste`: läuft über `get_bonus_boost_kpis(input_restaurant_id)`.

Zusätzlich wurde `loadNewMembersToday` gehärtet: Demo-Kunden werden nur noch im lokalen Demo-Modus verwendet.

## Betroffene Tabellen / RLS

Code- und Migrationsprüfung:

- `restaurants`
- `restaurant_members`
- `restaurant_branding`
- `customers`
- `points_transactions`
- `stamp_transactions`
- `rewards`
- `customer_rewards`
- `referrals`
- `customer_bonus_boosts`
- `restaurant_daily_pins`
- `audit_log`

Relevante bestehende RLS-Basis:

- `restaurants member select`: `public.is_restaurant_member(id) or owner_id = auth.uid()`
- `restaurant_members select`: `public.is_restaurant_member(restaurant_id)`
- `customers admin manage`: `public.is_restaurant_admin(restaurant_id)`
- `points_transactions member select`: `public.is_restaurant_member(restaurant_id)`
- `rewards member select`: spätere Hardening-Migration entfernt öffentlichen `active = true` Tabellen-Select
- `customer_bonus_boosts admin/member`: über `public.is_restaurant_member(restaurant_id)`
- `restaurant_daily_pins member select`: über `public.is_restaurant_member(restaurant_id)`

Keine neue Migration erstellt, weil die vorhandenen Migrationen RLS für die betroffenen Kernpfade bereits definieren und der konkrete Leckpfad im Frontend-Tenant-State sowie Demo-Fallback lag.

## TenantProvider Analyse

Fix:

- Beim User-Wechsel werden `restaurants`, `activeRestaurantId` und `branding` sofort geleert.
- Ein `tenantLoadRequestId` verhindert, dass ein alter asynchroner Load später fremde/alte Daten in den State schreibt.
- `setActiveRestaurantId` ignoriert IDs, die nicht in der aktuellen erlaubten Restaurantliste stehen.
- `refreshTenants` startet ebenfalls einen neuen Request und nutzt dieselbe Schutzlogik.

Damit kann User B im selben Browser nicht den alten State von User A weiterverwenden.

## localStorage Analyse

Gefunden:

- `wuxuai-demo-state` wird nur im lokalen Demo-Modus gelesen.
- Kein produktiver `selectedRestaurant`-localStorage wurde im TenantProvider gefunden.
- Customer-Token-Storage ist slug-basiert und gehört zum Customer Portal, nicht zum Restaurant-Owner-Tenant.

Fix:

- Demo-State bleibt lokal auf `isLocalDemoMode` begrenzt.
- Aktive Restaurant-ID wird nicht aus localStorage übernommen.
- Extern gesetzte Restaurant-IDs werden gegen die aktuelle Tenant-Liste geprüft.

## Dashboard KPI Fix

- Dashboard-KPIs bleiben initial 0.
- Bei Ladefehlern werden KPIs auf 0 gesetzt, nicht auf Demo-Werte.
- `loadNewMembersToday` gibt Demo-Kunden nur im lokalen Demo-Modus zurück.
- `loadRewardKpis` und `loadBonusBoostKpis` wurden bereits auf lokalen Demo-Modus begrenzt.

## Demo-Fallback Prüfung

Geändert / gehärtet:

- Auth-Demo-User nur lokal
- Tenant-Demo-Restaurant nur lokal
- Onboarding-Demo nur lokal
- Loyalty-Demo-Kunden/-Regeln/-Boosts nur lokal
- Reward-Demo-Angebote/-KPIs nur lokal
- Campaign-Demo-Fallback nur lokal

`Kai Sushi` bleibt in `src/shared/lib/demoData.ts` als lokale Entwicklungsdemo erhalten, darf aber im Supabase-/Live-Betrieb nicht mehr automatisch verwendet werden.

## User-Wechsel-Test

Code-seitig geprüft:

- User-Wechsel triggert sofortiges Leeren des Tenant-State.
- Alter Tenant-Load wird über `tenantLoadRequestId` unwirksam.
- Fremde Restaurant-ID kann nicht über `setActiveRestaurantId` aktiviert werden.

Nicht live geprüft:

- Kein Staging-Owner A/B Login in dieser Umgebung verfügbar.

## Neuer Account Test

Code-seitig erwartetes Verhalten:

- Neuer Owner lädt nur `restaurants.owner_id = eigener User`.
- Wenn kein eigenes Restaurant oder keine Mitgliedschaft vorhanden ist, bleibt `activeRestaurant` leer.
- Dashboard-KPIs bleiben 0 oder die Seite bleibt im Setup-/Leerezustand.

Nicht live geprüft:

- Kein neuer Staging-Testaccount angelegt.
- Kein neuer Restaurant-Onboarding-Flow gegen Staging ausgeführt.

## RLS / Security Test

Code-/Migrationsprüfung durchgeführt.

Nicht live geprüft:

- Fremder authenticated User gegen fremde `restaurant_id`
- anon direkter Tabellenzugriff
- Owner A sieht nicht Restaurant B
- Staff sieht nicht Restaurant B

Grund: In dieser Umgebung wurden keine Staging-Zugangsdaten und kein Supabase-CLI-Livezugriff verwendet.

## Build Ergebnis

`npm run build` erfolgreich.

```text
tsc -b && vite build
✓ built
```

## Offene Risiken

1. **Kritisch:** Staging-User-Wechsel A → B wurde nicht live geprüft.
2. **Kritisch:** Neuer Account / neues Restaurant wurde nicht live gegen Supabase geprüft.
3. **Kritisch:** RLS wurde nicht live mit fremdem authenticated User geprüft.
4. **Mittel:** Lokale Demo-Daten bleiben für lokale Entwicklung im Code vorhanden, sind aber an `isLocalDemoMode` gekoppelt.

## Status

NOT READY

Grund: Code-Fix und Build sind erfolgreich, aber die geforderten Staging-/RLS-/User-Wechsel-Tests wurden nicht live durchgeführt. Kein FINAL LOCK ohne echte Multi-Tenant-Liveprüfung.
