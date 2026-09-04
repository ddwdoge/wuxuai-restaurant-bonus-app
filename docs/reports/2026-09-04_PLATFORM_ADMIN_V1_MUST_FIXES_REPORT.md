# Platform Admin V1 Must-Fixes Report

Datum: 2026-09-04

## Ursache

Die globale Platform-Admin-Ansicht unterschied fehlende Telemetrie nicht
ausreichend von einem gesunden Systemzustand. Einzelne Audit-Aktionen lagen
zudem knapp unter der geforderten Touchhoehe von 44 Pixel.

## Geaenderte Dateien

- `src/modules/platform/PlatformAdminPage.tsx`
- `src/modules/platform/platformAdminService.ts`
- `src/modules/platform/PlatformOperationalTelemetry.tsx`
- `src/modules/platform/platformOperationalTelemetryView.mjs`
- `src/modules/platform/platformOperationalTelemetryView.d.mts`
- `src/styles.css`
- `supabase/migrations/20260904001000_platform_admin_v1_operational_telemetry.sql`
- `tests/platform-admin-operational-telemetry.test.mjs`
- `docs/07_WUXUAI_ADMIN.md`
- `docs/19_CHANGELOG.md`
- `docs/reports/2026-09-04_PLATFORM_ADMIN_V1_MUST_FIXES_REPORT.md`

## Was wurde geaendert

- Ein read-only, rollenbegrenzter Betriebsstatus fuer Cron, E-Mail und
  Registrierungen wurde ergaenzt.
- Die Anzeige verwendet nur belegte Zustandsdaten und unterscheidet
  Betriebsbereit, keine aktuellen Ereignisse, eingeschraenkt, Fehler und nicht
  verfuegbar.
- Die Touchhoehe der betroffenen Platform-Admin-Audit-Aktionen wurde auf 45
  CSS-Pixel gesetzt, damit die reale Browsermessung mindestens 44 Pixel
  erreicht.

## Was wurde nicht geaendert

- Keine deferred Platform-Admin-Module, Analytics oder Stripe-Funktionen.
- Keine Product- oder Restaurant-Businesslogik.
- Keine RLS-Lockerung, kein Service-Role-Schluessel im Frontend.
- Keine Production-Datenbank, kein Production-Worker, keine Production-Domain,
  kein Production-Auth und keine Production-Edge-Function.

## Build Ergebnis

- Platform-Admin-Tests: 42/42 PASS
- Vollstaendige Tests: 1278/1278 PASS
- Typecheck: PASS
- Lint: PASS (0 Fehler; 7 bestehende Warnungen)
- Production-Build mit verifizierter Staging-Konfiguration: PASS
- Secret Scan: PASS
- `git diff --check`: PASS

## Migration

- Migration: `20260904001000_platform_admin_v1_operational_telemetry.sql`
- Staging-Projekt: `bwhvfjuwixgwduoeqaya`
- Pre-Dry-Run: genau eine ausstehende Migration
- Auf Staging angewendet: Ja
- Post-Dry-Run: 0 ausstehende Migrationen
- DB Linter: 0 Fehler
- Production angewendet: Nein

## Staging Ergebnis

- Worker: `wuxuai-restaurant-bonus-app-staging`
- Custom Domain: `staging-app.bonus.wuxuaisbi.com`
- Deployment-Version: `dd049790-4e41-4f61-bce2-ee4d8fbb0d03`
- Cron: Betriebsbereit, 7/7 konfiguriert und 7/7 aktiv
- E-Mail: Eingeschraenkt wegen belegter Warteschlange; kein falscher
  Gesundheitsstatus
- Registrierung: Betriebsbereit anhand vorhandener Audit-Evidenz
- Anonymer RPC-Aufruf: HTTP 401
- Anonymer Seitenaufruf: zur Anmeldung umgeleitet
- Staging-Bundle: nur Staging-Supabase `bwhvfjuwixgwduoeqaya`

## Responsive Ergebnis

Physische Browsermessung bei 320, 375, 390, 414, 430, 768 und 1024+ Pixel:

- kleinste gemessene Touchhoehe: 45 Pixel
- horizontaler Ueberlauf: keiner
- Aktionsbeschriftungen: lesbar

## Risiken

- Die E-Mail-Telemetrie meldet aktuell korrekt `Eingeschraenkt`, weil
  Nachrichten in der Warteschlange liegen. Das ist ein belegter
  Betriebszustand und kein Fehler dieser Platform-Admin-Implementierung.
- Die Auth-SMTP-Konfiguration ist aus dem Datenbankvertrag nicht pruefbar und
  wird deshalb nicht als gesund behauptet.

## Status

**FINAL LOCK (STAGING)**
