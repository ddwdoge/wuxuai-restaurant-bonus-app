# Staging-Testdatenreset – kontrollierter Klassifikationsabbruch

Datum: 2026-07-29  
Branch: `codex/v13-legal-maps-hardening`  
Commit: `b544b76b45f083ab9dd951446b0c468a0b207cfa`

## Bestätigte Umgebung

- Environment: Staging
- Projekt: `wuxuai-bonus-staging`
- Project-Ref maskiert: `bwhv…qaya`
- Projektstatus: `ACTIVE_HEALTHY`
- Region: `eu-west-1`
- aktive Datenbankverbindung: Ja
- Production: Nein

Die Inventur wurde über die bereits authentifizierte Supabase-Management-Verbindung als reine SQL-Count-Abfrage ausgeführt. Es wurden keine Namen, E-Mail-Adressen, Telefonnummern, Geburtstage, IDs, Tokens oder Secrets ausgegeben.

## Ausgangszustand

Der Working Tree enthielt bereits vor diesem Auftrag lokale Änderungen aus Customer Identity, QR-Hardening, Telefonnummern-E.164 und den zugehörigen Reports. Diese Änderungen wurden weder verworfen noch gestaged.

Remote sind Migrationen bis einschließlich `20260726002000` registriert. Lokal zusätzlich ausstehend:

1. `20260727001000_customer_identity_v1_no_sms.sql`
2. `20260728001000_v1_bonus_activity_journal.sql`
3. `20260728002000_referral_bonus_duration_settings.sql`
4. `20260729001000_customer_repeat_qr_access_hardening.sql`
5. `20260729002000_customer_phone_e164_hardening.sql`

## Anonymisierte Inventur vor einer möglichen Löschung

### Tenant- und Identitätsdaten

| Bereich | Anzahl |
| --- | ---: |
| Restaurants | 25 |
| explizit über sichere Testmuster klassifizierte Restaurants | 20 |
| nicht eindeutig als Test klassifizierte Restaurants | 5 |
| Organisationen | 25 |
| Filialen | 25 |
| Restaurant-Mitgliedschaften | 25 |
| Mitarbeiter | 5 |
| Kunden | 35 |
| als Testkunde markiert | 1 |
| nicht als Testkunde markiert | 34 |
| ungültige Telefonnummern bei markierten Testkunden | 0 |
| ungültige Telefonnummern bei nicht markierten Kunden | 6 |
| Kundentokens | 50 |
| Kundengeräte | 49 |

Die Restaurantklassifikation verwendete ausschließlich eindeutige Test-/Demo-/QA-/Staging-/Sandbox-/Pilot-Bezeichnungen oder klar technische Test-E-Mail-Domänen. Ein heuristischer Treffer wurde nicht als Freigabe für eine Löschung verwendet.

### Bonus-, Reward- und Referral-Daten

| Bereich | Anzahl |
| --- | ---: |
| Punktetransaktionen | 23 |
| Stempeltransaktionen | 0 |
| Punktebuchungsanfragen | 8 |
| Rewards | 33 |
| Customer Rewards | 26 |
| Willkommensgeschenk-Zuordnungen | 23 |
| Geburtstagsgeschenk-Zuordnungen | 0 |
| Referrals | 8 |
| Bonus-Boost-Zeiträume | 2 |
| alte Reward-Einlösecodes | 2 |
| gemeinsame Einlösecodes | 2 |
| Reward-Redemption-Events | 4 |
| Einlöseversuche | 9 |
| Aktivierungsversuche | 2 |

### Legal-, Audit- und sonstige Daten

| Bereich | Anzahl |
| --- | ---: |
| Auditzeilen | 559 |
| als Testevent markiert | 41 |
| nicht als Testevent markiert | 518 |
| Legal Acceptances | 12 |
| Customer Consents | 24 |
| Consent Events | 40 |
| Push Subscriptions | 0 |
| Ablauf-Erinnerungen | 0 |
| Privacy Requests | 0 |
| Customer Message Attempts | 0 |
| Restaurant Legal Profiles | 24 |
| Legal Documents | 120 |
| Legal Document Versions | 120 |
| Restaurant Branding | 25 |
| Loyalty Settings | 25 |
| Loyalty Rules | 12 |
| Campaigns | 1 |
| Campaign Events | 4 |
| Campaign Customer Offers | 2 |
| Coupons | 1 |
| Coupon Redemptions | 0 |
| Tages-PIN-Versuche | 2 |
| Tages-PIN-Zeilen | 17 |
| Storage-Objekte | 37 |

Das `redemption_activity_journal` ist noch nicht vorhanden, weil seine Migration aussteht.

## Klassifikationsentscheidung

Der Auftrag erlaubt eine Löschung nur, wenn alle betroffenen Datensätze eindeutig Testdaten sind. Diese Voraussetzung ist nicht erfüllt:

- 5 von 25 Restaurants besitzen keinen belastbaren Testmarker.
- 34 von 35 Kunden sind nicht als Testkunden markiert.
- 518 von 559 Auditzeilen sind nicht als Testevents markiert.
- 37 Storage-Objekte können ohne tenantbezogene Einzelzuordnung nicht sicher als Testassets bestätigt werden.
- 6 aktuell ungültige Telefonnummern gehören zu nicht als Test markierten Kunden.

Eine Staging-Umgebung allein ist kein ausreichender Nachweis, dass jeder Datensatz gelöscht werden darf. Deshalb wurde keine Löschung ausgeführt.

## Durchgeführte Sicherheitsmaßnahmen

- Zwei temporäre SQL-Migrationsproben wurden absichtlich transaktional zurückgerollt.
- Die Remote-Migrationshistorie wurde dadurch nicht verändert.
- Anschließend wurden ausschließlich read-only SQL-Count-Abfragen verwendet.
- Kein `migration repair`.
- Keine Datenkorrektur.
- Keine Kontenzusammenführung.
- Keine Auth-Benutzerlöschung.
- Keine Storage-Löschung.
- Keine Policy-, Bucket- oder RLS-Änderung.

Alle temporären Probe- und Requestdateien lagen ausschließlich unter `/private/tmp` und wurden entfernt.

## Nicht ausgeführt

- Testdatenreset: Nein
- Storage-Bereinigung: Nein
- Audit-Löschung: Nein
- Migrationen angewendet: Nein
- neuer Seed-Bestand: Nein
- neue Testkonten: Nein
- Security-Live-Verifikation nach Migration: Nein
- Production-Migration oder Deployment: Nein

## Erforderliche Freigabegrundlage

Vor einem neuen Löschlauf ist eine explizite, fachlich bestätigte Allowlist erforderlich:

1. Restaurant-IDs oder Slugs, die vollständig gelöscht werden dürfen.
2. Bestätigung, ob zugehörige Owner-/Mitarbeiter-Auth-Benutzer ebenfalls Testkonten sind.
3. Bestätigung, ob alle 34 unmarkierten Kunden den freigegebenen Testrestaurants zugeordnet und löschbar sind.
4. Tenantzuordnung der 37 Storage-Objekte.
5. Entscheidung, welche Plattform-/Legal-Grunddaten erhalten bleiben müssen.

Erst danach kann ein tenantbegrenztes, transaktionales Löschskript erstellt, als Dry-Run geprüft und ausgeführt werden.

## Risiken

Ein pauschaler Reset würde derzeit möglicherweise nicht eindeutig klassifizierte Restaurant-, Kunden-, Audit- und Storage-Daten löschen. Das widerspricht der ausdrücklichen Schutzregel des Auftrags.

## Qualitätsprüfung

- Typecheck: erfolgreich
- Lint: 0 Fehler, 7 bereits bestehende Warnungen
- Tests: 263/263 erfolgreich
- Build: erfolgreich
- `git diff --check`: erfolgreich
- Push, Merge oder Deployment: nicht ausgeführt

Status: `BLOCKED_BY_DATA_CLASSIFICATION`
