# Owner Auth Recovery Hardening

Datum: 2026-07-30  
Branch: `codex/owner-auth-recovery-hardening`  
Ausgangscommit: `0f318c2`

## Aufgabe

Der Owner-Passwort-Reset wurde gegen persistierende Recovery-Sessions, unvollständige Hash-Flows, Reload-/Remount-Verlust und konkurrierende React-Strict-Mode-Effekte gehärtet. Der bestehende Confirm-Email-Flow bleibt erhalten. Customer-, Staff-, Tenant-, RLS- und Datenbanklogik wurden nicht verändert.

## Ursachen

### 1. Recovery-Session blieb nach Abbruch bestehen

Der bisherige Flow verwendete denselben Supabase-Client wie ein normales Login. Dieser Client speichert Sessions dauerhaft. Ein lokaler Logout fand nur nach erfolgreicher Passwortänderung statt. Beim Verlassen der Seite blieb die Recovery-Session deshalb potenziell als normale Owner-Session erhalten.

### 2. Parser und Sessionaufbau unterstützten unterschiedliche Flows

Die URL-Erkennung kannte bereits Query-Code und Hash-Tokens. `establishOwnerAuthSession()` tauschte jedoch hauptsächlich einen PKCE-Code aus und setzte ein vollständiges Implicit-Tokenpaar nicht explizit als Session.

### 3. URL-Bereinigung zerstörte den Reload-Kontext

Query und Hash wurden aus Sicherheitsgründen entfernt. Danach fehlte ein nicht sensitiver Hinweis, dass die weiterhin gültige Session ausschließlich zu einem laufenden Passwort-Reset gehört.

### 4. React Strict Mode konnte konkurrierende Effekte auslösen

Es gab keinen zentralen Single-Flight-Schutz für den einmal verwendbaren PKCE-Code und keine idempotente Lifecycle-Bereinigung zwischen Effect-Cleanup und erneutem Effect-Setup.

## Konkrete Lösung

### Separater tabgebundener Recovery-Client

Der Passwort-Reset verwendet einen eigenen Supabase-Client:

- `detectSessionInUrl: false`
- `autoRefreshToken: false`
- `persistSession: true`
- Supabase-verwalteter Auth-Speicher in `window.sessionStorage`
- eigener Storage-Key `wuxuai-owner-recovery-auth`

Die normalen Owner-Sessions bleiben im bisherigen Client. Die Recovery-Session ist dagegen auf den aktuellen Tab begrenzt und verschwindet beim Schließen des Tabs automatisch. Die Anwendung speichert selbst keine Access Tokens, Refresh Tokens, Codes oder Passwörter.

### PKCE, Implicit und bestehende Recovery-Session

`establishOwnerRecoverySessionCore()` unterstützt:

- PKCE: `exchangeCodeForSession(code)` auf `/auth/update-password?code=...`
- Implicit: vollständiges Hash-Paar über `setSession({ access_token, refresh_token })`
- Reload: bestehende Session nur zusammen mit einem gültigen kurzlebigen Recovery-Marker

Unvollständige Hash-Tokens, URL-Fehler, fehlende User und abgelaufene Marker werden generisch abgelehnt. Tokenwerte werden weder geloggt noch in UI-Fehler übernommen.

### Kurzlebiger Marker

Marker: `owner_password_recovery_in_progress`

Gespeichert wird ausschließlich:

```json
{
  "expiresAt": 0,
  "version": 1
}
```

Die echte Ablaufzeit liegt 20 Minuten nach dem Sessionaufbau. Der Marker enthält keine E-Mail, Tokens, Codes oder Passwörter. Er wird bei Erfolg, Abbruch, ungültiger Session oder Ablauf entfernt.

### URL-Bereinigung

`clearSensitiveAuthUrl()` wird auf der Passwortseite erst nach erfolgreichem Sessionaufbau aufgerufen. Es nutzt `history.replaceState`, behält `/auth/update-password` und entfernt Query sowie Hash ohne Reload.

### Lifecycle und Strict Mode

Die zentrale Recovery-Lifecycle-Verwaltung:

- zählt aktive Seiten-Consumer;
- verzögert den Cleanup um einen Task, damit ein sofortiges Strict-Mode-Remount ihn abbrechen kann;
- führt beim echten Unmount genau einen lokalen Logout aus;
- führt nach erfolgreicher Passwortänderung genau einen lokalen Logout aus;
- verhindert einen zweiten Logout beim nachfolgenden Unmount;
- fängt Cleanup-Fehler ab;
- verhindert über Single-Flight einen doppelten PKCE-Austausch.

`UpdatePasswordPage` verhindert nach Unmount Navigation und State-Updates. Der Reset startet weder Owner-Trial noch Tenant-Erzeugung.

### Confirm-Email-Regression

Der bestehende Confirm-Callback verwendet weiterhin den normalen Owner-Auth-Client. Dieser verarbeitet jetzt explizit:

- PKCE-Code über `exchangeCodeForSession`
- vollständigen Hash-Flow über `setSession`
- Callback-Fehler ohne technische Details

Nach erfolgreicher E-Mail-Bestätigung bleibt die idempotente Tenant-Erzeugung über `completeConfirmedOwnerRegistration()` erhalten.

## Geänderte Dateien

- `src/shared/lib/supabase.ts`
- `src/modules/auth/authRoutePolicy.mjs`
- `src/modules/auth/ownerAuthService.ts`
- `src/modules/auth/UpdatePasswordPage.tsx`
- `src/modules/auth/ownerRecoveryFlow.mjs`
- `src/modules/auth/ownerRecoveryFlow.d.mts`
- `tests/owner-email-confirmation-password-reset.test.mjs`
- `tests/owner-recovery-session.test.mjs`
- dieser Bericht

## Neue Tests

Direkt geprüft wurden:

1. PKCE-Code ohne zusätzlichen Flow-Parameter.
2. vollständiger Implicit-Hash.
3. vorhandene Recovery-Session mit Marker.
4. Hash ohne Refresh Token.
5. fehlender URL-/Marker-/Session-Kontext.
6. Marker-Inhalt und TTL.
7. beschädigte und abgelaufene Marker.
8. Single-Flight bei parallelem PKCE-Aufruf.
9. Unmount-Cleanup.
10. erfolgreicher Update-Cleanup genau einmal.
11. kein zweiter Logout nach Erfolg.
12. Strict-Mode-Cleanup und erneutes Setup.
13. idempotentes mehrfaches Release.
14. nicht fataler Logoutfehler.
15. kein Trial oder Tenant im Recovery-Flow.
16. normaler Owner-Login und Confirm-Callback unverändert.

## Lokale Laufzeitprüfung

- Direkter Aufruf `/auth/update-password` ohne Link, Marker oder Recovery-Session: kontrollierter Fehlerzustand.
- Direkter Aufruf `/auth/callback` ohne Callbackdaten: kontrollierter Fehlerzustand.
- Browser-Console-Errors in beiden Prüfungen: 0.
- Es wurden keine echten Tokens oder Testpasswörter verwendet.

## Qualität

- Typecheck: erfolgreich.
- Lint: 0 Fehler, 6 bereits bestehende Warnungen.
- Tests: 421/421 erfolgreich.
- Build: erfolgreich.
- Migration: keine.
- RLS/Policies/RPCs: nicht verändert.
- Push/Merge/Deployment: nicht durchgeführt.

## Manuelle Staging-E2E-Checkliste

### E-Mail-Bestätigung

1. Neue Owner-Testadresse registrieren.
2. Vor Bestätigung prüfen: kein Restaurant, Branch, Membership oder Trial.
3. Bestätigungslink auf demselben Gerät öffnen.
4. Bestätigungslink mit separater Testadresse auf einem anderen Gerät öffnen.
5. Danach Owner-Login durchführen.
6. Prüfen: exakt ein Restaurant, Branch, Membership und Trial.
7. Bestätigungslink erneut öffnen und Idempotenz prüfen.

### Passwort-Reset

1. „Passwort vergessen?“ verwenden.
2. PKCE-Link `/auth/update-password?code=...` öffnen.
3. Falls Supabase einen Hash-Link ausstellt, Implicit-Variante separat öffnen.
4. Reset-Seite nach erfolgreichem Sessionaufbau neu laden.
5. Reset-Seite ohne Speichern verlassen.
6. Geschützte Owner-Route öffnen: keine Recovery-Session darf als Login gelten.
7. Reset erneut anfordern und Passwort erfolgreich ändern.
8. Prüfen: Weiterleitung zum Owner-Login und keine automatische Anmeldung.
9. Mit neuem Passwort anmelden.
10. Prüfen: altes Passwort funktioniert nicht mehr.
11. Verwendeten Reset-Link erneut öffnen: kontrollierte Ablehnung.
12. Tab während eines offenen Reset-Flows schließen und danach geschützte Route prüfen.

## Noch zu prüfende Supabase-Einstellungen

- Site URL
- Redirect-Allowlist für Local, Staging und Pilot-/Production-Domain
- tatsächlich verwendeter PKCE- oder Implicit-Flow
- `detectSessionInUrl` im ausgelieferten Build
- Custom SMTP
- deutsche E-Mail-Templates
- Production-Redirect-Domains ohne breite Wildcards

## Password-Reset-Absender

- Ziel: `WUXU Group Support <support@wuxugroup.com>`.
- Der Absender wird nicht vom Frontend gesetzt; `resetPasswordForEmail` liefert
  nur Empfänger und Redirect-URL an Supabase Auth.
- Im Staging-Projekt ist **Authentication → Emails → SMTP Settings → Enable
  custom SMTP** aktuell deaktiviert.
- Erforderlich sind `support@wuxugroup.com` als Sender email,
  `WUXU Group Support` als Sender name sowie die geheimen SMTP-Providerdaten.
- Die Domain muss beim Provider freigegeben und SPF, DKIM sowie DMARC müssen
  geprüft werden.
- Ohne vollständige Providerkonfiguration wurde der Schalter bewusst nicht
  aktiviert. Es gibt keinen Frontend-Workaround.
- Detailbericht:
  `docs/reports/2026-07-30_PASSWORD_RESET_SENDER_CONFIGURATION_REPORT.md`.

## Verbleibende Risiken

- Kein echter Staging-E-Mail-Link wurde in diesem Lauf verwendet.
- Custom SMTP und Zustellbarkeit bleiben Production-Blocker.
- Redirect-Allowlist muss vor dem echten E2E verifiziert werden.
- Ein physischer Same-Device-/Cross-Device-Test steht noch aus.

Status: `CODE LOCK` – Staging-E-Mail-E2E und SMTP bleiben offen.
