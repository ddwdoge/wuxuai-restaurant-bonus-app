# Staging Owner Registration Confirmation Fix

Datum: 2026-09-08
Umgebung: Staging `bwhvfjuwixgwduoeqaya`
Production: unveraendert

## Ursache

Der physisch fehlgeschlagene Account war nach der E-Mail-Bestaetigung korrekt
authentifiziert, besass aber noch kein Profil, kein Restaurant und keine
Owner-Membership. Zwei getrennte Integrationsfehler verhinderten die sichere
Fortsetzung:

1. Wenn der lokale Owner-Registrierungszustand nach dem Wechsel des
   Browserkontexts nicht mehr vorhanden war, leitete der bestaetigte Callback
   faelschlich nach `/admin`. Der geschuetzte Owner-Guard blockierte dort
   korrekt mit `Falscher Anmeldebereich`. Der Callback leitet diesen Zustand
   nun zum authentifizierten Aktivierungsformular `/register`.
2. Die PRO-Planmigration `20260905004000` beschraenkte
   `branch_subscriptions.plan_key` auf `BASIC`, `PRO` und `PREMIUM`.
   `start_restaurant_owner_trial` und dessen Helper
   `ensure_restaurant_branch` schrieben weiterhin den alten Wert `pilot`.
   Der Foreign Key rollte die gesamte Owner-/Restaurant-Erzeugung atomar
   zurueck. Zwei additive Forward-Migrationen ersetzen ausschliesslich diesen
   Planwert durch `BASIC`.

## Geaenderte Dateien

- `src/modules/auth/AuthCallbackPage.tsx`
- `tests/owner-email-confirmation-password-reset.test.mjs`
- `supabase/migrations/20260908001000_owner_trial_basic_plan_compatibility.sql`
- `supabase/migrations/20260908002000_owner_branch_basic_plan_compatibility.sql`
- `docs/reports/2026-09-08_STAGING_OWNER_REGISTRATION_CONFIRMATION_FIX_REPORT.md`

## Was wurde geaendert

- Bestaetigte, noch nicht provisionierte Owner-Registrierungen setzen den
  sicheren Aktivierungsflow auf `/register` fort.
- Neue Owner-Trials starten im kanonischen Paket `BASIC`.
- Die Branch-Erzeugung verwendet ebenfalls `BASIC`.
- Die bestehende Auth-Identitaet wird weiterverwendet; Rollen bleiben additiv.
- Regressionstests sichern Callback-Ziel, Authentifizierung, Idempotenz,
  BASIC-Planwert sowie unveraenderte Grants ab.

## Was wurde nicht geaendert

- Keine Production-Aenderung oder Production-Migration.
- Keine RLS-, Rollen-, Tenant- oder Cross-Tenant-Aufweichung.
- Keine Customer-/Staff-Rolle entfernt oder exklusiv gemacht.
- Keine manuelle Owner-Rolle und kein zweiter Auth-User angelegt.
- Keine Businesslogik ausser der Plan-Katalog-Kompatibilitaet geaendert.

## Datenbank- und Sicherheitsnachweis

- Vorher: Auth-User vorhanden und bestaetigt; Profil, Restaurant,
  Owner-Membership und Onboarding-Tenant fehlten.
- Route Guard vorher: korrekt blockiert, weil keine serververifizierte
  Restaurant-Membership bestand.
- `20260908001000`: auf Staging angewendet.
- `20260908002000`: auf Staging angewendet.
- Post-Dry-Run: keine ausstehenden Migrationen.
- DB-Linter: keine Fehler.
- RLS und RPC-Grants bleiben unveraendert: `public`/`anon` entzogen,
  `authenticated` erlaubt; `auth.uid()` bleibt Rollenbasis.
- Physisch: Aktivierung derselben bestaetigten Identitaet fuehrte zu
  `/admin/onboarding`. Der Tenant-Switcher zeigte genau das isolierte
  Testrestaurant. Kein `Falscher Anmeldebereich` mehr.

## Verifikation

- Fokussierte Auth-/Multi-Role-Tests: 48/48 PASS.
- Vollstaendige Tests: 1347/1347 PASS.
- Typecheck: PASS.
- Lint: PASS mit 0 Fehlern und 9 vorbestehenden Warnungen.
- Build: PASS.
- Secret Scan der geaenderten Dateien: PASS.
- `git diff --check`: PASS.
- Staging Worker: `c37faccf-3d6a-4cfb-a7e9-b9ab9f80704f`.
- Production: unveraendert.

## Risiken

- Der isolierte Staging-Testtenant bleibt fuer den anschliessenden Kassa-V3-
  Flow bestehen und darf erst ueber den freigegebenen Testtenant-Cleanup
  entfernt werden.
- Die zwei neuen Staging-Migrationen duerfen ohne separaten Founder-Gate nicht
  auf Production angewendet werden.

## Status

OWNER REGISTRATION CONTRACT: FINAL LOCK (STAGING)
