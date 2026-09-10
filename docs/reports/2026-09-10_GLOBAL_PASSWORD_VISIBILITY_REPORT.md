# WUXUAI Bonus V1 - Global Password Visibility Report

Datum: 2026-09-10

## Ursache

Der aktuelle Austria Launch Master Contract verlangt fuer jedes Konto-
Passwortfeld eine standardmaessig verborgene Eingabe mit barrierearmer
Anzeigen-/Ausblenden-Funktion und mindestens 44 Pixel Touchflaeche. Im
autoritativen Ausgangsstand besass keines der elf Konto-Passwortfelder diesen
Schalter.

## Inventar vor der Aenderung

| Rolle / Flow | Datei | Felder |
| --- | --- | ---: |
| Customer Login / Registrierung | `src/modules/customer/CustomerAuthPage.tsx` | 2 |
| Owner Login / Platform-Admin-Einstieg | `src/modules/auth/LoginPage.tsx` | 1 |
| Owner Registrierung / bestehende Identitaet | `src/modules/auth/RegisterPage.tsx` | 3 |
| Staff Login | `src/modules/auth/StaffLoginPage.tsx` | 1 |
| Staff Einladung | `src/modules/auth/StaffInvitePage.tsx` | 2 |
| Passwort-Reset / Aenderung | `src/modules/auth/UpdatePasswordPage.tsx` | 2 |

Gesamt: 11 Konto-Passwortfelder. Davon waren vor der Aenderung 0 mit einem
Anzeigen-/Ausblenden-Schalter ausgestattet.

Die vierstellige Customer-Tages-PIN in `CustomerPortal.tsx` und die Staff-
Tages-PIN in `StaffTablet.tsx` sind keine Konto-Passwoerter. Sie bleiben nach
dem gesperrten QR-/PIN-Vertrag verborgen und ausserhalb dieses UI-Scopes.

## Geaenderte Dateien

- `src/shared/components/PasswordInput.tsx`
- `src/shared/components/password-input.css`
- `src/modules/public/PublicPageComponents.tsx`
- `src/modules/customer/CustomerAuthPage.tsx`
- `src/shared/i18n/catalog.mjs`
- `tests/global-password-visibility.test.mjs`
- `tests/customer-registration-email-confirmation-fix.test.mjs`
- `docs/19_CHANGELOG.md`
- `docs/V1_AUSTRIA_LAUNCH_MASTER_CONTRACT.md`
- `docs/reports/2026-09-10_GLOBAL_PASSWORD_VISIBILITY_REPORT.md`

## Was wurde geaendert

- Eine gemeinsame kontrollierte `PasswordInput`-Komponente setzt den initialen
  Typ auf `password` und schaltet lokal zwischen `password` und `text` um.
- Der Schalter verwendet `Eye` / `EyeOff`, `type="button"`, `aria-label`,
  `aria-pressed`, `aria-controls`, einen sichtbaren Tastaturfokus und eine
  stabile 44 x 44 Pixel Bedienflaeche.
- Der Eingabewert, vorhandene Event-Handler, Validierung, `autocomplete`, IDs
  und ARIA-Verknuepfungen werden unveraendert weitergereicht.
- `PublicFormField` verwendet die gemeinsame Komponente ausschliesslich fuer
  `type="password"`; andere Feldtypen bleiben im bisherigen Renderpfad.
- Customer Login und Registrierung verwenden dieselbe Komponente direkt.
- Anzeigen-/Ausblenden-Texte sind explizit fuer DE, EN, FR, IT, ES, ZH und KO
  vorhanden.

## Was wurde nicht geaendert

- Keine Authentifizierungsregel, Passwortanforderung oder Fehlerlogik.
- Keine Session-, Supabase-, RLS-, Datenbank- oder Migrationsaenderung.
- Keine Tages-PIN-, QR-, Punkte-, Gift-, Redemption- oder Kassa-Aenderung.
- Keine Production-Konfiguration, kein Production-Deployment und keine Daten.

## Automatische Verifikation

- Fokussierte Passworttests: 4/4 PASS.
- Volltests: 1392/1392 PASS.
- Typecheck: PASS.
- Lint: PASS, 0 Fehler; 9 bestehende Warnungen.
- Build: PASS.
- Secret Scan des Changesets: PASS, 0 Treffer.
- `git diff --check`: PASS.
- Migration: keine.

## Physische Verifikation

Lokale und kanonische Staging-Pruefung mit Chromium:

- Breiten: 320, 375, 390, 414, 430, 768, 1024 und 1280 Pixel.
- Routen: Owner Login, Owner Registrierung, Customer Login, Customer
  Registrierung und Staff Login.
- Sprachen: DE, EN, FR, IT, ES, ZH und KO.
- Je Feld: initial verborgen, anzeigen, Wert erhalten, erneut ausblenden,
  `type="button"`, Touchflaeche mindestens 44 Pixel.
- Passwort und Bestaetigung: unabhaengige Instanzen.
- Horizontales Ueberlaufen: 0.
- Fatale Browserfehler: 0.
- Staging Supabase Ref: ausschliesslich `bwhvfjuwixgwduoeqaya`.
- Production Supabase Ref beobachtet: 0.

Staff-Einladung und Passwort-Reset zeigen ihre Felder nur nach erfolgreicher
serverseitiger Token-/Recovery-Session. Ihre vier Felder sind ueber denselben
physisch verifizierten `PublicFormField`-Renderpfad abgedeckt; es wurde fuer
diese UI-Aufgabe bewusst kein Auth-Token und keine E-Mail erzeugt.

Staging Worker: `wuxuai-restaurant-bonus-app-staging`

Staging Version: `d1275d87-415e-4d0e-a4ed-c589088e4649`

## Risiken

Keine offenen P0-Risiken im genehmigten Scope. Der tokengebundene Passwort-
Reset-/Aenderungsweg konnte ohne echten Recovery-Link nicht physisch bis zu den
beiden Feldern geoeffnet werden. Dieser eine physische P1-Nachweis bleibt fuer
den Founder-kontrollierten Golden Path offen; weder Konto noch Passwort wurden
fuer diese UI-Pruefung veraendert.

## Status

GLOBAL PASSWORD VISIBILITY: STAGING READY FOR PHYSICAL FINAL LOCK

PRODUCTION: UNCHANGED
