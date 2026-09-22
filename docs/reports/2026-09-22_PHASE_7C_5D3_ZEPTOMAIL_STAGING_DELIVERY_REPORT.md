# Phase 7C.5D3 – ZeptoMail Staging Delivery Report

Datum: 2026-09-22  
Branch: `codex/v1-release-integration`  
Implementierungscommit: `0bfaea5ab06c0bd5146865c90c2d435ac09e81fd`  
Staging-Projekt: `bwhvfjuwixgwduoeqaya` (`wuxuai-bonus-staging`)

## Ursache

Der normale Capacity-Mail-Renderer war für den isolierten synthetischen
Staging-Nachweis nicht zulässig, weil seine produktive Warnsprache und CTA wie
eine reale Kapazitätswarnung wirken konnten. Der Versandpfad benötigte daher
einen eigenen fail-closed Renderer für `synthetic_capacity`.

## Geänderte Dateien

- `supabase/functions/_shared/transactionalMailTemplates.mjs`
- `supabase/functions/transactional-mail-dispatcher/index.ts`
- `tests/phase-7c5d-zeptomail-staging-isolation.test.mjs`

Migration 158 wurde nicht verändert. Für diesen Abschlussbericht kam nur diese
Reportdatei hinzu.

## Was wurde geändert

- Dedizierte HTML- und Plain-Text-Ausgabe für synthetische Capacity-Tests.
- Exakter Betreff: `[STAGING TEST] WUXUAI® Bonus Kapazitätswarnung`.
- Sichtbarer Hinweis `Synthetische Staging-Testnachricht` sowie klare Aussage,
  dass keine echte Warnung, Buchung, Abbuchung oder Tarifänderung vorliegt.
- Technische Referenzen sind ausschließlich Environment, Request-ID und
  Correlation-ID.
- Kein Kauf-, Upgrade-, Checkout-, Billing-CTA und kein Link.
- Routing ausschließlich für `message_type=synthetic_capacity`,
  `environment=staging` und `synthetic_test=true`.
- Unvollständige oder abweichende Kombinationen brechen fail-closed ab.

## Was wurde nicht geändert

- Der normale Capacity-Renderer blieb byte-stabil über alle sieben Sprachen.
- Customer-Outbox-Reservierung und normale Capacity-Outbox-Reservierung.
- Migration 158 sowie ältere Migrationen.
- Business-, Entitlement-, Add-on-, Stripe- oder Production-Verträge.
- Kein allgemeiner Mail-Scheduler wurde aktiviert oder aufgerufen.

## Lokale Gates

- Focused Tests: PASS, 21/21.
- Security Contracts: PASS, 12/12.
- Full Tests: PASS, 1932/1932.
- Typecheck: PASS.
- Lint: PASS, 0 Fehler; 8 vorbestehende Warnungen.
- Build: PASS.
- Secret Scan: PASS.
- `git diff --check`: PASS.

## Migration und Staging

- Migration `20260922001000_capacity_warning_synthetic_staging_test.sql`:
  lokaler SHA-256 vor Anwendung
  `499e06cad1434d829a5001135154f2ca4d32ec18dcbbb73de0609519ed78beb5`.
- Ausschließlich Migration 158 auf Staging angewendet.
- Migrationshistorie: 158/158.
- Repeat-Dry-Run: leer.
- Edge Function `transactional-mail-dispatcher`: Version 7, ACTIVE,
  `verify_jwt=true`, Bundle-Nachweis
  `41ca583c3bc4aa8ebd8033e5df9642d3f44e447c8d6f940aa0ce935059b87e79`.
- Deployment erfolgte aus dem exakten Implementierungscommit.
- Production wurde nicht aufgerufen oder verändert.

## Isolierter Zustellnachweis

- Autorisierter Empfänger: `office@wuxuaisbi.com`.
- From: `WUXUAI® Bonus <notifications@wuxuaibonus.com>`.
- Reply-To: `support@wuxuaibonus.com`.
- Erster Aufruf: `processed=1`, `sent=1`, `failed=0`,
  `provider_accepted=true`.
- Identischer Retry: `processed=0`, `sent=0`, `failed=0`,
  kein zweiter Provider-Aufruf.
- Fünf Negativfälle (fremder Empfänger, fehlende Request-ID, fehlende
  Correlation-ID, `synthetic_test=false`, Environment ungleich Staging):
  5/5 fail-closed, kein Versand.
- Synthetischer Datensatz: `SENT`, `attempt_count=1`.
- Provider-Message-ID ist im Audit vorhanden; im Bericht wird nur der nicht
  rückrechenbare Hash-Präfix `653044974823` dokumentiert.
- Auditfolge: `ENQUEUED,RESERVED,PROVIDER_ACCEPTED` (genau drei Ereignisse).
- Physischer Eingang im legitimen Zoho-Postfach bestätigt, Posteingang.
- SPF: PASS.
- DKIM: PASS.
- DMARC: PASS (`p=none`).
- Keine unerwarteten Links oder Businessdaten im Inhalt.

## Outbox- und Schreibschutz

- Vorher/Nachher Customer-Outbox: 21 gesamt, 21 PENDING.
- Vollständiger Zeilen-Fingerprint vorher/nachher:
  `d77ca91c88b1d288bc30ea3c40981ec5`.
- Die 19 historischen Einträge blieben unverändert; ihr Vorher-Fingerprint war
  `51dfd39b8526e0eb5e894ee8902cc289` und ist durch den unveränderten
  vollständigen 21-Zeilen-Fingerprint mit abgedeckt.
- Normale Capacity-Warning-Outbox: 0 gesamt, 0 PENDING.
- Customer-Outbox verarbeitet: 0.
- Bestehende Status-, Versuchszähler- und Lease-Werte: unverändert.
- Erwartete Systemwrites: genau ein synthetischer Testdatensatz und drei
  append-only Auditereignisse.
- Businessdaten, Entitlements und Add-ons: unverändert.

## Sicherheit und Risiken

- Der Staging-Scheduler-Authentisierungswert wurde vor dem isolierten Aufruf
  sicher rotiert und weder ausgegeben noch gespeichert oder committed.
- Der bereits vorhandene DB-Cron für die Capacity-Evaluation blieb aktiv und
  unverändert; er ruft nur
  `run_capacity_warning_daily(statement_timestamp())` auf. Er wurde für diesen
  Versand nicht benötigt und der Mail-Dispatcher wurde nicht allgemein
  gestartet.
- Tracking bleibt im ZeptoMail-Agent deaktiviert.
- Einzige verbleibende Einschränkung: ZeptoMail-Übersichtszähler können zeitlich
  verzögert aktualisieren; Provider-Akzeptanz, Datenbank-Audit und physischer
  Empfang sind unabhängig davon bestätigt.

## Status

**PHASE 7C.5D3 ZEPTOMAIL STAGING DELIVERY FINAL LOCK**

Desktop geprüft: Ja (Zoho Mail und ZeptoMail-Nachweis).  
Tablet geprüft: Nicht betroffen.  
Mobile geprüft: Nicht betroffen.  
Migration angewendet: Ja, ausschließlich Staging.  
RLS geprüft: Ja, Migration- und Security-Gates.  
RPC geprüft: Ja, isolierter Enqueue/Reserve/Complete-Pfad.  
