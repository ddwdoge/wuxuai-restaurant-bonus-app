# WUXUAI Bonus V1 - AI Implementation Guardrails Restoration

Datum: 2026-08-30  
Branch: `codex/v1-canonical-recovery`  
Ausgangs-HEAD: `d64094c80704329e54413a70d0cf8f6c687198a2`  
Production: `LOCKED`  
Stripe: `DEFERRED`

## Ursache

`docs/AI_IMPLEMENTATION_GUARDRAILS.md` war im permanenten kanonischen
Repository nicht vorhanden und in keinem erreichbaren Git-Ref oder Pruef-ZIP
historisch gespeichert. `AGENTS.md` verwies vor diesem P0 ebenfalls noch nicht
auf die Datei. Der Final-Readiness-Bericht hatte das Fehlen bereits als
formalen Contract-Blocker klassifiziert; der aktuelle Founder-P0 macht den
Vertrag nun ausdruecklich zur Pflicht.

Ein untracked Entwurf im veralteten `a64b46e`-Checkout war keine autoritative
Quelle und wurde nicht uebernommen. Der neue Vertrag ist deshalb keine
Wiederherstellung eines behaupteten Originalwortlauts, sondern eine
nachvollziehbare Konsolidierung aktiver Repository-Vertraege.

## Autoritative Quellen

- `AGENTS.md`
- `docs/00_START_HIER.md`
- `docs/18_CODEX_REGELN.md`
- `docs/V1_CURRENT_CANONICAL_PRODUCT_CONTRACT.md`
- `docs/LEGACY_DOCUMENT_INDEX.md`
- `docs/14_DATABASE_ARCHITEKTUR.md`
- `docs/23_API_RPC_REGELN.md`
- `docs/24_SECURITY_PRIVACY.md`
- `docs/21_PRODUCTION_GO_LIVE_PLAN.md`
- `docs/22_PAYMENT_STRIPE_PLAN.md`
- `docs/17_CTO_ENTSCHEIDUNGEN.md`
- `src/shared/commercialContract.mjs`
- aktuelle Git-Historie, Migrationen, Tests und verifizierte Reports

## Direkt unterstuetzte Regeln

- kanonische Quellenprioritaet und eingefrorene Legacy-Regeln
- V1/V2-Trennung und keine spekulative Produktlogik
- strikte Tenant-, Rollen-, RLS-, RPC- und SECURITY-DEFINER-Grenzen
- additive Forward-Migrationen, keine destruktiven Aenderungen ohne Auftrag,
  Staging vor Production
- serverseitige Autoritaet fuer Punkte, Einloesung, Rollen und Tenantzustand
- Development/Test-Zielpruefung und Production-Schutz
- 3 Kalendermonate, 59 EUR/Monat exkl. USt., Stripe deferred
- volle Quality-Gates und ehrliche Live-/Physical-Klassifikation
- Report-/Pruef-ZIP- und risikooffene Abschlussvertraege

## Nicht unterstuetzt oder unbekannt

- ein historischer Originalwortlaut der fehlenden Datei
- die Behauptung, der Pflichtverweis sei bereits im kanonischen `AGENTS.md`
  committed gewesen
- ein separat kodifiziertes allgemeines Force-Push-Verbot

Diese Punkte wurden nicht als historische Tatsachen erfunden. Git-Aktionen
bleiben durch Quellenprioritaet, Zielpruefung und ausdruecklichen Auftrag
begrenzt.

## Geaenderte Dateien

- `AGENTS.md`
- `docs/AI_IMPLEMENTATION_GUARDRAILS.md`
- `tests/ai-implementation-guardrails-contract.test.mjs`
- `docs/19_CHANGELOG.md`
- `docs/reports/2026-08-30_AI_IMPLEMENTATION_GUARDRAILS_RESTORATION_REPORT.md`
- `docs/reports/2026-08-30_V1_FINAL_END_TO_END_RELEASE_READINESS_AUDIT_REPORT.md`

## Was nicht geaendert wurde

- kein Anwendungscode
- keine Businesslogik
- keine Migration oder Datenbank
- kein Worker, keine Domain und keine externe Umgebung
- keine Production- oder Stripe-Aktion
- keine bestehenden QR-/Starter-Kit-Aenderungen

## Validierung

- Guardrails Contract-Test: 3/3 PASS.
- Volle Tests: 1137/1137 PASS.
- Typecheck: PASS.
- Lint: PASS, 0 Fehler und 7 bekannte Warnungen.
- Build: PASS, 2061 Module transformiert.
- `git diff --check`: PASS.
- Secret Scan: PASS. Keine Private Keys, Live-/Supabase-Secret-Keys,
  Credential-URLs, JWT-Literale oder hardcodierten Service-Role-Werte.
- Contract-Recheck: Guardrails-Dokument FOUND, AGENTS-Referenz FOUND,
  `CURRENT CODE/CONTRACT MISMATCH`: NO.

## Risiken und Status

Der formale Guardrails-Blocker ist geschlossen. Das separat offene QR-Center-
Mobile-Preview-Gate benoetigt weiterhin Development/Test-Deployment und
physische Founder-iPhone-Bestaetigung; es wird durch diesen P0 nicht als PASS
umklassifiziert.

Guardrails-Aufgabe: **LOCK**.  
Globaler V1-Release: **NOT READY** bis zum offenen QR-Live-/Physical-Gate.

## Abschlussformat

- Aufgabe: AI Implementation Guardrails Contract wiederherstellen
- Build: Ja
- Migration: Keine
- Flow-Test: Nicht anwendbar; keine Laufzeitveraenderung
- RLS/Security: Ja, Vertrag und Secret-Grenzen geprueft; keine DB-Aenderung
- Alte Logik geprueft: Ja, Legacy Index und Git-/Export-Historie geprueft
- Report: `docs/reports/2026-08-30_AI_IMPLEMENTATION_GUARDRAILS_RESTORATION_REPORT.md`
- Pruef-ZIP: `exports/2026-08-30_AI_IMPLEMENTATION_GUARDRAILS_RESTORATION.zip`
- Offene Risiken: QR-Center-Mobile-Preview Development/Test-/iPhone-Gate
- Status: LOCK fuer Guardrails; globaler V1-Release NOT READY
