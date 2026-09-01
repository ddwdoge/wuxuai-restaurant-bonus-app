# WUXUAI Bonus P1 - Exact Role Lifecycle Contract Audit

Datum: 2026-08-30  
Branch: `codex/v1-canonical-recovery`  
Modus: Audit, keine Anwendungscode- oder Datenbankaenderung

## Ursache

Der neue Founder-Vertrag erlaubt additive Rollen auf einer Supabase-Auth-
Identitaet, verbietet aber die Owner-/Restaurant-Provisionierung, solange fuer
dieselbe Identitaet mindestens eine kanonisch aktive Staff-Mitgliedschaft
besteht. Der aktuelle Serververtrag `start_restaurant_owner_trial` prueft nur
Authentifizierung und Pflichtangaben. Er beginnt anschliessend unmittelbar mit
Profil- und Restaurant-Provisionierung. Eine Staff-Pruefung existiert weder vor
der ersten DML-Aktion noch spaeter.

Damit ist folgende aktuell moegliche Sequenz ein Vertragsverstoss:

`ACTIVE STAFF -> /register -> start_restaurant_owner_trial -> Restaurant + Owner + Trial`

## Autoritative Provisionierungsfunktion

`public.start_restaurant_owner_trial(text, text, text)` erzeugt beziehungsweise
sichert:

- Profil
- Restaurant; die bestehende Organization-/Branch-Architektur wird dabei
  ueber die kanonischen Trigger/Helper ergaenzt
- `restaurant_members` mit Rolle `owner`
- Branch-Subscription und Trial
- Audit-Ereignis

Live-Staging und aktuelle Migration stimmen ueberein:

- `owner_has_staff_gate = false`
- `owner_checks_active_staff = false`
- `owner_creates_restaurant = true`
- `owner_creates_trial = true`

## Rollenmatrix

| Identitaet | Owner Portal | Staff eigenes Restaurant | Customer | Owner-Neuregistrierung |
| --- | --- | --- | --- | --- |
| Owner only | PASS | PASS | nicht automatisch | bereits Owner/idempotent |
| Staff only, aktiv | BLOCKED fuer Owner Portal | PASS | nicht automatisch | **FAIL: aktuell erlaubt** |
| Customer only | BLOCKED | BLOCKED | PASS | PASS, gleiche Auth-ID |
| Owner + Customer | PASS | PASS | PASS | bereits Owner/idempotent |
| Staff + Customer, aktiv | BLOCKED fuer Owner Portal | PASS | PASS | **FAIL: aktuell erlaubt** |

## Regelstatus

- Owner nutzt den eigenen Mitarbeiterbereich ueber die autoritative
  `restaurant_members`-Beziehung und ohne `staff_members`-Fake: **PASS**.
- Owner-Customer ist nicht automatisch: **PASS**.
- Owner, Staff, Customer und Platform Admin koennen den Customer-Bereich mit
  `activate_authenticated_customer_account` auf derselben Auth-ID idempotent
  aktivieren: **PASS**.
- Normaler Staff erhaelt keinen Owner-Zugriff und nur fuer aktive,
  restaurantbezogene Staff-Zuordnungen Zugriff: **PASS**.
- Customer -> Staff nutzt ueber die aktuelle additive Migration und die Edge
  Function denselben vorhandenen Auth-User: **PASS**.
- Active Staff -> neue Owner-Provisionierung: **FAIL**.
- Staff-Deaktivierung -> Owner-Freigabe: **NOT IMPLEMENTED**, weil der
  vorgelagerte Blockierungsvertrag insgesamt fehlt.
- Suspendieren/Archivieren loescht weder `auth.users` noch Customer-Account
  oder Customer-Memberships: **PASS**.
- Mehrere Staff-Restaurants werden beim Owner-Start nicht geprueft:
  **NOT IMPLEMENTED**.
- Eine Platform-Admin-Rolle allein blockiert Customer-, Staff- oder
  Owner-Aktivierung nicht: **PASS**. Ein kuenftiger Gate darf nur die separate
  aktive Staff-Beziehung auswerten.

## Kanonisches Staff-Statusmapping

Der bestehende Staff-Lifecycle besitzt:

- `invited`: nicht aktiv, Owner-Registrierung soll erlaubt sein
- `active` plus `active = true` plus `archived_at is null`: aktive
  Beschaeftigung, Owner-Registrierung muss blockiert sein
- `suspended`: nicht aktiv, Owner-Registrierung soll erlaubt sein
- `archived`: entfernt, Owner-Registrierung soll erlaubt sein
- `legacy`: kein kanonischer persoenlicher aktiver Staff-Zugang ohne passende
  Auth-/Membership-Beziehung; darf nicht allein blockieren

Es gibt keinen separaten Status `inactive`. Die vorhandenen kanonischen
Entsprechungen sind `suspended` und `archived`. Eine physische Loeschung ist
nicht der aktuelle Lifecycle; Entfernen wird auditiert archiviert.

## Exakte Mismatches

### 1. Kritisch: serverseitiger Owner-Registrierungsgate fehlt

- Datei: `supabase/migrations/20260830001000_v1_commercial_contract_three_month_trial.sql`
- Funktion: `public.start_restaurant_owner_trial(text, text, text)`
- Aktuell: Jeder bestaetigte Auth-User ohne vorhandenes eigenes Restaurant kann
  die Provisionierung starten, auch bei aktiver Staff-Mitgliedschaft.
- Erforderlich: Vor **jeder** DML-Aktion global ueber alle Restaurants auf eine
  Staff-Zeile mit gleicher `auth_user_id`, `active = true`,
  `account_status = 'active'` und `archived_at is null` pruefen und mit einem
  stabilen sicheren Fehlercode abbrechen.
- Security-/Business-Auswirkung: Unerlaubte Organization-/Restaurant-/Branch-
  und Trial-Provisionierung durch aktive Staff-Identitaeten.

### 2. Frontend bildet den fehlenden Gate nicht ab

- Dateien: `src/modules/auth/RegisterPage.tsx`,
  `src/modules/auth/registerOwnerService.ts`
- Aktuell: Jedes bestaetigte Konto ohne Owner-Zugriff wird als aktivierbares
  bestehendes Konto behandelt und ruft direkt den Trial-RPC auf.
- Erforderlich: Serverseitigen stabilen Fehlercode verstaendlich abbilden. Eine
  optionale Vorabdarstellung darf nur UX sein und den Servergate nicht ersetzen.

### 3. Testabdeckung fuer neuen Founder-Vertrag fehlt

- Aktuell: `1149/1149` Tests bestehen, aber kein Test fordert den aktiven
  Staff-Block vor Provisionierung.
- Erforderlich: Active, invited, suspended, archived, mehrere Staff-
  Mitgliedschaften, Customer-only, Platform-only, Staff+Customer sowie
  Null-Side-Effects fuer Profile/Restaurant/Branch/Membership/Trial testen.

### 4. Dokumentations- und historische Testmismatches

- `docs/24_SECURITY_PRIVACY.md` behauptet noch, Customer- und Platform-
  Identitaeten duerften nicht an Staff gebunden werden. Das widerspricht dem
  neuen additiven Rollenvertrag und dem aktuellen effektiven RPC.
- `tests/owner-team-management.test.mjs` prueft weiterhin die historische
  exklusive Rollenlogik in Migration `20260825002000`, obwohl
  `20260830002000_multi_role_account_foundation.sql` sie effektiv ersetzt.
- Der Canonical Product Contract enthaelt noch keinen ausdruecklichen
  Active-Staff-Owner-Registrierungsgate.

## Erforderliche Aenderungen, noch nicht umgesetzt

1. Additive Forward-Migration fuer `start_restaurant_owner_trial` mit globalem
   Active-Staff-Check vor der ersten DML-Aktion.
2. Stabiler serverseitiger Fehlercode, zum Beispiel
   `OWNER_REGISTRATION_ACTIVE_STAFF_BLOCKED`, nur fuer `authenticated`.
3. Deutsche Owner-UX fuer diesen Fehler; keine Organization, Restaurant,
   Branch, Owner-Membership oder Trial-Nebenwirkung.
4. Contracttests fuer alle Status- und Multi-Restaurant-Faelle sowie
   Side-Effect-Freiheit.
5. Canonical Contract, CTO-Entscheidung, API-/Security-Dokumentation und
   ersetzte historische Tests auf das additive Modell aktualisieren.
6. Migration zuerst auf Development/Test-Supabase anwenden; danach History,
   DB-Linter, Grants/RLS und echte Lifecycle-Gates pruefen.

## Was wurde nicht geaendert

- Kein Anwendungscode
- Keine Migration
- Keine Datenbankdaten
- Keine RLS-/Grant-Regel
- Kein Deployment
- Keine Production-Aktion
- Keine Stripe-Aktion

## Verifikation

- Live-Staging-Funktionsdefinitionen: read-only geprueft
- Tests: `1149/1149 PASS`
- Typecheck: PASS
- Lint: PASS mit 0 Fehlern und 7 bestehenden Warnungen
- Build: PASS mit vorhandener Development/Test-Public-Konfiguration

## Risiken

Release-blockierend ist die aktuell erlaubte Owner-Provisionierung fuer aktive
Staff-Identitaeten. Gruene bestehende Tests kompensieren diesen fehlenden neuen
Vertrag nicht.

Status: **NOT READY**

