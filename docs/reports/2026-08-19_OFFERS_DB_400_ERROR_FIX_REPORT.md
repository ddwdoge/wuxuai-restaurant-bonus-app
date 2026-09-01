# Aktuelles & Angebote - DB/400-Fehler Audit und Staging-Fix

Datum: 2026-08-19  
Branch: `codex/v1-release-finishing-sprint`  
Ausgangscommit: `2bb20a9075ee86d525c962f1921b9119e58cca2f`  
Staging: `wuxuai-bonus-staging` (`bwhv...qaya`)

## Ursache

Die Offers-Struktur und die lesenden RPCs waren vollständig auf Staging vorhanden. Der reproduzierbare HTTP-400-Pfad war der Schreib-RPC `POST /rest/v1/rpc/save_restaurant_offer`.

Der RPC schrieb sein Audit-Ereignis mit `actor_type = 'restaurant_user'`. Der reale Staging-Constraint `audit_log_actor_type_check` erlaubt ausschließlich `admin`, `staff`, `customer` und `system`. PostgreSQL brach deshalb den gesamten Create-Vorgang ab:

```text
SQLSTATE: 23514
Constraint: audit_log_actor_type_check
Fehler: new row for relation "audit_log" violates check constraint
```

Das Angebot selbst wurde durch den Transaktionsabbruch nicht gespeichert. Es fehlte keine Offers-Tabelle und es lag kein RLS- oder PostgREST-Schema-Cache-Problem vor.

## Frontend-Requests

Die Route `/admin/offers` verwendet:

| Zweck | Request | Tenantbindung |
| --- | --- | --- |
| Angebote laden | `POST /rest/v1/rpc/list_restaurant_offers` | `input_restaurant_id`, serverseitige Adminprüfung |
| Aktive Standorte | `GET /rest/v1/branches?select=id,name,status` | `restaurant_id`, `status=active`, RLS |
| Aggregierter E-Mail-Status | `POST /rest/v1/rpc/get_restaurant_offer_email_summary` | `input_restaurant_id`, serverseitige Adminprüfung |
| Erstellen/Bearbeiten | `POST /rest/v1/rpc/save_restaurant_offer` | Restaurant, Angebot und Branch serverseitig geprüft |
| Veröffentlichen/Deaktivieren/Archivieren | `POST /rest/v1/rpc/change_restaurant_offer_status` | Restaurant und Angebot serverseitig geprüft |
| Duplizieren | `POST /rest/v1/rpc/duplicate_restaurant_offer` | Restaurant und Quellangebot serverseitig geprüft |
| Entwurf löschen | `POST /rest/v1/rpc/delete_restaurant_offer_draft` | Restaurant, Angebot und Status serverseitig geprüft |

Der Save-Payload enthält die vorhandenen Felder für Typ, Titel, Beschreibungen, Bild, Preise, Zeitraum, Wochentage, Uhrzeit und Buttontext. Es gibt keine Reward-, Punkte-, Coupon- oder Marketingversand-Verknüpfung.

## Migration Inventory

### `20260804001000_restaurant_offers_v1.sql`

- Tabellen: `restaurant_offers`, `restaurant_offer_metrics`
- Constraints: Typ, Status, EUR, Textlängen, Zeitraum, Preise, Zeitpaar, Wochentage
- Indexe: Owner-Abfrage, öffentliche aktive Angebote, Metrics
- RLS: auf beiden Tabellen aktiv
- Policies: authentifizierter Admin-Read für eigenen Tenant
- Trigger: `validate_restaurant_offer_row_trigger`
- RPCs: List, Save, Statuswechsel, Duplizieren, Draft-Delete, Public-List, Public-Metrics
- Direkte Tabellen-Schreibrechte für `anon` und `authenticated`: entzogen

### `20260804002000_central_customer_account_offer_emails.sql`

- RPC `get_restaurant_offer_email_summary(uuid)`
- liefert ausschließlich aggregierte Werte
- kein Zugriff auf Empfängerlisten im Owner-Frontend
- Angebots-E-Mail-Versand bleibt deaktiviert und war nicht Teil dieses Fixes

### `20260819001000_fix_offers_audit_actor_type.sql`

- additive Forward-Migration
- ersetzt nur die vier Offers-Schreib-RPC-Definitionen
- verwendet den bestehenden gültigen Audit-Akteurstyp `admin`
- behält Signaturen, Tenantprüfung, Businessregeln, `SECURITY DEFINER`, festen `search_path` und Grants unverändert
- verändert keine Tabelle, Policy, RLS-Regel oder Daten

## Repository gegen Staging

Vor dem Fix waren 91/91 Migrationen synchron. Beide ursprünglichen Offers-Migrationen waren registriert und angewendet. Das reale Schema entsprach dem Repository hinsichtlich Spalten, Datentypen, Constraints, Indexen, RLS, Policies, Triggern, Signaturen und Grants.

Die einzige funktionale Abweichung lag innerhalb der ursprünglichen RPC-Implementierung selbst: Ihr Auditwert war mit dem bereits bestehenden Audit-Constraint unvereinbar.

Nach dem Fix:

- Migrationen lokal/remote: 92/92 synchron
- erneuter `db push --dry-run --include-all`: leer
- Offers-Schreib-RPCs mit gültigem `admin`-Akteurstyp: 4/4
- direkte authentifizierte Tabellen-Schreibrechte: Nein
- RLS auf Offers und Metrics: aktiv
- DB-Linter: 0 Fehler

## Staging-Tests

Der CRUD-Test lief gegen einen eindeutig ausgewählten aktiven Staging-Tenant innerhalb einer expliziten äußeren PostgreSQL-Transaktion. Die Transaktion endete mit `ROLLBACK`; Testangebote und zugehörige Audit-Schreibversuche wurden vollständig verworfen.

| Prüfung | Ergebnis |
| --- | --- |
| Create | PASS |
| Read | PASS |
| Update Titel/Text | PASS |
| Fünf veröffentlichen | PASS |
| Sechste parallele Veröffentlichung blockieren | PASS |
| Deactivate | PASS |
| Danach nächsten Entwurf veröffentlichen | PASS |
| Filter Alle/Veröffentlicht/Entwürfe/Inaktiv | PASS |
| Fremdtenant-Schreibversuch | `OFFER_ACCESS_DENIED`, PASS |
| verbliebene Smoke-Testzeilen | 0 |

Die drei initialen Seitenrequests lieferten nach dem Fix jeweils HTTP 200. Die Staging-gekoppelte `/admin/offers`-Seite wurde mit einem kurzlebigen Owner geöffnet: Überschrift sichtbar, echter Empty State sichtbar, kein Ladefehler, 0 Konsolenfehler. Der temporäre Auth-Nutzer und seine Membership wurden anschließend entfernt.

## UI-Zustände

- Loading: Skeleton-Grid
- Empty: `Noch keine Angebote` nur nach erfolgreichem Load mit 0 Einträgen
- Error: `Angebote konnten nicht geladen werden.` mit `Erneut versuchen`
- technische PostgREST-Details werden nicht im Owner-UI ausgegeben

## Geänderte Dateien

- `supabase/migrations/20260819001000_fix_offers_audit_actor_type.sql`
- `src/modules/offers/restaurantOfferService.ts`
- `src/modules/admin/pages/RestaurantOffersPage.tsx`
- `tests/restaurant-offers-v1.test.mjs`
- `docs/reports/2026-08-19_OFFERS_DB_400_ERROR_FIX_REPORT.md`

## Was nicht geändert wurde

- keine Marketing-Mail-Funktion
- keine Reward-, Punkte- oder Einlösungslogik
- keine RLS- oder Tenant-Lockerung
- keine Production-Migration
- kein Production-Deployment
- kein Stripe

## Qualität

- Offers-Tests: 23/23 PASS
- Gesamttests: 681/681 PASS
- Typecheck: PASS
- Lint: PASS, keine neuen Fehler
- Build: PASS
- `git diff --check`: PASS
- Staging DB-Linter: 0 Fehler

## Statusblock

```text
HTTP 400 REPRODUCED:
YES

ROOT CAUSE:
save_restaurant_offer schrieb den nicht erlaubten Audit-Akteurstyp restaurant_user; audit_log_actor_type_check brach mit SQLSTATE 23514 ab.

OFFERS MIGRATION EXISTS:
YES

OFFERS SCHEMA ON STAGING:
COMPLETE

MIGRATION DRIFT:
NO

NEW FORWARD MIGRATION REQUIRED:
YES

NEW MIGRATION:
20260819001000_fix_offers_audit_actor_type.sql

RLS:
PASS

CREATE OFFER:
PASS

READ OFFER:
PASS

UPDATE OFFER:
PASS

DEACTIVATE OFFER:
PASS

MULTI-TENANT ISOLATION:
PASS

EMPTY STATE:
PASS

ERROR STATE:
PASS

HTTP 400 AFTER FIX:
0

DB LINTER ERRORS:
0

TESTS:
681/681 PASS

TYPECHECK:
PASS

LINT:
PASS

BUILD:
PASS

STAGING FIX APPLIED:
YES

OFFERS MODULE READY:
YES

PRODUCTION:
LOCKED

STRIPE:
DEFERRED
```
