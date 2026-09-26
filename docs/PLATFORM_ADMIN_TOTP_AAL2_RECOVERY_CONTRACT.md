# Platform Admin TOTP/AAL2 – Break-glass- und Recovery-Vertrag

Status: **ARCHITEKTURPRÜFUNG ERFORDERLICH / NOCH NICHT FÜR STAGING FREIGEGEBEN**

Gültigkeitsbereich: Platform-Admin-Zugang von WUXUAI Bonus

Stand: 2026-09-26

## 1. Sicherheitsziel

Platform-Admin-Aktionen bleiben auch während eines Recovery-Vorgangs serverseitig
an eine mit TOTP bestätigte AAL2-Sitzung gebunden. Recovery ersetzt ausschließlich
einen verlorenen oder nicht mehr verfügbaren TOTP-Faktor. Es entsteht weder eine
dauerhafte AAL1-Ausnahme noch ein allgemein nutzbarer MFA-Bypass.

Wenn TOTP oder der Supabase-MFA-Dienst nicht verfügbar ist, bleiben Platform-
Admin-Aktionen gesperrt. Betriebsdruck ist kein Grund, die AAL2-Prüfung zu
deaktivieren oder `platform_admins` direkt zu verändern.

## 2. Zulässige Rollen

Vor der Staging-Aktivierung müssen folgende Personen namentlich in einem
zugriffsgeschützten Recovery-Register außerhalb der Anwendung hinterlegt sein:

1. **Recovery Requestor:** Founder beziehungsweise vertretungsberechtigte
   Geschäftsleitung. Nur diese Rolle darf einen Recovery-Vorgang eröffnen.
2. **Independent Recovery Approver:** vorab benannte zweite Person mit
   Sicherheitsverantwortung. Requestor und Approver dürfen nicht dieselbe Person
   sein.
3. **Recovery Executor:** Inhaberin oder Inhaber eines separat MFA-geschützten
   Supabase-Organisationszugangs. Der Executor darf zugleich Approver sein, aber
   nicht Requestor des gleichen Vorgangs.

Fehlt eine erreichbare, vorab registrierte zweite Prüfinstanz, wird kein Recovery
ausgeführt. Der Platform-Admin-Zugang bleibt gesperrt. Diese Besetzung ist ein
offenes Freigabe-Gate vor Staging.

## 3. Unabhängige Identitätsprüfung

Die gesperrte Platform-Admin-Sitzung, das verlorene Gerät und ein dort erzeugter
Code gelten nicht als Identitätsnachweis. Vor einer Faktoränderung sind mindestens
zwei voneinander unabhängige Nachweise erforderlich:

- Rückruf oder Videoabgleich über eine bereits im Recovery-Register hinterlegte
  Kontaktmöglichkeit;
- Kontrolle eines zweiten, vorab registrierten und MFA-geschützten
  Unternehmens-Providerkontos oder der Unternehmens-Maildomäne;
- Abgleich der Vertretungsberechtigung mit dem hinterlegten Unternehmensnachweis.

Ausweiskopien, TOTP-Secrets, QR-Payloads, Codes, Access-/Refresh-Tokens und
Recovery-Codes werden nicht in Ticket, Audit, Bericht oder Git übernommen.

## 4. Verbindlicher Recovery-Ablauf

1. Requestor eröffnet einen Vorfall mit zufälliger Correlation-ID, Grund,
   Zeitstempel und betroffener pseudonymisierter Platform-Admin-Referenz.
2. Platform-Admin-Mutationen werden organisatorisch eingefroren. Vorhandene
   Auth-, Faktor- und Auditmetadaten werden read-only gesichert.
3. Approver führt die unabhängige Identitätsprüfung durch und protokolliert nur
   PASS/FAIL sowie die verwendeten Nachweisklassen.
4. Executor prüft im offiziellen Supabase-Control-Plane-Zugang read-only die
   Faktor-Metadaten. Es wird exakt der verlorene TOTP-Faktor adressiert.
5. Alle bestehenden Sitzungen der betroffenen Identität werden widerrufen. Danach
   wird ausschließlich der verlorene Faktor entfernt. Passwort, Rolle,
   Membership und `platform_admins` bleiben unverändert, sofern kein separater
   Credential-Incident vorliegt.
6. Die Person meldet sich in einem sauberen Browserprofil mit dem bestehenden
   ersten Faktor neu an. Diese AAL1-Sitzung besitzt weiterhin keine Platform-
   Aktionsberechtigung.
7. Über die reguläre Anwendung wird ein neuer TOTP-Faktor eingerichtet und mit
   einem gültigen Code bestätigt. Der QR-/Secretwert wird nur im aktuellen
   Browser und Authenticator verarbeitet.
8. Nach erfolgreicher Challenge wird ein neuer AAL2-Access-Token nachgewiesen,
   ohne seinen Wert zu protokollieren. Die serverseitige TOTP-AMR-Prüfung muss
   PASS sein.
9. Direkte RPC-Nachweise werden ausgeführt: AAL1 bleibt abgewiesen; dieselbe
   geschützte Read-RPC ist mit der neuen TOTP-AAL2-Sitzung zulässig. Eine
   schreibende Aktion ist für Recovery nicht erforderlich.
10. Verbliebene Vor-Recovery-Sitzungen und der verlorene Faktor werden erneut als
    ungültig bestätigt. Danach wird der Vorfall geschlossen.

## 5. Unveränderbarer Nachweis

Der Incident-Nachweis wird zunächst im zugriffsgeschützten, append-only
Security-Incident-System außerhalb der gesperrten Anwendung geführt. Nach
wiederhergestelltem AAL2 wird eine referenzierende, aber secret-freie Auditzeile
in der bestehenden Plattform-Auditspur ergänzt, sofern ein dafür bereits
freigegebener Auditpfad existiert.

Pflichtfelder:

- Correlation-ID und Vorfallklasse;
- Beginn, Genehmigung, Ausführung und Abschluss mit Serverzeit;
- pseudonymisierte Requestor-, Approver- und Executor-Referenzen;
- verwendete Identitätsnachweisklassen und deren PASS/FAIL;
- Fingerprint der entfernten Faktor-ID, niemals Secret oder Code;
- Sitzungswiderruf, Faktorentfernung, Neueinrichtung und AAL2-Wiederherstellung;
- Ergebnisse der AAL1-/AAL2-RPC-Nachweise;
- Abweichungen und Abschlussentscheidung.

## 6. Verbotene Recovery-Methoden

- keine dauerhafte oder zeitweise AAL1-Freigabe für Platform-Aktionen;
- keine Änderung oder Deaktivierung von Migration 173 als Recovery-Abkürzung;
- keine Service-Role-, SQL-, JWT-Claim- oder Browser-Metadaten-Ausnahme;
- kein direktes Einfügen oder Umschreiben von `platform_admins`;
- kein gemeinsam nutzbarer Backup-Account;
- kein Versand eines TOTP-Secrets oder Codes per Chat, E-Mail oder Ticket;
- keine Wiederverwendung des verlorenen Faktors;
- keine Fortsetzung bei unvollständiger unabhängiger Identitätsprüfung.

## 7. Rückfallweg

- **Fehler vor Migration 173:** abbrechen; Datenbank bleibt auf Migration 172.
- **Fehler innerhalb Migration 173:** die Migration ist transaktional; bei Fehler
  wird sie vollständig zurückgerollt. Keine manuelle Teilkorrektur.
- **UI-Fehler nach Migration:** Migration und AAL2-Grenze bleiben aktiv. Recovery
  erfolgt nur über den offiziellen Supabase-MFA-Control-Plane-Weg; keine
  AAL1-Freigabe.
- **Supabase-MFA-Störung:** Platform-Aktionen bleiben eingefroren, bis der Dienst
  wieder verfügbar ist. Es gibt keinen Bypass.
- **Verdacht auf kompromittierten ersten Faktor:** separater Credential-Incident;
  zusätzlich Passwort/Providerzugang rotieren und alle Sitzungen widerrufen.

## 8. Architektur-Gates

Vor jeder Staging-Freigabe müssen namentlich bestätigt sein:

- Recovery Requestor;
- unabhängiger Recovery Approver;
- Recovery Executor mit eigenem MFA-geschütztem Supabase-Zugang;
- append-only Incident-Ablage;
- zugängliche unabhängige Kontakt- und Unternehmensnachweise;
- Freigabe dieses Vertrags durch Founder und Security-Review.

Bis dahin gilt: **LOCAL CODE LOCK / STAGING NOT READY**.
