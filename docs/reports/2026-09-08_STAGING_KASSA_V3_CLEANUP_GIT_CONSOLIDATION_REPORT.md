# WUXUAI Bonus - Staging Kassa V3 Cleanup und Git-Konsolidierung

Datum: 2026-09-08
Umgebung: Staging `bwhvfjuwixgwduoeqaya`
Production: unveraendert
Founder-Freigabe: verwendet

## Ursache

Der isolierte Kassa-Compliance-V3-Test-Tenant konnte beim ersten atomaren
Cleanup nicht geloescht werden. `restaurant_legal_profiles.operator_profile_id`
referenzierte noch das zu loeschende `organization_legal_profiles`-Profil. Die
Loeschreihenfolge im bestehenden Test-Tenant-Cleanup beruecksichtigte diese
Abhaengigkeit nicht.

## Eng begrenzte Korrektur

Die Forward-Migration
`20260908008000_kassa_test_tenant_legal_profile_dependency_fix.sql` installiert
einen serverseitigen `BEFORE DELETE`-Trigger. Er entfernt das abhaengige
Restaurant-Rechtsprofil nur innerhalb des bereits autorisierten, atomaren
TEST-ONLY-Cleanup-Kontexts und nur fuer den exakt gebundenen Restaurant-Tenant.

Nicht geaendert wurden RLS, Rollen, Kassa-Statuslogik, Gift Redemption,
QR-/Tages-PIN-Vertraege, globale Legal-Unveraenderbarkeit oder Production.

## Cleanup-Nachweis

Geloeschter Test-Tenant:

- Name: `WUXUAI KASSA CLEANUP TEST 2026-09-08`
- Restaurant-ID: `406bd92e-c5ac-4684-9cb5-0cfcda990e26`
- TEST-ONLY-Preflight: bestanden
- Starke Bestaetigung: tenant- und namensgebunden
- Atomarer Cleanup: erfolgreich

Inventar unmittelbar vor dem Cleanup:

- Organisationen: 1
- Restaurants: 1
- Standorte: 1
- Owner: 1
- Staff: 1
- Kunden: 1
- Memberships: 1
- Customer-Account-Zuordnungen: 1
- Punktebuchungen: 2
- QR-Referenzen: 54
- PIN-Versuche: 0
- Rewards: 2
- Redemptions: 1
- Kassa-Bestaetigungen: 1
- Kassa `OPEN`: 0
- Kassa `RECORDED`: 0
- Kassa `OWNER_REVIEWED`: 1
- Angebote: 0
- Mail-Queue: 0
- Notification-State: 0
- Tenant-Audit: 229
- Legal/Consent: 15
- Storage: 0
- Weitere Tenant-Zeilen: 3

Read-only Datenbankpruefung nach dem Cleanup:

- Alle geprueften tenant-eigenen Zieltabellen: 0 Zeilen
- Cleanup-Registry-Eintrag entfernt: 1
- Tenant-lokaler Cleanup-Audit-Eintrag entfernt: 1
- Test-Customer Auth-Identitaet entfernt: 1
- Test-Customer Account entfernt: 1

Explizit erhalten:

- `Kaffee Konditorei baeckerei`: 1 Restaurant, 13 Kunden
- Globaler Weifen-Auth-User: 1
- Fremde Weifen-Memberships: 4
- Fremde Weifen-Punktebuchungen: 10
- Unrelated Staging data deleted: 0
- Production data changed: 0

## Physischer Kassa-Flow

Der isolierte Staging-Flow wurde vor dem Cleanup vollstaendig bestanden:

- Personal Customer QR und kanonische Scanner-Identitaet: PASS
- Tages-PIN und Punktebuchung: PASS
- QR-Einmalverwendung: PASS
- Welcome Gift, 15-Minuten-Fenster und Swipe Redemption: PASS
- `OPEN -> RECORDED -> OWNER_REVIEWED`: PASS
- Platform-Admin-Diagnose und Audit-Reihenfolge: PASS
- Rollen-/Tenant-Schutz: PASS
- Responsive 320/375/390/414/430/768/1024/1280: PASS

## Migrationen

Alle folgenden Dateien sind auf Staging angewendet und durch den Post-Dry-Run
als vollstaendig repraesentiert:

1. `20260908001000_owner_trial_basic_plan_compatibility.sql`
2. `20260908002000_owner_branch_basic_plan_compatibility.sql`
3. `20260908003000_owner_trial_legal_package_compatibility.sql`
4. `20260908004000_kassa_test_tenant_legal_cleanup_fix.sql`
5. `20260908005000_kassa_foreign_test_customer_cleanup.sql`
6. `20260908006000_kassa_foreign_cleanup_preflight_lock_fix.sql`
7. `20260908007000_staff_scanner_customer_label_consistency.sql`
8. `20260908008000_kassa_test_tenant_legal_profile_dependency_fix.sql`

Post-Dry-Run: `0` pending, Remote-Datenbank aktuell.

## Geaenderte Dateien

Der lokale Konsolidierungs-Scope umfasst 23 Dateien:

- 6 Runtime-/UI-Dateien
- 8 Migrationen
- 3 Testdateien
- 6 direkte Reports einschliesslich dieses Abschlussberichts

`supabase/.temp/cli-latest`, Build-Artefakte, Secrets, Exporte und Production-
Konfiguration sind nicht Teil des Scopes.

## Verifikation

- Focused Kassa/Security Tests: 81/81 PASS
- Full tests: 1362/1362 PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler, 9 bekannte Warnungen
- Build mit lokalem Staging-Environment: PASS
- Secret Scan: PASS
- `git diff --check`: PASS
- Staging Migration Dry-Run: PASS, 0 pending
- DB Linter: PASS mit bekannten, nicht durch diese Korrektur erzeugten Warnungen
- RLS/Security: PASS

## Was nicht geaendert wurde

- Keine Production-Migration
- Kein Production-Deployment
- Keine Production-Daten-, Auth-, RLS-, DNS- oder Cloudflare-Aenderung
- Kein GitHub-Push
- Keine allgemeine Tenant-Delete-Funktion
- Keine Lockerung von Audit-/Legal-Unveraenderbarkeit

## Risiken

Keine offenen P0- oder P1-Risiken im geprueften Kassa-V3-Staging-Scope. Die
lokale Konsolidierung muss vor einem spaeteren PR nochmals auf exakten Scope und
Remote-Checks geprueft werden.

## Abschluss

- Aufgabe: Isolierten Kassa-V3-Test-Tenant atomar bereinigen und Git-Scope vorbereiten
- Build: Ja
- Migration: Erstellt und auf Staging angewendet
- Flow-Test: Ja
- RLS/Security: Ja
- Alte Logik geprueft: Ja
- Status: FINAL LOCK fuer Staging; lokaler Git-Branch vorbereitet, nicht gepusht
