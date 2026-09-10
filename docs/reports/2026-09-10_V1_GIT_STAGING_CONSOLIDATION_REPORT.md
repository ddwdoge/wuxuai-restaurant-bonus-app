# WUXUAI Bonus V1 Git-/Staging-Konsolidierung

Datum: 2026-09-10

## Ziel

Die drei bereits auf Staging geprueften V1-Arbeitsstroeme Customer Activation,
globale Passwortsichtbarkeit und UI/UX Consistency werden vor dem Stripe-Gate
in genau einem gestapelten Branch fuer einen spaeter Founder-freigegebenen PR
nach `main` zusammengefuehrt.

## Autoritative Ausgangslage

- Authoritative Repository: `ddwdoge/wuxuai-restaurant-bonus-app`
- Ausgangsstand `origin/main`: `256af625cb99c6cecae599aed1d26e8a80d58547`
- Konsolidierungsbranch: `codex/v1-ui-ux-consistency`
- Aktive Staging-Version: `8e2adff7-4c5b-40f7-bac6-eb2bf1541018`
- Staging Worker: `wuxuai-restaurant-bonus-app-staging`
- Production-Repository und Production-Worker: nicht veraendert

## Ancestry und Strategie

Der Konsolidierungsbranch basiert direkt auf dem aktuellen `origin/main` und
enthaelt danach:

1. Customer Activation als patch-identischen Cherry-pick des freigegebenen
   Commits `5fff53b598dd2bed5045abffe2e03d4068aff8ea`.
2. Globale Passwortsichtbarkeit als darauf gestapelten Commit. Die zentralen
   Passwortkomponenten, direkten Tests und der Report sind bytegleich zum
   freigegebenen Branchstand
   `086f59feae2c2eedae49d2a483df92a83e4617d5`.
3. Den darauf aufgebauten, physisch geprueften UI/UX-Consistency-Stand.

Damit ist ein einzelner PR dieses Branches die kleinste saubere
Konsolidierungsstrategie. Separate PRs oder erneute Cherry-picks wuerden
ueberlappende Katalog-, Master-, Changelog- und UI-Dateien duplizieren.

## Scope-Klassifikation

- A Customer Activation: Setup-Drawer, Spaeter, kompakte Erinnerung,
  App-&-Benachrichtigungen-Zugang, Install-/Push-Readiness
- B Passwortsichtbarkeit: gemeinsame PasswordInput-Komponente und alle elf
  aktiven Passwortfelder
- C UI/UX Consistency: kompakter Info-Trigger, Header-integrierte Sprachwahl,
  44-Pixel-Audit-Controls und Rollen-Shell-Konsistenz
- D i18n/Terminologie: DE/EN/FR/IT/ES/ZH/KO-Kataloge und kanonische deutsche
  Rollenbegriffe
- E Tests: direkte Activation-, Password-, UI-, Auth-, Rollen- und
  Responsive-Regressionstests
- F Kanonische Dokumentation: Customer-Vertrag, Master-Status, Changelog und
  drei zugehoerige technische Reports
- G Unrelated: 0

## Migrationen und Sicherheit

- Neue oder geaenderte Migrationen: 0
- RLS-, RPC-, Auth-, QR-, PIN-, Punkte-, Gift-, Redemption- und Kassa-Vertrag:
  unveraendert
- Service Role im Frontend: nein
- Secrets im Scope: 0
- Production-Konfiguration: 0
- Stripe-Code: 0

## Verifikation

- Fokussierte Tests: 50/50 PASS
- Vollstaendige Tests: 1408/1408 PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler; 9 bestehende Warnungen
- Build: PASS
- Secret Scan: PASS
- `git diff --check`: PASS
- Responsive Browsermatrix: 336/336 PASS
- Physischer Staging-Nachweis: PASS
- Platform Audit: kleinste wirksame Klickflaeche 44 Pixel, Ueberlauf 0

## Physische Gates

- UI/UX Consistency: PASS
- Customer Activation: Staging PASS; echter Geraete-Installationsweg bleibt im
  finalen Golden Path
- Passwortsichtbarkeit: oeffentliche Auth-Routen PASS
- Tokengebundener Recovery-Link: bewusst fuer den finalen Golden Path
  vorgemerkt; keine kuenstliche Token-Evidenz erzeugt

## Status

Der lokale Konsolidierungsstand ist bereit fuer einen exakt begrenzten Push-
und PR-Gate. Push und PR benoetigen die ausdrueckliche Founder-Freigabe fuer
den dann berichteten Branch-HEAD.

Production changed: NO
