# WUXUAI Bonus - Platform Admin V1 Loop 1

Datum: 2026-08-24  
Branch: `codex/v1-canonical-recovery`  
Ausgangscommit: `919141181223aa414ef004a09aa3f02637f2b7fd`

## Current Admin Architecture

Die Codebasis besass bereits eine sichere Plattform-Admin-Basis. Es wurde kein
paralleles System angelegt.

- Routen: `/admin/platform`, `/admin/platform/audit`,
  `/admin/platform/restaurants/:restaurantId`, `/platform-admin` und
  `/platform-admin/restaurants`.
- Route Guard: `ProtectedRoute` verwendet fuer diese Routen den separaten
  `platform`-Scope. Restaurantrollen werden nicht als Plattformrollen gelesen.
- Auth: Supabase Auth stellt die Sitzung bereit. Restaurantrollen stammen aus
  `restaurant_members`; interne Plattformrollen liegen getrennt in
  `platform_admins`.
- RLS: `platform_admins` besitzt RLS. Tenanttabellen behalten ihre bestehenden
  restaurantbezogenen Policies.
- Serverautorisierung: `current_platform_role`, `is_platform_admin` und die
  globalen Plattform-RPCs pruefen `auth.uid()` und die Plattformrolle
  serverseitig.
- Service Layer: `platformAdminService.ts` verwendet ausschliesslich die
  dedizierten RPCs. Es gibt keinen direkten Tabellenzugriff und keine Service
  Role im Browser.
- Audit: `audit_log` speichert Actor, Aktion, Zieltyp/-ID und Zeitstempel. Die
  bestehende Plattform-Schreib-RPC speichert Vorher-/Nachher-Zustand sowie den
  optionalen Grund in sicherer Audit-Metadatenstruktur.
- Ownership: `restaurant_members` und `restaurants.owner_id` verleihen keinen
  Plattformzugriff.

## Ursache der Haertung

Der Client akzeptierte eine serverseitig signierte `app_metadata`-Plattformrolle
vor dem Rollen-RPC. Auch wenn diese Metadaten nicht vom normalen Benutzer
bearbeitet werden koennen, war die Rollenquelle dadurch doppelt. Loop 1 macht
den bestehenden `platform_admins`-Eintrag zur einzigen Laufzeitautoritaet und
laedt die Clientrolle immer ueber `get_current_platform_role`.

## Umsetzung

- Zentrale Rollenmatrix in `platformAdminAuthorization.mjs`.
- Einheitliche Route- und Schreibberechtigungspruefung.
- Clientseitig keine Plattformrollenaufloesung aus Metadaten.
- Additive Migration
  `20260824003000_platform_admin_foundation_hardening.sql`.
- `platform_admins`: RLS bleibt aktiv; direkte Rechte fuer `public`, `anon` und
  `authenticated` werden entzogen.
- `current_platform_role`: aktiver Tabellen-Datensatz plus `auth.uid()`, fester
  `search_path`, keine Restaurant- oder Metadatenableitung.
- Nur `get_current_platform_role` ist fuer `authenticated` aufrufbar; interne
  Helper bleiben direkt gesperrt.

## Rollenmatrix

| Rolle | Plattformzugriff |
| --- | --- |
| `platform_admin` | erlaubt |
| andere dokumentierte interne Plattformrollen | nach Least-Privilege-Matrix |
| Owner/Admin/Manager eines Restaurants | blockiert |
| Staff/Supervisor | blockiert |
| Customer | blockiert |
| Anon | blockiert |

Support, Security und Viewer besitzen keinen Schreibzugriff. Schreibaktionen
bleiben bei den bereits dokumentierten internen Schreibrollen und werden von der
jeweiligen RPC erneut geprueft.

## Nicht geaendert

- Customer Auth und Owner Auth
- Staff Auth
- Punkte, Referral und Einloesung
- Geocoding und Reporting
- E-Mail-Vertraege
- Stripe
- normale Tenant-RLS
- bestehende Plattform-Geschaeftsfunktionen und Dashboardumfang

## Migration und Staging

Die Migration ist lokal erstellt, aber in diesem Loop nicht ungefragt auf
Staging angewendet. Vor der Anwendung muss bestaetigt werden, dass der benoetigte
interne Benutzer bereits einen aktiven `platform_admins`-Datensatz besitzt.
Es findet bewusst kein automatischer Privileg-Backfill aus Auth-Metadaten statt.

## Tests und Risiken

Die fokussierte Suite prueft die positive Rolle `platform_admin`, blockiert
Owner, Staff, Customer und Anon und kontrolliert Route, RPC-only Service Layer,
Tabellenautoritaet, Grants, Audit sowie unveraenderte Tenant-RLS.

Offenes Gate: Migration auf Staging anwenden und einen echten internen
Plattform-Admin sowie alle negativen Rollen live pruefen. Bis dahin maximal
CODE LOCK, nicht FINAL LOCK.

## Quality Gates

- Fokussierte Platform-Admin-Security-Tests: 9/9 PASS
- Vollstaendige autoritative Suite: 812/812 PASS, 0 skipped
- Typecheck: PASS
- Lint: PASS, 0 Fehler und 8 bestehende Warnungen
- Build: PASS
- `git diff --check`: PASS
- Secret Scan: PASS
- Staging-Dry-Run: PASS; exakt `20260824003000` geplant
- Staging-DB-Linter vor Anwendung: 0 Fehler
- Migration auf Staging angewendet: Nein
- Normale Tenant-RLS veraendert: Nein

## Finale Matrix

```text
PLATFORM ADMIN ROLE:
PASS

PLATFORM ADMIN ROUTE:
PASS

SERVER AUTHORIZATION:
PASS

OWNER ACCESS:
BLOCKED

STAFF ACCESS:
BLOCKED

CUSTOMER ACCESS:
BLOCKED

ANON ACCESS:
BLOCKED

AUDIT FOUNDATION:
PASS

NORMAL TENANT RLS CHANGED:
NO

DB MIGRATION:
20260824003000_platform_admin_foundation_hardening.sql

TESTS:
812/812 PASS

PLATFORM ADMIN FOUNDATION READY:
NO - CODE READY, STAGING MIGRATION AND LIVE ROLE TEST PENDING

PRODUCTION:
LOCKED

STRIPE:
DEFERRED
```
