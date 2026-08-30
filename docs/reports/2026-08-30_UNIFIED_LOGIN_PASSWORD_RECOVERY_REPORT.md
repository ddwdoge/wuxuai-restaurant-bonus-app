# WUXUAI Bonus P1 - Unified Login / Password Recovery Report

Stand: 2026-08-30

Branch: `codex/v1-canonical-recovery`

Status: `CODE LOCK`

## Ursache

Der sichere Supabase-Passwortwiederherstellungsflow war bereits vorhanden,
aber nur im Restaurant-Login verlinkt und in UI sowie Funktionsnamen als
Owner-Flow dargestellt. Customer und Staff hatten keinen Einstieg. Der
Staff-Login behandelte ausserdem `/staff/login` ohne Restaurant-Slug als
ungueltigen QR, obwohl bestehende Mitarbeiter direkt mit ihrem persoenlichen
Konto einsteigen duerfen.

## Geaenderte Dateien

- `src/modules/auth/portalRecoveryUx.mjs`
- `src/modules/auth/portalRecoveryUx.d.mts`
- `src/modules/auth/PortalLoginNavigation.tsx`
- `src/modules/auth/portal-login-navigation.css`
- `src/modules/auth/LoginPage.tsx`
- `src/modules/auth/StaffLoginPage.tsx`
- `src/modules/auth/ForgotPasswordPage.tsx`
- `src/modules/auth/UpdatePasswordPage.tsx`
- `src/modules/auth/ownerAuthService.ts`
- `src/modules/customer/CustomerAuthPage.tsx`
- `src/modules/public/public-entry-premium.css`
- `tests/unified-login-password-recovery.test.mjs`
- `tests/owner-email-confirmation-password-reset.test.mjs`
- `docs/19_CHANGELOG.md`

## Was wurde geaendert

- Gemeinsamer, validierter Recovery-Kontext fuer `customer`, `staff` und
  `owner` mit sicherer Rueckleitung zum urspruenglichen Login.
- Eine kanonische `resetPasswordForEmail`-Anforderung und eine einzige
  `updateUser({ password })`-Aktualisierung fuer die Supabase-Auth-Identitaet.
- Generische Anti-Enumeration-Erfolgsmeldung ohne Kontobestandsauskunft.
- `Passwort vergessen?` auf allen drei Loginseiten.
- Wiederverwendete Navigation `Anderen Bereich oeffnen`, ohne Plattform-Admin.
- Direkter Staff-Login ohne QR; bei vorhandenem Restaurant-Slug bleibt die
  exakte serverseitige Restaurantzugriffspruefung bestehen.
- 320-Pixel-Boxmodell und Ueberschrift fuer die Public-Loginseiten korrigiert.

## Was wurde nicht geaendert

- Keine Rolle wird durch Navigation oder Login vergeben.
- Keine Staff-Selbstregistrierung ergaenzt.
- Keine RLS-, RPC-, Auth-, Membership- oder Tenantregel geaendert.
- Keine E-Mail-Bestaetigungs-, Resend- oder Staff-QR-Logik ersetzt.
- Keine Datenbankmigration, kein Deployment, keine Production- oder
  Stripe-Aktion.

## Pruefung

- Typecheck: PASS
- Lint: PASS, 0 Fehler / 7 bestehende Warnungen
- Tests: `1155/1155 PASS`
- Production-Build: PASS
- Mobile Browsermatrix: 6 Seiten x 320/375/390/414/430 = 30/30 PASS
- Horizontales Ueberlaufen: NO
- Portal-Link-Touchflaechen: mindestens 44 px
- Rollen-Security-Vertrag: automatisiert PASS
- QR-gebundener Staff-Kontext: erhalten

## Migration / Security

- Migration: NONE
- RLS: UNCHANGED
- RPCs: UNCHANGED
- Service Role im Frontend: NO
- Plattform-Admin-Link auf Public Login: NO

## Offene Live-Gates

- Development/Test-Deployment nicht beauftragt und nicht ausgefuehrt.
- Echte Reset-Mail und Supabase-Callback noch nicht live getestet.
- Abgelaufener und bereits verwendeter Link noch nicht live getestet.
- Customer-only, Staff-only und Multi-Role Negativ-/Positivmatrix noch nicht
  physisch live wiederholt.
- Physischer iPhone-Mail- und Passwortwechseltest bleibt Founder-Gate.

## Risiken

Ohne echten Mail-Link und Development/Test-Deployment ist der externe
Supabase-Recoveryvertrag nicht final nachgewiesen. Deshalb kein `FINAL LOCK`.

Status: `CODE LOCK`
