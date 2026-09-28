# WUXUAI Bonus – BASIC Paid- und Free-Pilot-Readiness

Datum: 2026-09-28

Branch: `codex/v1-release-integration`

Implementierungscommit: `52c7c6551cd8f2a1c0e14362d325a90d33e8943b`

Migration: `20260928002000_basic_paid_and_free_pilot_readiness.sql`

Migration-SHA-256: `ac1ae44598fcd27870d23696a98a9565e7908f8c30769565549acbf48bb6e7c4`

## Ursache und Scope

Zwei zuvor gekoppelte Sicherheitsverträge wurden getrennt und fail-closed
geschlossen:

1. Bezahltes BASIC darf nur nach aktueller Seller-, Tax-, Vertrags-,
   Umgebungs- und Price-Binding-Prüfung `active/paid` erreichen.
2. Ein kostenloser österreichischer BASIC-Pilot darf unabhängig von
   zahlungsbezogener Stripe-/Billing-Konfiguration geprüft werden, bleibt aber
   vollständig an AAL2, AT, Legal, Privacy, Tax-Prüfung, Übersetzung, technische
   Evidenz, erforderliche Dokumentversionen, KYB/Betreiberangaben, Kassa und
   eine ausdrücklich freigegebene Pilot-Policy gebunden.

Die allgemeine AT-Länderfreigabe blieb `PREPARED`. Es wurden keine offenen
Nachweise künstlich freigegeben und kein Restaurant aktiviert.

## 1. Bezahltes BASIC

### Serververtrag

`basic_paid_activation_readiness_internal(...)` ist die gemeinsame aktuelle
Readiness-Prüfung. Sie verlangt vor Checkout-Vorbereitung, Providerabschluss,
Webhook-Verarbeitung und jedem direkten Subscription-Write auf `active/paid`:

- einen aktuellen ausdrücklich angenommenen Vertrag
  `basic-paid-v1-2026-09-28`;
- BASIC, 5.900 Cent, EUR, monatlich und den aktuellen Katalogstand;
- exakte TEST-/LIVE-Umgebung und `livemode`-Parität;
- eine verifizierte Stripe-Produkt-/Price-/Lookup-Key-Bindung mit
  `licensed`, `per_unit`, EUR und Monatsintervall;
- Sellerstatus `TEST_READY` beziehungsweise `LIVE_READY`;
- Tax Readiness `VERIFIED`, passendes Land, bestätigtes Price-Tax-Behavior
  und verifizierte Tax-Evidenz;
- vollständige öffentliche Country-Readiness, KYB/Betreiberfreigabe und Kassa.

Der universelle Billing-Write-Guard prüft dieselbe Readiness erneut. Dadurch
können direkte DML-/RPC-Pfade, Providerabschluss, Wiederholung, Reaktivierung
oder ein positives Webhook-Ereignis die Prüfung nicht umgehen. Negative
Zustandsreduktionen wie Zahlungsausfall oder Kündigung bleiben zulässig.

### Nachweise

- `TEST_ONLY` allein: blockiert, solange Seller/Tax nicht bereit sind.
- Direkter Write auf `active/paid`: blockiert.
- Checkout-Vorbereitung und Providerabschluss: erneute Readiness-Prüfung.
- Positives, lokal vollständig vorbereitetes synthetisches TEST-Szenario:
  PASS und am Testende vollständig zurückgerollt.
- `invoice.paid` vor `checkout.session.completed`: genau eine autoritative
  Wirkung; das später ältere Ereignis wird als stale klassifiziert.
- Identisches Replay: idempotent; gleiche Event-ID mit anderem Payload-Hash:
  blockiert.
- Fehlgeschlagene Zahlung und Kündigung: getrennt und regressionsfrei.
- Reaktivierung: verlangt einen neuen bewusst angenommenen Vertrag und bleibt
  unter nicht bereitem Seller/Tax fail-closed.
- Stripe-API-Aufrufe: 0; Stripe TEST/LIVE wurde nicht verändert.

## 2. Kostenloser BASIC-Pilot

### Eigener Pilotvertrag

Die append-only Tabelle `country_basic_pilot_policy_versions` trennt
Pilot-Readiness von öffentlicher Länder- und Paid-Readiness. Der initiale
AT-Stand ist bewusst `BLOCKED` und trägt nur einen Evidenzhinweis; es wurde
keine fachliche Freigabe behauptet.

`country_basic_pilot_readiness_snapshot(...)` verlangt für AT:

- technische Registrierung und Country-State `PREPARED` oder `LIVE`;
- ausdrücklich `APPROVED` gesetzte Pilot-Policy mit Evidenz;
- aktuelle Checks `legal`, `privacy`, `tax`, `translation`,
  `technical_smoke` und `required_documents`;
- den realen KYB-/Betreiberfreigabevertrag und die tenantbezogene
  Kassa-Bestätigung;
- beim Aktivierungs-RPC zusätzlich Platform Owner/Admin, lebende Session,
  aktuellen TOTP/AAL2-Nachweis und die unveränderte Pending-Baseline.

Ausschließlich `billing` und `stripe` entfallen für diesen Gratispfad. Die
Aktivierung akzeptiert nur BASIC und genau einen oder drei Kalendermonate. Sie
setzt keine Zahlungsmethode, Stripe-ID, Belastung, PRO-Berechtigung oder
automatische Verlängerung.

Trialgrenzen und das anschließende 60-Kalendertage-Einlösefenster werden in
`Europe/Vienna` berechnet. `ends_at` ist exklusiv: exakt am berechneten
Endzeitpunkt besteht keine Einlöseberechtigung mehr. Es wurde keine Lösch- oder
Verfallsregel ergänzt.

### Platform-Admin-UI

Der Planbereich zeigt die neue Aktion „Kostenlosen BASIC-Pilot prüfen“ mit
serverseitig geladenen Blockern, Auswahl ein/drei Monate, Begründung,
einmaligen Request-/Correlation-IDs und exakter Bestätigungsphrase. Die
Schaltfläche bleibt deaktiviert, solange der Server `ready=false` liefert.
Eine UI-Freigabe ersetzt keinen Serverguard.

## Lokale Prüfungen

- Fresh Replay: 183/183 PASS.
- Migration 180 + 183 Repeat 1/2: PASS; geschützte Fingerprints identisch.
- DB-Lint: PASS.
- Focused Tests: 19/19 PASS.
- Full Suite: 2.097/2.097 PASS.
- Typecheck: PASS.
- Lint: PASS, 0 Fehler; 8 vorbestehende Warnungen.
- Build: PASS, 2.157 Module.
- Rollen-/Direkt-RPC-Matrix: Anonymous, Customer, Owner/Staff und AAL1
  blockiert; nur Platform Owner/Admin mit aktuellem TOTP/AAL2 kommt bis zu den
  fachlichen Gates.
- 24 parallele identische Trial-Aufrufe: eine Entscheidung/ein Claim,
  23 idempotente Antworten.
- Ein-/Drei-Monats-, Monatsende-, Schaltjahr- und Sommer-/Winterzeitgrenzen:
  PASS.
- Customer-/Trial-/Paid-Regressionen: PASS.
- Secret Scan und Diff-Checks: PASS.

## Staging

- Projekt: verifiziertes `wuxuai-bonus-staging`.
- Vorher: 182/182; Dry-Run enthielt ausschließlich Migration 183.
- Nachher: 183/183; Repeat-Dry-Run leer; Remote-DB-Lint ohne Befund.
- Aktiver Staging-Worker: `wuxuai-restaurant-bonus-app-staging`.
- Aktive Version: `307f302a-747b-433d-9dac-712fa91223f3`.
- Deployment-Nachricht bindet Version an Commit `52c7c65` und Migration 183.
- HTTP 200; lokales und ausgeliefertes HTML bytegleich, SHA-256
  `17b849e95f187857a96c9a3dcbbe1e73f6358df1fa006a0cda1ca7538205b6f8`;
  referenzierte Assets identisch.

Physische Negativprüfung mit legitimer Platform-Admin-Sitzung:

- AT blieb `PREPARED` und nicht öffentlich live.
- Die neue Pilotaktion war sichtbar, aber deaktiviert.
- Angezeigte Blocker: Pilot-Policy nicht freigegeben; Legal/Privacy/Tax/
  Übersetzung/Technik/Dokumentversionen offen; KYB/Betreiberangaben offen;
  Kassa offen.
- Ein legitimer Owner wurde am direkten Platform-Admin-Zugriff abgewiesen.
- Keine positive Aktivierung wurde versucht, weil die realen Gates offen sind.

Vorher/Nachher blieben unverändert: Restaurants 17/17, Subscriptions 17/17,
Audit 4.092/4.092, Trialentscheidungen 0/0, Grace 0/0,
Checkout-Requests 0/0, Stripe-Event-Inbox 0/0, Billing-Trial-Claims 0/0,
PRO-Grants 0/0 und Add-ons 0/0. Erwartete neue Daten sind ausschließlich eine
AT-Pilot-Policy-Zeile im Zustand `BLOCKED`.

## Erforderliche fachliche Entscheidungen

Vor einer positiven kostenlosen Pilotaktivierung müssen verbindlich und
versioniert vorliegen:

1. Freigabe des österreichischen Pilotvertrags und der zu verwendenden
   Rechtstextversionen.
2. Datenschutz: Zweck/Rechtsgrundlage, Verantwortlichkeiten, Zugriff,
   Aufbewahrung und Löschung.
3. KYB-/Betreiberangaben und Kassa-Nachweis des konkreten Betriebs.
4. Übersetzungsfreigabe, technischer Smoke-Test und erforderliche
   Dokumentversionen.
5. Steuerfachliche Entscheidung für die unentgeltliche SaaS-Leistung,
   insbesondere umsatzsteuerliche Behandlung, mögliche Dokumentations- oder
   Rechnungspflichten bei Nullentgelt, Leistungsort und Übergang zum
   entgeltlichen Vertrag. Diese Entscheidung bleibt auch ohne Stripe relevant.

Für bezahltes BASIC bleiben zusätzlich Seller-Verifikation, Tax Readiness,
Price-Tax-Behavior, Stripe-TEST-End-to-End und später Stripe LIVE erforderlich.

## Ergebnis

**Kostenloser Pilot nach Gründung und den oben genannten Rechts-/Privacy-/
Steuerentscheidungen, vor Stripe LIVE:** technisch **JA**. Der getrennte
Serververtrag kann dann einen manuellen BASIC-Trial für ein oder drei
Kalendermonate aktivieren, ohne Stripe-Daten oder Zahlung und ohne AT allgemein
live zu schalten. Aktuell bleibt er korrekt gesperrt, weil die fachliche
Pilot-Policy und mehrere reale Nachweise offen sind.

**Bezahltes BASIC:** serverseitig gehärtet, aber positiv auf Staging weiterhin
gesperrt, solange Seller/Tax/Price-/Country- und Stripe-Testnachweise nicht
vollständig bereit sind.

Production, Stripe, Stripe LIVE, LEGACY-Tenant, reale Betriebe, PRO und
Customer-Mail-Scheduler blieben unverändert.

Status: `STAGING SECURITY GATE PASS / POSITIVE FREE PILOT LEGAL-TAX DECISIONS OPEN / PRODUCTION NOT READY`
