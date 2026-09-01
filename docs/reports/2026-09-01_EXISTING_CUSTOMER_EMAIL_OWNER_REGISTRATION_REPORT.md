# Existing Customer Email Owner Registration Report

Datum: 2026-09-01

## Ursache

Supabase beantwortet einen erneuten Signup fuer eine bereits vorhandene E-Mail
anti-enumerationssicher mit einem verschleierten Benutzer ohne Session und ohne
Identities. Der bisherige Owner-Registrierungsclient behandelte jedes
fehlerfreie Signup ohne Session als neue, noch zu bestaetigende Registrierung.
Bei einem bereits bestaetigten Customer-Konto wurde deshalb auf eine zweite
Bestaetigungsmail gewartet, obwohl keine erforderlich war.

## Geaenderte Dateien

- `src/modules/auth/RegisterPage.tsx`
- `src/modules/auth/registerOwnerService.ts`
- `src/modules/auth/ownerAuthFlow.mjs`
- `src/modules/auth/ownerAuthFlow.d.mts`
- `tests/existing-customer-owner-registration.test.mjs`
- aktive Vertrags-, Flow- und Changelog-Dokumentation

## Was wurde geaendert

- Neue Owner-Signups und verschleierte bestehende Identitaeten werden sicher
  unterschieden.
- Eine bestehende Identitaet authentifiziert sich mit ihrem bestehenden
  Passwort und setzt danach den passwortfreien Pending-Owner-Intent fort.
- Bereits angemeldete und bestaetigte Customer-/Staff-Konten aktivieren den
  Owner-Bereich weiterhin direkt mit derselben Session.
- Unbestaetigte Konten wechseln in den vorhandenen Resend-/Cooldown-/Callback-
  Flow; der Owner-Intent bleibt erhalten.
- Regressionstests sichern Anti-Enumeration, eine Auth-Identitaet, additive
  Rollen, atomare Provisionierung, Tenantbindung und Trial-Idempotenz.

## Was wurde nicht geaendert

- Keine Customer-, Staff- oder bestehende Owner-Rolle wurde veraendert.
- Keine RLS-, RPC-, Trial-, Commercial-, Legal- oder Businessregel wurde
  gelockert.
- Keine Datenbankmigration und kein Production-Deployment.

## Sicherheit

Vor der Authentifizierung wird keine vorhandene Rolle genannt. Der Client
fragt keine Profile oder Rollen anhand der E-Mail ab. Der Pending Intent
enthaelt Name, normalisierte E-Mail, Restaurantname und optionale Telefonnummer,
aber niemals ein Passwort. Die bestehende SECURITY-DEFINER-RPC ist nur fuer
`authenticated` freigegeben und verwendet `auth.uid()` als Autoritaet.

## Build Ergebnis

- Tests: 1248/1248 PASS.
- Typecheck: PASS.
- Lint: PASS mit 0 Fehlern und 7 bereits vorhandenen Warnungen ausserhalb des
  geaenderten Scopes.
- Production Build: PASS mit dem fail-closed Build-Environment-Guard und
  nicht sensitiven lokalen Platzhalterwerten.

## Migration

Keine.

## Staging Ergebnis

Nicht deployed. Physischer Development/Test-Gate bleibt beim Founder.

## Risiken

Der reale Supabase-Flow fuer ein bestaetigtes bestehendes Customer-Konto und
ein noch unbestaetigtes Konto muss nach einem freigegebenen Development/Test-
Deployment physisch bestaetigt werden. Deshalb maximal CODE LOCK.

## Oberflaechenpruefung

- Desktop: Komponentenvertrag und Build geprueft; Live-Gate ausstehend.
- Tablet: bestehendes responsives Public-Formular unveraendert; Live-Gate
  ausstehend.
- Mobile: bestehende Mobile-First-Formkomponenten und Touch-CTA werden
  wiederverwendet; physischer Founder-Gate ausstehend.

## Abschluss

- Aufgabe: Bestehende Customer-/Staff-E-Mail kann denselben Auth-Benutzer fuer
  die Owner-Registrierung weiterverwenden.
- Build: Ja.
- Migration: Keine.
- Flow-Test: Automatisierter Vertrags- und Regressionstest ja; realer
  Development/Test-Flow noch nicht deployed.
- RLS/Security: Ja, bestehende RPC-Grants, `auth.uid()`, Tenantbindung,
  Anti-Enumeration und passwortfreier Pending Intent geprueft.
- Alte Logik geprueft: Ja.
- Report: `docs/reports/2026-09-01_EXISTING_CUSTOMER_EMAIL_OWNER_REGISTRATION_REPORT.md`.
- Pruef-ZIP: `exports/2026-09-01_EXISTING_CUSTOMER_EMAIL_OWNER_REGISTRATION.zip`.
- Offene Risiken: Physischer Founder-Gate fuer bestaetigtes und unbestaetigtes
  Bestandskonto.
- Status: CODE LOCK; PHYSICAL FOUNDER GATE PENDING.
