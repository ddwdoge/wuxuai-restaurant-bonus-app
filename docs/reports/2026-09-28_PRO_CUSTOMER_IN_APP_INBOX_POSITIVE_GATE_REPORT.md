# PRO Customer In-App-Inbox – Positiver Gate-Fortsetzung

Stand: 28.09.2026, Europe/Vienna

## Ergebnis

Der vorgesehene befristete PRO-Test-Override ist serverseitig vorhanden und
fail-closed. Auf Staging existiert jedoch kein Tenant, der gleichzeitig eine
exakt passende aktive TEST_ONLY-Markierung und einen authentifizierten
synthetischen Customer besitzt. Deshalb wurden weder Entitlement noch
Staging-Businessdaten veraendert und kein positiver Staging-Browser-PASS
behauptet.

Der positive Customer-Flow wurde stattdessen im frisch aufgebauten lokalen
Stack mit synthetischen Daten physisch in Chromium und WebKit belegt.

## Ursache und enger Aenderungsumfang

Die positive Staging-Pruefung ist nicht an der Inbox-Implementierung, sondern
am fehlenden autorisierten Testkontext blockiert: Der exakt markierte
TEST_ONLY-Tenant besitzt keinen synthetischen Customer mit Auth-Bindung; der
andere Tenant mit Customer erfuellt die exakte Markerbindung nicht.

In diesem Gate wurde kein Produkt-, Runtime- oder Migrationscode geaendert.
Neu sind ausschliesslich:

- ein lokaler positiver Chromium-/WebKit-Browsernachweis;
- dieser Evidenzbericht;
- ein ausdruecklich nicht freigegebener Consent-/Retention-Entwurf.

Nicht geaendert wurden BASIC, Entitlements, E-Mail-Dispatcher, Scheduler,
Staging-Daten, Edge Functions, Production und Stripe.

## Source-, Datenbank- und Deploymentstand

- Branch: `codex/v1-release-integration`
- lokaler und Remote-HEAD:
  `1fe2bc7e89c8a3fc3cd996dbb99827db74b744fc`
- Remote-Paritaet: `0/0`
- Staging-Projekt: `wuxuai-bonus-staging`, verifiziert
- Migrationen: `186/186`
- Repeat-Dry-Run: leer
- Migration 186:
  `20260928005000_pro_customer_in_app_inbox.sql`
- Migration-186-SHA-256:
  `dd3ee04ac2767ee15a6e964a2cb0508571ffe7059ff9c4b5db7960e825c027ed`
- aktiver Staging-Worker: `wuxuai-restaurant-bonus-app-staging`
- aktive Version: `44c1eee5-6b5a-4736-ba19-55c677c4c0de`, 100 Prozent
- Edge Functions: unveraendert
- Production und Stripe LIVE: unveraendert

## Autorisierter PRO-Testpfad

`set_platform_commercial_pro_access` ist der vorgesehene Mutator fuer
`INTERNAL_TEST_ONLY`. Er verlangt serverseitig:

- aktive Rolle `platform_owner` oder `platform_admin`;
- aktuelle, noch gueltige TOTP/AAL2-Sitzung durch `current_platform_role()`;
- TOTP-Nachweis aus den letzten zehn Minuten;
- exakte Restaurant-/Organisation-/Owner-/Name-Uebereinstimmung mit dem
  aktiven TEST_ONLY-Marker;
- einen endlichen Start-/Endzeitraum mit zukuenftigem Ablauf;
- Begruendung, exakte Bestaetigung und globale Request-ID;
- Advisory-/Row-Lock, Idempotenz, Widerruf und append-only Commercial-Audit.

Der allgemeine AT-PRO-Country-Lock wird fuer `INTERNAL_TEST_ONLY` nicht
geoeffnet. Ein Widerruf oder Ablauf entfernt die effektive PRO-Berechtigung.
Der Customer-Abruf prueft diese Berechtigung erneut.

## Read-only Staging-Befund

Zwei aktive TEST_ONLY-Marker wurden pseudonymisiert untersucht:

- Referenz `e3a60c9be3ee`: ein synthetischer Customer, aber keine exakte
  Markerbindung mehr; zusaetzlich keine Customer-Auth-Bindung. Der Grant-RPC
  wuerde fail-closed mit `TEST_ONLY_MARKER_REQUIRED` ablehnen.
- Referenz `8250e2dc8752`: exakte Markerbindung, aber kein synthetischer
  Customer, keine Customer-Auth-Bindung und keine Membership.

Damit gilt:

- exakt gebundener TEST_ONLY-Tenant mit synthetischer Customer-Auth: `0`;
- aktive PRO-Grants: `0`;
- Commercial-PRO-Auditzeilen: `0`;
- PRO-Inboxzeilen: `0`.

Die vorhandenen Marker, Customer und Tenants wurden nicht korrigiert,
umbenannt, reaktiviert oder anderweitig umgangen.

## Lokaler positiver Browserflow

Ein frischer lokaler Stack wurde bis 186/186 aufgebaut. Eine vollstaendig
synthetische, task-eigene Fixture mit exaktem TEST_ONLY-Marker, zeitlich
begrenztem INTERNAL_TEST_ONLY-Grant und authentifiziertem Testcustomer wurde
angelegt und nach dem Lauf entfernt.

| Nachweis | Ergebnis |
| --- | --- |
| Chromium | PASS |
| WebKit | PASS |
| Offer-Ereignis | 1 Eintrag |
| Reward-Schwelle erstmals erreicht | 1 Eintrag |
| Deduplizierter Gesamtbestand | exakt 2 Eintraege |
| Ungelesen bei Erstabruf | 2 |
| Kundenaktion gelesen | 2 auf 1 |
| Reload/Auth-Hydration | 1 bleibt konsistent |
| PRO-Entzug | Trigger und Liste sofort unsichtbar |
| Unerwartete Businesswrites | 0 |

Insgesamt bestanden 16 enge Chromium-/WebKit-Assertionen. Der Business-
Fingerprint fuer Customerzahl, Punktestand, Punktebuchungen, Rewards,
Angebote und Subscriptionstatus blieb waehrend Browser-, Reload-, Lese- und
Downgradepruefung identisch. `read_at` war die einzige erwartete
Customer-Inbox-Mutation.

## Fokussierte Regression

- Syntaxcheck des lokalen Browsernachweises: PASS
- PRO-Inbox-, Platform-PRO-, Commercial-Lock- und TOTP/AAL2-Tests:
  44/44 PASS
- Fresh Replay: 186/186 PASS
- Full Suite, Typecheck, Lint und Build wurden nicht erneut ausgefuehrt, weil
  kein Produkt-, Migrations- oder Runtimecode geaendert wurde. Der unveraenderte
  Source-Stand traegt weiterhin den bestaetigten Nachweis 2111/2111, Typecheck,
  Lint und Build PASS aus dem unmittelbar vorangehenden Gate.

## Staging-Negativgates

- Anonymous/Owner/Staff/fremder Customer/fremder Tenant: bestehender
  serverseitiger Vertrag unveraendert fail-closed.
- BASIC, abgelaufener oder widerrufener PRO-Zugang: bestehende Inbox nicht
  sichtbar; neue Erzeugung gesperrt.
- Direktes Tabellen-DML fuer Browserrollen: gesperrt.
- E-Mail, Push und Customer-Mail-Scheduler: nicht aktiviert.

## Ausgefuehrte Writes

### Staging

- PRO-Grants: `0`
- Commercial-PRO-Audit: `0`
- Inbox: `0`
- Offers/Rewards/Punkte/Customer/Entitlements: `0`

### Lokal, synthetisch und anschliessend entfernt

- 1 befristeter TEST_ONLY-PRO-Grant;
- 1 synthetisches Offer-Ereignis;
- 1 synthetisches Reward-Ereignis;
- 2 deduplizierte Inboxeintraege;
- 1 erwartete `read_at`-Aenderung je Browserlauf;
- 0 unerwartete Businesswrites.

Die abschliessende Cleanup-Pruefung ergab jeweils `0` verbliebene lokale
Restaurants, Customer, Grants, Inboxeintraege und Auth-User aus dieser
Fixture. Der task-eigene lokale Supabase-Stack wurde danach geordnet gestoppt.

## Rechts-/Consent-/Retention-Gate

Der technische Entwurf steht in
`docs/PRO_NOTIFICATION_CONSENT_RETENTION_DRAFT.md`. Er ist keine
Rechtsfreigabe. Offen bleiben insbesondere die Einordnung der vier
Kanal-/Ereigniskombinationen, Consent-Versionierung, Widerrufswirkung und
Aufbewahrungs-/Loeschregeln.

## Status

`LOCAL POSITIVE PRO IN-APP CUSTOMER FLOW PASS /`
`STAGING SECURITY NEGATIVE GATES PASS /`
`POSITIVE STAGING CUSTOMER FLOW OPEN – NO EXACT TEST_ONLY + CUSTOMER AUTH CONTEXT /`
`REAL CONSENT AND RETENTION CONTRACT OPEN /`
`NOT READY FOR REAL CUSTOMERS OR PRODUCTION`
