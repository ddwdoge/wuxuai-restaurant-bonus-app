# WUXUAI Bonus - Global Password Visibility Physical Final Gate

Datum: 2026-09-11
Umgebung: Staging
Production: unveraendert

## Ursache

Der integrierte Password-Visibility-Stand deckte alle elf Konto-Passwortfelder
ab. Der noch offene Gate war der echte, Founder-kontrollierte Recovery-Flow.
Bei dessen physischer Ausfuehrung wurde zusaetzlich festgestellt, dass sensible
Recovery-URL-Werte erst nach erfolgreichem asynchronem Session-Aufbau entfernt
wurden. Bei einem ungueltigen oder erneut verwendeten Link konnten sie deshalb
in der Adresszeile verbleiben.

## Geaenderte Dateien

- `src/modules/auth/ownerAuthService.ts`
- `src/modules/auth/UpdatePasswordPage.tsx`
- `tests/owner-email-confirmation-password-reset.test.mjs`
- `docs/reports/2026-09-11_GLOBAL_PASSWORD_VISIBILITY_PHYSICAL_FINAL_GATE.md`

Die weitere bestehende Working-Tree-Arbeit gehoert zu bereits freigegebenen
Country-, PRO- und PIN-Scopes und wurde weder verworfen noch in diesen Fix
gezogen.

## Was wurde geaendert

- `establishOwnerRecoverySession()` entfernt sensible Query- und Fragmentwerte
  synchron vor dem Aufbau des Recovery-Clients und vor jeder asynchronen
  Sessionverarbeitung.
- Der spaetere doppelte Cleanup-Aufruf in der Seite wurde entfernt.
- Der direkte Regressionstest beweist die Reihenfolge und verhindert einen
  Rueckfall auf Cleanup nur im Erfolgsfall.

## Was wurde nicht geaendert

- Keine Authentifizierungsregel, Passwortanforderung oder Token-Laufzeit.
- Keine Country-, Legal-, PRO-, Punkte-, QR-, PIN-, Gift- oder Kassa-Logik.
- Keine Datenbankmigration, RLS-Policy oder Grant-Aenderung.
- Keine realen Staging-Betriebe und keine Production-Daten.

## Password-Visibility-Vertrag

- Password-Visibility-Commit ist im autoritativen Stand integriert.
- Konto-Passwortfelder gefunden: 11.
- Konto-Passwortfelder mit gemeinsamem Show/Hide-Vertrag: 11.
- Abgedeckt: Customer Login/Registrierung, Owner Login/Registrierung,
  Staff Login/Einladung, Platform-Admin-Einstieg sowie Reset/Aenderung und
  Passwortbestaetigung.
- Standard: verborgen; Toggle: `type="button"`; Wert bleibt kontrolliert
  erhalten; Touchziel mindestens 44 x 44 CSS-Pixel; Autocomplete bleibt am
  jeweiligen Feldvertrag.
- DE, EN, FR, IT, ES, ZH und KO besitzen Show-/Hide-Texte.
- Tages-PIN-Felder bleiben bewusst ausserhalb dieses Konto-Passwort-Scopes.

## Automatische Verifikation

- Fokussierte Recovery-/Password-Tests nach Fix: 47/47 PASS.
- Password/Auth/Country/PRO-Matrix: 162/162 PASS.
- Volltests nach Fix: 1504/1504 PASS.
- Typecheck: PASS.
- Lint: PASS, 0 Fehler; 9 bestehende Warnungen.
- Build mit ausschliesslich Staging-Supabase-Bindung: PASS.
- Secret Scan des Task-Diffs: PASS, 0 Credential-/JWT-Treffer.
- `git diff --check`: PASS.
- Oeffentliche Staging-Auth-Routen: Owner, Customer, Staff, Forgot Password und
  Update Password jeweils HTTP 200.

## Physischer Recovery-Nachweis

- Verwendet wurde ausschliesslich das bestaetigte TEST_ONLY-Ownerkonto.
- Recovery-Mail wurde regulaer ueber Staging ausgeloest.
- Der Founder oeffnete den Link und gab beide Passwoerter persoenlich ein.
- Neues Passwort und Bestaetigung waren standardmaessig verborgen.
- Beide Schalter wurden unabhaengig geprueft; Werte blieben erhalten und kein
  Toggle loeste ein Submit aus.
- Fehlerzustand, erfolgreicher Passwortwechsel, neuer Login, Ablehnung des alten
  Passworts und erneuter erfolgreicher Login wurden physisch bestaetigt.
- Wiederverwendung des ersten Recovery-Links wurde blockiert.
- Nach dem URL-Scrub-Deployment wurde ein neuer Recovery-Link geoeffnet; der
  Founder bestaetigte die bereinigte kanonische URL ohne Query oder Fragment.
- Kein Passwort, Recovery-Link, JWT oder Refresh-Token wurde in diesen Bericht,
  Git oder das Pruef-ZIP uebernommen.

## Responsive und Sprachen

Die bereits physisch verifizierte integrierte Password-Visibility-UI wurde
durch den URL-Cleanup nicht visuell veraendert. Der bestehende Nachweis umfasst
320, 375, 390, 414, 430, 768, 1024 und 1280 CSS-Pixel sowie DE, EN, FR, IT, ES,
ZH und KO. Horizontales Ueberlaufen und fatale Browserfehler: 0. Die aktuelle
fokussierte Testsuite bestaetigt denselben gemeinsamen Komponenten- und
Lokalisierungsvertrag nach dem Security-Fix.

## Staging und Session-Sicherheit

- Staging Worker: `wuxuai-restaurant-bonus-app-staging`.
- Deployed Version: `c8ed1cf2-4a82-4a38-a846-547d81e1dac6`.
- Der im vorherigen Chatkontext sichtbar gewordene Access-Token wurde niemals
  wiederverwendet und ist am 2026-09-11 um 22:56:48 CEST abgelaufen.
- Vor dem erneuten Linktest: 1 TEST_ONLY-Session widerrufen, danach 0 aktiv.
- Nach dem erneuten Linktest: 1 TEST_ONLY-Session widerrufen, danach 0 aktiv.
- Keine andere Auth-Identitaet oder Mandantensession wurde veraendert.
- Staging-Geschaeftsdaten wurden nicht veraendert.

## Final-Lock-Schutz

- Country Launch Gate bleibt durch die aktuelle Vollsuite und den bestehenden
  physischen Nachweis erhalten; AT aktiv, DE/CH/FR/IT/ES gesperrt.
- PRO Phase 1 bleibt erhalten; der TEST_ONLY-Betrieb wurde physisch als BASIC
  mit `0 / 5` Angeboten verifiziert.
- Keine Production-Migration, kein Production-Deployment und keine
  Production-Daten- oder Auth-Aenderung.

## Risiken

Im genehmigten Scope sind keine offenen P0- oder P1-Risiken verblieben. Das
urspruenglich sichtbare Access-JWT kann technisch nicht vor seinem Ablauf
zurueckgerufen werden; der Ablauf ist eingetreten, alle Refresh-Sessions des
TEST_ONLY-Users wurden serverseitig entfernt, und der neue Staging-Code entfernt
sensible URL-Werte vor jedem Sessionaufbau.

## Prozess-Cleanup

- Task-eigene Hintergrundprozesse gestartet: 0.
- Task-eigene Hintergrundprozesse gestoppt: 0.
- Task-eigene Hintergrundprozesse weiterhin aktiv: 0.
- Retained Process Purpose: NONE.
- Unrelated Node-Prozesse veraendert: NO.

## Ergebnis

GLOBAL PASSWORD VISIBILITY: FINAL LOCK

PRODUCTION: UNCHANGED
