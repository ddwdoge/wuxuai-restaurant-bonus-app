# get_today_restaurant_pin 404 Fix Report

Datum: 2026-07-10

Status: NOT READY

## Ursache für 404

Die Staff-Seite ruft korrekt:

```text
supabase.rpc("get_today_restaurant_pin", { input_restaurant_id: restaurantId })
```

Staging antwortet jedoch:

```text
status=404
PGRST202
Could not find the function public.get_today_restaurant_pin(input_restaurant_id) in the schema cache.
```

Ursache:

- Die Funktion existierte lokal bereits in `supabase/migrations/20260709004000_tages_pin_reward_redemption_lock.sql`.
- Die aktuell verwendete Supabase-Staging-Datenbank kennt diese RPC nicht.
- Dadurch kann PostgREST die RPC nicht auflösen.
- Zusätzlich war auf Staging noch ein alter `collect_bonus_points`-Weg ohne Tages-PIN aktiv.

## RPC-Signatur vorher / nachher

### Frontend-Aufruf

```ts
supabase.rpc("get_today_restaurant_pin", {
  input_restaurant_id: restaurantId,
});
```

### Erwartete SQL-Signatur

```sql
public.get_today_restaurant_pin(input_restaurant_id uuid)
```

### Additive Fix-Migration

Neue Migration:

```text
supabase/migrations/20260710001000_fix_get_today_restaurant_pin_rpc.sql
```

Diese Migration erstellt idempotent:

- `restaurant_daily_pins`
- `generate_daily_pin_code()`
- `ensure_today_restaurant_pin(input_restaurant_id uuid, input_branch_id uuid default null)`
- `get_today_restaurant_pin(input_restaurant_id uuid)`
- RLS Policy für `restaurant_daily_pins`
- `GRANT EXECUTE` nur für `authenticated`
- `notify pgrst, 'reload schema'`

## Geänderte Dateien

- `supabase/migrations/20260710001000_fix_get_today_restaurant_pin_rpc.sql`
- `src/modules/loyalty/loyaltyService.ts`
- `src/modules/staff/StaffTablet.tsx`
- `docs/reports/2026-07-10_GET_TODAY_RESTAURANT_PIN_404_FIX_REPORT.md`

## Frontend-Fix

Entfernt:

- Demo-Fallback-PIN `1234` in `loadTodayRestaurantPin`
- sichtbarer Staff-PIN-Placeholder `Demo: 1234`

Beibehalten:

- Loading-State
- Fehler-State
- keine Frontend-Zufalls-PIN
- kein `----`

## GRANT / RLS / Security-Prüfung

Lokal in der Migration geprüft:

- `restaurant_daily_pins` hat RLS aktiv.
- Direkter Select ist nur für Restaurantmitglieder erlaubt.
- `generate_daily_pin_code()` ist nicht für `public`, `anon` oder `authenticated` ausführbar.
- `ensure_today_restaurant_pin(...)` ist nicht für `public`, `anon` oder `authenticated` ausführbar.
- `get_today_restaurant_pin(uuid)` ist nicht für `public` oder `anon` ausführbar.
- `get_today_restaurant_pin(uuid)` ist nur für `authenticated` ausführbar.
- Die Funktion prüft serverseitig `is_restaurant_member(input_restaurant_id)`.

## Staff-Seite Test

Codepfad geprüft:

- Staff-Seite ruft `loadTodayRestaurantPin(restaurantId)`.
- `loadTodayRestaurantPin` ruft `get_today_restaurant_pin` mit `input_restaurant_id`.
- Tages-PIN wird nicht im Frontend erzeugt.
- Kein Demo-Fallback.
- Kein sichtbares `----`.

Live-Test:

- Nicht bestanden.
- Grund: Staging-RPC liefert weiter 404, weil die Migration nicht angewendet werden konnte.

## Punkte-sammeln Test

Aus vorherigem Live-Test bestätigt:

- Staging ließ noch Punktebuchung ohne Tages-PIN zu.
- Das ist kritisch und bleibt offen, solange die Tages-PIN-Migration nicht auf Staging angewendet ist.

In diesem Lauf nicht erneut mit Testgast gebucht, weil die RPC-Migration nicht auf Staging angewendet werden konnte.

## Staging-Ergebnis

Staging-Projekt:

```text
bwhvfjuwixgwduoeqaya
```

Migration-Push versucht:

```text
npx supabase db push --include-all
```

Ergebnis:

```text
Access token not provided.
Supply an access token by running supabase login or setting the SUPABASE_ACCESS_TOKEN environment variable.
```

Staging-RPC danach erneut geprüft:

```text
get_today_restaurant_pin: status=404
PGRST202
Could not find the function public.get_today_restaurant_pin(input_restaurant_id) in the schema cache.
```

Migration auf Staging:

```text
Nein
```

## Build-Ergebnis

`npm run build` erfolgreich.

## Offene Risiken

Kritisch:

- Staging hat die RPC `get_today_restaurant_pin(input_restaurant_id uuid)` weiterhin nicht.
- Staging kann Tages-PIN nicht anzeigen.
- Staging kann ohne angewendete Tages-PIN-Migration weiterhin alte Punktebuchungswege enthalten.

Blocker:

- `SUPABASE_ACCESS_TOKEN` ist in der Shell nicht gesetzt.
- Supabase CLI kann ohne Token die Migration nicht pushen.

Mittel:

- `docs/21_CODEX_SELBSTKONTROLL_LOOP.md` fehlt im Projekt. Die Selbstkontroll-Regeln wurden aus den vorhandenen Bible-Dateien und Reports angewendet.

## Nächste notwendige Aktion

Token in der lokalen Shell setzen und dann erneut ausführen:

```text
npx supabase db push --include-all
```

Danach erneut prüfen:

- RPC ohne 404 erreichbar
- Staff-Seite zeigt echte 4-stellige PIN
- falsche Tages-PIN wird abgelehnt
- richtige Tages-PIN bucht Punkte
- alter Punktebuchungsweg ohne PIN bucht keine Punkte mehr

## Status

NOT READY

