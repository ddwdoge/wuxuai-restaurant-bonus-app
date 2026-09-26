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
   Supabase-Organisationszugangs und eines kontrollierten serverseitigen
   Recovery-Runners mit Berechtigung für die Auth-Admin-API des eindeutig
   ausgewählten Staging-Projekts. Der Executor darf zugleich Approver sein,
   aber nicht Requestor des gleichen Vorgangs.

Fehlt eine erreichbare, vorab registrierte zweite Prüfinstanz, wird kein Recovery
ausgeführt. Der Platform-Admin-Zugang bleibt gesperrt. Diese Besetzung ist ein
offenes Freigabe-Gate vor Staging.

## 3. Zwei getrennte MFA-Grenzen

Der MFA-Zugang zum **Supabase-Organisationskonto** schützt Dashboard,
Organisation und Control Plane des Executors. Er ist weder der TOTP-Faktor des
WUXUAI-Benutzers noch berechtigt er für sich allein zur Änderung eines
Anwendungsfaktors.

Der **WUXUAI-Platform-Admin-TOTP-Faktor** gehört zum Auth-Benutzer im konkreten
Supabase-Projekt und wird in Supabase Auth verwaltet. Der nachgewiesene
offizielle Serverpfad ist:

1. Faktor-Metadaten mit
   `supabase.auth.admin.mfa.listFactors({ userId })` ermitteln;
2. exakt den genehmigten Faktor mit
   `supabase.auth.admin.mfa.deleteFactor({ userId, id: factorId })` entfernen.

Beide Aufrufe sind Auth-Admin-Aufrufe. Sie dürfen nur in einem geschützten,
kurzlebigen Server-/Recovery-Prozess mit dem Staging-Projekt und dessen
serverseitiger Projektberechtigung laufen. Ein Browser, die Client-App und ein
normaler Platform-Admin-Access-Token sind dafür nicht ausreichend. Secret- oder
Service-Credentials werden nie in Browser, Bericht, Ticket, Shell-Argument,
Prüf-ZIP oder Git übernommen.

Die Funktion und ihr Berechtigungsmodell wurden mit der im Projekt installierten
offiziellen Supabase-JavaScript-Bibliothek sowie gegen das eindeutig bestätigte
Staging-Projekt read-only geprüft. Der destruktive Nachweis erfolgte ausschließlich
lokal an einem synthetischen Benutzer. Am einzigen echten Platform-Admin-Konto
wurde weder ein Faktor aufgelistet noch entfernt.

## 4. Unabhängige Identitätsprüfung

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

## 5. Verbindlicher Recovery-Ablauf

1. Requestor eröffnet einen Vorfall mit zufälliger Correlation-ID, Grund,
   Zeitstempel und betroffener pseudonymisierter Platform-Admin-Referenz.
2. Platform-Admin-Mutationen werden organisatorisch eingefroren. Vorhandene
   Auth-, Faktor- und Auditmetadaten werden read-only gesichert.
3. Approver führt die unabhängige Identitätsprüfung durch und protokolliert nur
   PASS/FAIL sowie die verwendeten Nachweisklassen.
4. Executor bestätigt Projektbindung und Migration 173 einschließlich des
   aktuellen Session-/Faktor-Guards. Ohne diesen Nachweis wird kein Faktor
   entfernt.
5. Executor liest über `auth.admin.mfa.listFactors` ausschließlich die minimalen
   Faktor-Metadaten und adressiert nach Vier-Augen-Freigabe exakt den verlorenen
   TOTP-Faktor. Faktor-IDs werden nur pseudonymisiert dokumentiert.
6. Executor entfernt exakt diesen Faktor über
   `auth.admin.mfa.deleteFactor`. Es wird **nicht** behauptet, dass zuvor ein
   separater globaler Sitzungswiderruf stattgefunden hat. Supabase invalidiert
   dabei die weitere Sitzungserneuerung; ein bereits signiertes Access-JWT kann
   jedoch bis zu seinem `exp` kryptografisch gültig bleiben.
7. Unmittelbar danach wird der vor der Entfernung gespeicherte, noch nicht
   abgelaufene AAL2-Token nur im geschützten Testprozess gegen eine schreibfreie
   Platform-RPC geprüft. Migration 173 muss ihn sofort abweisen, weil die
   referenzierte Auth-Session nicht mehr an einen existierenden, verifizierten
   TOTP-Faktor gebunden ist. Tokenwerte werden nie ausgegeben.
8. Die Person meldet sich in einem sauberen Browserprofil mit dem bestehenden
   ersten Faktor neu an. Diese AAL1-Sitzung besitzt weiterhin keine Platform-
   Aktionsberechtigung.
9. Über die reguläre Anwendung wird ein neuer TOTP-Faktor eingerichtet und mit
   einem gültigen Code bestätigt. Der QR-/Secretwert wird nur im aktuellen
   Browser und Authenticator verarbeitet.
10. Nach erfolgreicher Challenge wird ein neuer AAL2-Access-Token nachgewiesen,
   ohne seinen Wert zu protokollieren. Die serverseitige TOTP-AMR-Prüfung muss
   PASS sein.
11. Direkte RPC-Nachweise werden ausgeführt: AAL1 bleibt abgewiesen; dieselbe
   geschützte Read-RPC ist mit der neuen TOTP-AAL2-Sitzung zulässig. Eine
   schreibende Aktion ist für Recovery nicht erforderlich.
12. Der verlorene Faktor wird erneut als nicht vorhanden bestätigt. Die
    Restlaufzeit aller vor der Entfernung ausgestellten Access-JWTs wird aus
    deren `exp` beziehungsweise der verifizierten Projektkonfiguration bestimmt,
    ohne Tokenwerte zu protokollieren.
13. Der Vorfall wird erst geschlossen, wenn der alte AAL2-Token am direkten RPC
    blockiert ist, der neue Faktor AAL2 wiederherstellt und keine unbekannte
    Session verbleibt. Bei jedem unklaren Ergebnis bleiben Platform-Mutationen
    eingefroren; als defensiver Abbruchweg wird mindestens bis zum spätesten
    `exp` aller Vor-Recovery-Tokens gewartet.

Die lokale Referenzkonfiguration verwendet eine Access-Token-Laufzeit von rund
einer Stunde. Die tatsächliche Staging-Laufzeit ist vor dem Recovery read-only
zu bestätigen und darf nicht aus der lokalen Einstellung abgeleitet werden.

## 6. Sichere Verifikation ohne echtes Admin-Risiko

- Lokaler End-to-End-Test: synthetischen Auth-Benutzer anlegen, TOTP regulär
  enrollen und verifizieren, AAL2-Token sichern, Faktor über die offizielle
  Auth-Admin-API entfernen, denselben noch nicht abgelaufenen Token gegen eine
  schreibfreie Platform-RPC prüfen und den Benutzer vollständig entfernen.
- Staging vor Freigabe: Projekt und vorhandene Faktor-Metadaten nur read-only
  prüfen. Der einzige echte Platform-Admin-Faktor wird in einem Dry-run niemals
  gelöscht.
- Ein destruktiver Staging-Probetest wäre nur mit gesonderter Freigabe und einem
  eigens dafür vorgesehenen synthetischen Auth-Benutzer zulässig; dieser Benutzer
  erhält keine reale Platform-Admin-Berechtigung und keine Geschäftsdaten.

Der lokale Test bewies: Faktorentfernung allein verhindert nicht, dass ein
bereits ausgestelltes Access-JWT bis `exp` signaturgültig bleibt. Der ursprüngliche
Entwurf der Migration 173 ließ einen solchen direkten RPC zu. Der korrigierte
Guard verlangt deshalb gleichzeitig eine aktuelle `auth.sessions`-Zeile und den
zu dieser Session gehörenden weiterhin vorhandenen, verifizierten TOTP-Faktor.
Mit diesem Guard wurde derselbe alte Token unmittelbar abgewiesen.

## 7. Unveränderbarer Nachweis

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
- Faktorentfernung, alter-Token-Negativnachweis, Neueinrichtung und
  AAL2-Wiederherstellung;
- bestätigte maximale Restlaufzeit der Vor-Recovery-Access-Tokens;
- Ergebnisse der AAL1-/AAL2-RPC-Nachweise;
- Abweichungen und Abschlussentscheidung.

## 8. Verbotene Recovery-Methoden

- keine dauerhafte oder zeitweise AAL1-Freigabe für Platform-Aktionen;
- keine Änderung oder Deaktivierung von Migration 173 als Recovery-Abkürzung;
- keine Service-Role-, SQL-, JWT-Claim- oder Browser-Metadaten-Ausnahme;
- kein direktes Einfügen oder Umschreiben von `platform_admins`;
- kein gemeinsam nutzbarer Backup-Account;
- kein Versand eines TOTP-Secrets oder Codes per Chat, E-Mail oder Ticket;
- keine Wiederverwendung des verlorenen Faktors;
- keine Fortsetzung bei unvollständiger unabhängiger Identitätsprüfung;
- keine Behauptung einer sofortigen JWT-Ungültigkeit allein aufgrund von
  Sign-out, Refresh-Token-Widerruf oder Faktorentfernung;
- keine Faktorentfernung, solange Migration 173 mit Session-/Faktorbindung nicht
  aktiv und geprüft ist.

## 9. Rückfallweg

- **Fehler vor Migration 173:** abbrechen; Datenbank bleibt auf Migration 172.
- **Fehler innerhalb Migration 173:** die Migration ist transaktional; bei Fehler
  wird sie vollständig zurückgerollt. Keine manuelle Teilkorrektur.
- **UI-Fehler nach Migration:** Migration und AAL2-Grenze bleiben aktiv. Recovery
  erfolgt nur über den offiziellen Auth-Admin-Faktorpfad; keine AAL1-Freigabe.
- **Faktor entfernt, alter RPC nicht blockiert:** Platform-Mutationen bleiben
  organisatorisch eingefroren. Keine weitere Recovery-Mutation. Bis zum spätesten
  `exp` aller alten Access-Tokens warten, Evidenz sichern und Migration/Guard als
  Security Incident behandeln.
- **Supabase-MFA-Störung:** Platform-Aktionen bleiben eingefroren, bis der Dienst
  wieder verfügbar ist. Es gibt keinen Bypass.
- **Verdacht auf kompromittierten ersten Faktor:** separater Credential-Incident;
  zusätzlich Passwort/Providerzugang rotieren und alle Sitzungen widerrufen.

## 10. Architektur-Gates

Vor jeder Staging-Freigabe müssen namentlich bestätigt sein:

- Recovery Requestor;
- unabhängiger Recovery Approver;
- Recovery Executor mit eigenem MFA-geschütztem Supabase-Zugang;
- geschützter Recovery-Runner mit eng begrenzter Auth-Admin-Berechtigung für das
  eindeutig ausgewählte Projekt;
- append-only Incident-Ablage;
- zugängliche unabhängige Kontakt- und Unternehmensnachweise;
- Freigabe dieses Vertrags durch Founder und Security-Review.

Bis dahin gilt: **LOCAL CODE LOCK / STAGING NOT READY**.
