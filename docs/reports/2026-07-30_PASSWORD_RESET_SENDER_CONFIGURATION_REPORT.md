# Password-Reset-Absender – Konfigurationsbericht

Datum: 2026-07-30  
Projekt: `wuxuai-bonus-staging`  
Supabase Project Ref: `bwhv…qaya`

## Ursache

Passwort-Reset-E-Mails werden durch Supabase Auth versendet. Der Frontend-Aufruf
`supabase.auth.resetPasswordForEmail(...)` setzt ausschließlich Empfänger und
Redirect-URL. Er kann und darf den sichtbaren Absender nicht festlegen.

Im bestätigten Staging-Projekt ist unter **Authentication → Emails → SMTP
Settings** die Option **Enable custom SMTP** inzwischen aktiviert. Die
Absenderadresse ist `support@wuxugroup.com`. Der gespeicherte Anzeigename lautet
jedoch weiterhin `WUXUAI Restaurant bonus` statt `WUXU Group Support`.

Der Versuch, ausschließlich den Anzeigenamen zu korrigieren, wurde vom
Supabase-Dashboard mit HTTP 400 abgelehnt. Ohne erneute Eingabe der geheimen
SMTP-Providerdaten wurde keine weitere Änderung versucht.

## Codeprüfung

- Keine hartcodierte Absenderadresse im Frontend gefunden.
- Keine SMTP-Absenderkonfiguration in den Supabase-Migrationen gefunden.
- Der Owner-Passwort-Reset verwendet die zentrale Supabase-Auth-Funktion und
  übergibt keine `From`-Adresse.
- Es wurde kein Frontend-Workaround ergänzt.

## Erforderliche Supabase-Konfiguration

Dashboard-Pfad:

1. Supabase Dashboard öffnen.
2. Projekt `wuxuai-bonus-staging` auswählen.
3. **Authentication → Emails → SMTP Settings** öffnen.
4. **Enable custom SMTP** aktivieren.
5. Folgende Werte setzen:
   - Sender email / `smtp_admin_email`: `support@wuxugroup.com`
   - Sender name / `smtp_sender_name`: `WUXU Group Support`
   - SMTP host, port, username und password: Werte des freigegebenen
     Transaktionsmail-Providers.
6. Änderungen speichern.

Der sichtbare Absender soll danach als
`WUXU Group Support <support@wuxugroup.com>` erscheinen.

Die Änderung ist eine Dashboard-/SMTP-Provider-Konfiguration. Sie ist nicht im
Frontend implementierbar. Der SMTP-Provider muss den Versand für
`wuxugroup.com` beziehungsweise `support@wuxugroup.com` autorisieren.

## Provider- und Domainprüfung

Vor der Aktivierung sind beim gewählten SMTP-Provider zu prüfen:

- verifizierte Absenderdomain beziehungsweise verifizierter Absender,
- SPF,
- DKIM,
- DMARC,
- Bounce-/Suppression-Verarbeitung,
- zulässige Versandrate für Auth-E-Mails.

SMTP-Passwort, API-Key oder andere Zugangsdaten dürfen nicht in Code,
Dokumentation oder Git gespeichert werden.

## Live-Verifikation nach Konfiguration

1. Passwort-Reset an eine autorisierte Staging-Testadresse anfordern.
2. Im empfangenen Mail-Header prüfen:
   - sichtbarer Absender: `WUXU Group Support <support@wuxugroup.com>`,
   - SPF: bestanden,
   - DKIM: bestanden,
   - DMARC: bestanden.
3. Reset-Link öffnen und den bestehenden Recovery-Flow vollständig testen.
4. Provider-Log auf erfolgreiche Zustellung und fehlende Bounces prüfen.

## Durchgeführte Änderung

Keine SMTP-Konfiguration wurde aktiviert. Ohne vollständige Providerdaten und
Domainfreigabe würde eine Aktivierung den Auth-Mailversand gefährden. Es wurden
keine Secrets gelesen, ausgegeben oder gespeichert.

## Ergebnis

- Gewünschter Absender im Code hartcodiert: Nein
- Custom SMTP auf Staging aktiv: Ja
- Dashboard-Änderung erforderlich: Ja
- SMTP-Provider-Konfiguration vorhanden: Ja
- Sichtbarer Absender live verifiziert: Nein
- Frontend-Workaround implementiert: Nein

## Qualität

- `git diff --check`: erfolgreich
- Typecheck: erfolgreich
- Lint: 0 Fehler, 6 bereits bestehende Warnungen
- Tests: 421/421 erfolgreich
- Build: erfolgreich
- Migration: keine
- RLS/Security: unverändert

Status: `MANUAL VERIFICATION REQUIRED`
