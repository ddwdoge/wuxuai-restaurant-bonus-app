# WUXUAI Admin Trial- und Zahlungsverwaltung Basis

Datum: 2026-07-11

Status: NOT READY

## Ziel

Die interne WUXUAI Admin-Basis soll Restaurants, Testphasen, Abo-Status und Zahlungsstatus sichtbar machen und frühe manuelle Verwaltungsaktionen ermöglichen.

Nicht geändert:

- Customer Portal
- Staff Portal
- Punkte sammeln
- Tages-PIN
- Punkteeinlösung
- Willkommensgeschenke
- Bonus Boost
- QR Center
- Restaurant Owner Dashboard KPIs

## Geänderte Dateien

- `supabase/migrations/20260711007000_platform_admin_trial_payment_basis.sql`
- `src/shared/types/domain.ts`
- `src/modules/auth/AuthProvider.tsx`
- `src/app/App.tsx`
- `src/modules/platform/platformAdminService.ts`
- `src/modules/platform/PlatformAdminPage.tsx`
- `src/styles.css`
- `docs/07_WUXUAI_ADMIN.md`
- `docs/17_CTO_ENTSCHEIDUNGEN.md`
- `docs/19_CHANGELOG.md`

## DB/RPC Änderungen

Neue Migration:

`20260711007000_platform_admin_trial_payment_basis.sql`

Neue Tabelle:

- `platform_admins`

Neue / geänderte Subscription-Felder:

- `payment_status`
- `stripe_customer_id`
- `stripe_subscription_id`
- `current_period_end`
- `paused_at`
- `locked_at`
- `lock_reason`

Statuswerte:

- `trialing`
- `active`
- `past_due`
- `unpaid`
- `cancelled`
- `paused`

Zahlungsstatus:

- `not_required`
- `pending`
- `paid`
- `failed`
- `manual`

Neue RPCs:

- `get_current_platform_role`
- `get_platform_restaurants`
- `update_platform_restaurant_subscription`

## Admin-Routen

Neue interne Routen:

- `/platform-admin`
- `/platform-admin/restaurants`

Diese Routen sind nicht im Restaurant Portal eingebaut.

Restaurant Portal bleibt unter:

- `/admin`

## Trial-Status

Die Plattformübersicht zeigt:

- Testphase Start
- Testphase Ende
- verbleibende Testtage
- aktive Testphasen
- abgelaufene Testphasen

V1-Regel:

- 30 Tage kostenlos
- keine Kreditkarte nötig
- manuelle Verlängerung möglich

## Payment-Status

Die Plattformübersicht zeigt:

- Zahlungsstatus
- Abo-Status
- offene Zahlungen
- aktive Abos

Stripe Checkout und Stripe Webhooks wurden nicht gebaut.

## Manuelle Aktionen

Implementierte Admin-Aktionen:

- Restaurant aktivieren
- Restaurant pausieren
- Testphase um 14 Tage verlängern
- Zahlung auf bezahlt setzen
- Details öffnen

Jede Aktion läuft über `update_platform_restaurant_subscription`.

## Audit

Jede manuelle Änderung schreibt Audit:

- `restaurant_id`
- `organization_id`
- `branch_id`
- `actor_type = admin`
- `actor_id`
- `action = platform_subscription_updated`
- `target_table = branch_subscriptions`
- `target_id`
- Metadaten mit vorherigem und neuem Subscription-Zustand

## Security / RLS

Umgesetzt:

- Plattformrollen sind getrennt von Restaurantrollen.
- Restaurantrollen `owner`, `admin`, `manager`, `staff` geben keinen Plattformzugriff.
- Plattformzugriff kommt aus `app_metadata.role` oder `platform_admins`.
- Frontend verwendet keine Service Role.
- Plattformdaten werden über sichere RPCs geladen.
- Manuelle Aktionen sind serverseitig auf `platform_owner`, `platform_admin` und `billing_admin` begrenzt.
- `platform_admins` hat RLS aktiviert.

Nicht live geprüft:

- Migration wurde nicht gegen Supabase Staging angewendet.
- RLS wurde nicht mit echten `anon` / `authenticated` Rollen gegen Staging getestet.
- Plattformrolle über `platform_admins` wurde nicht live getestet.

## Mobile Prüfung

Statisch umgesetzt:

- Plattformseite nutzt mobile 1-Spalten-Struktur.
- Karten und Restaurantliste brechen unter 1180 px auf eine Spalte.
- Bei kleinen Breiten werden Header-Aktionen und Buttons gestapelt.
- Keine absichtlich horizontale Tabelle.

Nicht live geprüft:

- echte Browser-Screenshots für 390 px / Tablet / Desktop.

## Build-Ergebnis

Erfolgreich:

```text
npm run build
```

## Offene Risiken

- Die neue Migration wurde noch nicht auf Supabase Staging angewendet.
- RPCs wurden noch nicht live gegen Staging getestet.
- Die interne Adminrolle muss in Staging entweder über `app_metadata.role` oder `platform_admins` gesetzt werden.
- Stripe ist nur vorbereitet, nicht automatisiert.
- Restaurant Portal Lock bei unbezahltem Status wurde bewusst noch nicht hart aktiviert, um Customer-/Restaurant-Flows nicht unbeabsichtigt zu stören.

## Status

NOT READY

Begründung:

Die V1-Basis ist implementiert und der Build ist grün. Wegen neuer Migration und neuer sicherer RPCs fehlt für LOCK noch die Anwendung auf Staging und ein Live-Test der Plattformrollen, Restaurantliste, manuellen Aktionen und Audit-Einträge.
