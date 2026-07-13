# Tenant Isolation Live Final Report

Datum: 2026-07-13

Status: FINAL LOCK

## Ursache

Der vorherige Security-Stand war für Tenant Isolation noch nicht final
abgenommen, weil der Live-/Staging-Nachweis fehlte:

- neuer Account nur eigene Daten
- User-Wechsel im selben Browser
- fremde `restaurant_id`
- direkte RLS-Zugriffe
- keine fremden Daten im UI

Dieser Report dokumentiert den Live-Test gegen die vorhandene
Supabase-Staging-Konfiguration aus `.env.local`. Secrets wurden nicht gelesen,
nicht ausgegeben und nicht gespeichert.

## Testuser A/B anonymisiert

User A:

- E-Mail: `wuxuai-tenant-a-***@example.test`
- UI-Test-E-Mail: `wuxuai-ui-tenant-a-***@example.test`
- Restaurant A: anonymisiertes Staging-Testrestaurant `Tenant A ...`

User B:

- E-Mail: `wuxuai-tenant-b-***@example.test`
- UI-Test-E-Mail: `wuxuai-ui-tenant-b-***@example.test`
- Restaurant B: anonymisiertes Staging-Testrestaurant `Tenant B ...`

Alle Testaccounts wurden über den normalen Auth-/Trial-Flow erstellt. Es wurden
keine Demo-Daten verwendet.

## Restaurant A/B anonymisiert

Restaurant A:

- eigener Owner: Ja
- sichtbare Restaurants für User A: 1
- sichtbar: nur Restaurant A

Restaurant B:

- eigener Owner: Ja
- sichtbare Restaurants für User B: 1
- sichtbar: nur Restaurant B

## User-A-Test

Ergebnis: bestanden.

Prüfung:

- User A konnte genau ein Restaurant laden.
- Das sichtbare Restaurant gehörte User A.
- User A sah kein Restaurant B.

## User-B-Test

Ergebnis: bestanden.

Prüfung:

- User B konnte genau ein Restaurant laden.
- Das sichtbare Restaurant gehörte User B.
- User B sah Restaurant A nicht.

## User-Wechsel-Test

Ergebnis: bestanden.

Browsernaher Test:

- User A wurde im lokalen UI über `/login` angemeldet.
- `/admin/settings` zeigte Restaurant A.
- Danach wurde im selben Browserkontext User B über `/login` angemeldet.
- `/admin/settings` zeigte Restaurant B.
- Während der User-B-Prüfung erschien in den UI-Snapshots kein Restaurant-A-Text.

## localStorage-Test

Ergebnis: bestanden.

Prüfung:

- Vor User-B-Login wurde im selben Browserkontext absichtlich eine fremde
  Restaurant-A-ID in `localStorage` geschrieben.
- Nach User-B-Login wurde weiterhin nur Restaurant B angezeigt.
- Restaurant A erschien nicht.

## Direkter Fremdzugriff-Test

Ergebnis: bestanden.

Als User B wurden direkte REST-Abfragen gegen Restaurant A durchgeführt:

- `restaurants` mit Restaurant-A-ID: 0 Zeilen
- `customers` mit Restaurant-A-ID: 0 Zeilen
- `rewards` mit Restaurant-A-ID: 0 Zeilen
- `restaurant_branding` mit Restaurant-A-ID: 0 Zeilen
- Updateversuch auf `loyalty_settings` von Restaurant A: 0 Zeilen geändert

Bewertung:

- Fremde Daten wurden nicht ausgeliefert.
- Fremde Einstellungen wurden nicht geändert.

## RLS-Live-Test

Ergebnis: bestanden.

Prüfung:

- authenticated User B kann Restaurant A nicht direkt lesen.
- authenticated User B kann Kunden von Restaurant A nicht lesen.
- authenticated User B kann Rewards von Restaurant A nicht lesen.
- authenticated User B kann Branding von Restaurant A nicht lesen.
- authenticated User B kann Loyalty Settings von Restaurant A nicht ändern.
- anon liest keine Restaurantdaten.
- anon liest keine Tages-PIN-Daten.

## Codeprüfung TenantProvider

Ergebnis: bestanden.

Geprüfte Punkte:

- Tenant-State wird beim User-Wechsel sofort geleert.
- `tenantLoadRequestId` verhindert, dass alte asynchrone Loads alten Tenant-State
  zurückschreiben.
- Restaurantlisten werden serverseitig über `owner_id` oder
  `restaurant_members` eingeschränkt.
- `setActiveRestaurantId` akzeptiert nur Restaurants aus der aktuellen
  erlaubten Liste.
- Demo-Fallbacks sind im Supabase-Betrieb nicht aktiv.
- Alte `activeRestaurantId` wird nicht ungeprüft übernommen.

## Build-Ergebnis

Ausgeführt:

```text
npm run build
```

Ergebnis:

```text
erfolgreich
```

## Offene Risiken

Keine kritischen Risiken für den geprüften Tenant-Isolation-Block.

Hinweise:

- Die Testaccounts und Testrestaurants bleiben als Staging-Testdaten bestehen.
- Es wurden keine neuen Produktfunktionen und keine UI-Änderungen gebaut.
- Reward-RPCs wurden in diesem Schritt nicht verändert.

## Status

FINAL LOCK
