# WUXUAI Bonus – Phase 7C.5E Historical Staging Outbox Quarantine

Datum: 2026-09-22

Branch: `codex/v1-release-integration`

Base: `3be0010d754de4fe54d4be42fb8f3b4656ed48a1`

Implementierung: `29a2c55`

Staging-Projekt: `bwhvfjuwixgwduoeqaya`

## Ursache

Die Staging-Customer-Outbox enthielt 21 historische Testnachrichten ohne
belastbare Versandfreigabe. Der Founder klassifizierte alle 21 Zeilen als
historische Staging-Testdaten und erlaubte ausschließlich eine kontrollierte,
fingerprint-gebundene Quarantänisierung ohne Versand oder Löschung.

Zusätzlich verwendeten die Customer-Mailvorlagen im Support-Footer noch die
frühere Adresse `support@wuxuaisbi.com`.

## Geänderte Dateien

- `supabase/migrations/20260922002000_customer_outbox_quarantine_contract.sql`
- `supabase/functions/_shared/transactionalMailTemplates.mjs`
- `tests/phase-7c5e-outbox-quarantine.test.mjs`
- `tests/transactional-mail-dispatcher.test.mjs`
- `docs/V1_CURRENT_CANONICAL_PRODUCT_CONTRACT.md`

## Quarantänevertrag

Migration 159 installiert eine private Audit-Tabelle mit RLS, vollständig
entzogenen Runtime-Rechten und einem Trigger, der Updates und Löschungen
verhindert. Die Quarantänefunktion ist für `public`, `anon`, `authenticated`
und `service_role` gesperrt. Sie:

- sperrt den vollständigen PENDING-Bestand transaktional;
- akzeptiert ausschließlich 21 Zeilen und den vorab bestätigten Fingerprint;
- prüft Status `PENDING`, `attempt_count = 0` und fehlende Lease;
- bricht bei jeder Abweichung vollständig ab;
- setzt ausschließlich `SKIPPED` und den Grund
  `HISTORICAL_STAGING_TEST_DATA`;
- verändert keinen Versuchszähler und keine Provider-ID;
- speichert Anzahl, Vollfingerprint, exakte Ziel-IDs, Serverzeit sowie
  Datenbank- und optionale Auth-Identität im unveränderbaren Audit.

Die Migration selbst führt keine Quarantänisierung aus und richtet weder
Scheduler noch Versand ein.

## Staging-Stopgate und Ergebnis

Unmittelbar vor der Mutation:

- PENDING: 21
- Status weiterhin PENDING: 21
- Attempt 0: 21
- Lease frei: 21
- Vollfingerprint: `d77ca91c88b1d288bc30ea3c40981ec5`
- ID-Mengenhash: `7e0a3d0c22975305a1df052fc3f38164`
- Quarantänevertrag vorhanden: ja

Nach der atomaren Ausführung:

- Customer-Outbox-Gesamtbestand: 21
- PENDING: 0
- SKIPPED mit festem Quarantänegrund: 21
- Attempt weiterhin 0: 21
- Lease frei: 21
- Provider-Message-ID vorhanden: 0
- ID-Mengenhash unverändert: `7e0a3d0c22975305a1df052fc3f38164`
- Auditzeilen: 1
- Audit-Zielanzahl: 21
- Audit-Vorherfingerprint: `d77ca91c88b1d288bc30ea3c40981ec5`
- Audit-Ziel-IDs: 21
- ausführende Systemidentität: Datenbankrolle `postgres`
- Auth-UID im SQL-Systemkontext: nicht vorhanden
- Capacity-Warning-Deliveries: 0
- abgeschlossener synthetischer Testnachweis: unverändert 1
- E-Mails versendet: 0

Keine Zeile wurde gelöscht. Keine nach dem Preflight entstandene PENDING-Zeile
wurde erfasst; der unmittelbar vorher ermittelte Gesamtbestand war exakt 21.

## Support-Footer

Die Customer-Mailvorlagen verwenden in DE, EN, FR, IT, ES, ZH und KO nun
`support@wuxuaibonus.com` in Text und `mailto:`. Betreff, Texte, URLs und CTA
bleiben unverändert. Der Capacity-Renderer bleibt getrennt und sein bestehender
Sieben-Sprachen-Snapshot bytegleich.

## Production Clean Start

Production wird später ausschließlich aus dem vollständigen Migrationsverlauf
und einer getrennten Production-Konfiguration aufgebaut. Staging wird weder
geklont noch als Backup wiederhergestellt. Restaurants, Kunden, Memberships,
Punkte, Angebote, Einlösungen, Grants, Outbox-, Test-Audit- und TEST_ONLY-Daten
werden nicht übertragen.

Zulässige Initialdaten sind Plan-/Capacity-Katalog, zunächst LOCKED gesetzte
Country Policies, notwendige Rollen-/Systemkonfiguration, Mailvorlagen und
technische Referenzdaten. Production-Secrets werden getrennt eingerichtet.

## Prüfungen

- Focused Tests: 35/35 PASS
- Full Tests: 1937/1937 PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler; 8 bekannte Warnungen außerhalb des Scopes
- Build: PASS
- Customer-Footer-Snapshot: PASS
- Capacity-Renderer-Snapshot: PASS / unverändert
- Upgrade-Replay: PASS
- Repeat-Dry-Run lokal: leer
- Fresh-Replay bis 159: PASS
- DB-Lint: keine neue Warnung; bestehende Altwarnungen unverändert
- Staging-Migration 159: angewendet
- Staging-Repeat-Dry-Run: leer
- Secret Scan: PASS
- `git diff --check`: PASS

## Was nicht geändert wurde

- kein allgemeiner Mail-Scheduler aktiviert
- keine E-Mail versendet
- keine Nachricht gelöscht
- keine Capacity-Outbox verarbeitet
- keine Production-Verbindung oder Production-Datenbank geändert
- kein Stripe-Zugriff
- keine Entitlements, Add-ons, Grants oder Businessdaten geändert
- keine Edge Function und keine App bereitgestellt

## Status

**HISTORICAL STAGING OUTBOX QUARANTINE LOCK / PRODUCTION CLEAN-START CONTRACT LOCK**
