# WUXUAI Bonus – Canonical Documentation Reconciliation / Second-Account-Handoff

Datum: 2026-09-23; Scope-Entscheidung: 2026-09-24.
Status: **21-FILE CANONICAL DOC RECONCILIATION / LOCAL DOC GATE PASS**.

## Ursache und gepruefte Quellen

Kanonische Markdown-Dateien enthielten nach den Phasen 7C.5–7C.6B5 noch
fruehere Branch-, Trial-, Pricing- und Staging-Aussagen als aktuelle Regeln.
Geprueft wurden `AGENTS.md`, die Start-/Codex-/Guardrail-Dokumente, aktiver
Produkt- und Austria-Master-Vertrag, aktuelle Payment-/Production-/Onboarding-
Texte, Source/Tests der Pending-/Capacity-/Billing-Readiness, die Migrationen
153–165, Git-Historie/Tracking-Ref und die eingecheckten Phase-7B-/7C-
Gate-Berichte. Externer Staging- und Stripe-Zugriff fand nicht statt.

Die gepruefte lokale Baseline ist `codex/v1-release-integration` bei
`2c4e632fb242bc90cfc2fd4b3044ccaa79dbdd47`. Ein frischer Remote-Abgleich
unmittelbar vor dem Commit ist ein separates Pflichtgate.
`supabase/.temp/cli-latest` ist eine bekannte,
vorbestehende lokale Aenderung und bleibt unangetastet.

## Klassifikation der relevanten Fundstellen

| Fundstelle / Aussage | Klasse | Behandlung |
| --- | --- | --- |
| Migrationen 153–165 und letzter 165/165-Staging-Bericht | CURRENT | Source-/Berichtsnachweis fuer Statusdatei verwendet |
| Canonical Contract: Migration 165 nur lokal | CONFLICTING / NEEDS UPDATE | Als historischen Vor-Staging-Snapshot gekennzeichnet; aktueller Staging Lock vorangestellt |
| Canonical Contract: Recovery-Branch `codex/v1-canonical-recovery` | HISTORICAL | Datierter Snapshot; aktueller Branch oben und im Handoff |
| AGENTS, Codex-Regeln, Restaurant-/Onboarding-Text: drei Monate fuer neue Trials | CONFLICTING / NEEDS UPDATE | Aktueller Einmonats- und Pending-Vertrag ersetzt |
| Produktregeln 2026-08-30: drei Monate / Soft Limit | SUPERSEDED | Abschnitt explizit historisch markiert; Alt-Trials bleiben erhalten |
| Austria-Master: PRO 99 EUR, unlimited, Basic 3.000 nur soft | CONFLICTING / NEEDS UPDATE | Aktive Tabellen/Capacity-Aussagen auf 149 / 15 / 15.000 bzw. 5 / 3.000 und serverseitige Limits korrigiert |
| Austria-Master: CH als Teil des EU-Rollouts, AT Active | CONFLICTING / NEEDS UPDATE | CH separat, AT weiterhin LOCKED |
| Payment-Plan: alter Gate-6- und Dreimonatsvertrag | HISTORICAL / SUPERSEDED | Historische Abschnitte belassen, aktueller Vorrang und Label klargestellt |
| Production-Plan: Trial bei Registrierung, drei Monate, ohne Zahlungsmittel | CONFLICTING / NEEDS UPDATE | Abschnitt 13 auf Pending und spaetere Provideraktivierung korrigiert |
| Legacy-Index: drei Monate als aktuelle Regel | CONFLICTING / NEEDS UPDATE | Auf Pending und Provider-Trial korrigiert |
| Pilot-Testplan: drei Monate als verbindlicher Test | CONFLICTING / NEEDS UPDATE | Auf Pending-/Trial-Gates korrigiert |
| ZeptoMail-Einmaltest / 21 historische Quarantaeneintraege / synthetischer Scheduler | CURRENT fuer isolierten Staging-Scope | Allgemeine reale Mailzustellung bleibt gesondert gesperrt |
| Stripe-Sandbox-Konto und vier manuelle Preise | FOUNDER-REPORTED / NOT INDEPENDENTLY VERIFIED | Als Angabe ohne Price-IDs; App TEST/LIVE weiter UNBOUND |
| Positive Pending-Staging-Pruefung | NOT EXECUTED | Nicht als PASS ausgegeben; separate Freigabe erforderlich |
| Platform-Admin TOTP-MFA/AAL2, KYB und neuer Einloesevertrag | DEFERRED / NOT IMPLEMENTED | Keine bestehende Runtime-Faehigkeit behauptet |

Historische Reports, Changelog, alte Trial-Daten und Migrationen wurden nicht
umgeschrieben. Weder der alte 99-EUR-Preis noch alte Trialtexte erteilen
aktuelle Billing-Autoritaet. Alte Support-/Mailvorlagen wurden in dieser
reinen Dokumentationsphase nicht geaendert; der aktuelle Supportvertrag ist
`support@wuxuaibonus.com`.

## Exakter Commitumfang und lokale Grenzen

Founder-Freigabe: **exakt 21 Markdown-Dateien**: `AGENTS.md`,
`docs/02_PRODUKTREGELN.md`, `docs/04_RESTAURANT_PORTAL.md`,
`docs/07_WUXUAI_ADMIN.md`, `docs/08_FLOW_01_ONBOARDING.md`,
`docs/14_DATABASE_ARCHITEKTUR.md`, `docs/16_V2_MASTERPLAN.md`,
`docs/17_CTO_ENTSCHEIDUNGEN.md`, `docs/18_CODEX_REGELN.md`,
`docs/20_PILOT_TESTPLAN.md`, `docs/21_PRODUCTION_GO_LIVE_PLAN.md`,
`docs/22_PAYMENT_STRIPE_PLAN.md`, `docs/23_API_RPC_REGELN.md`,
`docs/AI_IMPLEMENTATION_GUARDRAILS.md`, `docs/LEGACY_DOCUMENT_INDEX.md`,
`docs/V1_RELEASE_READINESS.md`, `docs/V1_AUSTRIA_LAUNCH_MASTER_CONTRACT.md`,
`docs/V1_CURRENT_CANONICAL_PRODUCT_CONTRACT.md`,
`docs/V1_CURRENT_IMPLEMENTATION_STATUS.md`,
`docs/CODEX_SECOND_ACCOUNT_HANDOFF.md` und dieser Auditbericht.

Keine 22. Datei ist freigegeben. `supabase/.temp/cli-latest` bleibt
vollstaendig unangetastet und uncommitted.

Nicht geaendert: Produktcode, Tests, Migrationen, Paket-/Lockdateien,
Supabase-Konfiguration, historische Reports und andere Worktrees. Kein
Staging-/Production-/Stripe-Zugriff, keine E-Mail und keine
Businessdatenmutation. Kein Flow-/Browser-Test: reiner Markdown-Diff.
Der von `AGENTS.md` verlangte Build wurde mit ausschliesslich lokalem
Dummy-`VITE_SUPABASE_URL` und Dummy-`VITE_SUPABASE_ANON_KEY` erfolgreich
ausgefuehrt; es wurden keine echten Zugangswerte verwendet. Ein erster
Versuch ohne diese beiden Pflichtvariablen wurde vom Build-Preflight
erwartungsgemaess vor der Kompilierung abgebrochen.

## Vollstaendiger rekursiver Konfliktscan

Der erneute Scan umfasst **467 Markdown-Dateien unter `docs/` plus
`AGENTS.md`**. Treffer wurden nach aktuellem Vertrag, expliziter
SUPERSEDED-/HISTORICAL-Kennzeichnung, datierter Reportevidenz, eingefrorener
Kopie und sachfremden Beispielen klassifiziert. `99 €` als Restaurant-
Rechnungsbetrag und `365 Tage` als Referral-Dauer sind keine Billing-/
Capacity-Widersprueche. Der alte DACH-Roadmapschritt ist keine Schweiz-
Freigabe. **Weitere ACTIVE_CONFLICTS: 0** im geprueften Suchumfang.

`docs/V1_FINAL_RELEASE_STATUS.md` ist ausdruecklich SUPERSEDED;
`docs/19_CHANGELOG.md`, datierte Reports und ` 2.md`-Kopien bleiben
historisch und werden nicht umgeschrieben.

## Abschlusspruefung und naechster Schritt

- Die 21 geaenderten Markdown-Dateien haben keine gebrochenen relativen
  Markdown-Links. Secret-, Diff-, exakte Staginglisten- und frische Remote-
  Pruefung erfolgen unmittelbar vor dem Commit; bei Abweichung stoppen.
- Phase 7C.6C1: legitim angemeldetes Stripe-Sandbox-Konto, Land, vier
  Produkte/Preise, Tax Behaviour, Webhooks, Customers, Subscriptions und
  Billing Portal read-only inventarisieren; keine Stripe-Mutation.
- Positive Pending-Staging-Registrierung, Seller-/Provider-Verifikation,
  allgemeiner Mail-Scheduler, TOTP-MFA/AAL2 und Production sind offene,
  getrennt freizugebende Gates.

Dieser Bericht enthaelt keine Provider-IDs oder Secrets. Eine Second-Brain-
ZIP ist ausdruecklich nicht Teil dieser Phase.
