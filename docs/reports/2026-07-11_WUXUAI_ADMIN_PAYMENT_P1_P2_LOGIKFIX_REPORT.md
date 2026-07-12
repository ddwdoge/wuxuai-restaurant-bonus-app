# WUXUAI Admin Payment P1/P2 Logikfix Report

Datum: 2026-07-11  
Status: NOT READY

## Ursache

Die Analyse der WUXUAI Admin Trial-/Payment-Basis hatte mehrere Logikfehler gefunden: Restaurantzeilen konnten durch Branch-Joins vervielfacht werden, Payment-Aktionen veränderten zu viele Statusfelder, `current_period_end` wurde bei Admin-Aktionen zu aggressiv überschrieben, Pausieren konnte Customer-/Staff-Flows indirekt zerstören, Plattformrollen und Restaurantrollen waren nicht sauber getrennt und Read-only-Rollen sahen Schreibaktionen.

## Geänderte Dateien

- `src/modules/auth/AuthProvider.tsx`
- `src/modules/auth/ProtectedRoute.tsx`
- `src/app/App.tsx`
- `src/modules/platform/PlatformAdminPage.tsx`
- `src/modules/platform/platformAdminService.ts`
- `supabase/migrations/20260711008000_platform_admin_payment_logic_fix.sql`
- `docs/07_WUXUAI_ADMIN.md`
- `docs/17_CTO_ENTSCHEIDUNGEN.md`
- `docs/19_CHANGELOG.md`

## Neue Migration

- `20260711008000_platform_admin_payment_logic_fix.sql`

Die Migration ist additiv und ersetzt keine bestehende Migration.

## Branch-Fan-out Fix

`get_platform_restaurants()` nutzt keinen unkontrollierten Branch-Join mehr. Stattdessen wird per `lateral join` genau eine Branch gewählt: bevorzugt `primary_branch_id`, sonst die älteste Branch als Fallback. Dadurch erscheint jedes Restaurant in der Plattformliste genau einmal und Summary-KPIs werden nicht durch mehrere Branches vervielfacht.

## `current_period_end` Fix

`update_platform_restaurant_subscription()` verändert `current_period_end` und `current_period_ends_at` bei normalen Admin-Aktionen nicht mehr. Payment-Status, Abo-Status und Pausieren überschreiben das Periodenende nicht. Trial-Verlängerung verändert nur `trial_ends_at`.

## Payment Button Trennung

Die UI-Aktionen sind getrennt:

- `Restaurant aktivieren` setzt den Abo-Status auf `active` und aktiviert das Restaurant administrativ.
- `Zahlung manuell bestätigt` setzt nur den Zahlungsstatus auf `manual`.
- `Restaurant pausieren` setzt nur den Abo-Status auf `paused`.
- `Testphase verlängern` setzt nur eine Trial-Verlängerung.

Die alte Vermischung von Aktivieren und Bezahlt-Setzen wurde entfernt.

## Pausieren Verhalten

Pausieren setzt in V1 nicht mehr automatisch `restaurants.status = suspended`. Das Restaurant bleibt für Customer-/Staff-Flows auffindbar. Die Pause wird über `branch_subscriptions.subscription_status = paused`, `paused_at`, `locked_at` und optional `lock_reason` abgebildet.

## Rollenmodell Fix

`AuthProvider` führt Restaurantrolle und Plattformrolle getrennt:

- `restaurantRole` für Restaurant Portal.
- `platformRole` für WUXUAI Admin.
- `role` bleibt als Kompatibilitätsalias für `restaurantRole` erhalten.

`ProtectedRoute` kann über `roleScope="platform"` explizit Plattformrollen prüfen. Die Plattformroute nutzt diesen Scope. Damit kann ein Benutzer gleichzeitig Restaurant Owner und Platform Admin sein.

## Read-only Rollen Fix

Read-only-Plattformrollen (`support`, `security_admin`, `viewer`) sehen keine aktiven Schreibbuttons mehr. Sie sehen Restaurantliste, Details und Status mit Hinweis `Nur Ansicht`.

## Trial verlängern Fix

Trial-Verlängerung sendet nur `trialExtensionDays`. Aktive Abos werden dadurch nicht auf `trialing` zurückgesetzt und der Zahlungsstatus wird nicht auf `not_required` zurückgesetzt.

## Keine Subscription Anzeige

Restaurants ohne `branch_subscriptions`-Zeile werden nicht mehr als `Noch 0 Tage` oder blind als `trialing` angezeigt. Die UI zeigt `Kein Abo eingerichtet` bzw. `Kein Zahlungsstatus`.

## Audit previous_subscription Fix

`previous_subscription` wird vor der Änderung gelesen und im Audit gespeichert. Bei Neuanlage ist `previous_subscription = null`; nach der Änderung wird `next_subscription` gespeichert. Audit-Metadaten enthalten außerdem Aktion, Rolle, Actor, Restaurantstatus und Reason.

## Security / RLS

Statisch geprüft:

- Plattform-Admin-Routen prüfen `platformRole`.
- Restaurant-Portal-Routen prüfen weiterhin `restaurantRole`.
- Schreib-RPC erlaubt nur `platform_owner`, `platform_admin`, `billing_admin`.
- Helper-/Admin-RPCs werden für `public` und `anon` entzogen.
- Frontend nutzt keine Service-Role.

Live-RLS gegen Staging wurde in diesem Schritt nicht ausgeführt.

## Build Ergebnis

`npm run build` erfolgreich.

Wichtige Chunks:

- `PlatformAdminPage-BI0D_YCF.js`: 9.60 kB, gzip 2.90 kB
- `index-CcCf95eH.js`: 21.29 kB, gzip 6.86 kB
- `vendor-supabase-CGP4Gsz0.js`: 214.35 kB, gzip 55.47 kB

## Offene Risiken

- Die neue Migration wurde lokal erstellt, aber in diesem Schritt nicht auf Supabase Staging angewendet.
- `get_platform_restaurants()` und `update_platform_restaurant_subscription()` wurden statisch geprüft, aber noch nicht live gegen Staging mit echten Plattformrollen getestet.
- Multi-Branch-Fan-out wurde per SQL-Struktur behoben, aber noch nicht mit einem echten Restaurant mit mehreren Branches in Staging verifiziert.
- Owner-vs-Platform-Admin-Doppelrolle wurde im Code getrennt, aber noch nicht mit echtem kombinierten Testnutzer live geprüft.

## Status

NOT READY

Grund: Die P1/P2-Logikfixes sind lokal umgesetzt und der Build ist erfolgreich. Für LOCK fehlt noch die Anwendung der Migration und Live-Verifikation gegen Supabase Staging.
