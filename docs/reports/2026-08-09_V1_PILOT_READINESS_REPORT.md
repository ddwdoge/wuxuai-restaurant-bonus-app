# WUXUAI Restaurant Bonus - V1 Pilot Readiness

Datum: 2026-08-09  
Branch: `codex/v1-release-finishing-sprint`  
Commit-Basis: `e095b0b1c3b9f454ad517e658d4cbd7536ef6e76`  
Zielumgebung: `wuxuai-bonus-staging` (`bwhv...qaya`)  
Stripe: `DEFERRED`

## Ergebnis

Der lokale V1-Vertrag ist weiterhin technisch geprueft. Der Sprung zu einem
echten Pilotbetrieb konnte nicht abgeschlossen werden, weil fuer die Supabase
CLI keine verwendbare authentifizierte Sitzung beziehungsweise kein
`SUPABASE_ACCESS_TOKEN` vorhanden ist. Die Staging-Migration, RLS-Tests,
Cron-Ausfuehrung und realen E2E-Flows wurden deshalb nicht behauptet.

Zusaetzlich fehlt fuer Anwendungs-E-Mails ein freigegebener serverseitiger
Dispatchervertrag. Supabase Auth Custom SMTP versendet Auth-E-Mails, stellt
seine geheimen Providerdaten aber nicht automatisch Edge Functions oder SQL als
allgemeinen Mailtransport zur Verfuegung.

Status: **MANUAL ACCESS REQUIRED**

## 1. Migration Status

Migration:

- `20260809001000_v1_release_gift_presentations_notifications.sql`

Lokaler Preflight:

- additive Tabellen, Indizes und Funktionen vorhanden
- RLS fuer alle drei neuen Tabellen aktiviert
- direkte Rechte fuer `public`, `anon` und `authenticated` entzogen
- Browser-RPCs validieren Restaurant und geheimen Kunden-Token serverseitig
- Queue-Reservierung und Queue-Abschluss nur fuer `service_role`
- `SECURITY DEFINER`-Funktionen besitzen einen festen `search_path`
- Event-Key- und Assignment-Constraints sichern Deduplizierung
- Cron-Abhaengigkeit `pg_cron` ist explizit enthalten
- keine Tabellen oder historischen Daten werden geloescht
- keine bestehende RLS-Policy wird gelockert

Nicht verifiziert:

- Remote Migration Dry Run
- Remote Migration History
- echte SQL-Ausfuehrung auf sauberem Schema
- vorhandene Extension- und Cron-Berechtigungen auf Staging
- PostgREST-Schema-Reload auf Staging

Die lokale Maschine besitzt keine Docker-Laufzeit. Ein vollstaendiger lokaler
Supabase-Neuaufbau war daher nicht moeglich.

## 2. Staging DB Status

Staging-Verbindung: **nicht authentifiziert erreichbar**.

Erforderliche Befehle:

```bash
cd /Users/dongdongwu/Documents/GitHub/wuxuai-restaurant-bonus-os
supabase login
supabase link --project-ref bwhvfjuwixgwduoeqaya
supabase migration list --linked
supabase db push --linked --dry-run --include-all
```

Nach fachlicher Pruefung des Dry-Runs ausschliesslich auf Staging:

```bash
supabase db push --linked --include-all
supabase migration list --linked
```

Danach muessen Tabellen, Constraints, Funktionen, Trigger, Policies, Grants,
RLS und die drei Cron-Jobs direkt gegen Staging verglichen werden.

## 3. Mail Dispatcher Status

Status: **BLOCKED**.

Vorhanden:

- private Queue `customer_transactional_email_deliveries`
- atomare Deduplizierung ueber `event_type` und `event_key`
- Retry-Zaehler und persistente Zustandswerte
- Reservierung mit `FOR UPDATE SKIP LOCKED`
- service-role-only Reservierungs- und Abschluss-RPCs
- Queuefehler rollen Kerntransaktionen nicht zurueck

Fehlend:

- freigegebener allgemeiner SMTP-/Transactional-Mail-Vertrag fuer App-Mails
- serverseitig gesetzte Mailprovider-Secrets
- deployte Dispatcher-Edge-Function
- Scheduler-Aufruf des Dispatchers
- Bounce-/Suppression-Verifikation
- reale Zustelltests

Supabase Auth SMTP wird nicht als frei verfuegbarer Anwendungs-Mailtransport
behandelt. Es wurden keine Zugangsdaten ausgelesen, kopiert oder im Code
hinterlegt. Ein Dispatcher darf erst implementiert und aktiviert werden, wenn
Provider, Host/API, Absender, Region und Secrets ausdruecklich freigegeben sind.

## 4. Auth Real E2E

Nicht ausgefuehrt. Offen sind insbesondere:

- reale Bestatigungs-Mail
- Callback ohne localhost
- Session, Login, Logout und erneuter Login
- abgelaufener, doppelter und ungueltiger Link
- Chrome, Mobile Safari und frische private Sitzung

Vor Test muessen Site URL und Redirect-Allowlist im Staging-Dashboard bestaetigt
werden. Auth-Fehler sind unter Supabase Dashboard > Logs > Auth und im
anonymisierten Browser-Network-Log zu pruefen.

## 5. Gift Real E2E

Nicht ausgefuehrt, da die Migration nicht auf Staging angewendet ist.

Offen fuer Welcome Gift, Birthday Gift und Punktebelohnung:

- Start, Countdown, Refresh und Wiederaufnahme
- Ablauf nach exakt 15 Minuten
- Historie, Audit und unveraenderbares Journal
- Doppelklick, zwei Tabs und zwei Geraete
- falsches Restaurant, falscher Kunde, abgelaufen und bereits eingeloest
- Netzunterbrechung und Refresh am Ablaufpunkt

## 6. Birthday Automation Real E2E

Nicht ausgefuehrt. Zu pruefen sind:

- exakt 14 Tage vor Geburtstag in Restaurant-Zeitzone
- eine Zuteilung pro Restaurant, Kunde und Jahr
- aktiver Geburtstagspool und leerer Pool
- mehrfacher Cron ohne Duplikat
- einmalige Zuteilungs- und Erinnerungsmail
- kein Reminder nach Einloesung oder Ablauf
- Jahreswechsel und 29. Februar

Cronfehler sind ueber `cron.job_run_details` und Supabase Postgres Logs zu
kontrollieren. Payloads und Logs duerfen keine E-Mail-Adressen, Tokens oder
Geburtstage enthalten.

## 7. Threshold Mail E2E

Nicht ausgefuehrt. Die Sequenz `90 -> 100 -> 120 -> 20 -> 100` muss nach
Staging-Aktivierung genau zwei Schwellenereignisse erzeugen. Inaktive,
geloeschte oder abgelaufene Rewards, mehrere Restaurants und Retries bleiben
Pflichtfaelle.

## 8. Browser- und Geraetetests

Lokal bereits automatisiert geprueft:

- 390, 430, 768, 1024 und 1440 px
- kein horizontaler Overflow
- keine zu kleinen sichtbaren Haupt-Touchziele
- keine Console Errors im geprueften Registrierungszustand

Physisch offen:

- iPhone Safari
- installierte iPhone-PWA
- Android Chrome
- Desktop Safari
- Screen Lock/Resume, Hintergrund/Vordergrund und Orientierung
- echte E-Mail-Links, QR-Einstieg und Live-Einloesung

## 9. RLS und Security auf Staging

Lokaler Vertragscheck: **bestanden**.  
Echter Staging-Test: **nicht ausgefuehrt**.

Pflichtmatrix nach Migration:

- Kunde A kann Geschenk oder Praesentation von Kunde B nicht lesen/starten
- Restaurant A kann Daten und Geburtstagspool von Restaurant B nicht aendern
- anonymer Zugriff besitzt keine direkten Queue-/State-Tabellenrechte
- Customer-RPCs akzeptieren nur gueltige restaurantgebundene Geheimtokens
- Queue-RPCs sind nur mit serverseitiger `service_role` aufrufbar
- service role kommt weder im Browserbundle noch in Client-Logs vor
- Doppelklick und Parallelaufrufe erzeugen keine zweite Einloesung

## 10. Observability

Vor Pilot zu bestaetigen:

- Auth: Supabase Auth Logs
- Migration/RPC/RLS: Supabase Postgres und API Logs
- Birthday Cron und Abschluss-Cron: `cron.job_run_details`
- Mailqueue: Status, `attempt_count`, gekuerzter `last_error_code`
- Dispatcher: Edge Function Logs ohne Empfaengeradresse oder Payload-Secrets
- Redemption: bestehende Audit-Events und unveraenderbares Journal
- Auth Callback: anonymisierte Browser- und Cloudflare-Logs

Eine automatische Alarmierung fuer fehlgeschlagene Mail-, Cron- oder
Redemption-Jobs ist noch nicht nachgewiesen.

## 11. Pilot Data Safety

Ohne Staging-Zugriff nicht verifizierbar:

- Backupstatus und Wiederherstellbarkeit
- Remote Migration History
- Test-/Seed-Datentrennung
- Demo-Accounts und Bypass-Flags
- offene Admin-Routen
- produktionsaehnliche Staging-Konfiguration
- localhost-freie Redirects und E-Mail-Links

Lokal wurden keine neuen Secrets oder Service-Role-Werte eingefuehrt.

## 12. Manuelle Aktionen

1. Supabase CLI per `supabase login` authentifizieren; Token niemals in Report,
   Shell-History-Snippet oder Git speichern.
2. Projekt-Ref und Projektname erneut als Staging bestaetigen.
3. Migration-Liste und `db push --dry-run --include-all` pruefen.
4. Nur die erwartete Migration auf Staging anwenden.
5. RLS-/Grant-Matrix und Cronjobs live pruefen.
6. Einen allgemeinen Transaktionsmailprovider freigeben und dessen Secrets
   ausschliesslich als Edge-Function-Secrets setzen.
7. Dispatcher implementieren/deployen und Zustellung, Retry und Deduplizierung
   live pruefen.
8. Auth-, Geschenk-, Birthday-, Threshold- und Security-E2E ausfuehren.
9. Physische Geraetetests dokumentieren.
10. Backupstatus und Rollback vor Pilot bestaetigen.

## 13. Known Bugs und offene Risiken

Konkrete Pilotblocker:

1. Migration nicht auf Staging angewendet.
2. Remote RLS, Grants, Cron und Schema nicht verifiziert.
3. Kein aktiver Dispatcher fuer Geburtstag- und Schwellen-Mails.
4. Auth-E-Mail und Callback nicht real E2E-geprueft.
5. Geschenk-, Birthday- und Threshold-Flows nicht real auf Staging geprueft.
6. Physischer Safari-/PWA-Test offen.
7. Backup-, Alerting- und Pilotdatenstatus nicht verifiziert.

## 14. Pilot Recommendation

- PILOT READY: **NO**
- PUBLIC RELEASE READY WITHOUT STRIPE: **NO**
- STRIPE: **DEFERRED**

Empfehlung: Zuerst CLI- und Mailprovider-Zugang bereitstellen, dann Migration,
RLS/Cron und die realen E2E-Flows in genau dieser Reihenfolge pruefen. Bis dahin
keinen Pilotbetrieb mit echten Gaesten starten.

## 15. Lokale Qualitaetspruefung

- Typecheck: erfolgreich
- Lint: 0 Fehler, 8 bereits bestehende Warnungen
- Tests: 658/658 erfolgreich
- Build: erfolgreich, 2012 Module
- `git diff --check`: erfolgreich
- Production-Deployment: nicht durchgefuehrt
- Production-Migration: nicht durchgefuehrt
