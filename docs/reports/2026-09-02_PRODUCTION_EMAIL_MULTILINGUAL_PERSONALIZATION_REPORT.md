# WUXUAI® Bonus Production Email System - Multilingual Personalization

Datum: 2026-09-02
Status: CODE LOCK

## Ursache

Vor dem ersten Production-Mailversand mussten die vorhandenen V1-E-Mail-Flows
vollständig inventarisiert, auf sieben Sprachen vorbereitet, einheitlich als
WUXUAI® Bonus gebrandet und gegen Daten-, Link- und Secret-Leaks geprüft
werden.

## Inventar

Gefunden wurden zehn aktive E-Mail-erzeugende Einstiegspunkte in sieben
Template-Familien:

1. Customer Signup-Bestätigung
2. Owner Signup-Bestätigung
3. Customer Bestätigungs-Resend
4. Owner Bestätigungs-Resend
5. Gemeinsame Passwort-Wiederherstellung für Customer, Staff und Owner
6. Staff-Einladung für einen neuen Auth-User
7. Staff-Fortsetzung für einen bestehenden Auth-User per Magic Link
8. Birthday Gift Zuweisung
9. Birthday Gift Ablauf-Erinnerung
10. Benachrichtigung beim erstmaligen Erreichen einer Punktebelohnung

Nicht aktiv und nicht ergänzt: E-Mail-Änderungsbestätigung, Welcome-Gift-Mail,
allgemeine Reward-Ablaufmail, Newsletter oder Marketing-Mail.

## Was wurde geändert

- Zentrale Systemtexte für DE, EN, FR, IT, ES, ZH und KO ergänzt.
- Sprachauflösung nach Preference, Account, App, Browser und EN-Fallback
  umgesetzt.
- Customer- und Owner-Signup speichern die sicher erkannte App-Sprache als
  Präsentationsmetadatum, nicht als Autorisierungsquelle.
- Transaktionsmails personalisieren mit sicher verfügbarem Vornamen,
  Restaurant sowie Gift-/Reward-Titel und fallen ohne Namen sauber zurück.
- Staff-Einladungen erhalten ausschließlich sichere Präsentationsmetadaten.
- App-CTAs verwenden den umgebungsgebundenen `APP_BASE_URL`-Vertrag; für
  Production ist das `https://app.bonus.wuxuaisbi.com`.
- Auth-Template-Quellen für Confirmation/Resend, Recovery, Invite und Magic
  Link wurden mit `ConfirmationURL` und sieben Sprachzweigen vorbereitet.
- Absender-Fallback, sichtbare Marke und Support-Footer verwenden
  `WUXUAI® Bonus` und `support@wuxuaisbi.com`.

## Auth-Limitierung

Die Dateien unter `supabase/auth-templates/` konfigurieren den gehosteten
Supabase-Auth-Dienst nicht automatisch. Production Auth bleibt unverändert,
bis die Vorlagen und Betreffzeilen in einem separat freigegebenen
Konfigurationsschritt geprüft und eingespielt werden. Der sichere
`ConfirmationURL`-Vertrag wurde nicht ersetzt oder rekonstruiert.

## Was wurde nicht geändert

- Keine neue Business-Mail und keine Marketing-Mail
- Keine Welcome-Gift-, Birthday-, Points-, Reward- oder Referral-Logik
- Keine RLS-, Tenant-, Multi-Role- oder Autorisierungsänderung
- Keine Migration und keine Production-Datenänderung
- Keine Edge-Function-, Cloudflare- oder DNS-Bereitstellung
- Kein E-Mail-Versand und keine Stripe-Aktivierung
- Keine internen Welcome-Gift-Gewichte in Mail oder öffentlicher UI

## Sicherheit

- Interne IDs, Tokens, Payloads und Secrets werden nicht in Mailinhalte oder
  Logs aufgenommen.
- Owner-Inhalte wie Restaurant-, Gift- und Reward-Namen bleiben unverändert
  und werden nicht automatisch übersetzt.
- Unklare oder mehrdeutige Empfängerzuordnung fällt ohne Personalisierung und
  auf Englisch zurück.
- Secret-Scan der geänderten und neuen Dateien: PASS.

## Verifikation

- Tests: 1264/1264 PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler; 7 bekannte Warnungen außerhalb dieses Scopes
- Production-Build: PASS
- Secret-Scan: PASS
- `git diff --check`: PASS
- Mobile E-Mail-Layout: per responsivem Inline-HTML und 44px CTA vertraglich
  geprüft; echter Mailclient-/iPhone-Smoke-Test noch nicht durchgeführt

## Risiken

- Auth-Lokalisierung ist erst nach separater Production-Konfiguration live.
- Edge Functions wurden nicht deployed und Transaktionsmails nicht real
  versendet; deshalb kein FINAL LOCK.
- Der aktuelle Worktree enthält zusätzlich die bereits vor diesem Auftrag
  begonnenen, zusammenhängenden Production-Origin-Vertragsänderungen. Sie
  wurden nicht zurückgesetzt oder separat committed.

## Abschluss

- Aufgabe: Production Email System - Multilingual Personalization
- Build: Ja
- Migration: Keine
- Flow-Test: Nein, kein Production-Mailversand freigegeben
- RLS/Security: Ja, unverändert und durch Regressionstests geprüft
- Alte Logik geprüft: Ja
- Report: `docs/reports/2026-09-02_PRODUCTION_EMAIL_MULTILINGUAL_PERSONALIZATION_REPORT.md`
- Prüf-ZIP: `exports/2026-09-02_PRODUCTION_EMAIL_MULTILINGUAL_PERSONALIZATION.zip`
- Offene Risiken: Hosted Auth-Konfiguration und kontrollierter Production-Smoke-Test
- Status: CODE LOCK
