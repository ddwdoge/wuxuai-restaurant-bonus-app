# WUXUAI Bonus V1 - AI Implementation Guardrails

Status: **ACTIVE / REQUIRED**  
Stand: 2026-08-31
Geltungsbereich: Implementierung, Review, Migration, Deployment und Release-Gates

Dieses Dokument konsolidiert bestehende Projektregeln. Es fuehrt keine neue
Produkt-, Punkte-, Reward-, Referral-, Legal-, Billing- oder Tenantlogik ein.
Bei einem Widerspruch gilt die Quellenprioritaet aus `AGENTS.md`; der Konflikt
wird als `CURRENT CODE/CONTRACT MISMATCH` und `NOT READY` gemeldet.

## 1. Source of Truth

- Die verbindliche Reihenfolge lautet:
  1. `AGENTS.md`
  2. dieses Guardrail-Dokument
  3. `docs/V1_CURRENT_CANONICAL_PRODUCT_CONTRACT.md`
  4. aktuelle Architektur-, Sicherheits-, API- und Business-Vertraege
  5. `docs/V1_FINAL_RELEASE_STATUS.md`
  6. historische Reports und Changelog
- Der permanente Git-Stand ist die technische Arbeitsgrundlage. Historische
  Reports und Pruef-ZIPs sind Nachweise, aber keine aktive Spezifikation.
- Fuer die laufende V1-Recovery ist `codex/v1-canonical-recovery` der
  kanonische Arbeitsbranch. Der bewusste Production-Release erfolgt spaeter
  ueber `main` nach Founder-Freigabe.
- Aktuelle Produktregeln stehen zentral in
  `docs/V1_CURRENT_CANONICAL_PRODUCT_CONTRACT.md`; ersetzte Regeln stehen in
  `docs/LEGACY_DOCUMENT_INDEX.md`. Keine zweite konkurrierende kanonische
  Produkt-, Preis-, Legal- oder Tenantdefinition anlegen.
- Fuer Tenant-, Rollen- und Businesszustand sind die verifizierten
  Datenbank-/RPC-Vertraege autoritativ. Frontendzustand, URL, Metadaten oder
  historische Screenshots ersetzen diese Autoritaet nicht.
- Ein temporaeres Arbeitsverzeichnis oder Export darf nie die einzige Kopie
  freigegebener Arbeit sein. Unrelated dirty-worktree changes bleiben erhalten.

Quellen: `AGENTS.md`, `docs/00_START_HIER.md`,
`docs/V1_CURRENT_CANONICAL_PRODUCT_CONTRACT.md`,
`docs/LEGACY_DOCUMENT_INDEX.md`.

## 2. V1 Scope Protection

- V1 zuerst fertigstellen; V2 nur auf ausdruecklichen Auftrag vorbereiten oder
  implementieren.
- Keine spekulativen Features, keine neue Businesslogik und keine
  Wiederherstellung eingefrorener Legacy-Flows in einem Release-Gate.
- Interne, technische oder Legacy-Oberflaechen duerfen nicht als neue
  Owner-, Staff- oder Customer-Funktion sichtbar gemacht werden.
- LOCKED Flows werden nur fuer einen reproduzierten Defekt oder einen
  ausdruecklich freigegebenen neuen Vertrag geaendert und danach im betroffenen
  Umfang erneut geprueft.
- Sichtbare V1-UI bleibt deutsch, mobile-first und rollenspezifisch.

Quellen: `AGENTS.md` Abschnitte 3, 4, 6, 7 und 9;
`docs/18_CODEX_REGELN.md` Abschnitte 4 bis 9.

## 3. Tenant und Security

- Restaurant-, Branch- und Organization-Kontext immer explizit und konsistent
  pruefen. Cross-Tenant-Lesen oder -Schreiben ist unzulaessig.
- RLS bleibt fuer sensible Tabellen aktiv und wird nicht als kurzfristiger Fix
  abgeschwaecht oder deaktiviert.
- Rollen kommen nicht aus `user_metadata`; fehlende Rollen erhalten keinen
  Owner-, Staff- oder Platform-Admin-Zugriff.
- Service-Role-Secrets, Token-Hashes, PIN-Hashes und private Kundendaten
  gehoeren nicht in Browsercode, Git, Logs oder Public Payloads.
- `SECURITY DEFINER` verlangt einen festen sicheren `search_path`, explizite
  serverseitige Rollen-/Tenantpruefungen und bewusst minimale EXECUTE-Grants.
  Unsichere Defaults werden widerrufen; Public/anon wird nur fuer den exakt
  geprueften oeffentlichen RPC-Vertrag freigegeben.
- Punkte, Einloesung, Rollen, Tenantzuordnung und Audit bleiben serverseitig
  autoritativ.

Quellen: `AGENTS.md` Abschnitte 10 und 11;
`docs/14_DATABASE_ARCHITEKTUR.md` Abschnitte 2, 15, 16 und 18;
`docs/23_API_RPC_REGELN.md` Abschnitte 5 und 6;
`docs/24_SECURITY_PRIVACY.md` Abschnitte 5 bis 7.

## 4. Datenbank und Migrationen

- Additive Forward-Migrationen bevorzugen. Historische Migrationen nicht
  umschreiben, um einen aktuellen Vertrag darzustellen.
- Keine destruktive Migration ohne ausdruecklichen Auftrag. Neue Pflichtfelder
  zuerst nullable anlegen, vorhandene Daten backfillen und erst danach
  Constraints setzen.
- Migrationen, RLS, Policies, RPC-Signaturen und Grants zuerst auf Staging
  pruefen. Production ist kein Testplatz.
- Lokale und Remote-Migration-History muessen fuer den freigegebenen Zielstand
  synchron sein. Sicherheitsrelevante DB-Aenderungen erfordern danach den
  DB-Linter und die betroffenen Rollen-/Tenanttests.
- Keine Migration als angewendet und keinen DB-Lint als PASS melden, wenn nur
  Sourcecode inspiziert wurde.

Quellen: `AGENTS.md` Abschnitt 11; `docs/18_CODEX_REGELN.md` Abschnitte 16 bis
19; `docs/14_DATABASE_ARCHITEKTUR.md` Abschnitte 2.5, 3 und 18;
`docs/21_PRODUCTION_GO_LIVE_PLAN.md`.

## 5. Business Logic

- UI-, Layout-, Text- und Medienfixes duerfen Punkteberechnung, Eligibility,
  Reward-/Gift-Zustand, Referral, Einloesung, Trial oder Tenantzuordnung nicht
  still veraendern.
- Punkte, Reward-, Redemption-, Pricing-, Legal- und Tenantregeln besitzen je
  einen kanonischen Vertrag. Keine abweichenden Kopien in einzelnen Seiten
  oder Komponenten hardcoden.
- Eine neue Founder-Entscheidung ist erst dann als implementierter Ist-Vertrag
  zu bezeichnen, wenn der relevante Code-/DB-Vertrag und die erforderlichen
  Tests beziehungsweise Live-Gates nachgewiesen sind.
- Ungeklaerte oder widerspruechliche Businesslogik wird nicht geraten, sondern
  als `NOT READY` gemeldet.

Quellen: `AGENTS.md` Abschnitte 1, 2 und 12;
`docs/18_CODEX_REGELN.md` Abschnitte 2 bis 5;
`docs/V1_CURRENT_CANONICAL_PRODUCT_CONTRACT.md`.

## 6. Deployment und Umgebungen

- `wuxuaisbi.com` ist die zentrale WUXUAI SaaS-Plattform.
- `bonus.wuxuaisbi.com` ist ausschliesslich die WUXUAI Bonus Landingpage und
  Marketing-Domain.
- `app.bonus.wuxuaisbi.com` ist die WUXUAI Bonus Production-Anwendung.
- `book.wuxuaisbi.com` ist die WUXUAI Book Website.
- Staging verwendet eine eigene, eindeutig als Non-Production erkennbare
  Domain. Landingpage und Production-Anwendung duerfen niemals dieselbe
  Cloudflare-Route oder denselben Worker verwenden.
- Production bleibt bis zur bewussten Founder-Freigabe und dem Release ueber
  `main` gesperrt. Keine Production-Migration, kein Production-Deployment und
  keine Stripe-Aktion aus einem Development/Test-Gate ableiten.
- Vor jedem Deployment Branch/Commit, Worker, Domain, Supabase-Ziel und
  Migrationsumfang pruefen. Nur das ausdruecklich freigegebene Ziel bedienen.
- Lokal, Development/Test und spaetere Production bleiben getrennte
  Umgebungen. Kein PASS fuer eine externe Umgebung aus einem lokalen Build
  ableiten.
- Ein physischer oder manueller Gate wird nur nach tatsaechlicher Pruefung als
  PASS gemeldet.

Quellen: `docs/21_PRODUCTION_GO_LIVE_PLAN.md` Abschnitte 2 bis 5, 9 und 30;
`docs/V1_CURRENT_CANONICAL_PRODUCT_CONTRACT.md` Abschnitt Staging und
Production; verifizierter Development/Test-Stand im Release-Readiness-Bericht
vom 2026-08-30.

## 7. Commercial Contract

- Trial: exakt 3 Kalendermonate kostenlos.
- Basispaket: WUXUAI Bonus V1, 59 EUR pro Monat exkl. USt., monatlich.
- Automatische Abrechnung ist nicht aktiv; Stripe bleibt `DEFERRED`.
- Aktuell wird kein Zahlungsmittel verlangt. Es gibt keinen Fake-Checkout und
  keine vorgetaeuschte automatische Umwandlung in ein bezahltes Abo.
- Die zentrale Laufzeitkonfiguration ist `src/shared/commercialContract.mjs`.
  Unfertige Add-ons bleiben unsichtbar.

Quellen: `docs/V1_CURRENT_CANONICAL_PRODUCT_CONTRACT.md` Abschnitt Commercial
Contract; `docs/22_PAYMENT_STRIPE_PLAN.md`; `src/shared/commercialContract.mjs`.

## 8. Test- und Quality-Gates

- Fuer einen vollstaendigen Release- oder Implementierungsgate: volle Tests,
  Typecheck, Lint, Build, `git diff --check` und Secret Scan ausfuehren.
- Bei DB-Aenderungen kommen Migration-History, DB-Linter, RLS-/Grant-/RPC- und
  Tenanttests hinzu.
- `npm run build` ist Pflicht. Ein fehlgeschlagener Pflichtcheck ergibt
  `NOT READY`.
- Flow-relevante Aenderungen brauchen den echten betroffenen Flow-Test. Ohne
  erforderlichen Staging-/Live-/Physical-Nachweis maximal `CODE LOCK`, niemals
  `FINAL LOCK`.
- Bekannte Warnungen, nicht ausgefuehrte Checks und offene manuelle Gates
  werden explizit berichtet und nicht als PASS umgedeutet.

Quellen: `AGENTS.md` Abschnitt 12; `docs/18_CODEX_REGELN.md` Abschnitte 35 und
36; `docs/21_PRODUCTION_GO_LIVE_PLAN.md` Abschnitt 5.

## 9. Artefakte und Reporting

- Signifikante Aufgaben erhalten einen Report unter `docs/reports/` und ein
  Pruef-ZIP unter `exports/` ohne Dependencies, Buildoutput, `.env`-Dateien,
  Secrets oder alte ZIP-Artefakte.
- Der Abschluss nennt mindestens Aufgabe, Build, Migration, Flow-Test,
  RLS/Security, gepruefte alte Logik, Report, Pruef-ZIP, offene Risiken und den
  belastbaren Status.
- Production- und Stripe-Status werden ausdruecklich genannt.
- Anwendungscode, Businesslogik, Migrationen oder externe Umgebungen, die nicht
  geaendert wurden, werden genau so ausgewiesen.

Quellen: `AGENTS.md` Abschnitte 12.8 bis 13;
`docs/18_CODEX_REGELN.md` Abschnitte 35 und 36.8 bis 36.10.

## 10. Git Safety

- Im aktuellen V1-Recovery-Zyklus auf `codex/v1-canonical-recovery` arbeiten;
  `main` bleibt dem bewussten Production-Release vorbehalten.
- Vor Aenderungen Branch, HEAD, Remote-Bezug und Worktree-Status pruefen.
- Bestehende, nicht zur Aufgabe gehoerende Aenderungen nicht ueberschreiben,
  verwerfen oder in den eigenen Scope ziehen.
- Temporäre Worktrees duerfen Hilfsmittel sein, aber nicht die einzige
  kanonische Kopie freigegebener Arbeit. Der fortsetzbare Stand muss im
  permanenten Repository und im vorgesehenen Git-Branch nachweisbar sein.
Quellen: `docs/V1_CURRENT_CANONICAL_PRODUCT_CONTRACT.md` Kopfzeile;
`docs/21_PRODUCTION_GO_LIVE_PLAN.md` Abschnitte 9.2 und 30; dokumentierte
Worktree-Recovery und Git-/Cloudflare-Recovery-Reports vom 2026-08-28.

## 11. Nicht aus historischen Quellen ableiten

- Dieses Dokument rekonstruiert keinen verlorenen Originalwortlaut. In den
  erreichbaren Git-Refs und Pruef-ZIPs existiert kein historischer Blob dieser
  Datei.
- Historische Reports duerfen keine aktuelle Produktregel aktivieren.
- Ein allgemeines Force-Push-Verbot ist in den aktiven Projektvertraegen nicht
  separat kodifiziert und wird hier nicht erfunden. Jede Push-Aktion bleibt
  dennoch auf den ausdruecklich freigegebenen Branch/Commit beschraenkt.
- Ungeklaerte Regeln bleiben ungeklaert und werden als `NOT READY` berichtet.

## 12. Platform V4 und kuenftige Entwicklung

- Der bewusst nach `main` integrierte V1-Stand ist die stabile Produktbasis.
- Experimentelle V4-Arbeit erfolgt auf einem separaten Branch und nach dem
  V1-Release auf einem getrennten Staging-Worker. Sie wird nicht direkt auf
  `main` entwickelt oder ungeprueft in Production bereitgestellt.
- Neue Module und spaetere bezahlte Add-ons erweitern den V1-Vertrag. Sie
  duerfen bestehende V1-Flows nicht still ersetzen oder den Basistarif
  unkenntlich machen.
- `WUXUAI Bonus V1` bleibt als Basispaket mit seinem kanonischen Funktionsumfang
  und Preisvertrag identifizierbar. Unfertige Pakete bleiben unsichtbar.
- Stripe-Vorbereitung und spaetere Live-Aktivierung sind ein eigener,
  Founder-freigegebener Gate. Dieser Dokumentations-Freeze aktiviert weder
  Billing noch Stripe.
