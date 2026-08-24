# WUXUAI Bonus - Referral Invite Landing und vollständige Kundenregistrierung

Datum: 2026-08-24  
Branch: `codex/v1-canonical-recovery`  
Ausgangscommit: `919141181223aa414ef004a09aa3f02637f2b7fd`

## Ursache

Die öffentliche Referral-Route verwendete ein separates vereinfachtes
Registrierungsformular ohne E-Mail, Passwort, Passwortbestätigung und zentrale
Supabase-Auth-Identität. Zusätzlich erlaubte die sichere Rückwegprüfung nur
Customer- und Restaurant-QR-Pfade, aber keinen streng validierten Referral-Pfad.
Dadurch konnte der Referral-Kontext den kanonischen E-Mail-Callback nicht
zuverlässig durchlaufen.

Der bestehende Public-Resolver berücksichtigte außerdem das vorhandene
`expires_at` nicht und gab den Vornamen ohne eigenes öffentliches
Namensfreigabefeld zurück.

## Geänderte Dateien

- `src/modules/customer/ReferralLanding.tsx`
- `src/modules/customer/CustomerAuthPage.tsx`
- `src/modules/customer/CustomerAuthCallbackPage.tsx`
- `src/modules/customer/customerAccountService.ts`
- `src/modules/customer/customerReturnPath.mjs`
- `src/modules/customer/customerReturnPath.d.mts`
- `src/modules/customer/referralInviteFlow.mjs`
- `src/modules/customer/referralInviteFlow.d.mts`
- `src/modules/customer/central-customer.css`
- `src/modules/loyalty/loyaltyService.ts`
- `src/modules/loyalty/referralBonusSettings.mjs`
- `supabase/migrations/20260824004000_authenticated_referral_registration_bridge.sql`
- betroffene Referral-, Legal-, Customer- und Responsive-Tests
- `docs/09_FLOW_02_GAST_WERDEN.md`, `docs/12_FLOW_05_BONUS_BOOST.md`, `docs/19_CHANGELOG.md`

## Umsetzung

- Referral-Landing zeigt Restaurant, Logo, sicheren neutralen Einlader-Fallback
  und die dynamische 100/50-Dauer.
- Das doppelte Referral-Identitätsformular wurde entfernt. Registrierung und
  Login laufen über den bestehenden zentralen Customer-Auth-Flow.
- `/r/<slug>/<token>` ist nur bei strengem Slug- und Tokenformat ein erlaubter
  Callback-Rückweg. Externe, relative und manipulierte Pfade fallen auf
  `/customer` zurück.
- `confirmPassword` bleibt ausschließlich lokaler Formzustand.
- Nach bestätigter E-Mail werden nur die restaurantbezogenen Pflichtdokumente
  angenommen.
- `join_authenticated_customer_referral` ist authenticated-only, prüft
  Auth-Konto, Restaurant, Hash-Token, Ablauf, Legal Readiness und bestehende
  Membership serverseitig und verknüpft Referral, Customer und Membership in
  einer Transaktion mit Advisory- und Row-Lock.
- Signup und Beitritt setzen ausschließlich `pending_registered`. Die bestehende
  erste gültige Punktebuchung bleibt alleinige Qualifikationsquelle.
- Ohne ausdrücklich freigegebenes öffentliches Namensfeld liefert der Resolver
  keinen Vornamen; die UI zeigt `Ein Freund hat dich eingeladen`.

## Nicht geändert

- bestehende Qualifizierungs- und Punkte-Engine
- 2x-Obergrenze und 100/50-Aufteilung
- Grant-, Stacking-, Reporting- und Audit-Trigger
- normaler Restaurant-QR-Beitritt
- Owner-, Staff- und Plattformflows
- Production und Stripe

## Sicherheit

- Public-Resolver prüft Restaurant, Hash-Token, Status und Ablauf.
- Keine internen Customer-, Auth- oder Referral-IDs im Public-Payload.
- Neue Beitritts-RPC besitzt festen `search_path = public, pg_temp`.
- `EXECUTE` für `public` und `anon` entzogen; nur `authenticated` erlaubt.
- Keine direkte Browser-DML und keine Service-Role im Client.
- Kein Token, Passwort, Telefonwert oder interne ID im neuen Audit-Metadatum.
- Bestehende RLS-Policies wurden nicht gelockert.

## Tests

- Autoritative Suite: 822/822 PASS.
- Neue Tests: 10 Referral-Flow-, Callback-, Privacy-, Tenant-, Locking- und
  Nicht-Qualifikationsfälle.
- Typecheck: PASS.
- Lint: 0 Fehler, 7 bestehende Warnungen.
- Build: PASS.
- `git diff --check`: PASS.
- Responsive Browserprüfung: 320/375/390/414/430/768/1024 ohne horizontalen
  Overflow, Submit vorhanden, minimale Interaktionshöhe 44 px.
- Browserfehler: 0; zwei bestehende React-Router-v7-Zukunftswarnungen.

## Migration und Staging

Der verknüpfte Staging-Dry-Run war erfolgreich, würde aber gemeinsam anwenden:

1. `20260824003000_platform_admin_foundation_hardening.sql`
2. `20260824004000_authenticated_referral_registration_bridge.sql`

Die ältere Platform-Admin-Migration gehört nicht zu diesem Auftrag. Deshalb
wurde kein `db push` ausgeführt. Die Referral-RPC ist auf Staging noch nicht
erreichbar und der geforderte echte E-Mail-/Punkte-/Boost-E2E konnte nicht
durchgeführt werden.

## Finale Matrix

REFERRAL LANDING: PASS  
REFERRER DISPLAY: PASS  
RESTAURANT CONTEXT: PASS  
FULL CUSTOMER REGISTRATION: PASS  
PASSWORD CONFIRMATION: PASS  
EMAIL CONFIRMATION: FAIL - lokal vertraglich geprüft, echter Staging-Versand offen  
REFERRAL SURVIVES CALLBACK: PASS - Code/Serververtrag; Staging-E2E offen  
PENDING REFERRAL: PASS - Code/SQL-Vertrag; Staging-E2E offen  
QUALIFICATION: PASS - bestehende autoritative Engine unverändert und getestet  
REFERRER 100%: PASS  
FRIEND 50%: PASS  
SELF REFERRAL: BLOCKED  
TOKEN TAMPERING: BLOCKED  
NORMAL REGISTRATION REGRESSION: PASS  
MOBILE: PASS - automatisiert; physischer iPhone-Safari-Test offen  
STAGING E2E: FAIL  
REFERRAL INVITE FLOW COMPLETE: NO  
PRODUCTION: LOCKED  
STRIPE: DEFERRED

## Risiken

- Migrationsreihenfolge `030`/`040` benötigt eine separate Staging-Freigabe.
- Echte Bestätigungs-E-Mail, Browser-Close-Rückkehr, erste Punktebuchung,
  Booster-Ablauf und Owner-Reporting müssen danach mit isolierten Testkunden
  live geprüft werden.
- Physischer iPhone-Safari-Test steht aus.

Status: **NOT READY**
