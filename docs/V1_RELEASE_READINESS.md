# WUXUAI Restaurant Bonus V1 Release Readiness

Stand: 2026-08-09

## Implemented

- Zentraler Kundenlogin mit Supabase Auth, E-Mail, Passwort und Callback
- Prefetch-sicherer `token_hash`-Bestätigungsflow mit kontrolliertem Resend
- Serverzeitgebundenes 15-Minuten-Präsentationsfenster für Punktebelohnungen,
  Willkommensgeschenke und Geburtstagsgeschenke
- Idempotenter, mandanten- und kundenbezogener Geschenkstart
- Automatischer Abschluss, Audit und unveränderbares Einlösungsjournal
- Automatische Geburtstagszuteilung 14 Tage vorher aus dem bestehenden Pool
- Einmalige Zuteilung pro Kunde, Restaurant und Geburtstagsjahr
- Private Queue für Geburtstag-, Ablauf- und Punkte-Schwellen-E-Mails
- Erneute Schwellenbenachrichtigung erst nach Unterschreiten und erneutem
  Überschreiten
- Priorisierter Dashboard-Schritt für einen fehlenden Geburtstagspool

## Tested

- Statische und verhaltensnahe Vertragsprüfungen für Tenant-, Kunden-, Zeit-,
  Idempotenz- und Browserrechte
- Birthday Pool, Doppel-Cron, Reminder-Deduplizierung und Threshold-Rearm
- Historischer Geschenkcode-Restore bleibt als Kompatibilitätspfad erhalten
- Typecheck: erfolgreich
- Lint: 0 Fehler, 8 bestehende Warnungen
- Gesamttests: 658/658 erfolgreich
- Production-Build: erfolgreich
- `git diff --check`: erfolgreich

## Remaining Blockers

- Die Migration `20260809001000_v1_release_gift_presentations_notifications.sql`
  muss nach erfolgreichem Dry-Run auf dem bestätigten Staging-Projekt angewendet
  und dort fachlich geprüft werden.
- Für die private Transaktionsmail-Queue fehlt ein ausdrücklich freigegebener
  serverseitiger Dispatcher/Provider. Supabase Auth SMTP ist kein allgemeiner
  Versandvertrag für Anwendungs-E-Mails.
- Der vollständige Kunden-E-Mail-Bestätigungsflow muss nach Deployment des
  kompatiblen App-Stands mit einer echten E-Mail geprüft werden.
- Physischer Mobile-Safari- und installierter-PWA-Test sind offen.

## Pilot activation check (2026-08-09)

Status: **MANUAL ACCESS REQUIRED**

- Das verknuepfte Projekt-Ref ist `bwhv...qaya` und laut bestehender
  Projektdokumentation ausschliesslich `wuxuai-bonus-staging`.
- Der Remote-Migrationsstand konnte in dieser Sitzung nicht gelesen werden.
  Die Supabase CLI besitzt keine verwendbare authentifizierte Sitzung und es
  ist kein `SUPABASE_ACCESS_TOKEN` verfuegbar.
- Die lokale Umgebung besitzt keine Docker-Laufzeit. Ein vollstaendiger
  Neuaufbau eines lokalen Supabase-Schemas war deshalb nicht moeglich.
- Der SQL-Vertrag wurde statisch auf additive Objekte, RLS, Grants,
  `SECURITY DEFINER` und feste `search_path`-Angaben geprueft. Das ersetzt
  weder den Remote-Dry-Run noch die Staging-Verifikation.
- Supabase Auth Custom SMTP ist fuer Auth-Mails konfiguriert. Dessen geheime
  Providerdaten sind nicht als allgemeiner Anwendungs-Mailvertrag oder als
  Edge-Function-Secrets verfuegbar. Geschenk- und Schwellen-Mails koennen
  deshalb noch nicht versendet werden.

Erforderlicher Zugriff, ohne Secrets in Logs oder Dokumente zu schreiben:

```bash
supabase login
supabase link --project-ref bwhvfjuwixgwduoeqaya
supabase migration list --linked
supabase db push --linked --dry-run --include-all
```

Erst nach geprueftem Dry-Run darf auf Staging ausgefuehrt werden:

```bash
supabase db push --linked --include-all
supabase migration list --linked
```

Fuer den Transaktionsmail-Dispatcher muessen die Zugangsdaten eines
freigegebenen SMTP-/Transactional-Mail-Vertrags separat als
Edge-Function-Secrets bereitgestellt werden. Die Auth-SMTP-Konfiguration darf
nicht aus dem Dashboard exportiert, im Repository gespeichert oder im Browser
verwendet werden.

## Manual Supabase Actions

### SUPABASE MANUAL ACTION REQUIRED

1. Supabase Dashboard > Authentication > URL Configuration
   - Site URL: `https://bonus.wuxuaisbi.com`
   - Redirect URLs:
     - `https://bonus.wuxuaisbi.com/auth/callback`
     - `https://bonus.wuxuaisbi.com/auth/update-password`
     - `https://bonus.wuxuaisbi.com/customer/auth/callback`
2. Supabase Dashboard > Authentication > Email Templates > Confirm signup
   - Bestätigungslink prefetch-sicher auf folgenden Vertrag setzen:

```html
<a href="{{ .RedirectTo }}#token_hash={{ .TokenHash }}&type=email">
  E-Mail-Adresse bestätigen
</a>
```

3. Erst nach Deployment des kompatiblen App-Stands eine neue Testadresse
   registrieren und den vollständigen E-Mail-, Callback- und Loginflow prüfen.
4. Für Geburtstag- und Schwellen-E-Mails einen serverseitigen Dispatcher an
   `reserve_customer_transactional_emails` und
   `complete_customer_transactional_email` anbinden. Zugangsdaten ausschließlich
   als Edge-Function-Secrets verwalten. Keine SMTP-Zugangsdaten im Browser.

## Production Environment Actions

- Staging-Migration und RLS/Grant-Verifikation abschließen
- Transaktionsmail-Dispatcher auf Staging mit Bounce-/Retry-Verhalten prüfen
- Cron-Jobs, Zeitzone, 29. Februar und Jahreswechsel mit isolierten Testdaten
  prüfen
- Production-Secrets und Redirect-Allowlist getrennt kontrollieren
- Production-Migration nur nach separater Freigabe
- Pilot-Smoke-Test auf echten Geräten durchführen

## Stripe Deferred

Stripe ist ausdrücklich nicht Bestandteil dieses Sprints. Bestehende
Billing-Felder bleiben erhalten. Es gibt keinen simulierten Checkout, keine
Fake-Zahlung, keine Webhooks und keine künstlich aktivierte Subscription.

## Pilot Checklist

- [ ] Auth-E-Mail und Callback live auf Staging bestätigt
- [ ] Geschenkfenster auf zwei Geräten idempotent geprüft
- [ ] Geburtstagszuteilung und Doppel-Cron auf Staging geprüft
- [ ] Geburtstag- und Schwellen-E-Mails tatsächlich zugestellt
- [ ] Audit und Journal auf Staging geprüft
- [ ] Physischer iPhone-Safari-Test
- [ ] Installierte PWA geprüft
- [ ] Keine Console-, Network- oder RLS-Fehler

## Public Release Checklist

- [ ] Pilot ohne kritische Fehler abgeschlossen
- [ ] Rechtstexte anwaltlich freigegeben
- [ ] Production-Supabase-Konfiguration bestätigt
- [ ] Monitoring, Mail-Bounces und Cron-Fehler alarmiert
- [ ] Backup- und Rollback-Ablauf geprüft
- [ ] Stripe nach Firmengründung separat umgesetzt und geprüft

## Status

- PILOT READY: **NO**
- PUBLIC RELEASE READY WITHOUT BILLING: **NO**
- STRIPE READY TO IMPLEMENT: **NO**

Begründung: Der Codevertrag ist vorbereitet, aber Migration, echter
Transaktionsmailversand, Staging-E2E und physische Mobiltests sind noch offen.

Letzte Pilotbewertung am 2026-08-09:

- PILOT READY: **NO**
- PUBLIC RELEASE READY WITHOUT STRIPE: **NO**
- STRIPE: **DEFERRED**
