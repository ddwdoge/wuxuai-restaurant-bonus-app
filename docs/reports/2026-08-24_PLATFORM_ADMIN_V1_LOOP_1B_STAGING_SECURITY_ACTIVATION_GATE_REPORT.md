# WUXUAI Bonus - Platform Admin V1 Loop 1B Staging Security Activation Gate

Datum: 2026-08-24  
Branch: `codex/v1-canonical-recovery`  
Ausgangscommit: `919141181223aa414ef004a09aa3f02637f2b7fd`  
Staging: `wuxuai-bonus-staging` (`bwhv...qaya`)

## Ursache des Blockers

Die Migration `20260824003000_platform_admin_foundation_hardening.sql` wurde
nicht auf Staging angewendet, weil beide verbindlichen Vorbedingungen
fehlschlagen:

1. `public.platform_admins` enthaelt 0 Datensaetze, davon 0 aktive
   Zuordnungen. Auch in `auth.users` existiert kein aktiver Benutzer mit einer
   anerkannten Plattformrolle in `app_metadata`. Eine beabsichtigte interne
   WUXUAI-Adminidentitaet konnte daher nicht bestaetigt werden.
2. Der unveraenderte Dry Run plant neben `20260824003000` auch die fachfremde
   Migration `20260824004000_authenticated_referral_registration_bridge.sql`.
   Der erwartete exklusive Migrationsplan fuer Loop 1B liegt damit nicht vor.

Es wurde kein Benutzer angelegt, keine Rolle vergeben und keine Migration
erzwungen. Production und Stripe blieben unangetastet.

## Staging-Bestand vor Anwendung

- `platform_admins`: 0 Zeilen, 0 aktive Zuordnungen, 0 inaktive Zuordnungen.
- Auth-Metadaten mit anerkannter Plattformrolle: 0 Benutzer.
- Aktiver `current_platform_role()`-Vertrag: `SECURITY DEFINER`, Owner
  `postgres`, `search_path=public`, liest noch `app_metadata` und
  `platform_admins`.
- `platform_admins`: RLS aktiv; `authenticated` besitzt aktuell noch SELECT,
  der durch die bestehende Own-Row-Policy begrenzt wird.
- `030` wuerde den Metadaten-Fallback entfernen, den sicheren Search Path auf
  `public, pg_temp` setzen und direkte Tabellenrechte entziehen. Ohne
  autoritative Admin-Zuordnung waere danach jedoch kein positiver Admin-Test
  moeglich.

## Migration und Linter

- Remote-Historie ist bis `20260824002000` synchron.
- Lokal offen: `20260824003000` und `20260824004000`.
- Dry Run: technisch erfolgreich, fachlich FAIL wegen unerwarteter `040`.
- Migration auf Staging: Nein.
- Staging DB Linter, Schema `public`, Error-Level: 0 Fehler.
- Keine RLS-, Grant-, Funktions- oder Audit-Aenderung wurde ausgefuehrt.

## Rollen- und Sicherheitspruefung

Die automatisierten Vertragsanalysetests bestaetigen lokal die vorgesehene
Rollenmatrix, die getrennte serverseitige Rollenquelle, den Route Guard, den
RPC-only Service Layer, die Audit-Basis und unveraenderte Tenant-RLS. Ein echter
positiver Platform-Admin-Test und die negativen Live-Tests duerfen diese
Staging-Aktivierung jedoch nicht ersetzen und wurden ohne reale, eindeutig
zugeordnete Testidentitaeten nicht vorgetaeuscht.

Der Client-Metadaten-Eskalationspunkt ist auf Staging noch nicht geschlossen,
weil `030` nicht aktiv ist und der aktuelle Serververtrag weiterhin
`app_metadata` als Rollenquelle akzeptiert. Normale Benutzer koennen diese
Metadaten nicht selbst setzen; fuer dieses Gate bleibt die doppelte Rollenquelle
dennoch ein FAIL.

## Qualitaet

- Autoritative Tests: 822/822 PASS, 0 skipped.
- Typecheck: PASS.
- Lint: PASS, 0 Fehler und 7 bestehende Warnungen.
- Build: PASS.
- `git diff --check`: PASS.
- Secret Scan des Diffs und aller ungetrackten Dateien: PASS.
- Keine `.env`-Dateien, Dumps, Build-Artefakte oder neuen ZIP-Exporte im Diff.

## Erforderliche naechste Aktion

Vor einem neuen Loop-1B-Lauf muss eine bereits legitimierte interne
WUXUAI-Auth-Identitaet explizit und nachvollziehbar in `platform_admins`
eingetragen werden. Diese Vergabe benoetigt eine separate, konkrete Freigabe;
es darf kein beliebiger Benutzer angelegt oder aus Restaurantrollen abgeleitet
werden. Danach muss `030` isoliert geplant werden, ohne `040` anzuwenden, und
erst anschliessend duerfen Migration, Rollen-Smokes und Audit-Smoke erfolgen.

## Finale Matrix

```text
MIGRATION APPLIED STAGING:
NO

MIGRATION HISTORY:
FAIL

DB LINTER ERRORS:
0

PLATFORM ADMIN IDENTITY:
FAIL

PLATFORM ADMIN ACCESS:
FAIL

OWNER ACCESS:
FAIL - LIVE TEST NOT STARTED

STAFF ACCESS:
FAIL - LIVE TEST NOT STARTED

CUSTOMER ACCESS:
FAIL - LIVE TEST NOT STARTED

ANON ACCESS:
FAIL - LIVE TEST NOT STARTED

CLIENT METADATA ESCALATION:
FAIL - HARDENING MIGRATION NOT ACTIVE

DIRECT API BYPASS:
FAIL - LIVE TEST NOT STARTED

TENANT RLS REGRESSION:
FAIL - LIVE TEST NOT STARTED

AUDIT:
FAIL - LIVE TEST NOT STARTED

TESTS:
822/822 PASS

TYPECHECK:
PASS

LINT:
PASS - 0 ERRORS, 7 EXISTING WARNINGS

BUILD:
PASS

PLATFORM ADMIN FOUNDATION READY:
NO

READY FOR LOOP 2:
NO

PRODUCTION:
LOCKED

STRIPE:
DEFERRED
```

Status: **NOT READY**
