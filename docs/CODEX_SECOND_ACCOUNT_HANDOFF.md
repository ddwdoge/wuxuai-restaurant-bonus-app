# WUXUAI Bonus – Uebergabe an ein zweites Codex-Konto

Stand: 2026-09-24. Repository: `ddwdoge/wuxuai-restaurant-bonus-app`.
Kanonischer Branch: `codex/v1-release-integration`.
Gepruefter Remote-HEAD vor diesem Dokumentationsabgleich:
`4e03f9142eab853ac3130998f59f08a870bc6ba2`.
Vor jeder Arbeit Remote erneut pruefen; dieses Dokument ist kein Ersatz dafuer.

- Bekannte absichtlich uncommittete Datei: `supabase/.temp/cli-latest`.
  Nicht veraendern, entfernen, stagen oder committen. Andere Worktrees koennen
  fremde Aenderungen enthalten; nur den kanonischen Branch bearbeiten.
- Aktueller Staging-Nachweis: Projekt `bwhvfjuwixgwduoeqaya`
  (`wuxuai-bonus-staging`), Migrationen **168/168**. Das letzte App-Deployment
  `29d37aaf-1bf0-487e-a1ee-e65263b7a202`, Version
  `8b5b0dc2-c67a-4daa-969c-5768133b0928` wurde durch 7C.6C2B nicht
  durch die negativen Edge-Gates nicht veraendert. Production bleibt LOCKED und unveraendert.
- Seller `WUXUAI Digital & Trading GmbH`: PLANNED, nicht gegruendet oder
  Stripe-verifiziert. WU & XU Group GmbH: IP-Inhaberin/Lizenzgeberin, nicht
  Kunden-Rechnungsausstellerin. App-Provider TEST: vier `VERIFIED`-Bindungen;
  Tax Readiness `PENDING_CONFIGURATION`; LIVE: `UNBOUND`. AT + PRO kommerziell
  LOCKED. Der negative Checkout-/signierte technische Webhook-Pfad besitzt
  STAGING NEGATIVE BILLING RESTGATE LOCK; Stripe-/Provideraufrufe und positive
  Aktivierungen waren dabei 0. Positiver Stripe-Checkout, echter Stripe-
  Webhook und KYB-Grundlage bleiben offen. Migration 169 ist lokal 169/169
  vollstaendig geprueft und im LOCAL CODE LOCK. Staging bleibt 168/168;
  Migration 169 wurde dort nicht angewendet. Ein Staging- oder Final-Lock
  besteht dafuer nicht.
  Positive Pending-Staging-Registrierung: NOT EXECUTED.
- Stripe-Sandbox-Konto und vier monatliche Produkte/Preise wurden in 7C.6C1C
  read-only verifiziert. Die TEST-Price-Bindungen in Migration 166 sind keine
  Checkout-, Webhook-, Billing- oder Live-Autoritaet. Siehe den
  [7C.6C2B-Staging-Bericht](reports/2026-09-24_PHASE_7C_6C2B_TEST_PROVIDER_BINDING_STAGING_GATE_REPORT.md).

Kanonischer Kurzvertrag: BASIC 59 EUR netto/Monat mit 5 Angeboten und 3.000
aktiven eindeutigen Kunden; PRO 149 EUR netto/Monat mit 15 Angeboten und
15.000 solchen Kunden, niemals unbegrenzt. Offer Add-on 19 EUR netto/Monat
je +5 Angebote; Customer Add-on 29 EUR netto/Monat je +5.000 Kunden.
Kundenfenster: exakt rollierende 365 Tage. Registrierung erzeugt
PENDING_ACTIVATION ohne Trial, erlaubt Setup/Preview und blockiert Live-
Aktionen. Erst verifizierte Provideraktivierung startet einen kostenlosen
BASIC-/PRO-Kalendermonat; Add-ons haben keinen Trial. Historische rechtmaessige
Trials bleiben erhalten. Migrationen 163–168 sind auf Staging angewendet
(168/168); 7C.6C2B ist ein TEST-only STAGING BACKEND LOCK und 7C.6C3B
ein negativer Billing-Restgate-Lock, nicht Production- oder kommerzielle Freigabe.

## Quellen und Sicherheit

Zuerst `AGENTS.md`, `00_START_HIER.md`, `18_CODEX_REGELN.md`,
`AI_IMPLEMENTATION_GUARDRAILS.md`, danach den
[kanonischen Produktvertrag](V1_CURRENT_CANONICAL_PRODUCT_CONTRACT.md) und
[Implementierungsstatus](V1_CURRENT_IMPLEMENTATION_STATUS.md) lesen.
Aktueller sicherer Source-/Migrationsvertrag und aktuelle kanonische Regeln
gehen datierten Phasen-Snapshots vor; Reports bleiben unveraenderliche Evidenz.
Bei `CURRENT CODE/CONTRACT MISMATCH` stoppen und `NOT READY` melden.

Ohne weitere Freigabe: keine
Migration, keine Staging-/Production-Mutation, keine Stripe-Mutation, kein
Trialstart, kein PRO-/Country-Grant, keine E-Mail, keine Businessdaten- oder
Secret-Aenderung. Historische Migrationen und Reports niemals umschreiben.
Keine vollstaendigen Provider-IDs, Tokens, Cookies oder personenbezogenen
Testdaten in Markdown, Chat oder Logs.

## Naechster Arbeitsschritt: Business Verification Foundation lokal pruefen

Die negative technische Checkout-/Signatur-/Replay-Architektur ist auf Staging
gelockt; der positive Stripe-Checkout, echte Provider-Webhook-Aktivierung,
Billing Portal und synthetische positive Sandbox-E2E-Tests sind nicht
implementiert oder freigegeben. Phase 7C.6C5A/7D.1 baut die gemeinsame
Business-Verification-Grundlage ausschliesslich lokal; Migration 169 ist
lokal 169/169 geprueft und im LOCAL CODE LOCK, aber nicht auf Staging
angewendet. Vor Folgearbeit Remote-HEAD, Staging 168/168 und den
negativen Restgate-Bericht erneut pruefen. Tax-/Invoice-Readiness und Seller-
Verifikation bleiben getrennte Gates; LIVE ist gesperrt.

Sichere Baseline-Befehle im richtigen Worktree (ohne Secrets):

```sh
git branch --show-current
git rev-parse HEAD
git rev-parse origin/codex/v1-release-integration
git ls-remote origin refs/heads/codex/v1-release-integration
git status --short
git diff --check
rg --files supabase/migrations | rg '2026092[1234]'
```

Bei Branch-/HEAD-/Remote-Abweichung, unerwarteten Worktree-Aenderungen,
fehlender Migration 166, abweichendem Staging-Projekt, unklarer Account-
Eigentuemerschaft, Secret-Risiko oder einer noetigen externen Mutation:
**stoppen; keine vermutete Baseline herstellen.**
