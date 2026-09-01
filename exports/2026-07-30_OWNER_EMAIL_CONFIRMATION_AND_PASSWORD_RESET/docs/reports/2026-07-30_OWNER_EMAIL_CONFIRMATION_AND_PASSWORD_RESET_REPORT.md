# Owner E-Mail-Bestätigung und Passwort-Reset

Datum: 2026-07-30  
Branch: `release/v1-restaurant-bonus`  
Ausgangscommit: `0f318c2`

## Ergebnis

Der Owner-Auth-Flow verwendet jetzt ausschließlich Supabase Auth für Registrierung, E-Mail-Bestätigung, Login und Passwort-Reset. Ein Restaurant-Tenant wird erst nach einer bestätigten E-Mail und einer bestätigten Session über den bestehenden idempotenten RPC `start_restaurant_owner_trial` erzeugt. Customer-Module wurden nicht verändert. Die Staff-Route erhielt keine neue UI oder eigene Route; sie verwendet weiterhin die bestehende Auth-Infrastruktur.

Der Code ist lokal vollständig implementiert. Ein vollständiger Staging-E2E ist noch blockiert, weil die Redirect-Allow-List im Supabase-Dashboard wegen eines Dashboard-Fehlers nicht gespeichert bzw. verifiziert werden konnte. Zusätzlich ist kein eigener SMTP-Anbieter konfiguriert. Der Supabase-Standardversand ist keine Production-Lösung.

## Alter Auth-Flow

- `signUp` leitete direkt auf `/admin/onboarding` um.
- Bei einer sofort ausgegebenen Session wurde der Owner-Trial unmittelbar gestartet.
- Es gab keine zentrale Callback-, Bestätigungs-, Passwort-vergessen- oder Passwort-aktualisieren-Seite.
- Der Login zeigte Supabase-Fehler teilweise ohne vollständige fachliche Einordnung.
- Die Staging-Konfiguration hatte E-Mail-Bestätigung deaktiviert, keine Redirect-Allow-List und `http://localhost:3000` als Site URL.

## Neuer Auth-Flow

1. Der Owner registriert sich mit E-Mail und Passwort.
2. `signUp` speichert nur nicht geheime Onboarding-Metadaten und verwendet `/auth/callback` als `emailRedirectTo`.
3. Ohne bestätigte E-Mail wird keine Owner-Tenant-Erzeugung ausgeführt.
4. `/auth/confirm-email` bietet erneutes Senden mit 60-Sekunden-Cooldown, Korrektur der Adresse und Rückkehr zum Login.
5. `/auth/callback` akzeptiert nur tatsächliche Supabase-Callbackparameter, stellt die Session her, entfernt sensitive URL-Werte und startet den idempotenten Owner-Trial.
6. `/admin` verlangt zusätzlich explizit `email_confirmed_at`.
7. `/auth/forgot-password` antwortet unabhängig vom Kontobestand generisch.
8. `/auth/update-password` akzeptiert nur einen Recovery-Kontext, aktualisiert das Passwort über `supabase.auth.updateUser` und beendet danach die lokale Recovery-Session.

## Tenant-Erzeugung

- Zeitpunkt: erst nach bestätigter E-Mail und bestätigter Supabase-Session.
- RPC: `public.start_restaurant_owner_trial(input_owner_name text, input_restaurant_name text, input_phone text)`.
- `anon` EXECUTE auf Staging: Nein.
- `authenticated` EXECUTE auf Staging: Ja.
- Der bestehende RPC bleibt die Idempotenzgrenze gegen doppelte Restaurants, Branches, Memberships und Subscriptions.
- Staging-Audit: 3 Auth-User, 0 unbestätigte Auth-User, 0 Restaurant-Memberships und 0 Restaurants für unbestätigte User.

## Routen und Redirects

Implementierte öffentliche Routen:

- `/auth/callback`
- `/auth/confirm-email`
- `/auth/forgot-password`
- `/auth/update-password`

Vorgesehene eng begrenzte Redirects:

| Umgebung | Bestätigung | Passwort-Reset |
| --- | --- | --- |
| Local | `http://localhost:5173/auth/callback` | `http://localhost:5173/auth/update-password` |
| Staging Preview | `https://wuxuai-restaurant-bonus-app.dongdongwu4899.workers.dev/auth/callback` | `https://wuxuai-restaurant-bonus-app.dongdongwu4899.workers.dev/auth/update-password` |
| Pilot-Domain | `https://bonus.wuxuaisbi.com/auth/callback` | `https://bonus.wuxuaisbi.com/auth/update-password` |

Beobachteter Supabase-Stand:

- Projekt: `wuxuai-bonus-staging` (`bwhv...qaya`).
- Confirm Email: aktiviert.
- Site URL: auf `https://bonus.wuxuaisbi.com` korrigiert.
- Redirect-Allow-List: nicht erfolgreich gespeichert/verifiziert; das Dashboard lieferte beim Hinzufügen einen HTTP-500-Zustand und lud die Konfigurationsseite anschließend fehlerhaft.

## Passwortregeln

- mindestens 8 Zeichen;
- keine rein numerischen Passwörter;
- keine Zeichenwiederholung wie `aaaaaaaa`;
- häufige triviale Werte werden blockiert;
- Passwort und Wiederholung müssen identisch sein;
- Supabase `WeakPasswordError`, Rate Limit, Netzwerk-, Server- und Linkfehler werden in verständliche deutsche Meldungen übersetzt;
- Passwörter werden nicht geloggt, in URLs geschrieben oder lokal gespeichert.

## Session und Sicherheit

- Öffentliche Seiten starten keinen unnötigen globalen Session-Refresh.
- Nur `/auth/callback` und `/auth/update-password` laden gezielt eine Auth-Session.
- Callback- und Recovery-Werte werden nach Verarbeitung mit `history.replaceState` aus der URL entfernt.
- Ungültige direkte Callback- und Recovery-Aufrufe zeigen sofort einen kontrollierten Fehlerzustand.
- Es wird keine Service Role im Browser verwendet.
- RLS ist auf `restaurants`, `restaurant_members`, `branches` und `profiles` auf Staging weiterhin aktiv.
- Customer- und Staff-Module werden von den neuen Owner-Auth-Seiten nicht importiert.
- Die Staff-Route erhielt kein `requireConfirmedEmail`; wegen der projektweiten Supabase-E-Mail-Provider-Einstellung müssen neue Staff-E-Mail-Flows vor einer späteren Staff-Registrierung separat live geprüft werden.

## E-Mail-Templates und SMTP

- Confirm signup, Reset password, Invite user und Email change sind im Supabase-Dashboard vorhanden, verwenden aber noch die Standardvorlagen.
- Eigene deutsche WUXUAI-Texte konnten nicht gespeichert werden, weil Custom SMTP deaktiviert ist und das Dashboard die Bearbeitung an die SMTP-Konfiguration bindet.
- Custom SMTP: deaktiviert.
- Absenderdomain, SPF, DKIM, DMARC, Reply-To, Versandrate und Bounce-Verarbeitung: nicht konfiguriert bzw. nicht verifiziert.
- Production-Blocker: eigener SMTP-Anbieter mit verifizierter Domain und Zustellbarkeit fehlt.

## Lokale UI-Prüfung

- Login zeigt „Passwort vergessen?“.
- Bestätigungsseite zeigt die geforderten deutschen Texte und Aktionen.
- Ungültiger Callback zeigt „Dieser Bestätigungslink ist ungültig oder abgelaufen.“ ohne White Screen.
- Ungültige Recovery-URL zeigt einen kontrollierten Fehler und Links zum erneuten Anfordern bzw. Login.
- Passwort-vergessen-Seite zeigt keine Account-Enumeration.
- Interaktive Elemente der geprüften Auth-Seiten besitzen mindestens 44 px Höhe.
- Der Browser meldete nur zwei bereits bestehende React-Router-v7-Hinweise, keine Auth-Fehler.
- Eine echte 390-px-Abnahme war mit der verfügbaren Browser-Viewport-Steuerung nicht verifizierbar; physische Mobile-Safari-Prüfung bleibt offen.

## Tests

- Neue Auth-Regressionstests: 18.
- Abgedeckt: Callback-Routen, Confirm-Gate, verzögerte Tenant-Erzeugung, idempotente RPC-Nutzung, generische Antworten, Cooldown, Passwortregeln, Fehlerabbildung, URL-Bereinigung und Scope-Schutz für Customer/Staff.
- Typecheck: erfolgreich.
- Lint: 0 Fehler, 6 bereits bestehende Warnungen.
- Tests: 402/402 erfolgreich.
- Build: erfolgreich.
- `git diff --check`: wird im finalen Repository-Audit protokolliert.

## Staging-E2E

Nicht vollständig durchgeführt. Gründe:

1. Redirect-Allow-List ist wegen des Supabase-Dashboard-Fehlers noch nicht bestätigt.
2. Custom SMTP fehlt; ein verlässlicher Empfangs-, Reset- und Zustellbarkeitstest ist damit nicht Production-tauglich.
3. Es wurden bewusst keine Testkonten erzeugt, solange Callback-/Recovery-Redirects nicht verifiziert sind.

## Migration und Datenbank

- Neue Migration für diese Aufgabe: Nein.
- Production-Migration: Nein.
- RLS-/Policy-Änderung: Nein.
- Lokale und Remote-Migrationshistorie auf Staging: synchron bis einschließlich `20260730002000`.

## Offene Risiken

- Redirect-Allow-List für Local, Staging Preview und Pilot-Domain eintragen und erneut prüfen.
- Custom SMTP einschließlich SPF, DKIM, DMARC, Reply-To, Rate Limits und Bounce-Verarbeitung konfigurieren.
- Deutsche E-Mail-Templates erst danach final einrichten.
- Vollständigen Staging-E2E mit neuer Test-E-Mail durchführen.
- Staff-Invite-/Login-Verhalten unter aktivierter Supabase-E-Mail-Bestätigung separat live prüfen.
- Physisches Mobile Safari testen.

Status: `BLOCKED_BY_PRODUCTION_SMTP`
