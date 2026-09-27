# PRO-E-Mail-Queue – lokale Dispatch-Autorisierung

Datum: 26.09.2026
Status: **LOCAL CODE LOCK / STAGING NOT APPLIED / CUSTOMER MAIL SCHEDULER DISABLED**

## Ursache

`OFFER_PUBLISHED` und `POINT_REWARD_AVAILABLE` prüften das PRO-Entitlement beim Erzeugen des Ereignisses. Die spätere Reservierung der persistenten Queue prüfte jedoch nur die Erreichbarkeit des Empfängers. Der Dispatcher rief anschließend den Mailprovider ohne erneute serverseitige Prüfung von Entitlement und Einwilligung auf. Damit konnte ein bereits eingereihter Eintrag nach Downgrade, Pause oder Widerruf grundsätzlich weiter versandfähig bleiben.

Für Reward-E-Mails existiert kein eigener freigegebener Einwilligungsvertrag. Eine bestätigte Konto-E-Mail oder eine Angebots-Einwilligung ist ausdrücklich keine Reward-Einwilligung.

## Geänderte Dateien

- `supabase/migrations/20260926003000_pro_notification_dispatch_authorization.sql`
- `supabase/functions/transactional-mail-dispatcher/index.ts`
- `tests/pro-notification-dispatch-authorization.local.sql`
- `tests/pro-notification-dispatch-authorization.test.mjs`
- `tests/pro-notification-dispatcher-path.test.mjs`
- dieser Bericht

Vorbestehende KYB-Arbeiten, `supabase/.temp/cli-latest` und alle übrigen fremden Änderungen wurden nicht verändert oder zurückgesetzt.

## Sicherheitsvertrag

### Reservierung

Vor jeder Reservierung prüft die Datenbank erneut:

- `OFFER_PUBLISHED`: aktuelles `offer_notifications`-Entitlement sowie aktive, bestätigte, nicht widerrufene und zum selben Account/Customer/Restaurant gehörende Angebots-Einwilligung.
- Die Einwilligung darf seit dem Enqueue nicht verändert worden sein. Ein späteres Wiederaktivieren nach Pause oder erneutes Consent macht eine alte Queuezeile nicht wieder versandfähig.
- `POINT_REWARD_AVAILABLE`: aktuelles `reward_notifications`-Entitlement; danach immer fail-closed mit `REWARD_EMAIL_CONSENT_CONTRACT_MISSING`, bis ein eigener Reward-Consent-Vertrag implementiert ist.
- Bestehende Birthday-Transaktionsmails behalten ihren bisherigen Vertrag.

### Unmittelbar vor Provideraufruf

Der Dispatcher ruft für Customer-Queuezeilen unmittelbar vor Empfängerauflösung, Template-Rendering und `sendMail` die neue service-role-only-Funktion `authorize_customer_transactional_email_delivery` auf. Diese sperrt und prüft die PROCESSING-Zeile erneut. Bei Ablehnung bleibt die Provideraufrufzahl null.

### Sicherer Queuezustand

Blockierte Einträge werden nicht gelöscht. Sie wechseln terminal zu `SKIPPED`, behalten ihre Queue- und Ereignisidentität und erhalten genau einen der nicht personenbezogenen Gründe:

- `PRO_ENTITLEMENT_INACTIVE`
- `OFFER_EMAIL_CONSENT_INACTIVE`
- `REWARD_EMAIL_CONSENT_CONTRACT_MISSING`

Ein technischer Fehler der finalen Autorisierungs-RPC ist ebenfalls fail-closed: kein Provideraufruf; der vorhandene Retry-Vertrag erhält `DISPATCH_AUTHORIZATION_FAILED`.

## Prüfergebnisse

| Gate | Ergebnis |
|---|---|
| Migration 175 Upgrade 174 → 175 | PASS |
| Fresh Replay | PASS, 175/175 |
| Repeat-Dry-Run | PASS, keine ausstehende Migration |
| DB-Lint | PASS, keine Error-Befunde |
| SQL Security/Regression | PASS, 17/17 |
| Focused Code/Dispatcher | PASS, 36/36 |
| Full Suite | PASS, 2.033/2.033 |
| Typecheck | PASS |
| Lint | PASS, 0 Fehler; 8 vorbestehende Warnungen |
| Build | PASS |
| Customer-Mail-Dispatcher-Scheduler | DISABLED; keine lokale Cron-Zeile für den allgemeinen Customer-Mail-Dispatcher |
| Echte Kundenzustellung | NICHT AUSGEFÜHRT |

Die SQL-Matrix deckt für beide PRO-Ereignistypen ab:

- PRO beim Enqueue, BASIC vor Reservierung;
- Consent beim Enqueue, Widerruf vor Reservierung;
- Pause und spätere Reaktivierung beleben eine alte Offer-Queuezeile nicht wieder;
- Widerruf zwischen Reservierung und Providergrenze;
- Reward bleibt trotz bestätigter Konto-E-Mail und Offer-Consent blockiert;
- gültige Offer- und bestehende Birthday-Pfade bleiben regressionsfrei.

Der instrumentierte Dispatcher-Fake bestätigte für `PRO_ENTITLEMENT_INACTIVE`, `OFFER_EMAIL_CONSENT_INACTIVE` und `REWARD_EMAIL_CONSENT_CONTRACT_MISSING` jeweils exakt **0 Provideraufrufe**. Ein gültiges Offer erreichte weiterhin genau einmal Provider- und Completion-Pfad. Es wurden keine echten Nachrichten versandt.

## Migration und externe Systeme

- Lokaler Migrationsstand: **175/175**
- Migration 175 auf Staging angewendet: **NEIN**
- Staging in diesem Loop gelesen oder verändert: **NEIN**
- Production verändert: **NEIN**
- Stripe verändert: **NEIN**
- Deployment/Push/Commit: **NEIN**
- PRO-In-App-Benachrichtigung: **nicht implementiert; außerhalb dieses Scopes**

## Verbleibende PRO-Launch-Gates

1. Eigener rechtlich und produktseitig freigegebener Reward-E-Mail-Consent-Vertrag inklusive Grant, Widerruf und Audit.
2. Migration 175 und der geänderte Dispatcher müssen separat für Staging freigegeben, angewendet/deployed und dort negativ sowie positiv verifiziert werden.
3. Customer-Mail-Scheduler und echte Zustellung bleiben bis gesonderter Freigabe deaktiviert.
4. Sichere synthetische E2E-Zustellung auf Staging ist noch offen; echte Kunden sind ausgeschlossen.
5. PRO-In-App-Angebots- und Reward-Benachrichtigungen bleiben ein separates offenes Produkt-/Implementierungsgate.

## Status

**PRO E-MAIL QUEUE DISPATCH AUTHORIZATION LOCAL CODE LOCK / REWARD E-MAIL FAIL-CLOSED / STAGING, SCHEDULER, REAL DELIVERY AND PRO IN-APP GATES OPEN**
