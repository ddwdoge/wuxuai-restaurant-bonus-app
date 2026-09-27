# Platform Admin TOTP/AAL2 – ausführbare Staging-Checkliste

Status: **ENTWURF FÜR ARCHITEKTURPRÜFUNG / NICHT AUSGEFÜHRT**

Migration: `20260926001000_platform_admin_totp_aal2_gate.sql` (173)

Stand: 2026-09-27

Diese Checkliste beschreibt die spätere Staging-Freigabe. Sie autorisiert keine
Migration, Faktor-Einrichtung, Konfigurationsänderung oder Deployment-Aktion.

## A. Vorbedingungen und Stop-Gates

- [ ] Founder und Security-Review haben den Break-glass-/Recovery-Vertrag
  schriftlich freigegeben.
- [ ] Requestor, unabhängiger Approver und Executor sind namentlich registriert
  und erreichbar.
- [ ] Executor besitzt einen eigenen MFA-geschützten Supabase-
  Organisationszugang; keine geteilte Sitzung.
- [ ] Staging-Projekt-ID und Projektname wurden unmittelbar vorher read-only
  bestätigt; Production ist nicht verbunden.
- [ ] Branch, Remote-Parität und exakter freigegebener Commit wurden bestätigt.
- [ ] Staff-Auth-Basiscommit
  `8acb24ca7661d2c8422267885809624842625009` ist Vorfahr des Commit-Tips.
- [ ] Migrationen 001–172 sind bytegleich; ausschließlich Migration 173 ist
  ausstehend.
- [ ] Migration-173-SHA-256 stimmt mit der freigegebenen Evidenz überein.
- [ ] Das einzige Platform-Admin-Konto ist aktiv, der erste Faktor funktioniert,
  und eine legitime isolierte Sitzung ist vorhanden.
- [ ] Vorher-Snapshot: Platform-Admin-Zeile, Rollen, Faktor-Metadaten,
  Auth-Sitzungsanzahl, Grants, Funktionsdefinitionen und relevante Auditpräfixe.
- [ ] Es existiert ein getesteter Zugriff auf den offiziellen Supabase-MFA-
  Auth-Admin-Recoverypfad (`listFactors`/`deleteFactor`) über einen geschützten
  serverseitigen Recovery-Runner.
- [x] Die lokale Referenzimplementierung
  `scripts/platform-admin-totp-recovery-runner.mjs` wurde mit einem
  synthetischen lokalen Auth-Benutzer und verifiziertem TOTP-Faktor geprüft.
  Signatur-, Rollentrennungs-, Projektbindungs-, Berechtigungs- und
  Einmaligkeitsfehler stoppen vor der Faktorentfernung.
- [ ] Der Runner ist auf einem namentlich verantworteten, geschützten
  Ausführungsort verfügbar. Der Executor kann dort die Staging-Auth-Admin-
  Autorität nur kurzzeitig zur Laufzeit bereitstellen; weder Credential noch
  privater Approver-Schlüssel liegen in Git, Approval oder Evidenz.
- [ ] Der unabhängige Approver besitzt den registrierten privaten
  Ed25519-Schlüssel; ausschließlich der öffentliche Schlüssel wird dem Runner
  restriktiv bereitgestellt.
- [ ] Die externe append-only Incident-Ablage ist erreichbar und übernimmt die
  zwei pseudonymisierten Runner-Ereignisse sowie den späteren Abschlussnachweis.
- [ ] Supabase-Organisations-MFA und WUXUAI-App-User-TOTP sind im Runbook als
  getrennte Faktoren und Berechtigungsgrenzen dokumentiert.
- [ ] Die tatsächliche Staging-Access-Token-Laufzeit wurde read-only bestätigt;
  die lokale Referenzlaufzeit darf nicht übernommen werden.

**Sofort stoppen**, wenn Projekt, Commit, Migration, Admin-Identität,
Recovery-Besetzung oder Ausgangsfingerprints nicht eindeutig sind.

### A1. Runner-Preflight je Recovery-Vorgang

- [ ] Zufällige Request- und Correlation-ID sowie pseudonymisierte Actor-
  Referenzen wurden außerhalb der Anwendung angelegt.
- [ ] Requestor, Approver und Executor entsprechen dem registrierten
  Recovery-Register; Requestor ist weder Approver noch Executor.
- [ ] Mindestens zwei zulässige unabhängige Identitätsnachweisklassen sind PASS.
- [ ] Die signierte Approval-Datei ist höchstens 15 Minuten gültig, Modus 0600
  und nennt exakt Staging-Project-Ref, TOTP-Faktor, Executor und freigegebenen
  Migration-173-Hash.
- [ ] Approver-Public-Key-Datei ist Modus 0600; Evidenzverzeichnis ist Modus
  0700 und der konkrete Evidenzpfad existiert noch nicht.
- [ ] Die Auth-Admin-Autorität stammt aus dem eindeutig bestätigten
  Staging-Projekt, wird nur im Prozessspeicher bereitgestellt und erscheint
  weder in Argumenten noch Logs.
- [ ] Die exakte Bestätigungsphrase ist nur für die freigegebene Correlation-ID
  gesetzt. Keine allgemeine oder wiederverwendbare Bestätigung.
- [ ] Nach dem Lauf enthält die Evidenz genau `RECOVERY_AUTHORIZED` und bei
  Erfolg `TOTP_FACTOR_REMOVED`; Roh-User-/Faktor-IDs und Credentials fehlen.

## B. Kontrollierte Reihenfolge und unvermeidbares Übergangsfenster

Zwischen UI-Deployment und Migration 173 besteht bewusst ein kurzes
Wartungsfenster. Die neue UI kann bereits TOTP verlangen, die Datenbank folgt
aber bis zur Migration noch den alten Serverregeln. In diesem Fenster bleiben
direkte RPCs für eine bestehende Platform-Admin-Sitzung nach den alten
rollenbasierten Regeln erreichbar. Betroffen sind insbesondere Platform-Reads,
Country Release, Restaurant-/Tenant-/Security-Operationen, Auth Support,
TEST_ONLY-Cleanup, Customer-Testmodus, Subscription-/Billing-/Plan-/PRO-
Mutationen, Business-Verification-Entscheidungen und Entitlement-Mutationen.
Die UI ist in diesem Zeitraum keine Sicherheitsgrenze.

Kontrollen für dieses Fenster:

- angekündigtes Wartungsfenster; keine Platform-Admin-Fachaktionen;
- einzig vorgesehene Admin-Sitzung in isoliertem Browserprofil;
- keine parallelen Admin-Browser oder Automationen;
- Vorher-Fingerprints und Auditpräfix sichern;
- Migration 173 vor UI-Deployment bereits bytegenau vorbereitet;
- Fenster auf Enrollment, AAL2-Nachweis und unmittelbare Migration begrenzen;
- bei jeder Abweichung UI auf die vorherige Asset-Version zurücksetzen, keine
  Migration anwenden und Wartungsfreeze beibehalten.

1. **Staging-TOTP-Fähigkeit prüfen/aktivieren.** Nur die offiziell freigegebene
   Supabase-TOTP-Konfiguration verwenden. Keine SMS-, Phone- oder generische
   AAL2-Ausnahme aktivieren.
2. **Wartungsfreeze aktivieren und UI-Build bereitstellen.** Den geprüften Commit mit
   `PlatformAdminMfaGate` auf Staging deployen, während die Datenbank noch auf
   Migration 172 steht. Asset-/Commit-Parität und HTTP-Health prüfen. Ab diesem
   Zeitpunkt bis zum bestandenen Schritt 7 keine Platform-Fachaktion ausführen.
3. **Ersteinrichtung physisch durchführen.** In einer isolierten legitimen
   Platform-Admin-Sitzung `/admin/platform` öffnen, die explizite TOTP-
   Einrichtung starten, QR nur in der Authenticator-App erfassen und Challenge
   abschließen. Keine QR-Payload und keinen Code protokollieren.
4. **AAL2 vor Migration beweisen.** Neuen Access-Token und TOTP-AMR intern
   fingerprinten; nur `AAL2/TOTP PASS` berichten. Session/Tokenwert nicht
   ausgeben. Seite neu laden und serverseitige Rolle weiterhin read-only prüfen.
5. **Migration 173 unmittelbar anwenden.** Nur die additive Migration aus dem bestätigten
   Commit ausführen. Erwartung: 173/173. Danach Hash, Schemahistorie,
   Funktionsdefinitionen, `search_path`, ACL und Grants erneut prüfen.
6. **Repeat-Dry-Run und DB-Lint.** Keine ausstehende Migration; DB-Lint ohne neue
   sicherheitsrelevante Findings.
7. **Direkte RPC-Matrix ausführen.** Siehe Abschnitt C.
8. **Physisches Gate ausführen.** AAL1-/AAL2-Wechsel, Reload, Token-Refresh,
   Faktorentfernungs-Negativvertrag und erneute Challenge prüfen. Keine reale
   Businessmutation und keine Entfernung des einzigen echten Faktors ausführen.
9. **Nachher-Snapshot.** Rollen, Platform-Admin-Zeile und Businessdaten müssen
   identisch sein. Zulässig sind nur erwartete Supabase-Faktor-/Sessionmetadaten
   und klassifizierte Auth-Audits.
10. **Secret-freie Evidenz sichern.** Bericht, Fingerprints, Migration-Hash,
    RPC-Statuscodes und Recovery-Bereitschaft; keine IDs, Tokens, QR-Daten oder
    Codes.

## C. Direkte RPC-Nachweise

Für alle Aufrufe wird dieselbe legitime Platform-Admin-Identität verwendet. Die
Access-Tokens bleiben ausschließlich im Browser-/Testprozessspeicher. Als
geschützte, schreibfreie Probe dient `get_platform_restaurants`; vor und nach
jedem Block werden Business- und Auditfingerprints verglichen.

### C1. AAL1

- [ ] Frische erste-Faktor-Sitzung ohne TOTP-Challenge herstellen.
- [ ] `get_current_platform_role` liefert ausschließlich die eigene aktive Rolle.
- [ ] Direkter Aufruf `get_platform_restaurants` wird serverseitig verweigert
  beziehungsweise liefert keine Platform-Daten.
- [ ] Direkter Aufruf einer geschützten Funktion mit manipulierten Clientclaims
  ändert das Ergebnis nicht.
- [ ] Platform-UI rendert keine geschützten Inhalte, sondern Setup/Challenge.
- [ ] Businesswrites und Auditdelta: 0.

### C2. TOTP-AAL2

- [ ] TOTP-Challenge über die reguläre Anwendung erfolgreich abschließen.
- [ ] Neuer Token ist nachweisbar und enthält serverseitig AAL2 plus TOTP-AMR;
  Werte nicht ausgeben.
- [ ] Derselbe direkte Aufruf `get_platform_restaurants` ist zulässig.
- [ ] Ergebnisse bleiben durch bestehende Datenminimierung/RLS begrenzt.
- [ ] Nach regulärem Access-Token-Refresh bleibt AAL2/TOTP erhalten und der
  direkte Read-RPC zulässig.
- [ ] Businesswrites und unerwartetes Auditdelta: 0.

### C3. Negativ- und Sitzungswechsel

- [ ] Sign-out: direkter geschützter RPC abgewiesen.
- [ ] Abgelaufene oder ersetzte Sitzung: abgewiesen.
- [ ] **Bedingter Nachweis:** Wenn ein vor Faktorentfernung ausgestellter und
  noch nicht abgelaufener AAL2-Token aus einem autorisierten geschützten
  Testkontext sicher verfügbar ist, wird er nach Entfernung seines verifizierten
  TOTP-Faktors unmittelbar vom direkten Read-RPC abgewiesen. Dieser destruktive
  Nachweis erfolgt lokal mit synthetischem Benutzer; auf Staging nur mit separat
  freigegebenem Testbenutzer, niemals mit dem einzigen echten Platform Admin.
  Für einen realen Faktorverlust wird kein alter Token vorausgesetzt, beschafft
  oder aus einem Browser exportiert.
- [ ] Ohne sicher verfügbaren alten Token wird `NOT AVAILABLE` dokumentiert. Ab
  der serverseitig belegten Faktorentfernungszeit bleiben Platform-Mutationen
  mindestens für die read-only verifizierte maximale Staging-JWT-Laufzeit
  zuzüglich dokumentierter Uhrtoleranz eingefroren. Der Recovery-Abschluss
  erfolgt erst nach vollständigem Ablauf dieses Quarantänefensters; AAL2- und
  TOTP-Grenzen bleiben unverändert aktiv.
- [ ] Nicht-TOTP-AAL2-Methode: abgewiesen.
- [ ] Tokenwechsel führt synchron zurück in den Prüfzustand; ein früherer
  React-Gate-Nachweis autorisiert keinen neuen Token.
- [ ] Ein TOTP-Nachweis älter als zehn Minuten wird von einer bestehenden
  High-Risk-Aktion als `RECENT_PLATFORM_TOTP_REQUIRED` abgewiesen. Dieser Test
  darf nur rollback-geschützt und ohne persistente Fachwirkung erfolgen.

## D. Nachweise zu Migration 173

- [ ] `platform_session_current_internal()` bindet `session_id` an `auth.uid()`,
  verlangt eine vorhandene Session und berücksichtigt `not_after`.
- [ ] `platform_totp_factor_current_internal()` bindet die Session an ihren
  weiterhin vorhandenen, verifizierten TOTP-Faktor desselben Benutzers.
- [ ] `platform_totp_aal2_verified_internal()` besitzt keine EXECUTE-Grants für
  Browserrollen oder Service Role.
- [ ] `current_platform_role()` und `is_platform_admin()` sind nicht direkt für
  Browserrollen ausführbar und verwenden die interne AAL2/TOTP-Prüfung.
- [ ] Nur `get_current_platform_role()` ist für `authenticated` ausführbar; sie
  liefert nur die eigene aktive Rolle und wird von keiner Aktion als
  Autorisierung benutzt.
- [ ] `require_recent_platform_auth_internal()` verwendet den neuesten TOTP-AMR-
  Zeitstempel und bleibt intern.
- [ ] Alle Funktionen besitzen sicheren `search_path`.
- [ ] Keine Rolle, Membership, Platform-Admin-Zeile oder Businessrelation wurde
  durch die Migration verändert.

## E. Rückfall- und Abbruchplan

- **Vor Migration:** bei jedem Fehler stoppen; Datenbank bleibt 172/172. Falls
  bereits ein neuer TOTP-Faktor eingerichtet wurde, bleibt er bestehen und wird
  nicht automatisch entfernt. Die UI wird bei Bedarf auf das vorherige Asset
  zurückgesetzt; die alte Serverregel bleibt ausdrücklich als nicht AAL2-
  abgesichert klassifiziert.
- **Migration schlägt fehl:** transaktionales Rollback bestätigen, 172/172 und
  vorherige Funktionshashes prüfen; kein manueller Teil-Fix.
- **Nach Migration kein UI-Zugang:** AAL2-Grenze nicht zurücknehmen. Den geprüften
  Recovery-Vertrag über den offiziellen Supabase-Auth-Admin-Weg ausführen.
- **MFA-Dienst gestört:** Platform-Admin-Aktionen einfrieren und Gate offen lassen;
  keine AAL1-Ausnahme.
- **Unerwartete Datenänderung:** sofort stoppen, Fingerprints sichern, keine
  Korrektur ohne neue Founder-Freigabe.

## F. Abschlusskriterien

Ein Staging-PASS ist erst zulässig, wenn:

- Migration 173 genau einmal angewendet und 173/173 bestätigt ist;
- AAL1-Direktaufrufe fail-closed und TOTP-AAL2-Read-Aufrufe erfolgreich sind;
- Tokenwechsel, Refresh und Sign-out korrekt neu bewertet werden;
- der Alt-Token-Negativnachweis entweder bedingt PASS ist oder bei
  `NOT AVAILABLE` das aus Faktorentfernungszeit, verifizierter maximaler
  Staging-JWT-Laufzeit und Uhrtoleranz gebildete Quarantänefenster vollständig
  abgelaufen und dokumentiert ist;
- Recovery-Besetzung, geschützter Ausführungsort, Staging-Auth-Admin-Autorität
  und lokale Runner-Version physisch verfügbar und gegeneinander geprüft sind;
- alle geschützten Datenfingerprints unverändert sind;
- keine Secrets oder personenbezogenen Auth-Daten in Evidenz gelangt sind.

Production bleibt unabhängig davon gesperrt.
