# Platform Admin TOTP Recovery Runner – Local Report

Datum: 2026-09-27

## Ursache

Vor einer Anwendung von Migration 173 auf Staging musste der im Recovery-
Vertrag vorgesehene Auth-Admin-Pfad als eng begrenzter, fail-closed Runner
lokal ausführbar werden. Dieser Lauf hat keine Staging-, Production- oder
Stripe-Daten verändert und keinen realen Faktor gelesen oder entfernt.

## Geänderte Dateien

- `scripts/platform-admin-totp-recovery-runner.mjs`
- `tests/platform-admin-totp-recovery-runner.test.mjs`
- `tests/platform-admin-totp-aal2-auth.local.mjs`
- `docs/PLATFORM_ADMIN_TOTP_AAL2_RECOVERY_CONTRACT.md`
- `docs/PLATFORM_ADMIN_TOTP_AAL2_STAGING_CHECKLIST.md`
- `docs/reports/2026-09-27_STAGING_TRANSITION_173_176_READINESS_REPORT.md`
- dieser Bericht

## Sicherheitsvertrag

- Auth-Admin-Credential ausschließlich kurzzeitig im Prozessspeicher;
- exakte HTTPS-Project-URL-/Project-Ref-Bindung;
- Ed25519-signierte, maximal 15 Minuten gültige Freigabe;
- Requestor getrennt von Approver und Executor;
- mindestens zwei unabhängige Identitätsnachweise;
- exakte Bindung an TOTP-Faktor, Executor und Migration-173-Hash;
- restriktive Approval-/Public-Key-/Evidenz-Dateirechte;
- explizite, Correlation-ID-gebundene Löschbestätigung;
- Faktor muss eindeutig, `totp` und `verified` sein;
- vor Auth-Admin-Zugriff exklusiver pseudonymisierter Startnachweis;
- nach Erfolg append-only Abschlussnachweis;
- keine User-/Faktor-ID, kein Token und kein Credential in der Evidenz.

## Lokale Nachweise

- Runner-/AAL2-Focused-Matrix: 20/20 PASS;
- Node-Syntaxprüfung: PASS;
- echter lokaler Supabase-Auth-Lauf mit kurzlebigem synthetischem Benutzer:
  TOTP-Enroll/Challenge, AAL2, Token-Refresh, Runner-`listFactors`/
  `deleteFactor`, blockierter alter AAL2-RPC und vollständiger Cleanup: PASS;
- realer Platform-Admin-Faktor: nicht gelesen, nicht verändert;
- Staging-Auth-Admin-Autorität: nicht verwendet;
- Full Suite/Typecheck/Lint/Build: aus dem bestätigten Integrationsnachweis
  übernommen; App-/Migration-/Runtime-Produktcode wurde in diesem Runner-Loop
  nicht geändert.

## Offene Gates

- tatsächliche maximale Staging-JWT-Laufzeit;
- namentlich benannter unabhängiger Recovery Approver;
- namentlich benannter Recovery Executor mit separatem MFA-geschütztem
  Supabase-Organisationszugang und nachgewiesener Auth-Admin-Autorität;
- geschützter Ausführungsort und sichere Laufzeit-Zuführung der Autorität;
- Approver-Key-Verwahrung und externe append-only Incident-Ablage;
- Founder-/Security-Freigabe und kontrolliertes Wartungsfenster.

## Nicht geändert

- keine Migration und keine Auth-Konfiguration;
- keine Staging-/Production-/Stripe-Daten;
- kein realer Faktor oder Zugang;
- kein Deployment und kein Push;
- `supabase/.temp/cli-latest` blieb unangetastet und uncommitted.

## Status

**RECOVERY RUNNER LOCAL PASS / MIGRATION 173 STAGING NOT READY**
