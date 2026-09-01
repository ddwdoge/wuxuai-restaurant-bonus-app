# Onboarding-Status Constraint Fix - Staging

Datum: 2026-07-30  
Branch: `codex/v13-legal-maps-hardening`  
Ausgangscommit: `93c06cb`  
Supabase: `wuxuai-bonus-staging` (`bwhv...qaya`)

## Ursache

Die Anwendung aktiviert ein bestehendes Restaurant mit `onboarding_status = 'completed'`.
Der auf Staging vorhandene CHECK-Constraint erlaubte davor ausschließlich `draft` und
`ready`. PostgreSQL lehnte den Update deshalb mit `23514` ab.

## Constraint vor der Migration

- Name: `restaurants_onboarding_status_check`
- Definition: `CHECK (onboarding_status = ANY (ARRAY['draft'::text, 'ready'::text]))`
- Validiert: Ja

## Umsetzung

Migration:
`supabase/migrations/20260730001000_onboarding_status_allow_completed.sql`

Der bestehende Constraint wird kontrolliert unter demselben Namen ersetzt. Danach sind
exakt `draft`, `ready` und `completed` erlaubt. Die Migration enthält kein DML, verändert
keine bestehenden Werte und ändert weder RLS, Policies, Slugs noch Restaurant-Erstellung.

## Staging-Anwendung

- Dry-Run: erfolgreich; exakt eine ausstehende Migration erkannt
- Migration auf Staging angewendet: Ja
- Lokale und Remote-Version `20260730001000`: synchron
- Erneuter Dry-Run: Datenbank ist aktuell
- Statusverteilung vor und nach Anwendung: `draft = 2`, `ready = 3`
- Datenänderung durch Migration: Nein

Constraint danach:

`CHECK (onboarding_status = ANY (ARRAY['draft'::text, 'ready'::text, 'completed'::text]))`

## Live-Datenbankprüfung

Alle Update-Prüfungen liefen in expliziten Transaktionen mit anschließendem `ROLLBACK`.

- `completed` wird akzeptiert: Ja
- unbekannter Status wird abgelehnt: Ja
- authentifizierter Owner-Updatepfad erfolgreich: Ja
- erneute Aktivierung idempotent: Ja
- Restaurant-ID unverändert: Ja
- Slug unverändert: Ja
- neues Restaurant angelegt: Nein
- Duplikat angelegt: Nein

RLS blieb aktiviert. Die drei vorhandenen Restaurant-Policies sind unverändert; es wurde
keine Policy ergänzt, entfernt oder gelockert.

## Anwendungskonsistenz

- TypeScript-Domaintyp: `draft | ready | completed`
- Onboarding-Mapper: dieselben drei Werte
- Route Guards: `ready` und `completed` gelten als abgeschlossen
- Aktivierungshelper: ausschließlich Update des bestehenden Restaurants
- Slug wird beim Abschluss nicht neu erzeugt oder geändert
- Legal-Readiness-Funktionen berücksichtigen `ready` und `completed`
- Fallback-INSERT: nicht vorhanden und nicht ergänzt

## Tests und Qualität

- Neue Constraint- und Aktivierungstests: 6
- Tests gesamt: 336/336 erfolgreich
- Typecheck: erfolgreich
- Lint: 0 Fehler, 6 bestehende Warnungen
- Build: erfolgreich
- `git diff --check`: erfolgreich

## Nicht durchgeführt

- Kein Production-Migrationslauf
- Kein Deployment
- Kein Push
- Kein Merge
- Kein vollständiger Browser-Neuregistrierungsflow mit echtem Staging-Owner

Der Constraint-Fehler ist auf Staging behoben und der authentifizierte Updatepfad wurde
serverseitig verifiziert. Ein echter Browserlauf kann erst mit einer autorisierten
Staging-Owner-Testsitzung den konkreten PostgREST-Status `200/204`, Reload und die gesamte
Onboarding-Navigation abschließend bestätigen.

## Status

`CHANGES_REQUIRED`

Offener Punkt: vollständiger authentifizierter Browser-E2E-Lauf auf Staging.
