# WUXUAI Bonus V1 - Customer Portal RPC Live-Fehler

Datum: 2026-07-17  
Status: NOT READY

## Ursache

`get_public_customer_portal` ist live vorhanden und antwortet fuer den Slug
`wuxuai-food` mit HTTP 200. Der Customer-Portal-Service ruft bei vorhandenem
Kundentoken danach zusaetzlich `get_customer_gift_metadata` auf. Diese zweite
RPC ist im Live-PostgREST-Schema-Cache nicht vorhanden und antwortet mit HTTP
404 sowie `PGRST202`.

Die bisherige Fehlerklassifizierung suchte im gesamten PostgREST-Fehler nach
dem allgemeinen Wort `restaurant`. Der Hint des `PGRST202`-Fehlers nennt
`get_platform_restaurant_detail`. Dadurch wurde der RPC-/Schemafehler falsch
als `Restaurant wurde nicht gefunden.` angezeigt.

## Live-Signatur

```sql
public.get_public_customer_portal(
  input_restaurant_slug text,
  input_customer_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
```

Live bestaetigte Parameternamen:

- `input_restaurant_slug`
- `input_customer_token`

Ein absichtlich mit `restaurant_slug` und `customer_token` gesendeter Request
antwortete mit `PGRST202` und dem Live-Hinweis:

```text
public.get_public_customer_portal(input_customer_token, input_restaurant_slug)
```

Die Parametertypen sind in der aktuell wirksamen versionierten SQL-Definition
beide `text`. Der Rueckgabetyp ist `jsonb`.

## Frontend-Aufruf

Datei: `src/modules/loyalty/loyaltyService.ts`

```ts
supabase.rpc("get_public_customer_portal", {
  input_restaurant_slug: restaurantSlug,
  input_customer_token: customerToken ?? null,
});
```

Frontend und Live-RPC verwenden dieselben Parameternamen.

## Live-Request

```text
POST https://bwhvfjuwixgwduoeqaya.supabase.co/rest/v1/rpc/get_public_customer_portal
```

Request Body ohne Kundentoken:

```json
{"input_restaurant_slug":"wuxuai-food","input_customer_token":null}
```

## Vollstaendige Live-Response

HTTP 200, kein PGRST-Fehlercode:

```json
{"offers":[],"branding":{"logo_url":"https://bwhvfjuwixgwduoeqaya.supabase.co/storage/v1/object/public/restaurant-media/15e2a1ad-fc11-418c-b9fd-deb40e899e24/branding/logo-1784320703285.png","font_family":"Inter","button_color":"#002020","primary_color":"#002020","secondary_color":"#e0c060"},"customer":null,"settings":{"active":true,"loyalty_mode":"amount_based","stamps_required":10,"amount_per_point":1.00,"bonus_amount_tiers":[{"key":"0_10","max":10,"min":0,"label":"0–10 €","amount":0},{"key":"10_20","max":20,"min":10,"label":"10–20 €","amount":10},{"key":"20_30","max":30,"min":20,"label":"20–30 €","amount":20},{"key":"30_40","max":40,"min":30,"label":"30–40 €","amount":30},{"key":"40_50","max":50,"min":40,"label":"40–50 €","amount":40},{"key":"50_75","max":75,"min":50,"label":"50–75 €","amount":50},{"key":"75_100","max":100,"min":75,"label":"75–100 €","amount":75},{"key":"100_plus","max":null,"min":100,"label":"100+ €","amount":100}],"smart_upsell_enabled":true,"bonus_boost_multiplier":1.00,"redemption_return_rate":0.0800,"referral_boost_enabled":true,"smart_upsell_threshold":5.00,"referral_boost_multiplier":2.00,"referral_boost_duration_days":30},"campaigns":[],"restaurant":{"name":"Wuxuai food","slug":"wuxuai-food","status":"active"}}
```

## Nachgelagerter Live-Fehler

Request:

```text
POST https://bwhvfjuwixgwduoeqaya.supabase.co/rest/v1/rpc/get_customer_gift_metadata
```

Vollstaendiger Response Body, HTTP 404:

```json
{"code":"PGRST202","details":"Searched for the function public.get_customer_gift_metadata with parameter input_customer_token or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache.","hint":"Perhaps you meant to call the function public.get_platform_restaurant_detail","message":"Could not find the function public.get_customer_gift_metadata(input_customer_token) in the schema cache"}
```

## EXECUTE und Schema-Cache

- `anon` EXECUTE fuer `get_public_customer_portal`: live bestaetigt durch HTTP 200 mit Anon-Key.
- `get_public_customer_portal`: im Live-Schema-Cache vorhanden.
- `get_customer_gift_metadata`: im Live-Schema-Cache nicht vorhanden.
- Die lokale Migration
  `20260714002000_daily_pin_booking_gifts_redemption_v1.sql` definiert und
  grantet `get_customer_gift_metadata(text)` fuer `anon` und `authenticated`.
- Der aktuelle CLI-Account erhielt beim direkten DB-Schema-Dump HTTP 403 und
  konnte deshalb nicht feststellen, ob die Funktion in `pg_proc` fehlt oder
  nur der PostgREST-Cache veraltet ist.

## gift_metadata-Pruefung

Es wird keine alte Tabelle oder View namens `gift_metadata` abgefragt. Der
einzige zusaetzliche Zugriff ist die RPC `get_customer_gift_metadata`.

## Geaenderte Datei

- `src/modules/loyalty/loyaltyService.ts`

## Fix

- Nur die exakte DB-Meldung `restaurant not found` wird noch als
  `Restaurant wurde nicht gefunden.` angezeigt.
- Der konkret bestaetigte fehlende Metadaten-Endpunkt `PGRST202` laesst das
  bereits erfolgreich geladene Portal-Grundpayload weiterlaufen.
- Andere RPC-/DB-Fehler werden als Verbindungsfehler angezeigt und nicht mehr
  als fehlendes Restaurant.

## Testtoken

Ein gueltiger roher Testtoken war weder im Repository noch in einer geoeffneten
Test-URL vorhanden. Die Datenbank speichert ihn bestimmungsgemaess nur als
Hash; er kann nicht rekonstruiert werden. Es wurde deshalb kein Token erfunden
und kein neuer Live-Kunde erzeugt. Der tokenbasierte End-to-End-Test bleibt
offen, bis der bestehende Testlink beziehungsweise rohe Testtoken bereitsteht.

## Build und Tests

- `npm run build`: erfolgreich.
- `npm test`: 5 von 5 Tests erfolgreich.

## Offene Risiken

- Live muss geklaert werden, ob Migration `20260714002000` fehlt oder ob nur
  der PostgREST-Schema-Cache aktualisiert werden muss.
- Der bestehende gueltige Testtoken muss noch direkt getestet werden.

Status: NOT READY
