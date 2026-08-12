# Owner-Registrierung: Passwortbestätigung

Stand: 2026-08-11  
Branch: `codex/v1-release-finishing-sprint`

## Ursache

Die öffentliche Owner-Registrierung besaß nur ein Passwortfeld. Ein Tippfehler
konnte deshalb erst beim späteren Login auffallen.

## Geänderte Dateien

- `src/modules/auth/RegisterPage.tsx`
- `tests/owner-email-confirmation-password-reset.test.mjs`
- `docs/19_CHANGELOG.md`

## Was wurde geändert

- Pflichtfeld „Passwort bestätigen“ direkt unter dem Passwort ergänzt
- Dasselbe native Passwortfeld und dieselben Premium-Formularstyles verwendet
- Fehlermeldung erst nach Verlassen des Feldes oder einem Submitversuch
- Submit bleibt bei leeren Pflichtfeldern, ungültigem Passwort, leerer
  Bestätigung oder Abweichung deaktiviert
- Exakter Abweichungstext: „Passwörter stimmen nicht überein.“
- Validierung bei Enter-/Form-Submit zusätzlich im Handler beibehalten

## Was wurde nicht geändert

Supabase Auth, Signup-Service, Owner-/Restaurant-Erzeugung, Trial, Redirect,
Onboarding, E-Mail-Bestätigung und Legal Consent wurden nicht verändert. Es
wurde keine Migration erstellt. `confirmPassword` ist ausschließlich lokaler
React-State und nicht Teil von `RegisterOwnerInput`, Pending Storage oder
Supabase `signUp`.

## UI-Prüfung

- Desktop geprüft: Ja, 1024 und 1440 px
- Tablet geprüft: Ja, 768 px
- Mobile geprüft: Ja, 390 und 430 px
- Horizontaler Overflow: Nein
- Touchflächen unter 44 px: 0
- Console Errors: 0

## Tests

- gleiche Passwörter aktivieren Submit bei ansonsten gültigen Pflichtfeldern
- unterschiedliche Passwörter blockieren Submit
- leere Bestätigung blockiert Submit
- bestehende Passwortregeln bleiben aktiv
- Bestätigungswert wird nicht an Service oder Supabase übergeben
- bestehende Registration-, Callback- und Recovery-Verträge bleiben erhalten

## Migration

Keine.

## Qualität

- Tests: 670/670 erfolgreich
- Typecheck: erfolgreich
- Lint: 0 Fehler
- Production-Build: erfolgreich
- `git diff --check`: erfolgreich

## Risiken

Der vollständige reale Registrierungsvorgang mit neuer E-Mail bleibt Teil des
manuellen Pilot-Tests. Die Änderung selbst beeinflusst den Backendvertrag nicht.

## Status

CODE LOCK bis zum realen Staging-Registrierungstest.
