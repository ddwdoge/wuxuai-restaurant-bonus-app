# Tages-PIN Final Live Test Report

Datum: 2026-07-10

Status: NOT READY

## Ursache vorher

Die Mitarbeiteransicht koppelte Tages-PIN und Mitarbeiterdaten in einem gemeinsamen Ladepfad. Wenn Mitarbeiterdaten nicht geladen werden konnten, blieb die Tages-PIN leer und die Oberfläche zeigte `----`.

`----` ist als Anzeige verboten, weil es wie ein echter PIN-Code wirken kann.

## Geänderte Dateien

- `src/modules/staff/StaffTablet.tsx`
- `src/styles.css`

## Getrennte Ladezustände

Umgesetzt in `src/modules/staff/StaffTablet.tsx`:

- `staffLoading`
- `staffError`
- Staff-Daten: Einstellungen, Regeln, Gäste, Belohnungen
- `todayPinLoading`
- `todayPinError`
- `todayPin`

Die Tages-PIN wird jetzt unabhängig von Mitarbeiterdaten geladen.

Wenn Mitarbeiterdaten fehlschlagen, kann die Tages-PIN weiterhin angezeigt werden.

Wenn die Tages-PIN fehlschlägt, können Mitarbeiterdaten weiterhin angezeigt werden.

## Tages-PIN Anzeige Ergebnis

Frontend-Code geprüft:

- `Tages-PIN wird geladen...`
- echte PIN bei Erfolg
- `Tages-PIN konnte gerade nicht geladen werden.`
- kein sichtbares `----`

Live-Anzeige in `/staff/akakiko-hietzing` konnte nicht final bestätigt werden, weil die Staging-RPC fehlt.

## RPC `get_today_restaurant_pin` Live-Test

Staging-Projekt:

- `bwhvfjuwixgwduoeqaya`

Test über REST-RPC mit konfigurierter Staging-URL:

```text
get_public_customer_portal: status=200
Restaurant: Akakiko Hietzing
```

Staging ist erreichbar.

```text
get_today_restaurant_pin: status=404
PGRST202
Could not find the function public.get_today_restaurant_pin(input_restaurant_id) in the schema cache.
```

Ergebnis:

- RPC ist lokal in `supabase/migrations/20260709004000_tages_pin_reward_redemption_lock.sql` vorhanden.
- RPC ist auf Staging nicht angewendet oder nicht im Schema-Cache.
- Auto-Erstellung der Tages-PIN konnte live nicht geprüft werden.
- Berechtigung für Staff/Owner konnte live nicht geprüft werden.
- Anon-Ablehnung konnte nicht sinnvoll geprüft werden, weil die Funktion fehlt.

## Punkte sammeln Live-Test

Testgast wurde über Staging normal registriert:

```text
register_restaurant_customer: status=200
Restaurant: Akakiko Hietzing
```

### Test A: Ohne Tages-PIN

Aufruf:

```text
collect_bonus_points ohne input_daily_pin
```

Ergebnis:

```text
status=200
points_added=10
points_balance=10
```

Bewertung:

KRITISCH.

Auf Staging ist noch ein alter Punktebuchungsweg ohne Tages-PIN aktiv. Das verstößt gegen die V1-LOCK-Regel.

### Test B: Falsche Tages-PIN

Aufruf:

```text
collect_bonus_points mit input_daily_pin = 0000
```

Ergebnis:

```text
status=404
PGRST202
Could not find function public.collect_bonus_points(... input_daily_pin ...)
```

Bewertung:

KRITISCH.

Die neue RPC-Signatur mit Tages-PIN ist auf Staging nicht vorhanden.

### Test C: Richtige Tages-PIN

Nicht möglich.

Grund:

- `get_today_restaurant_pin` fehlt auf Staging.
- richtige Tages-PIN kann nicht serverseitig geladen werden.
- neue `collect_bonus_points`-Signatur mit `input_daily_pin` fehlt auf Staging.

## Alte Punktebuchungswege geprüft

Lokale Suche:

- alte `collect_bonus_points`-Signaturen existieren in alten Migrationen.
- lokale finale Migration `20260709004000_tages_pin_reward_redemption_lock.sql` überschreibt alte Signaturen.
- lokale finale Migration lässt alte Signaturen ohne Tages-PIN nur noch mit Fehler `Die Tages-PIN ist nicht korrekt.` antworten.

Staging-Live-Ergebnis:

- alter Punktebuchungsweg ohne Tages-PIN ist aktiv.
- er bucht Punkte.

Alter Punktebuchungsweg ohne PIN gefunden:

```text
Ja
```

## Reward-Einlösung ohne PIN geprüft

Lokaler Code geprüft:

- Kundenportal ruft `redeemCustomerReward(...)`.
- Service ruft RPC `redeem_customer_reward`.
- keine 6-stellige Code-Eingabe im Kundenportal.
- keine Kellner-PIN.
- keine Mitarbeiter-PIN.
- lokale finale Migration entzieht `create_redemption_code` und `redeem_reward_with_pin` für `anon` und `authenticated`.

Live-Test nicht final möglich.

Grund:

- die finale Tages-PIN-/Reward-Lock-Migration ist auf Staging nicht angewendet.
- damit kann nicht garantiert werden, dass alte Code-RPCs auf Staging bereits entzogen sind.

## RLS / Security Ergebnis

Lokal geprüft:

- `restaurant_daily_pins` hat RLS aktiv.
- Select auf `restaurant_daily_pins` ist nur für Restaurantmitglieder erlaubt.
- `get_today_restaurant_pin` prüft `is_restaurant_member(input_restaurant_id)`.
- `generate_daily_pin_code` und `ensure_today_restaurant_pin` sind nicht öffentlich ausführbar.
- keine Service-Role im Frontend.
- Kundenportal zeigt keine Tages-PIN.

Live Ergebnis:

- Staging ist nicht sicher für Tages-PIN, weil die finale Migration fehlt.
- Auf Staging kann aktuell ohne Tages-PIN Punkte gesammelt werden.

## Build Ergebnis

`npm run build` erfolgreich.

## Offene Risiken

Kritisch:

- Migration `20260709004000_tages_pin_reward_redemption_lock.sql` ist auf Staging nicht angewendet oder nicht im Schema-Cache.
- `get_today_restaurant_pin` fehlt auf Staging.
- `collect_bonus_points` mit `input_daily_pin` fehlt auf Staging.
- alter `collect_bonus_points` Weg ohne Tages-PIN bucht live Punkte.

Mittel:

- Supabase CLI ist lokal nicht installiert.
- `SUPABASE_ACCESS_TOKEN` ist in der Shell nicht gesetzt.
- `docs/21_CODEX_SELBSTKONTROLL_LOOP.md` fehlt im Projekt; Selbstkontroll-Regeln wurden aus vorhandenen Bible-Dateien und `docs/reports/2026-07-10_CODEX_SELBSTKONTROLL_LOOP_REPORT.md` angewendet.

## Erforderliche nächste Aktion

Vor einem erneuten FINAL LOCK:

1. Staging-Migrationen mit Supabase-Zugriff anwenden:

```text
npx supabase db push --include-all
```

2. Prüfen, dass `20260709004000_tages_pin_reward_redemption_lock.sql` angewendet ist.
3. Schema-Cache prüfen oder warten, bis REST-RPCs verfügbar sind.
4. Live-Tests erneut durchführen:
   - `get_today_restaurant_pin`
   - Punkte sammeln ohne PIN
   - Punkte sammeln mit falscher PIN
   - Punkte sammeln mit richtiger PIN
   - Reward-Einlösung ohne PIN

## Status

NOT READY

