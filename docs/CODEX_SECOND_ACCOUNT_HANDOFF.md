# WUXUAI Bonus – Uebergabe an ein zweites Codex-Konto

Stand: 2026-09-23. Repository: `ddwdoge/wuxuai-restaurant-bonus-app`.
Kanonischer Branch: `codex/v1-release-integration`.
Gepruefter Basis-HEAD vor dem Dokumentationsabgleich:
`2c4e632fb242bc90cfc2fd4b3044ccaa79dbdd47`.
Vor jeder Arbeit Remote erneut pruefen; dieses Dokument ist kein Ersatz dafuer.

- Bekannte absichtlich uncommittete Datei: `supabase/.temp/cli-latest`.
  Nicht veraendern, entfernen, stagen oder committen. Andere Worktrees koennen
  fremde Aenderungen enthalten; nur den kanonischen Branch bearbeiten.
- Letzter eingecheckter Staging-Nachweis: Projekt `bwhvfjuwixgwduoeqaya`
  (`wuxuai-bonus-staging`), Migrationen **165/165**, Deployment
  `29d37aaf-1bf0-487e-a1ee-e65263b7a202`, Version
  `8b5b0dc2-c67a-4daa-969c-5768133b0928`. Seitdem hier kein neuer
  Staging-Read. Production bleibt LOCKED und unveraendert.
- Seller `WUXUAI Digital & Trading GmbH`: PLANNED, nicht gegruendet oder
  Stripe-verifiziert. WU & XU Group GmbH: IP-Inhaberin/Lizenzgeberin, nicht
  Kunden-Rechnungsausstellerin. App-Provider TEST/LIVE: UNBOUND. AT + PRO:
  LOCKED. Positive Pending-Staging-Registrierung: NOT EXECUTED.
- Stripe-Sandbox-Konto und vier manuell angelegte monatliche Produkte/Preise
  sind **Founder-Angaben**, hier nicht unabhaengig verifiziert. Keine
  Checkout-, Webhook-, Price-Binding- oder Live-Autoritaet daraus ableiten.

Kanonischer Kurzvertrag: BASIC 59 EUR netto/Monat mit 5 Angeboten und 3.000
aktiven eindeutigen Kunden; PRO 149 EUR netto/Monat mit 15 Angeboten und
15.000 solchen Kunden, niemals unbegrenzt. Offer Add-on 19 EUR netto/Monat
je +5 Angebote; Customer Add-on 29 EUR netto/Monat je +5.000 Kunden.
Kundenfenster: exakt rollierende 365 Tage. Registrierung erzeugt
PENDING_ACTIVATION ohne Trial, erlaubt Setup/Preview und blockiert Live-
Aktionen. Erst verifizierte Provideraktivierung startet einen kostenlosen
BASIC-/PRO-Kalendermonat; Add-ons haben keinen Trial. Historische rechtmaessige
Trials bleiben erhalten. Migrationen 163–165 sind laut letztem Staging-Gate
angewendet (165/165); 7C.6B5B ist STAGING LOCK, nicht Production-Freigabe.

## Quellen und Sicherheit

Zuerst `AGENTS.md`, `00_START_HIER.md`, `18_CODEX_REGELN.md`,
`AI_IMPLEMENTATION_GUARDRAILS.md`, danach den
[kanonischen Produktvertrag](V1_CURRENT_CANONICAL_PRODUCT_CONTRACT.md) und
[Implementierungsstatus](V1_CURRENT_IMPLEMENTATION_STATUS.md) lesen.
Aktueller sicherer Source-/Migrationsvertrag und aktuelle kanonische Regeln
gehen datierten Phasen-Snapshots vor; Reports bleiben unveraenderliche Evidenz.
Bei `CURRENT CODE/CONTRACT MISMATCH` stoppen und `NOT READY` melden.

Der Founder hat ausschliesslich den 21-Dateien-Dokumentationsabgleich auf
`codex/v1-release-integration` nach bestandenem Konsistenzgate freigegeben.
Ohne weitere Freigabe: keine
Migration, keine Staging-/Production-Mutation, keine Stripe-Mutation, kein
Trialstart, kein PRO-/Country-Grant, keine E-Mail, keine Businessdaten- oder
Secret-Aenderung. Historische Migrationen und Reports niemals umschreiben.
Keine vollstaendigen Provider-IDs, Tokens, Cookies oder personenbezogenen
Testdaten in Markdown, Chat oder Logs.

## Naechster Arbeitsschritt: Phase 7C.6C1

**Stripe Sandbox Product and Account Inventory, ausschliesslich read-only.**
Legitime bereits angemeldete Sitzung vorausgesetzt: Sandbox und Kontoland,
vier Produkte/Preise, monatliche Wiederholung, keine usage-based Preise,
keine eingebauten Trials, keine Duplikate, kein Stripe Connect fuer
Restaurant-Auszahlungen, Tax Behaviour, Webhooks, Customers, Subscriptions
und Billing Portal pruefen. Keine vollstaendigen Stripe-IDs protokollieren.
Keine Stripe-Mutation, kein Live-Modus. Fehlt die legitime Sitzung oder ist
der Account nicht eindeutig, stoppen und den Blocker melden.

Sichere Baseline-Befehle im richtigen Worktree (ohne Secrets):

```sh
git branch --show-current
git rev-parse HEAD
git rev-parse origin/codex/v1-release-integration
git ls-remote origin refs/heads/codex/v1-release-integration
git status --short
git diff --check
rg --files supabase/migrations | rg '2026092[123]'
```

Bei Branch-/HEAD-/Remote-Abweichung, unerwarteten Worktree-Aenderungen,
fehlender Migration 165, abweichendem Staging-Projekt, unklarer Account-
Eigentuemerschaft, Secret-Risiko oder einer noetigen externen Mutation:
**stoppen; keine vermutete Baseline herstellen.**
