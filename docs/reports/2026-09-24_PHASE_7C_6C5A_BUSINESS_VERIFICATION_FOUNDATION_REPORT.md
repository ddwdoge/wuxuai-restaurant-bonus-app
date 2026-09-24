# Phase 7C.6C5A / 7D.1 – Business Verification Foundation (lokal)

Stand: 24.09.2026. Branch `codex/v1-release-integration`, Basis `4e03f9142eab853ac3130998f59f08a870bc6ba2`. Kein Commit, Push oder Remote-Write in dieser Phase.

## Ursache und Umfang

Neun aktive Dokumente enthielten überholte Angaben zum Billing-/Providerstand. Die zwei zuvor freigegebenen und sieben zusätzlich freigegebenen Dateien wurden auf den bestätigten Staging-Stand 168/168 abgeglichen: TEST VERIFIED, LIVE UNBOUND, Seller PLANNED, Tax PENDING_CONFIGURATION. Der negative Checkout- und signierte technische Webhook-Pfad bleibt gelockt; positiver Stripe-Checkout, positiver Webhook und Aktivierung bleiben offen. Der anschließende lokale Entwurf von Migration 169 schafft eine getrennte Grundlage für reale Betriebsprüfung und befristete synthetische Staging-Testverifikation.

Geändert: `docs/07_WUXUAI_ADMIN.md`, `docs/14_DATABASE_ARCHITEKTUR.md`, `docs/17_CTO_ENTSCHEIDUNGEN.md`, `docs/22_PAYMENT_STRIPE_PLAN.md`, `docs/CODEX_SECOND_ACCOUNT_HANDOFF.md`, `docs/LEGACY_DOCUMENT_INDEX.md`, `docs/V1_AUSTRIA_LAUNCH_MASTER_CONTRACT.md`, `docs/V1_CURRENT_CANONICAL_PRODUCT_CONTRACT.md`, `docs/V1_CURRENT_IMPLEMENTATION_STATUS.md`, neue Migration `20260924004000_business_verification_foundation.sql`, zwei lokale fokussierte Tests und dieser Bericht.

Unverändert: Migrationen 001–168, Produkt-UI, bestehende Checkout-/Webhook-Edge-Funktionen, alte Reports, `supabase/.temp/cli-latest`, fremde Worktree-Dateien und alle Remote-Systeme.

## Vertrag und Sicherheitsgrenzen

- Business Cases: `PENDING_ACTIVATION`, `IN_REVIEW`, `VERIFIED`, `REJECTED`, `SUSPENDED`; MANUAL und DIGITAL. DIGITAL ist nur vorbereitet, ohne externen Provider.
- Firmenprofilkorrekturen sind versioniert; alte Revisionen, Entscheidungen, Testbelege, Requests und Evidenzmetadaten sind append-only. Dokumentdateien und Bankdaten werden nicht gespeichert.
- Der serverseitige Resolver trennt `real_verified` von `staging_test_verified`; Checkout und Live-Aktivierung bleiben ausdrücklich `false`. Fehlende/ungültige Zustände schließen fail-closed.
- Synthetische Freigabe erfordert eine serverseitige TEST_ONLY-Markierung, `STAGING`-Konfiguration, Platform-Admin-Entscheidung und maximal 24 Stunden Gültigkeit. LIVE-Effekt: keiner. Country-, Seller-, Tax- und Commercial-Gates werden nicht überbrückt.
- Admin-Mutationen erfordern Platform-Admin-Rolle, Recent Auth, exakte Bestätigungsphrase, Request-/Correlation-ID, transaktionsgebundenen Lock und idempotenten Request-Hash. Owner darf nur den eigenen Status/das eigene Profil lesen; Staff, Customer und Anonymous sind ausgeschlossen. Direkte Browser-DML ist entzogen.
- Reale `VERIFIED`-Entscheidung ist bewusst nicht freigegeben. `confirm_real_business_verification` wirft stets `REAL_BUSINESS_VERIFICATION_NOT_RELEASED` und hat keinen Browser-EXECUTE-Grant. Eine beantragte Ausweitung dieses Grants wurde durch die Sicherheitsprüfung abgelehnt und **nicht** umgangen. Dokumenten-, Datenschutz-, Aufbewahrungs- und Länderlegalvertrag sind separate Freigabegates.
- Auditgründe werden gegen offensichtliche Kontakt-/Dokumentkennungen geprüft. Die Begründung ist als redigierter Text vorgesehen; vollständige PII-Freiheit freier Texte lässt sich damit nicht beweisen. Keine realen PII in Tests oder Export.

## Nachweise

- Dokument-Statusscan: neun freigegebene aktive Dateien abgeglichen; keine weiteren klar aktiven Widersprüche gefunden. Historische Reports blieben unverändert. Interne Markdown-Links der neun Dateien: PASS.
- Migration 169: lokaler Fresh-Replay 169/169 PASS; Upgrade 168→169 PASS; Repeat 1/2 PASS; DB-Lint (`public`, error level) PASS. Migrationen 001–168 gegen HEAD bytegleich. Synthetische lokale Daten nach Reset: 0 Cases, 0 Test Receipts.
- Rollback-geschützter fokussierter SQL-Test: PASS für Statusübergänge, Revisionen, TEST_ONLY, Ablauf/LIVE-Sperre, Rollen, RLS/ACL, Tenant-Isolation, direkte DML und unveränderte Subscriptions. 24 identische sowie 24 konkurrierende parallele lokale Requests: PASS (eine autoritative Wirkung je Übergang).
- Full Tests: PASS nach lokaler Loopback-Berechtigung. Der erste Lauf wurde nur durch `listen EPERM 127.0.0.1` der Ausführungs-Sandbox blockiert; kein Codefehler. Typecheck PASS; Lint PASS mit acht vorbestehenden Warnungen und null Fehlern; Build PASS mit lokalem nicht-geheimem Build-Platzhalter. Secret-Scan über Scope PASS; `git diff --check` und `git diff --cached --check` PASS.
- Keine UI-Datei geändert; sieben Sprachen und Responsive-Matrix sind für diese reine DB-Foundation nicht physisch erneut getestet. Kein UI-/Staging-/FINAL-LOCK daraus abgeleitet.

## Offene Gates / Status

Migration 169 ist ausschließlich lokal; Staging bleibt 168/168. Positive KYB-Verifikation, Dokumenten-Storage/-Retention, Platform-Admin-UI, positive Checkout-/Webhook-Aktivierung, Stripe Tax und LIVE/Production sind offen. Bestehende 16 Staging-Subscriptions wurden nicht berührt; es fand keinerlei Staging-Zugriff oder Businessmutation statt. Ein frischer Remote-Abgleich war am Ende wegen lokaler DNS-Sperre nicht möglich; der zuvor bestätigte Basis-HEAD bleibt die Referenz.

**Status: PHASE 7C.6C5A / 7D.1 BUSINESS VERIFICATION FOUNDATION LOCAL CODE LOCK** – ausschließlich für die getestete lokale, fail-closed Datenbankgrundlage. Kein Staging-, positiver Billing- oder Production-Lock.
