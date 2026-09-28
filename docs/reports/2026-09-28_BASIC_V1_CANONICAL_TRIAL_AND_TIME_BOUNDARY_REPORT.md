# WUXUAI Bonus – BASIC V1 canonical trial and time-boundary report

Datum: 2026-09-28

Branch: `codex/v1-release-integration`

Implementierungscommit: `d9170b6b999f0cc8a244733d5d4d7f86ba187862`

## Ursache und Umfang

Aktive Dokumentation und eine interne Platform-Admin-Anzeige enthielten noch
den abgelösten provideraktivierten Ein-Monats-Trial. Dieser Lauf gleicht den
aktiven Vertrag auf den bereits implementierten BASIC-V1-Vertrag ab und ergänzt
deterministische Grenztests für Trialende und das 60-Tage-Einlösefenster.

Nicht verändert wurden historische Berichte, bereits angenommene
Rechtstextversionen, Migrationen, Edge Functions, Stripe-Konfiguration,
Customer-Mail-Scheduler, PRO, LEGACY-Tenant, Production und reale Daten.

## Verifizierter Source- und Staging-Stand

- Ausgangs-HEAD/Remote: `67bd0681470b3c92da20413bb11586e2de3a16a4`
- Implementierungs-HEAD/Remote: `d9170b6b999f0cc8a244733d5d4d7f86ba187862`
- Remote-Parität nach frischem Fetch: `0/0`
- Staging-Projekt: verifiziertes Projekt `bwhvfjuwixgwduoeqaya`
- Staging-Migrationen: `182/182`
- Repeat-Dry-Run: leer (`upToDate=true`, keine Migrationen/Seeds/Rollen)
- Aktiver Staging-Worker: `wuxuai-restaurant-bonus-app-staging`
- Deployment: `6fd9be59-a03a-4adf-b262-c8deb43e430f`
- Aktive Version: `1b8c870c-29a9-41c3-8c9e-9bc878ef8cd6`
- Deployment-Nachricht bindet die Version an Commit `d9170b6` und Migration 182.
- Staging HTTP: `200`
- Lokales und ausgeliefertes `index.html`: bytegleich, SHA-256
  `36e849cfc532eea2a8c1f4a9961cd2c645abb0ed93d6313767d08baf6b0d3292`
- Direkt referenzierte JS-/CSS-Assets: `6/6` bytegleich.
- `billing-stripe-test-webhook`: Version 1, ACTIVE, eigener Raw-Body-
  Signaturvertrag, Gateway-JWT aus.
- `billing-basic-test-checkout`: Version 1, ACTIVE, Gateway-JWT an.

Die öffentliche Staging-Clientbindung wurde vor dem Build anhand Projekt-Ref
und öffentlicher `anon`-Rolle geprüft. Werte wurden nicht ausgegeben oder
persistiert; die geschützte temporäre Builddatei wurde unmittelbar entfernt.

## Kanonischer BASIC-Vertrag

- Registrierung erzeugt keinen Trial.
- Ein berechtigter Platform Admin darf nach aktuellem TOTP/AAL2 und bestandenen
  Country-, KYB-, Legal- und Kassa-Gates einen BASIC-Trial ausdrücklich für
  einen oder drei Kalendermonate aktivieren.
- Während des Trials bestehen keine Zahlungsmethode, Stripe-ID, Belastung oder
  automatische Verlängerung.
- PRO, Add-ons und der spätere bezahlte BASIC-Vertrag sind getrennte Abläufe.
- BASIC kostet nach gesonderter wirksamer Owner-Annahme 59 EUR netto pro Monat
  zuzüglich anwendbarer Umsatzsteuer.
- Ohne wirksamen Folgeauftrag endet aktive Nutzung. Bestehende Ansprüche sind
  technisch 60 Tage einlösbar; neue Beitritte, positive Punkte/Stempel,
  Punkte-QRs und Angebote sind gesperrt.
- Es existiert keine automatische Löschung und kein autorisierter
  Punkteverfall nach Tag 60.
- Die ersten zehn Pilotbetriebe sind eine Marketingaktion, keine globale
  Codegrenze.

## Fundstellenmatrix

| Datei/Stelle | Klasse | Vorheriger Widerspruch | Korrektur / Relevanz |
| --- | --- | --- | --- |
| `docs/02_PRODUKTREGELN.md`, Trialvertrag | aktiv | Provideraktivierung/ein Monat | Manueller AAL2-BASIC-Trial 1/3 Monate; kein Payment/Stripe |
| `docs/04_RESTAURANT_PORTAL.md`, aktueller Trialstatus | aktiv | ein Monat nach Provideraktivierung | 1/3 Monate nach Country/KYB/Legal/Kassa |
| `docs/07_WUXUAI_ADMIN.md`, aktuelle Adminregel | aktiv | Providerereignis als Trialstart | Auditierte manuelle TOTP/AAL2-Aktivierung |
| `docs/08_FLOW_01_ONBOARDING.md`, Pending-Flow | aktiv | ein kostenloser Monat über Provider | Registrierung ohne Trial; getrennte manuelle Aktivierung |
| `docs/14_DATABASE_ARCHITEKTUR.md`, aktueller Billingvertrag | aktiv | Providerstart und ein Monat | Migration-180-Vertrag 1/3 Monate, payment-frei |
| `docs/21_PRODUCTION_GO_LIVE_PLAN.md`, Launch-Gates | aktiv | veraltete Trialannahmen | Ausdrückliche Owner-Annahme, 60-Tage-Grenzen und offene Legal-Gates |
| `docs/23_API_RPC_REGELN.md`, Aktivierungs-RPC | aktiv | Checkout/Provider als Trialvoraussetzung | Aktuelles AAL2- und Gate-Modell; Stripe-Writes im Trial gesperrt |
| `docs/CODEX_SECOND_ACCOUNT_HANDOFF.md`, Current Truth | aktiv | provideraktivierter Ein-Monats-Trial | Manueller 1-/3-Monats-BASIC-Vertrag |
| `docs/V1_RELEASE_READINESS.md`, aktuelle Readiness | aktiv | früherer Trialstart | Aktueller Trial-, Folgeauftrag- und 60-Tage-Vertrag |
| `src/modules/platform/billingReadinessMessages.mjs`, 7 Locales | aktive UI | ein Monat nach Checkout/Payment/Provider | Manueller BASIC-Trial 1/3 Monate, ohne Payment/Stripe |
| datierte Reports, superseded Abschnitte, angenommene Legalversionen | historisch | alte Werte vorhanden | unverändert; nicht rückwirkend umgedeutet |

Die Owner-Tarifseite zeigt physisch auf Staging den aktuellen Vertrag. Die
geänderten Governance-Texte sind keine neue angenommene Rechtstextversion.
Bestehende Annahmen werden nicht umgedeutet. Ob der spätere bezahlte
BASIC-Vertrag eine neue verbindliche Legalversion und erneute Zustimmung
benötigt, bleibt ein Rechts-Gate.

## Owner-Anzeige und Serverzustand

| Zustand | Nachweis / Vertrag |
| --- | --- |
| Vor Aktivierung | Pending/Setup bleibt sichtbar; Registrierung startet keinen Trial; positive Aktivierung bleibt serverseitig gate-gebunden. |
| 1-Monats-Trial | Code und deterministische SQL-Tests PASS; physischer positiver Staging-Flow durch offene AT-Gates BLOCKED. |
| 3-Monats-Trial | Bestehender isolierter TEST_ONLY-Tenant physisch sichtbar: BASIC-Trial, dokumentierter Start/Ende, keine Zahlungsmethode, keine automatische Abrechnung. |
| Letzte 7 Tage | Migration 182 und lokale Tests stellen das Entscheidungsfenster bereit; kein physischer Zeitablauf auf Staging in diesem Lauf. E-Mail-Versand wird nicht behauptet. |
| Nach Trialende | Lokaler Vertrag sperrt aktive Nutzung ohne bezahlten Folgeauftrag und öffnet nur das technische 60-Tage-Einlösefenster. Physischer Zeitablauf OPEN. |

Die ausdrückliche BASIC-Annahme wird serverseitig versioniert und auditierbar
gespeichert. Trialaktivierungsentscheidung, Dauer, Start und Ende werden durch
Migration 180 serverseitig protokolliert. Kein UI-Text allein aktiviert einen
Vertrag.

## Deterministische Zeitgrenzentests

Die lokale SQL-Testzeit ist explizit UTC. Getestet wurden:

- Monatsende: 31.01.2024 → 29.02.2024 und 31.01.2025 → 28.02.2025;
- unmittelbar vor, exakt am und unmittelbar nach Trialende;
- exakt am Beginn sowie unmittelbar nach Beginn des Grace-Fensters;
- unmittelbar vor, exakt am und unmittelbar nach Ende der 60 Tage;
- Zeitzonenfall `Europe/Vienna` gegen absolute UTC-Intervalle;
- exklusive Endgrenzen: `now < trial_ends_at` und
  `now < redemption_grace_ends_at`;
- wiederholte, verspätete und vertauschte Stripe-Testereignisse sowie
  Idempotenz-/Payloadkonflikte in den bestehenden Tests;
- Parallelität und Einmalwirkung in den Migration-181/182-Verträgen.

Ergebnis: fokussierte Node-/SQL-Gates PASS. Die lokalen Grenztests verändern
weder Staging-Zeit noch reale Verträge. Ein real verstrichener Trial und ein
real verstrichenes 60-Tage-Fenster wurden auf Staging nicht behauptet.

## Vier-Spalten-Abschlussmatrix

| Bereich | Lokal PASS | Staging physisch PASS | Durch bestehende Gates BLOCKED | OPEN / nicht positiv nachgewiesen |
| --- | --- | --- | --- | --- |
| 1-Monats-Trial | AAL2-/Gate-/Kalendermonatsvertrag und Grenztests | Negative Gateanzeige | AT Legal, Privacy, Tax, Billing, Stripe, Übersetzungen, technischer Funktionstest und erforderliche Legalversionen nicht konfiguriert | positive auditierte Aktivierung |
| 3-Monats-Trial | Vertrag und Tests | bestehender TEST_ONLY-Trial ohne Zahlungsmittel/Autoabrechnung | keine Umgehung vorgenommen | neue Aktivierung nicht wiederholt |
| Trialende | Endgrenze und Sperrvertrag | bestehende abgelaufene Zustände nur read-only sichtbar | positiver neuer Ablauf durch Launch-Gates | physischer kontrollierter Zeitübergang |
| 60-Tage-Einlösung | inklusive Start-/exklusive Endgrenze, Sperren, kein Verfall/Löschen | Schema/Deployment vorhanden, kein Zeitreise-PASS behauptet | rechtliche Behandlung nach Fenster offen | physischer 60-Tage-Ablauf und Gast-E2E |
| BASIC-Annahme | versioniert, ausdrücklich, serverseitig | kein positiver Write in diesem Lauf | Legal-/Seller-/Tax-Gates | verbindliche finale Rechtstextversion |
| Checkout | Auth-, Owner-, Acceptance-, Seller-/Tax- und TEST-only Guards | ohne Auth `401 UNAUTHORIZED_NO_AUTH_HEADER` | Seller `PLANNED`, Tax `PENDING_CONFIGURATION` | positiver Stripe-TEST-Checkout |
| Webhook | Signatur, Replay, Hashkonflikt, Reihenfolge | ohne Testkonfiguration `503 BASIC_TEST_WEBHOOK_NOT_ENABLED`; 0 Providercalls | Stripe-TEST-Konfiguration und Tax/Seller | positiver signierter Providerflow |
| Zahlung/Rechnung/Ausfall | Zustandsvertrag in Migration 181/182 | kein positiver Providerflow | Seller/Tax/Stripe TEST | echte Testrechnung und Testzahlungsausfall |
| Kündigung | kein stiller Folgeauftrag, idempotenter Vertragszustand | nicht mutierend geprüft | Seller/Tax/Stripe TEST | positiver Stripe-TEST-Kündigungsflow |
| Reaktivierung | neuer ausdrücklich angenommener Vertrag erforderlich | kein positiver Providerflow | Seller/Tax/Stripe TEST | positiver Reaktivierungsflow |

## Lokale technische Gates

- Fokussierte Tests: `16/16 PASS`
- Fokussierter SQL-Grenztest: `LOCAL_BASIC_POST_TRIAL_STRIPE_TEST_PASS`
- Fresh Replay: `182/182 PASS`
- DB-Lint: PASS; nur bekannte bestehende Warnungen
- Full Suite: `2092/2092 PASS`
- Typecheck: PASS
- Lint: PASS, 0 Fehler, 8 vorbestehende Warnungen
- Build: PASS, 2.156 Module
- Markdown-Links in den neun geänderten Markdown-Dateien: PASS
- `git diff --cached --check`: PASS
- Hochkonfidenz-Secret-Scan: PASS
- Ein heuristischer Vorabscan erkannte ausschließlich den Testrollen-Namen
  `service_role` in einer lokalen SQL-Fixture; kein Credentialwert.

Migration-SHA-256:

- 180: `885afab3cfef1283d289deae9b05afd86d85a3b3d234e80d7c90de22d0c52c33`
- 181: `4e0606bea6de22173ec0933661ea015d3cd4ddd957f0e664403ae974a7508a53`
- 182: `394f358bd923adb1bde9325af333cbca2196a212aef662d25b155b798903078e`

## Staging-Writes und Datenintegrität

Dieser Lauf führte keine Staging-Migration, keinen Trial-/Subscription-/
Acceptance-/Entitlement-/Grant-/Stripe-Write und keine positive
Platform-Admin-Aktion aus. Die einzige externe Mutation war das ausdrücklich
auf den Staging-Worker begrenzte Web-Deployment. Browserprüfungen waren
read-only; negative Checkout-/Webhook-Aufrufe endeten vor Provider- und
Businesswrites.

Die vor diesem Dokumentations-/UI-Deployment gesicherten BASIC-Relationen und
Bestandszahlen aus dem unmittelbar vorausgehenden 182-Gate bleiben die
Baseline. Da in diesem Lauf kein neuer vollständiger Remote-Daten-HMAC erzeugt
wurde, wird keine unabhängig neu gemessene `140/140`-Fingerprint-Parität
behauptet. Nachgewiesen sind: keine aufgerufene Businessmutation, leerer
Migrations-Dry-Run, unveränderte Edge-Versionen und read-only Browserpfade.

## Offene Gates und Risiko

- AT ist technisch registrierbar, aber öffentlich nur `PREPARED`, nicht live.
- Rechtliche Prüfung, Datenschutz, Steuer, Abrechnung, Stripe,
  Übersetzungsfreigabe, technischer Funktionstest und erforderliche
  Rechtsdokumentversionen sind auf Staging nicht konfiguriert.
- Seller bleibt `PLANNED`; Tax Readiness bleibt `PENDING_CONFIGURATION`.
- Positive Stripe-TEST-Zahlung, Rechnung, Zahlungsausfall, Kündigung und
  Reaktivierung sind deshalb nicht freigegeben.
- Rechtliche Behandlung verbleibender Ansprüche nach Tag 60 sowie
  Aufbewahrung/Löschung sind anwaltlich offen. Es wurde keine Verfalls- oder
  Löschautomatik aktiviert.
- Die Entscheidung sieben Tage vor Trialende ist technisch vorbereitet;
  physischer E-Mail-Versand wird nicht behauptet.
- Production und Stripe LIVE bleiben vollständig offen und unverändert.

## Geänderte Dateien

Implementierungs-/Vertragscommit: 13 Dateien – neun aktive Markdown-Verträge,
eine lokalisierte Platform-Admin-Textquelle und drei fokussierte Testdateien.
Dieser Bericht ist die einzige Datei des nachfolgenden Evidenzcommits.

## Status

`NOT READY`

Konkrete Restblocker: AT-Legal-/Privacy-/Tax-/Billing-/Stripe-/Legalversion-
Gates, Seller- und Tax-Verifikation, positiver Ein-Monats-Staging-Flow,
physischer Trialende-/60-Tage-Zeitablauf, positiver Stripe-TEST-End-to-End-Flow
und ausdrückliche Production-Freigabe.
