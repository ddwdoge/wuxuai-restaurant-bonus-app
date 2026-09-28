# BASIC V1 Production Preparation Matrix Report

Stand: 28.09.2026, Europe/Vienna

Ausgangs-HEAD: `f1e767ae2376cb993ea3debce8fa6a8dfc20f032`

Scope: read-only Provider-/Umgebungsinventar sowie enger lokaler Production-
Redemption-Konfigurationsfix. Kein Production-Write, kein Deployment und kein
Stripe-Zugriff.

## Ursache und Ziel

Der BASIC-Code-Lock war auf Staging bei Migration 185 belegt, waehrend das
Production-Runbook den tatsaechlichen Abstand der Production-Umgebung, die
erforderlichen Edge-Komponenten und den Mail-/Monitoring-/Backupvertrag noch
nicht konkret genug auswies. Zusaetzlich akzeptierte die Redemption-Edge-
Funktion nur lokale oder fest gebundene Staging-Runtime und waere auf
Production trotz korrekter Konfiguration mit 503 fail-closed geblieben.

## Read-only Inventar

- Git: Integrationsbranch lokal/remote exakt `f1e767ae...`, Paritaet `0/0`.
- Staging Supabase: ACTIVE_HEALTHY, 185/185, 0 pending.
- Production Supabase: ACTIVE_HEALTHY, 123/185, 62 pending; erste offene
  Migration `20260904001000`, letzte benoetigte Migration
  `20260928004000`.
- Staging Worker: aktive Version
  `7e89c92e-27ba-474f-a090-f2f1a5469168`, HTTP 200 und erwartetes
  Hauptasset.
- Production Worker: aktive Version
  `bd7f45cd-6601-4429-ab76-8a94e8c68a27`, HTTP 200, aber anderes/älteres
  Hauptasset.
- Marketing-Domain `bonus.wuxuaisbi.com`: beim Check HTTP 530. Dieser Befund
  wurde nicht repariert und ist getrennt vom Production-App-Worker.
- Production Edge: vorhanden waren `owner-location-geocode`,
  `owner-staff-invite` und `transactional-mail-dispatcher`. Die fuer den
  aktuellen BASIC-Vertrag benoetigten Funktionen `platform-support-auth` und
  `redemption-confirmation` waren nicht deployed.
- Production Mail: Runtime-Namen fuer SMTP und Scheduler waren teilweise
  vorhanden. `SMTP_REPLY_TO` und `TRANSACTIONAL_MAIL_MODE` waren nicht als
  vorhandene Namen belegt; der aktuelle Dispatcher bleibt dadurch
  fail-closed. Es wurde kein Wert gelesen.
- Production Backup: acht physische Backups sichtbar; letztes gelesenes Backup
  `COMPLETED`. PITR war deaktiviert, WAL-G-Backups aktiviert.
- Externes Error-/Uptime-Monitoring war im Source-/Providerinventar nicht
  nachweisbar. Das interne Health Center wird erst mit den offenen Migrationen
  auf den aktuellen Stand gebracht.

## Eng geschlossene technische Luecke

`redemption-confirmation` besitzt nun einen separaten Production-Modus. Er
akzeptiert ausschließlich die feste Production-App-Origin und das feste
Production-Supabase-Projekt. Staging und Production koennen nicht
gegeneinander vertauscht werden. Fehlende, falsche oder gemischte Bindungen
bleiben fail-closed. Request-Schema, Authentifizierung, Rollen-, Tenant-,
Idempotenz- und Datenbankvertrag wurden nicht veraendert.

Geaenderte technische Dateien:

- `supabase/functions/_shared/redemptionEdgeContract.mjs`
- `supabase/functions/redemption-confirmation/index.ts`
- `tests/phase-7d3b-redemption-edge-contract.test.mjs`

## Runbook-Korrektur

`docs/21_PRODUCTION_GO_LIVE_PLAN.md` enthaelt jetzt:

- konkrete Staging-/Production-Matrix fuer App, DB, Edge, Konfiguration,
  Domains, E-Mail, Monitoring und Backup;
- exakte spaetere Reihenfolge von Production-Backup ueber Migration 124 bis
  185, Edge Functions, App-Version und Smoke-Test;
- versionsbasierten Worker-/Function-Rollback und forward-only DB-Vertrag;
- klare Sperre fuer TEST-Billing-Funktionen, Customer-Mail-Scheduler,
  Push-Reminder und Stripe LIVE;
- kurzen Production-Smoke-Test ohne echte Aktivierung oder Zahlung.

## Was nicht geaendert wurde

- Keine Migration und keine Datenbankzeile.
- Kein Staging- oder Production-Deployment.
- Keine Cloudflare-, Supabase-, Domain-, Mail- oder Secret-Konfiguration.
- Keine Restaurant-, Trial-, Entitlement-, KYB-, Punkte- oder Redemption-
  Businessdaten.
- Kein Stripe TEST/LIVE und kein Customer-Mail-Versand.
- Legal-, Privacy-, Tax-, KYB-, Kassa-, Seller- und Stripe-Gates bleiben zu.

## Pruefergebnisse

- Migration 185 unveraendert; SHA-256
  `ba27f88ef697cbae7b76db45036c4f3ccee76e1c3982126d525dfdf47a0fe510`.
- Fokussierte Edge-/Origin-/HTTP-Vertragstests: 10/10 PASS.
- Vollstaendige Testsuite nach dem engen Runtime-Fix: 2.104/2.104 PASS.
- Typecheck: PASS.
- Lint: PASS mit 0 Fehlern und 8 vorbestehenden Warnungen.
- Build mit geschuetzt eingelesener oeffentlicher Staging-Clientbindung: PASS;
  die Werte wurden nicht ausgegeben oder dauerhaft gespeichert.
- Secret Scan des beabsichtigten Diffs: PASS.
- `git diff --check`: PASS.
- Keine task-eigenen Hintergrundprozesse oder Container verblieben.

## Statusgrenze

Technische Release-Vorbereitung und Runbook sind konkretisiert. Production ist
noch nicht freigegeben: 62 Migrationen, aktuelle Edge-/App-Paritaet, Mail-
Entscheidung, Monitoring sowie alle externen Gates sind vor dem Rollout zu
schliessen. Der lokale Redemption-Fix benoetigt vor einem spaeteren Release
noch einen eng geprueften Commit und die normale Integrations-/Staging-
Uebernahme; in diesem Auftrag erfolgte kein Push.

Status: **PRODUCTION PREPARATION CODE LOCK / PRODUCTION AND EXTERNAL GATES OPEN**
