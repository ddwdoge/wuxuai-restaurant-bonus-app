# WUXUAI Bonus V1 - Referral Share, E-Mail-Bestaetigung und Multi-Role

Stand: 2026-08-30  
Branch: `codex/v1-canonical-recovery`  
Status: **CODE LOCK / LIVE GATES PENDING**

## Ursache

### Referral Share

Die Referral-Oberflaeche zeigte QR und einen normalen Link, bot aber keinen
Aufruf von `navigator.share()`. Deshalb konnte Safari kein natives iOS-Share-
Sheet oeffnen.

### E-Mail-Bestaetigung und Resend

Customer- und Owner-Callback erwarteten nach dem Oeffnen des Supabase-Links
eine zweite bewusste UI-Aktion. Dadurch war die serverseitige Bestaetigung fuer
den Benutzer nicht eindeutig sichtbar und die Fortsetzung wirkte unzuverlaessig.
Der vorhandene Resend ruft bereits `supabase.auth.resend({ type: "signup" })`
auf und blockiert ein unbestaetigtes bestehendes Konto nicht allein wegen der
vorhandenen E-Mail-Adresse. Der Clientcooldown betraegt 60 Sekunden.

Im Staging-Dashboard ist Custom SMTP deaktiviert. Der Versand verwendet daher
den Supabase-Standardprovider. Das Dashboard lieferte am 2026-08-30 fuer
`RATE_LIMIT_EMAIL_SENT` keinen Zahlenwert, obwohl die anderen Auth-Limits
geladen wurden. Eine erfolgreiche Providerzustellung oder ein exaktes aktives
E-Mail-Stundenlimit ist damit nicht nachgewiesen.

### Multi-Role

Der serverseitige Portalzugriff modelliert Customer, Owner, Staff und Platform
bereits als unabhaengige Beziehungen. Die Aktivierungsoberflaechen behandelten
eine vorhandene Auth-Identitaet jedoch noch als falsches Portal beziehungsweise
starteten erneut `signUp`. Ausserdem blockierte die Staff-Bindung Customer-,
Platform- und Ownerbeziehungen global, selbst wenn sie zu einem anderen Tenant
gehoerten.

## Staging-Datenbankpruefung

- Ziel vor Build und Migration: `bwhvfjuwixgwduoeqaya`.
- Dry-Run vor Anwendung: genau
  `20260830002000_multi_role_account_foundation.sql` ausstehend.
- Migration anschliessend ausschliesslich auf Development/Test angewendet.
- Local/Remote Migration History danach synchron; erneuter Dry-Run leer.
- DB-Linter danach: 0 Fehler.
- Geaenderte Constraints: keine Tabellen-, Foreign-Key- oder Unique-Constraints.
  Die Migration ersetzt ausschliesslich zwei RPC-Vertraege. Bestehende
  Eindeutigkeit bleibt eine Auth-Identitaet je `customer_accounts.auth_user_id`
  sowie restaurantbezogene Staff-Eindeutigkeit je Auth-Benutzer/E-Mail.
- Der Live-Katalog bestaetigt fuer beide Funktionen `SECURITY DEFINER`, festen
  `search_path = public, auth, pg_temp`, authenticated-only Grants und keinen
  frei uebergebbaren Rollenparameter.
- `activate_authenticated_customer_account` liest ausschliesslich `auth.uid()`,
  verlangt eine bestaetigte Auth-Identitaet und schreibt nur Customer-Profil/
  E-Mail-Beziehung. Owner-, Staff- und Plattformbeziehungen werden nicht
  geschrieben.
- `bind_restaurant_staff_auth_identity` verlangt
  `can_manage_restaurant_staff(input_restaurant_id)`, bindet nur den passenden
  Staff-Datensatz desselben Restaurants und blockiert Owner/Admin/Manager im
  selben Restaurant. Es vergibt weder Owner- noch Plattformrechte.
- Live-Aggregate vor den realen Rollentests: keine vorhandene Owner+Customer-
  oder Staff+Customer-Testkombination; 0 doppelte Auth-E-Mails, 0 doppelte
  Customer-Auth-Zuordnungen und 0 Customer-Profile ohne Auth-Benutzer. Deshalb
  werden reale Mehrfachrollen-Gates nicht durch erfundene Daten ersetzt.

## Geaenderte Dateien

- `src/modules/customer/referralShare.mjs`
- `src/modules/customer/referralShare.d.mts`
- `src/modules/customer/CustomerPortal.tsx`
- `src/modules/customer/customer-premium.css`
- `src/modules/auth/AuthCallbackPage.tsx`
- `src/modules/customer/CustomerAuthCallbackPage.tsx`
- `src/modules/auth/ConfirmEmailPage.tsx`
- `src/modules/auth/AuthProvider.tsx`
- `src/modules/auth/RegisterPage.tsx`
- `src/modules/auth/registerOwnerService.ts`
- `src/modules/customer/CustomerAuthPage.tsx`
- `src/modules/customer/customerAuthService.ts`
- `src/modules/customer/ReferralLanding.tsx`
- `src/modules/admin/AdminLayout.tsx`
- `src/app/App.tsx`
- `supabase/migrations/20260830002000_multi_role_account_foundation.sql`
- zugehoerige Vertrags- und Regressionstests
- kanonischer Produktvertrag, CTO-Entscheidung und Changelog

## Was wurde geaendert

- Native Referral-Freigabe mit deutschem, restaurantbezogenem Share-Payload.
- Clipboard-Fallback, sichtbares Kopierfeedback, bestehender QR und tertiaeres
  Linkoeffnen bleiben erhalten.
- Gueltige Customer- und Owner-Callbacks bestaetigen automatisch, zeigen einen
  sichtbaren Erfolgszustand und leiten danach in den richtigen Bereich weiter.
- Bereits bestaetigte Benutzer erhalten Login-/Aktivierungsfuehrung statt einer
  weiteren Bestaetigungs-E-Mail.
- Bestehende angemeldete Auth-Benutzer koennen Customer- oder Owner-Zugriff
  additiv aktivieren, ohne einen zweiten Auth-Benutzer oder ein zweites Passwort.
- Rollenwechsel zeigt nur serververifizierte Portalzugriffe und erfordert kein
  Logout.
- Die neue authenticated-only Customer-Aktivierungs-RPC ist tenantneutral,
  transaktionsgesperrt, idempotent und besitzt einen festen `search_path`.
- Staff-Bindung erlaubt andere Rollen global, blockiert aber weiterhin
  Owner/Admin/Manager im selben Restaurant.

## Was wurde nicht geaendert

- Keine Referral-Attribution, 2x-Logik, Laufzeit, Monatslimit oder
  Qualifikationsregel.
- Keine RLS-Deaktivierung, keine Public-/Anon-Grants fuer die neue RPC und keine
  Verwendung von `user_metadata` als Rollenautoritaet.
- Die additive Migration wurde ausschliesslich auf Development/Test-Supabase
  `bwhvfjuwixgwduoeqaya` angewendet. Kein Frontend-Deployment und keine
  Production-Aktion.
- Keine Production- oder Stripe-Aktion.
- Keine Mehrsprachigkeitsarchitektur. Der aktive V1-Vertrag verlangt weiterhin
  deutsche sichtbare UI; DE/EN/FR/IT/ES ist deshalb ausserhalb dieses V1-Changes.

## Pruefergebnisse

- Tests: `1148/1148 PASS`
- Fokustests: `74/74 PASS`
- Typecheck: PASS
- Lint: PASS mit 7 vorbestehenden Warnungen
- `git diff --check`: PASS
- Secret Scan des geaenderten Umfangs: PASS
- Build: PASS mit den vorhandenen Development/Test-Buildvariablen; Zielprojekt
  vor dem Build als `bwhvfjuwixgwduoeqaya` verifiziert, Werte nicht ausgegeben
- Custom SMTP: deaktiviert
- Supabase E-Mail-Stundenlimit: Dashboardwert nicht geladen / nicht verifiziert
- Migration `20260830002000_multi_role_account_foundation.sql`: auf
  Development/Test angewendet
- Migration History: Local/Remote synchron; Post-Apply-Dry-Run leer
- DB-Linter: PASS, 0 Fehler
- Live-Funktionsaudit: beide neuen/ersetzten RPC-Vertraege authenticated-only,
  kein Anon-Grant, fester `search_path`, keine Rollenparameter

## Mobile und Live

- Touchflaechenvertrag fuer Share-/Copy-Aktionen: automatisiert geprueft
- Desktop: nicht live mit dem neuen Build geprueft
- Tablet: nicht live mit dem neuen Build geprueft
- Physical iPhone Share Sheet: PENDING
- Android Share Sheet: NOT TESTED
- E-Mail-Zustellung, abgelaufener Link, Resend und Post-Confirm-Hydration: LIVE
  PENDING
- Multi-Role Customer/Owner/Staff/Platform und Cross-Tenant: LIVE PENDING

## Risiken

- Standard-Supabase-Mailversand und sein im Dashboard nicht geladener
  E-Mail-Limitwert koennen Resend-/Delivery-Gates weiterhin blockieren.
- Der neue Frontend-Build ist noch nicht committed, gepusht oder deployed;
  deshalb koennen die UI-basierten Live-Gates noch nicht begonnen werden.
- Automatisierte Tests ersetzen weder Providerlogs noch physische Share-Sheets
  noch reale Cross-Tenant-Rollenproben.

## Status

`CODE LOCK / LIVE GATES PENDING`: Code, Pflicht-Build, Staging-Migration,
Migration History, leerer Dry-Run, DB-Linter und automatisierte Tests sind
gruen. E-Mail-Live-Gate, Multi-Role-Live-Gate, Frontend-Deployment und
physischer iPhone-Test fehlen; deshalb kein FINAL LOCK.

- Production: `LOCKED`
- Stripe: `DEFERRED`
