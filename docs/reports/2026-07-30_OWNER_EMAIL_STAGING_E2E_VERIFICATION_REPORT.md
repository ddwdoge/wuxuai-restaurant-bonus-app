# Owner-E-Mail-Bestätigung und Passwort-Reset – Staging-Verifikation

Datum: 2026-07-30  
Branch: `codex/owner-auth-recovery-hardening`  
Commit-Basis: `0f318c26199bcfcf7520d64413dc1e7eb502f78d`  
Supabase-Projekt: `wuxuai-bonus-staging` (`bwhv…qaya`)

## Zusammenfassung

Custom SMTP ist im bestätigten Staging-Projekt aktiv. Die Absenderadresse ist
`support@wuxugroup.com`. Der gespeicherte Anzeigename ist jedoch
`WUXUAI Restaurant bonus` und entspricht damit nicht dem verlangten
`WUXU Group Support`.

Ein echter Versand-, Empfangs- und Linktest konnte nicht durchgeführt werden,
weil kein erreichbares Testpostfach samt Zugriff bereitgestellt wurde. From-,
Reply-To-, Spam-, SPF-, DKIM- und DMARC-Ergebnis sind deshalb ausdrücklich
`MANUAL VERIFICATION REQUIRED`.

## Supabase-Konfiguration

| Prüfung | Ergebnis |
| --- | --- |
| Custom SMTP | Aktiv |
| Sender email | `support@wuxugroup.com` |
| Sender name | Abweichend: `WUXUAI Restaurant bonus` |
| Site URL | `https://bonus.wuxuaisbi.com` |
| Redirect-Allowlist | Leer |
| E-Mail-Limit | 30 E-Mails pro Stunde |
| Mindestintervall pro Empfänger | 60 Sekunden |
| Reset-Vorlage | Englische Supabase-Standardvorlage |
| Bestätigungsvorlage | Vorhanden, Live-Versand nicht geprüft |
| Reply-To | Im geprüften Dashboard-Bereich nicht verifizierbar |
| Linkablaufzeit | Im geprüften Dashboard-Bereich nicht verifizierbar |

### Kontrollierte Korrekturversuche

1. Der Anzeigename wurde lokal im Dashboardformular auf `WUXU Group Support`
   gesetzt. Supabase lehnte das Speichern mit HTTP 400 ab. Der gespeicherte
   SMTP-Stand wurde danach neu geladen; er blieb unverändert. Es wurde kein
   SMTP-Passwort gelesen oder eingegeben.
2. Die exakten Redirects
   `https://bonus.wuxuaisbi.com/auth/callback` und
   `https://bonus.wuxuaisbi.com/auth/update-password` sollten ergänzt werden.
   Bereits das Öffnen des Eingabeflows über **Add URL** endete im Dashboard mit
   HTTP 500. Es wurde keine Redirect-Konfiguration gespeichert.
3. Eine deutsche Reset-Vorlage wurde nicht gespeichert. Der Dashboard-Editor
   übernahm den Inhalt nicht zuverlässig und die Speicherung wurde mit HTTP 400
   abgelehnt. Die Seite wurde neu geladen; die gespeicherte Standardvorlage
   blieb erhalten.

Keine Secrets wurden gelesen, angezeigt, protokolliert oder gespeichert.

## Technischer Owner-Auth-Vertrag

- Registrierung verwendet `/auth/callback` als Bestätigungsziel.
- Vor bestätigter E-Mail wird kein Owner-Tenant und kein Trial erstellt.
- `/admin` verlangt serverseitig gelesenen Bestätigungsstatus.
- Tenant- und Trial-Erzeugung erfolgt über den idempotenten bestehenden Flow.
- Passwort-Reset verwendet `/auth/update-password?flow=recovery`.
- Der normale Supabase-Client und der tabgebundene Recovery-Client verwenden
  `detectSessionInUrl: false`.
- PKCE-Code und vollständiger Implicit-Hash werden kontrolliert verarbeitet.
- URL-Codes und Hash-Tokens werden nach erfolgreichem Sessionaufbau entfernt.
- Recovery-Marker enthält keine Tokens, Codes, E-Mail-Inhalte oder Passwörter.
- Abbruch, Unmount und erfolgreicher Reset führen zu lokalem Recovery-Logout.
- Der Recovery-Flow erstellt weder Tenant noch Trial.

## Automatisierte Prüfungen

### Relevante Auth-Tests

37/37 erfolgreich. Abgedeckt sind unter anderem:

- Confirm-Gate und zentrale Callback-Routen,
- keine Tenant-/Trial-Erzeugung vor Bestätigung,
- generische Reset-Antwort ohne Account Enumeration,
- Passwortregeln,
- PKCE und Implicit Flow,
- Single-Flight gegen doppelten Sessionaustausch,
- Reload-, Unmount- und Strict-Mode-Cleanup,
- URL- und Markerbereinigung,
- keine Tenant-/Trial-Erzeugung durch Reset.

### Gesamtqualität

- Typecheck: erfolgreich
- Lint: 0 Fehler, 6 bereits bestehende Warnungen
- Tests: 421/421 erfolgreich
- Build: erfolgreich
- `git diff --check`: erfolgreich
- Migration: keine
- RLS/Security: unverändert

## Nicht live bestätigte Testfälle

Folgende Punkte sind `MANUAL VERIFICATION REQUIRED`:

- tatsächliche Zustellung der Bestätigungs-E-Mail,
- tatsächliche Zustellung der Passwort-Reset-E-Mail,
- sichtbarer From-Header,
- Reply-To,
- Spamordner und Zustellbarkeit,
- SPF, DKIM und DMARC,
- tatsächliche Ziel-URL im zugestellten Link,
- Registrierung und Bestätigung im selben Browser,
- Cross-Browser-/Cross-Device-Bestätigung,
- Tenant und Trial nach Bestätigung genau einmal,
- Login nach Bestätigung,
- Passwortänderung mit echtem Link,
- neues Passwort gültig und altes Passwort ungültig,
- Wiederverwendung desselben Links blockiert,
- paralleles Öffnen in zwei Tabs.

## Manuelle Verifikation

1. Im Supabase-Dashboard den SMTP-Anzeigenamen mit erneut eingegebenen,
   autorisierten Providerdaten als `WUXU Group Support` speichern.
2. Unter **Authentication → URL Configuration** die zwei exakten Redirects
   `/auth/callback` und `/auth/update-password` ergänzen und nach Reload prüfen.
3. Eine neue, ausschließlich für Staging bestimmte Test-E-Mail verwenden.
4. Owner registrieren und im Postfach From, Reply-To, Betreff, Spamstatus und
   Linkdomain prüfen.
5. Vor Linköffnung im Dashboard bestätigen: kein Restaurant, keine Membership,
   kein Trial.
6. Bestätigungslink öffnen; danach genau einen Tenant und genau einen Trial
   prüfen. Link erneut und in einem zweiten Browser öffnen.
7. Passwort-Reset auslösen; generische UI-Antwort prüfen.
8. Reset-Mail und Linkdomain prüfen, Passwort ändern, danach altes und neues
   Passwort gegentesten.
9. Reset-Link erneut und parallel in einem zweiten Tab öffnen.
10. Testdaten nach dokumentierter Staging-Löschroutine vollständig bereinigen.

## Risiken

- Der konfigurierte Google-/Gmail-SMTP-Endpunkt wird vom Supabase-Dashboard als
  persönlicher statt transaktionaler Provider gewarnt; Zustellbarkeit kann
  beeinträchtigt sein.
- Der gespeicherte Anzeigename ist noch falsch.
- Die Redirect-Allowlist ist leer. Der angeforderte Redirect kann deshalb auf
  die Site URL zurückfallen und den vorgesehenen Callback-/Recovery-Flow
  verhindern.
- Ohne Postfachzugriff ist kein echter E-Mail-E2E nachgewiesen.

Status: `NOT READY`

