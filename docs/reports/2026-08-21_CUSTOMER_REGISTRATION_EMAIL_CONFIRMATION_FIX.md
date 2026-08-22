# Customer Registration – Email Confirmation + Password Confirmation Fix

Datum: 2026-08-21  
Branch: `codex/v1-release-finishing-sprint`  
Ausgangscommit: `89b9093c7a646904fab9508478af0362fd9c9691`

## Ursache

Der E-Mail-Versand auf Staging ist funktionsfähig. Der reproduzierte Fehler lag
in der Auswertung der Signup-Antwort: Supabase antwortet bei einer bereits
registrierten Adresse aus Schutz vor Account-Ermittlung ebenfalls mit HTTP 200,
liefert dabei aber einen verschleierten Nutzer ohne Identitäten und versendet
keine neue Bestätigungs-E-Mail. Die bisherige UI wertete jede erfolgreiche
HTTP-Antwort ohne Session als nachweislich versendete Bestätigung und zeigte
deshalb fälschlich „Bitte öffne jetzt den Bestätigungslink“.

Der Live-Nachweis mit einer neuen, isolierten Staging-Adresse ergab dagegen:

- Signup: HTTP 200, eine Identität, `confirmation_sent_at` vorhanden
- Bestätigungs-E-Mail: tatsächlich empfangen
- Verify: HTTP 303 zum vorgesehenen Customer-Callback
- `email_confirmed_at`: gesetzt
- anschließender Passwort-Login: HTTP 200

Ein erneuter Signup derselben bestätigten Adresse ergab HTTP 200 mit null
Identitäten und ohne neue E-Mail. Damit ist SMTP nicht die Root Cause.

## Flow und Datenvertrag

Der geprüfte Ablauf lautet:

`/customer/register` → `CustomerAuthPage` → `customerAuthService` →
`supabase.auth.signUp()` → Supabase Auth User → Bestätigungs-E-Mail →
`/customer/auth/callback` → Bestätigungsparser →
`ensure_authenticated_customer_account` → gespeicherter `customer_return_to` →
Customer Portal im ursprünglichen Restaurantkontext.

Der Signup sendet ausschließlich:

- normalisierte E-Mail-Adresse
- echtes Passwort
- `emailRedirectTo` auf `/customer/auth/callback`
- vorhandene Customer-Metadaten für Vorname, normalisierte Telefonnummer,
  optionalen Geburtstag und sichere Rückkehrroute

`confirmPassword` wird weder an Supabase Auth noch an RPCs, Metadaten,
Analytics oder Logs übergeben.

## Änderungen

- Gemeinsame Customer-Auth-Auswertung und sichere deutsche Fehlermeldungen
  ergänzt.
- Signup in einen eng begrenzten Service verschoben und Antwortzustände
  `confirmed`, `confirmation_required`, `existing_or_obfuscated` und `failed`
  explizit ausgewertet.
- Pflichtfeld „Passwort bestätigen“ mit verzögerter Fehlermeldung ergänzt.
- Submit bei leerer, ungültiger oder abweichender Bestätigung blockiert.
- Resend über die bestehende Supabase-API mit deaktiviertem Requestzustand,
  60-Sekunden-Sperre und neutralem Anti-Enumeration-Feedback ergänzt.
- Bestehende Telefonnummern-, Geburtstags-, Callback-, Legal- und
  Restaurantkontext-Logik beibehalten.

## Staging-Verifikation

Projekt: `wuxuai-bonus-staging` (`bwhv…qaya`)

- E-Mail-Provider und Confirm-Signup sind durch den realen No-Session-Signup,
  den empfangenen Bestätigungslink und den gesetzten Bestätigungszeitpunkt
  funktional nachgewiesen.
- Custom SMTP versendete die Nachricht erfolgreich; keine Zugangsdaten wurden
  protokolliert.
- Der Empfänger-Cooldown wurde respektiert: sofortiger Resend HTTP 429, nach
  Ablauf des Zeitfensters HTTP 200 und zweite E-Mail empfangen.
- Restaurant-Rückkehrroute blieb in den signierten Auth-Metadaten erhalten.
- Geburtstag ohne Eingabe blieb `null`; ein eingegebenes Datum wurde korrekt
  gespeichert.
- Duplicate-Signup erzeugte keine zweite Customer-Identität und keine neue Mail.

Die Supabase-Dashboard-Felder wurden in diesem Lauf nicht manuell geändert.
Für eine manuelle Konfigurationskontrolle gilt:

- `Authentication → Providers → Email`: Email Provider und Confirm Email aktiv
- `Authentication → URL Configuration`: Site URL
  `https://bonus.wuxuaisbi.com`, Redirect
  `https://bonus.wuxuaisbi.com/customer/auth/callback`
- `Authentication → Email Templates → Confirm signup`: Der aktuelle direkte
  Verify-Link funktionierte im Test. Für zusätzlichen Prefetch-Schutz bleibt
  das bereits unterstützte `token_hash`-Callback-Template die empfohlene
  Härtung; es wurde in diesem Auftrag nicht ungeprüft umgestellt.

## Tests und Responsive QA

- Automatisierte Tests: 690/690 erfolgreich
- Customer-Auth-Zieltests: 63/63 erfolgreich
- Typecheck: erfolgreich
- Lint: 0 Fehler
- Production Build: erfolgreich
- `git diff --check`: erfolgreich
- Responsive Chromium: 390, 430, 768, 1024 und 1440 px ohne horizontalen
  Overflow; beide Passwortfelder, Fehlermeldung und CTA vollständig sichtbar
- Owner-Registrierung: unverändert; bestehende Regressionstests erfolgreich
- Physischer iPhone-Safari-Test: nicht durchgeführt

## Nicht geändert

- Keine Migration
- Keine RLS-, Policy-, Tenant- oder Customer-Tabellenänderung
- Keine Owner-Registrierungsänderung
- Kein Production-Deployment
- Kein Stripe-Setup

## Offene Risiken

- Die exakte Dashboard-Konfiguration und das endgültige Prefetch-sichere
  Confirmation-Template sollten vor Production nochmals manuell im Supabase-
  Dashboard bestätigt werden.
- Die isolierten Staging-Testidentitäten aus dem E2E-Lauf müssen im normalen
  Staging-Testdaten-Cleanup entfernt werden.
- Physischer iPhone-Safari-Mail-App-Rückkehrtest steht noch aus.

## Finale Ausgabe

CUSTOMER REGISTRATION:  
PASS

DOUBLE PASSWORD CHECK:  
PASS

CONFIRM PASSWORD SENT TO BACKEND:  
NO

SUPABASE SIGNUP:  
PASS

CONFIRM EMAIL ENABLED:  
YES

CONFIRMATION EMAIL SENT:  
PASS

CONFIRMATION EMAIL RECEIVED:  
PASS

RESEND CONFIRMATION:  
PASS

AUTH CALLBACK:  
PASS

RESTAURANT CONTEXT PRESERVED:  
PASS

LOGIN AFTER CONFIRMATION:  
PASS

BIRTHDAY OPTIONAL:  
PASS

OWNER REGISTRATION REGRESSION:  
PASS

RLS:  
PASS

TESTS:  
690/690 PASS

TYPECHECK:  
PASS

LINT:  
PASS

BUILD:  
PASS

ROOT CAUSE:  
Die UI interpretierte Supabase-Anti-Enumeration-Antworten für bestehende
E-Mail-Adressen als tatsächlich versendete Bestätigungs-E-Mail.

CUSTOMER AUTH FLOW READY:  
NO – Code und Staging-Backend sind verifiziert, aber der korrigierte lokale
Frontendstand wurde auftragsgemäß nicht bereitgestellt. Der abschließende
Browser-E2E gegen einen Staging-Frontend-Deploy steht deshalb noch aus.

PRODUCTION:  
LOCKED

STRIPE:  
DEFERRED
