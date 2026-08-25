# Owner Team Management V1 - Staff Invite Live Failure Fix

Datum: 25.08.2026  
Umgebung: Supabase Staging `bwhv...qaya`, Cloudflare Staging `bonus.wuxuaisbi.com`  
Production: LOCKED  
Stripe: DEFERRED

## Ursache

Die Teamliste war nach Anwendung der Migration `20260825002000_owner_staff_account_management.sql` funktionsfähig. Der zuvor sichtbare Ladefehler stammte aus einem alten Request-Zustand vor Migration und Seiten-Reload.

Der echte Einladungsfehler lag in der Edge Function `owner-staff-invite`. Bereits der CORS-Preflight antwortete mit HTTP 503 und `sb-error-code: BOOT_ERROR`. Die Supabase Function Logs bewiesen die Ursache:

`Uncaught SyntaxError: Identifier 'error' has already been declared`

Im Resend-Zweig wurden zwei `const { error }` im selben Block deklariert. Dadurch startete die Funktion nicht; Owner-Autorisierung, Invite-RPC und Auth-Einladung wurden vor dem Fix nicht erreicht.

Bei der anschließenden Audit-Verifikation wurde ein zweiter eng begrenzter Fehler gefunden: `staff_record.auth_user_id = input_auth_user_id` ergab beim ersten Binding `NULL`. Dadurch wurde `if not already_bound` nicht ausgeführt und der dedizierte Audit-Eintrag `STAFF_INVITED` übersprungen.

## Geänderte Dateien

- `supabase/functions/owner-staff-invite/index.ts`
- `src/modules/admin/staffManagementService.ts`
- `supabase/migrations/20260825003000_owner_staff_invite_audit_null_fix.sql`
- `tests/owner-team-management.test.mjs`

## Änderungen

- Der zweite Edge-Fehlerwert heißt eindeutig `mailError`; die Function bootet wieder.
- Sichere Clientdiagnose protokolliert ausschließlich HTTP-Status und internen Fehlercode, keine E-Mail, Tokens oder Sessiondaten.
- Die additive Migration macht die Erstbindung mit `is not distinct from` nullsicher.
- `SECURITY DEFINER`, fester `search_path`, Tenantprüfung und Grants bleiben unverändert streng.
- Zwei Regressionstests schützen Edge-Boot-Vertrag und nullsicheren Auditvertrag.

## Staging-Verifikation

- Edge Preflight: HTTP 204, korrekte CORS-Origin.
- Einladung: genau ein kontrollierter erfolgreicher Versuch.
- UI: Erfolgsmeldung `Die Einladung wurde versendet.`
- Teamzeile nach Invite: `Einladung offen`.
- Auth-User: genau 1.
- Staff-Datensatz: genau 1, restaurantbezogen, Auth-ID gebunden.
- Einladung wurde angenommen; Teamzeile zeigt `Aktiv`, Annahme und letzte Anmeldung.
- E-Mail-Bestätigung ist serverseitig gesetzt.
- Keine doppelte Staff- oder Auth-Identität.
- Audit-Fix-Probe: exakt ein `STAFF_INVITED`; gesamte Probe per `ROLLBACK` zurückgenommen.
- Migration History lokal/remote: synchron.
- DB Linter: 0 Fehler.

## Rollen und Sicherheit

- Owner, eigenes Restaurant: erlaubt.
- Owner, fremdes Restaurant: blockiert.
- Staff Teamverwaltung: blockiert.
- Customer Teamverwaltung: blockiert.
- Anon: kein `EXECUTE` auf dem Autorisierungshelfer.
- Service Role bleibt ausschließlich in der Edge Function.
- RLS wurde nicht deaktiviert oder gelockert.

## Qualität

- Tests: 890/890 PASS.
- Typecheck: PASS.
- Lint: 0 Fehler, 7 bestehende Warnungen.
- Build: PASS.
- `git diff --check`: PASS.
- DB Linter: 0 Fehler.

## Nicht geändert

- Keine Production-Aktion.
- Kein Stripe-Setup.
- Kein Push oder Merge.
- Keine Änderung an Punkte-, Customer-, Reward- oder Referral-Logik.
- Keine Lockerung von Tenant-Isolation, RLS oder Edge-JWT-Prüfung.

## Risiken

- Die Staff-Login- und Staff-Fachrouten müssen als separater realer Staff-Session-E2E weiter geprüft werden, falls dies nicht bereits durch die erfolgreiche Einladungsannahme abgedeckt wird.
- Der lokale Supabase-CLI-Zugriff hat während der Diagnose bestehende Projekt-API-Schlüssel ausgelesen. Keine Schlüssel wurden in Dateien, Git, Logs dieses Reports oder UI gespeichert. Eine separate Rotation des Legacy-Service-Schlüssels ist als betriebliche Vorsichtsmaßnahme sinnvoll, aber nicht Bestandteil dieses Fixes.

## Status

Owner-Team-Einladung auf Staging repariert und live verifiziert. Production bleibt gesperrt.

