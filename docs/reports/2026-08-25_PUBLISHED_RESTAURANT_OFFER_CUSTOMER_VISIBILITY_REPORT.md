# WUXUAI Bonus - Published Restaurant Offer Customer Visibility Audit

Datum: 2026-08-25

Umgebung: Supabase Staging `bwhvfjuwixgwduoeqaya`

Production: nicht veraendert

Stripe: deferred

## Ursache

Die beiden veroeffentlichten Beitraege sind Mittagsmenues mit einem expliziten
Wochentags- und Uhrzeitfenster. Sie sind montags und dienstags von 09:37 bis
16:37 Uhr Europe/Vienna sichtbar. Der Live-Test erfolgte am Dienstag nach
23:00 Uhr Europe/Vienna. Deshalb filterte
`public.get_public_restaurant_offers(text, integer)` beide Datensaetze
serverseitig aus.

Es liegt kein Slug-, Restaurant-, Branch-, RLS-, Cache- oder Client-Rendering-
Fehler vor. Das Owner-Label `Veroeffentlicht` beschreibt den
Publikationszustand, nicht die momentane Sichtbarkeit innerhalb des optionalen
Wochen-/Tagesfensters.

## Live-Datensaetze

Restaurant:

- Restaurant-ID: `1dbd4d83-cd4f-441e-9d3f-71a34febfed2`
- Restaurantname: `Kaffee Konditorei baeckerei`
- Slug: `wu-und-xu-group-gmbh`
- Restaurantstatus: `active`
- Branch-ID: `df7e7649-229d-4a07-a4a0-4288182bbc9a`
- Branchname: `WU und XU Group GmbH`
- Branchstatus: `active`
- Finderfreigabe: aktiv

Angebot 1:

- ID: `d3561762-06a1-4189-bea5-6c61ffd3aa3c`
- Titel: `Kopie von testte`
- Typ: `LUNCH_MENU`
- Status: `PUBLISHED`
- Aktiv: Ja
- Veroeffentlicht: `2026-08-25T20:55:17.212287Z`
- Gueltig von: `2026-08-23T18:00:00Z`
- Gueltig bis: `2026-08-30T18:00:00Z`
- Wochentage: Montag, Dienstag
- Uhrzeit: 09:37-16:37 Europe/Vienna

Angebot 2:

- ID: `ecb1cf8f-b18d-4cae-aa67-5d03061f7acc`
- Titel: `testte`
- Typ: `LUNCH_MENU`
- Status: `PUBLISHED`
- Aktiv: Ja
- Veroeffentlicht: `2026-08-25T16:40:57.650486Z`
- Gueltig von: `2026-08-23T18:00:00Z`
- Gueltig bis: `2026-08-30T18:00:00Z`
- Wochentage: Montag, Dienstag
- Uhrzeit: 09:37-16:37 Europe/Vienna

## Owner-Vertrag

`change_restaurant_offer_status(..., 'PUBLISH')` setzt:

- `status = 'PUBLISHED'`
- `is_active = true`
- `published_at` und `published_by`

Die Owner-Oberflaeche zeigt `Veroeffentlicht`, wenn der Datensatz publiziert,
aktiv und innerhalb `valid_from`/`valid_to` liegt. Das Label wertet das
zusaetzliche Wochen-/Tagesfenster nicht aus.

## Customer-Vertrag

Kette:

`CustomerPortal.tsx` beziehungsweise `CustomerOffersPage.tsx`
-> `loadPublicRestaurantOffers(slug, limit)`
-> `POST /rest/v1/rpc/get_public_restaurant_offers`
-> `public.restaurant_offers`, `public.restaurants`, `public.branches`

Der Public-RPC ist `SECURITY DEFINER`, `STABLE`, hat den festen `search_path`
`public, pg_temp` und ist fuer `anon` und `authenticated` ausfuehrbar. Er gibt
nur den begrenzten oeffentlichen Angebots-Payload aus.

Live-Ergebnis fuer `wu-und-xu-group-gmbh` nach 23:00 Europe/Vienna:

```json
[]
```

Kontrollauswertung derselben serverseitigen Regeln fuer 12:00 Europe/Vienna am
2026-08-25:

```text
matching_count: 2
```

Damit ist bewiesen, dass der Backend-Zeitfilter die Angebote entfernt. Der
Client erhaelt keine Datensaetze und filtert nichts nachtraeglich aus.

## Sicherheit

- Restaurant- und Branch-Zuordnung stimmen ueberein.
- Fremdtenant-Daten werden nicht durch einen Client-Fallback ergaenzt.
- Draft-, deaktivierte, archivierte und abgelaufene Angebote bleiben im
  Public-RPC ausgeschlossen.
- RLS wurde nicht gelockert.
- Direkte Tabellenrechte wurden nicht veraendert.
- Keine Service-Role und keine Secrets wurden im Browser verwendet.

## Was wurde geaendert

Nur dieser Auditbericht. Keine App-, RPC-, RLS-, Daten- oder
Businesslogik-Aenderung.

## Was wurde nicht geaendert

- Die Uhrzeit- und Wochentagsregel fuer Mittagsmenues
- die beiden Staging-Angebote
- Owner-Angebotsverwaltung
- Customer Auth, Rewards, Referral, Redemption, Finder, Staff und Platform Admin
- Production

## Ergebnis

Die Customer-Pipeline arbeitet gemaess dem aktuell dokumentierten Vertrag.
Das konkrete Angebot ist ausserhalb seines konfigurierten Sichtbarkeitsfensters
nicht aktuell sichtbar. Fuer einen abendlichen Pilot-Test muss der Owner das
Zeitfenster des kontrollierten Testangebots bewusst erweitern oder einen
Angebotstyp ohne Tagesfenster verwenden. Historie und bestehende Angebote
werden nicht stillschweigend veraendert.

Status: NOT READY fuer den geforderten Live-Nachweis `PUBLISHED OFFER VISIBLE`;
ROOT CAUSE FOUND und keine Code-Reparatur erforderlich.

## Qualitaet und offene Live-Gates

- Tests: 990/990 PASS
- Typecheck: PASS
- Lint: PASS mit 0 Fehlern und 7 bereits vorhandenen Warnungen
- Build: PASS
- `git diff --check`: PASS
- Secret-Scan des Reports: PASS
- DB-Linter: nicht erneut ausgefuehrt, da keine DB-Aenderung erfolgte
- Authentifizierter Customer-Live-Test: nicht abgeschlossen; die verfuegbare
  Browsersitzung war eine gueltige Staff-Sitzung und wurde vom Role-Aware-Guard
  korrekt vom Customer-Portal ausgeschlossen
- Draft/Publish/Deactivate/Reactivate/Expire: in diesem Audit nicht mutierend
  wiederholt; bestehende Staging-Testdaten wurden bewusst nicht umkonfiguriert
- Mobile Angebotskarte: wegen des realen ausserhalb des Zeitfensters leeren
  Payloads nicht visuell abgenommen
