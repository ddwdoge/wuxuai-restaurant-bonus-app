# WUXUAI Bonus V1 - Live Blocker Gift Metadata Deploy

Datum: 2026-07-17  
Status: NOT READY

## Ziel

Live-Deployment und End-to-End-Pruefung von
`public.get_customer_gift_metadata(input_customer_token text)` sowie
Bereinigung der bestaetigten Duplikatdateien.

## Migration geprueft

Migration:

`supabase/migrations/20260714002000_daily_pin_booking_gifts_redemption_v1.sql`

Enthalten und geprueft:

- Signatur `public.get_customer_gift_metadata(input_customer_token text)`
- Rueckgabetyp `jsonb`
- `security definer`
- fester `search_path = public`
- Tokenpruefung ueber `hash_public_token(input_customer_token)`
- nur aktive, nicht abgelaufene Kundentokens
- Tenant-Verknuepfung ueber Restaurant, Branch und Kunde
- Response enthaelt nur Geschenk-Metadaten und keine Namen, Telefonnummern,
  Geburtstage oder Tokens
- `revoke execute ... from public`
- `grant execute ... to anon, authenticated`
- `notify pgrst, 'reload schema'`

Frontend-Signatur und SQL-Signatur stimmen ueberein:

```text
input_customer_token text
```

## Supabase CLI

Projekt-Ref:

```text
bwhvfjuwixgwduoeqaya
```

Ergebnisse:

- `SUPABASE_ACCESS_TOKEN` im Codex-Prozess: nicht gesetzt
- `npx supabase link --project-ref ...`: HTTP 403
- `npx supabase migration list`: HTTP 403
- `npx supabase db push --dry-run --include-all`: HTTP 403
- DB-Fallback: `SUPABASE_DB_PASSWORD` fehlt
- interaktives `npx supabase login`: in der nicht-interaktiven Umgebung nicht
  moeglich

Exakter CLI-Blocker:

```text
Your account does not have the necessary privileges to access this endpoint.
```

Folge:

- Migration nicht live angewendet
- Schema-Cache nicht neu geladen
- `pg_proc`-Signatur nicht direkt per SQL bestaetigt
- `has_function_privilege` nicht direkt per SQL ausgefuehrt

## Live-RPC-Ergebnisse

### Gueltiger neuer Testtoken und richtiger Slug

`get_public_customer_portal`:

- HTTP 200
- Restaurant `wuxuai-food`
- Kunde vorhanden
- ein Willkommensgeschenk vorhanden
- `Gratis Getraenk`
- Status `locked`

### Gift Metadata

`get_customer_gift_metadata` mit gueltigem Token:

- HTTP 404
- Code `PGRST202`
- Funktion nicht im Live-PostgREST-Schema-Cache

### Falscher Token

- HTTP 400
- Code `P0001`
- `customer token not valid`

### Cross-Restaurant

Token von `wuxuai-food` gegen `akakiko-hietzing`:

- HTTP 400
- Code `P0001`
- Zugriff abgelehnt

### Deaktivierter Token

Nach vorgesehener Tokenrotation:

- alter Token: HTTP 400 / `P0001`
- neuer Token: HTTP 200
- keine Reaktivierung des alten Tokens

## Anon EXECUTE

- `get_public_customer_portal`: live ueber Anon-Key mit HTTP 200 bestaetigt
- `get_customer_gift_metadata`: nicht bestaetigt, weil die Funktion im
  Live-Schema-Cache fehlt

## Live-Web-App

Route mit gueltigem Testtoken:

```text
/customer/wuxuai-food?token=[VERDECKT]
```

Ergebnis vor und nach Reload:

- Portal zeigt `Restaurant wurde nicht gefunden.`
- Restaurantdaten und Willkommensgeschenk werden nicht gerendert
- die lokal korrigierte Fehlerklassifizierung ist noch nicht live deployed
- der DB-Blocker `PGRST202` besteht weiterhin

## Duplikate entfernt

Vor Loeschung byte-identisch bestaetigt:

- `src/main 2.tsx` gegen `src/main.tsx`
- `src/vite-env.d 2.ts` gegen `src/vite-env.d.ts`

Entfernt wurden ausschliesslich:

- `src/main 2.tsx`
- `src/vite-env.d 2.ts`

## Testtoken

- ueber `register_restaurant_customer` serverseitig erzeugt
- HTTP 200
- 64 Zeichen
- nur in `/tmp/wuxuai-live-test-token.txt` gespeichert
- nicht in Repository, Report, ZIP oder Git geschrieben
- Datenbank speichert gemaess Architektur nur den Hash
- ein zweiter Testtoken wurde durch erneute Registrierung desselben
  synthetischen Testkunden rotiert und live validiert

## Qualitaetspruefung

- `npm install`: erfolgreich, 0 Sicherheitsluecken
- Node-Hinweis: lokale Runtime Node 20, Projekt fordert Node >= 22
- `npm run lint`: 0 Fehler, 12 bestehende Warnungen
- `npm run typecheck`: erfolgreich
- `npm test`: 5 von 5 erfolgreich
- `npm run build`: erfolgreich

## Geaenderte Dateien

- `src/modules/loyalty/loyaltyService.ts`
- `src/main 2.tsx` entfernt
- `src/vite-env.d 2.ts` entfernt
- dieser Report

## Verbleibender Blocker

Ein Supabase-Zugang mit ausreichender Projektrolle oder das zugehoerige
`SUPABASE_DB_PASSWORD` wird benoetigt. Danach muessen exakt ausgefuehrt werden:

```text
npx supabase link --project-ref bwhvfjuwixgwduoeqaya
npx supabase migration list
npx supabase db push --dry-run --include-all
npx supabase db push --include-all
```

Anschliessend muessen Schema-Cache, `anon`-EXECUTE, Gift-Metadata-RPC und die
Live-Web-App erneut geprueft werden.

Status: NOT READY
