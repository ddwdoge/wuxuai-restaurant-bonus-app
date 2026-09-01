# Tages-PIN + Reward Final Konsistenz Report

Datum: 2026-07-10

Status: FINAL LOCK

## Gelesene Bible-Dateien

- `AGENTS.md`
- `docs/00_START_HIER.md`
- `docs/06_STAFF_PORTAL.md`
- `docs/10_FLOW_03_BELOHNUNG_EINLOESEN.md`
- `docs/11_FLOW_04_PUNKTE_SAMMELN.md`
- `docs/13_SMART_REWARD_ENGINE.md`
- `docs/17_CTO_ENTSCHEIDUNGEN.md`
- `docs/18_CODEX_REGELN.md`
- `docs/reports/2026-07-10_GET_TODAY_RESTAURANT_PIN_404_FIX_REPORT.md`

Hinweis: `docs/21_CODEX_SELBSTKONTROLL_LOOP.md` existiert im Projekt nicht. Der Selbstkontroll-Loop wurde aus den vorhandenen Bible-Dateien und Reports angewendet.

## Ursache vorher

Staging hatte die finale Tages-PIN-Migration nicht angewendet.

Dadurch galt:

- `get_today_restaurant_pin(input_restaurant_id uuid)` fehlte auf Staging.
- `collect_bonus_points` mit Tages-PIN fehlte auf Staging.
- ein alter Punktebuchungsweg ohne Tages-PIN konnte live Punkte buchen.

## Geänderte Dateien

- `src/modules/customer/CustomerPortal.tsx`
- `src/modules/loyalty/loyaltyService.ts`
- `src/modules/staff/StaffTablet.tsx`
- `supabase/migrations/20260710001000_fix_get_today_restaurant_pin_rpc.sql`
- `docs/reports/2026-07-10_TAGES_PIN_REWARD_FINAL_KONSISTENZ_REPORT.md`

## Geänderte Migrationen

Neu:

```text
supabase/migrations/20260710001000_fix_get_today_restaurant_pin_rpc.sql
```

Diese Migration stellt idempotent sicher:

- `restaurant_daily_pins`
- `generate_daily_pin_code()`
- `ensure_today_restaurant_pin(input_restaurant_id uuid, input_branch_id uuid default null)`
- `get_today_restaurant_pin(input_restaurant_id uuid)`
- RLS für `restaurant_daily_pins`
- Grants für `get_today_restaurant_pin`
- PostgREST Schema Reload

Auf Staging angewendet:

- `20260709004000_tages_pin_reward_redemption_lock.sql`
- `20260710001000_fix_get_today_restaurant_pin_rpc.sql`

## Staging-Migration Ergebnis

`npx supabase db push --include-all` wurde erfolgreich ausgeführt.

Supabase meldete:

```text
Applying migration 20260709004000_tages_pin_reward_redemption_lock.sql...
Applying migration 20260710001000_fix_get_today_restaurant_pin_rpc.sql...
Finished supabase db push.
```

## get_today_restaurant_pin Live-Ergebnis

Live geprüft mit isolierter authentifizierter Owner-Session auf Staging.

Ergebnis:

- RPC erreichbar: Ja
- Status: 200
- PIN-Format: 4-stellig numerisch
- erneuter Abruf am selben Tag: gleiche PIN
- `valid_until`: heute 23:59:59
- anon Zugriff: 401, `permission denied for function get_today_restaurant_pin`

Beispiel aus Test:

```text
pin_code: 4341
valid_until: 2026-07-10T23:59:59+00:00
```

## Tages-PIN Mitarbeiteransicht Ergebnis

Codepfad geprüft:

- `StaffTablet` lädt Tages-PIN getrennt von Staff-Daten.
- `loadTodayRestaurantPin` ruft `get_today_restaurant_pin(input_restaurant_id)`.
- kein Frontend-Fallback `1234`
- kein sichtbares `----`
- deutscher Loading-State
- deutscher Fehler-State

Live-Browser-Screenshot konnte nicht erstellt werden, weil Playwright zwar als Paket vorhanden war, aber der Chromium-Binary nicht installiert war. Die Staging-RPC und der UI-Codepfad wurden geprüft.

## Punkte sammeln Live-Test

Live geprüft mit isoliertem Staging-Testrestaurant und Testgast.

### Ohne Tages-PIN

Ergebnis:

```text
status=400
Die Tages-PIN ist nicht korrekt.
```

Keine Punktebuchung.

### Falsche Tages-PIN

Ergebnis:

```text
status=400
Die Tages-PIN ist nicht korrekt.
```

Keine Punktebuchung.

### Richtige Tages-PIN

Ergebnis:

```text
status=200
points_added=10
points_balance=10
```

Zusätzlich geprüft:

- `points_transactions`: 1 Eintrag
- `reason`: `bonus_qr`
- Audit enthält `public_bonus_points_collected`

## Alte Punktebuchungswege Prüfung

Geprüft:

- `collect_bonus_points` ohne Tages-PIN
- `collect_bonus_points` mit alter 4-Parameter-Variante ohne Tages-PIN
- `add_customer_points`
- `confirm_points_collection`

Ergebnis:

- alte `collect_bonus_points` Varianten blockieren mit `Die Tages-PIN ist nicht korrekt.`
- `add_customer_points` existiert nicht
- `confirm_points_collection` existiert nicht
- kein aktiver Live-Weg ohne Tages-PIN gefunden

## Reward-Einlösung ohne PIN Prüfung

Live geprüft mit isoliertem Staging-Testrestaurant:

- Testgast sammelt Punkte mit richtiger Tages-PIN.
- Test-Reward wird erstellt.
- Kunde löst Reward über `redeem_customer_reward(customer_token, reward_id)` ein.

Ergebnis:

```text
first_status=200
first_points_balance=5
```

Doppelte Einlösung:

```text
second_status=400
Diese Belohnung wurde bereits eingelöst.
```

Audit enthält:

- `customer_reward_redeemed`

## Alte Code+PIN RPCs Status

Live geprüft:

```text
create_redemption_code: 401 permission denied
redeem_reward_with_pin: 401 permission denied
```

Bewertung:

- nicht mehr aktiver öffentlicher V1-Weg
- nicht vom Frontend verwendet
- V1 nutzt `redeem_customer_reward`

## RLS / Security Prüfung

Geprüft:

- anon kann `get_today_restaurant_pin` nicht ausführen
- anon liest aus `restaurant_daily_pins` keine Daten
- Tages-PIN wird serverseitig erzeugt
- keine Service-Role im Frontend
- alte Code+PIN-RPCs nicht öffentlich ausführbar
- `redeem_customer_reward` prüft Kundentoken, Restaurant-Zugehörigkeit, Reward-Zugehörigkeit, aktiv/nicht abgelaufen, ausreichende Punkte, nicht bereits eingelöst und schreibt Audit

Bewertung:

RLS/Security: Ja

## dailyPin State Fix

In `CustomerPortal.tsx` ergänzt:

```ts
setDailyPin("");
```

Verhalten:

- Erfolg: Tages-PIN-Feld wird geleert.
- Fehler: Tages-PIN bleibt stehen und kann korrigiert werden.

## Demo User Fix

Geprüft:

- kein `owner@kai-sushi.test` in `src`
- kein sichtbarer `Demo: 1234` Placeholder in `src`

## Build Ergebnis

`npm run build` erfolgreich.

## Offene Risiken

Nicht blockierend:

- Der finale Browser-Screenshot der Staff-Seite konnte nicht automatisiert erstellt werden, weil der Playwright-Chromium-Binary lokal nicht installiert ist.
- Im Projekt fehlt weiterhin `docs/21_CODEX_SELBSTKONTROLL_LOOP.md`.
- Es wurden isolierte Staging-Testrestaurants und Testgäste erzeugt.

## Status

FINAL LOCK

