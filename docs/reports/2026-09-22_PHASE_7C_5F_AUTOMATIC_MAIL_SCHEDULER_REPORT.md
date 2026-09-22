# WUXUAI® BONUS – Phase 7C.5F Automatic Mail Scheduler Report

## Ergebnis

Der isolierte automatische Staging-Scheduler hat genau eine neue synthetische
Testmail an den ausdrücklich autorisierten Empfänger zugestellt. Der Lauf war
zweifach geschützt: Supabase Edge JWT blieb aktiv und eine serverseitig
erzeugte Einmalberechtigung wurde atomar verbraucht. Der zugehörige Cron-Job
wurde vor dem Provider-Aufruf automatisch entfernt.

Status: **PHASE 7C.5F SYNTHETIC SCHEDULER DELIVERY LOCK**

Der allgemeine Customer-/Capacity-Mail-Scheduler bleibt deaktiviert. Dieser
Status ist kein Production- oder allgemeiner Scheduler-Lock.

## Ursache und enger Vertrag

Der vorhandene Dispatcher war auf manuell autorisierte synthetische Aufrufe
begrenzt. Für den Scheduler-Nachweis wurde ein separater Modus ergänzt, der:

- keine Nachricht selbst anlegen kann;
- nur einen bereits autorisierten Request-/Correlation-Datensatz reserviert;
- einen 256-Bit-Einmalwert ausschließlich gehasht persistiert;
- Supabase Edge JWT zusätzlich verlangt;
- genau einen Datenbank-Lebenszeitlauf erlaubt;
- Customer- und Capacity-Outbox weder scannt noch reserviert;
- den Cron-Job bei erfolgreicher Autorisierung vor dem Provider-Aufruf löscht.

## Geänderte Dateien

- `supabase/functions/transactional-mail-dispatcher/index.ts`
- `supabase/migrations/20260922003000_synthetic_mail_scheduler_test_contract.sql`
- `supabase/migrations/20260922004000_synthetic_mail_scheduler_jwt_transport.sql`
- `supabase/migrations/20260922005000_synthetic_mail_scheduler_single_run.sql`
- `tests/phase-7c5d-zeptomail-staging-isolation.test.mjs`
- `tests/phase-7c5f-synthetic-scheduler.local.sql`

Die vorbestehende lokale Änderung `supabase/.temp/cli-latest` wurde nicht
gestaged, verändert oder zurückgesetzt.

## Tests und technische Gates

- Focused Renderer-/Dispatcher-Tests: 25/25 PASS vor JWT-Hardening;
  finaler Scheduler-Isolationstest: 13/13 PASS.
- Lokaler SQL-Vertrag: PASS; genau eine Reservierung, Token nicht wiederverwendbar,
  Cron-Selbstabschaltung und unveränderte allgemeine Outboxes.
- Fresh-Replay: PASS bis Migration 162.
- Migration 160/161/162 Repeat: PASS.
- DB-Lint: PASS.
- Full Tests: 1939/1939 PASS nach finaler Dispatcher-Implementierung.
- Typecheck: PASS.
- Lint: PASS, 0 Fehler; 8 bekannte unveränderte Warnungen.
- Build: PASS mit nicht geheimen lokalen Build-Platzhaltern.
- Secret Scan und `git diff --check`: PASS.

## Staging

- Projekt: `bwhvfjuwixgwduoeqaya` (`wuxuai-bonus-staging`).
- Migrationen: 162/162; Repeat-Dry-Run leer.
- Edge Function: `transactional-mail-dispatcher` v9, ACTIVE,
  `verify_jwt=true`.
- Schedulerlauf: SENT, `attempt_count=1`, drei Auditereignisse.
- Test-Cron nach Autorisierung: 0 aktive Jobs.
- Erfolgreiche Scheduler-HTTP-Aufrufe: genau 1.
- Synthetische SENT-Zeilen: von 1 auf 2; genau eine neue Zeile.

## Zustellnachweis

- Betreff: `[STAGING TEST] WUXUAI® Bonus Kapazitätswarnung`
- From: `WUXUAI® Bonus <notifications@wuxuaibonus.com>`
- Reply-To: `support@wuxuaibonus.com`
- Empfänger: ausschließlich die founder-autorisierte Adresse.
- Inhalt: sichtbarer Hinweis „Synthetische Staging-Testnachricht“; keine echte
  Warnung, keine Buchung, Abbuchung oder Tarifänderung, keine Kauf-CTA.
- Physischer Inbox-Eingang: PASS, 22.09.2026 19:52 CEST.
- SPF: PASS.
- DKIM: PASS.
- DMARC: PASS (`p=none`).

Keine vollständigen Mailadressen des Empfängers, Provider-Message-IDs,
Request-/Correlation-IDs, SMTP-Daten, API-Schlüssel oder sonstige Secrets sind
in diesem Bericht enthalten.

## Outbox- und Datenintegrität

- 21 historische Customer-Nachrichten bleiben `SKIPPED` /
  `HISTORICAL_STAGING_TEST_DATA`.
- Customer-Outbox-Fingerprint vor/nach: identisch
  (`11b21a7b274ab5489ec8942c82ea3074`).
- Customer PENDING: 0.
- Customer Attempt-/Lease-Zustände: 0.
- Capacity-Warning-Outbox: 0.
- Businessdaten, Entitlements, Add-ons und Grants: unverändert.
- Production: unverändert.
- Stripe: unverändert.

## Commits

- Scheduler-Implementierung: `55f2daa90f61cf1e4bdc675139321269d530a9d1`
- JWT-Hardening: `9ae40f7c566c15f0147c7249b0a9589075428452`
- Single-Run-Hardening: `fd35533fd079507a43b705d3a9bf9b29b0e7aa18`
- Remote-Parität nach Implementierung: 0/0.

## Risiken und Abgrenzung

Es besteht kein offenes Risiko für diesen einmaligen Scheduler-Nachweis. Der
allgemeine automatische Mailversand ist bewusst nicht aktiviert und benötigt
einen gesonderten Founder-Auftrag sowie einen eigenen Betriebs-/Monitoring-Gate.
Production und Stripe wurden nicht berührt.
