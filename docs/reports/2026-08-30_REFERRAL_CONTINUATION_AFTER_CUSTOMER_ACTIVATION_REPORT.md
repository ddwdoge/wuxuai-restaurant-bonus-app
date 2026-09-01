# Referral Continuation nach Customer-Aktivierung

Datum: 2026-08-30

## Ursache

Der sichere Referral-Rueckweg `/r/<restaurant-slug>/<public-token>` wurde durch
Login, Registrierung, E-Mail-Bestaetigung und Customer-Aktivierung korrekt
transportiert. `AuthProvider` hydratisierte eine bestehende Supabase-Session
auf dieser oeffentlichen Route jedoch nicht. Die Referral-Seite sah den bereits
bestaetigten und aktivierten Benutzer deshalb erneut als anonym und zeigte
wieder die Anmeldung statt der Einladungsannahme.

## Geaenderte Dateien

- `src/modules/auth/authRoutePolicy.mjs`
- `src/modules/auth/authRoutePolicy.d.mts`
- `src/modules/auth/AuthProvider.tsx`
- `src/modules/customer/customerReturnPath.mjs`
- `src/modules/customer/ReferralLanding.tsx`
- `tests/referral-continuation-after-customer-activation.test.mjs`
- `docs/19_CHANGELOG.md`
- dieser Bericht

## Was wurde geaendert

- Referral-Routen bleiben oeffentlich, duerfen aber eine vorhandene Session und
  deren serververifizierte Portalzugriffe hydratisieren.
- Ein abgelaufener lokaler Authzustand wird entfernt, ohne die oeffentliche
  Referral-Route in einen falschen Portal-Login umzuleiten.
- Der bestehende sichere Return-Path verwendet dieselbe kanonische Referral-
  Pfadpruefung wie die Session-Hydration.
- Die Annahmeansicht bietet einen ausdruecklichen Abbruchweg zum Kundenportal.

## Was wurde nicht geaendert

- keine Referral-Attribution oder Qualifikation
- keine Punkte- oder 2x-Berechnung
- kein Monatslimit oder Duplikatschutz
- keine Legal-Autoannahme
- keine RPC-, RLS- oder Datenbankaenderung
- keine Migration
- kein Production- oder Stripe-Zugriff

## Sicherheit

Der Browser bewahrt nur den bereits vorhandenen oeffentlichen Referral-Token
im validierten relativen Return-Path. Auth-, Session- und Customer-IDs werden
nicht als Continuation-State gespeichert. Vor der Anzeige prueft
`get_public_referral` die Einladung; die finale Annahme revalidiert Restaurant,
Token, Customer, Legal-Consent und Tenant serverseitig ueber
`join_authenticated_customer_referral`.

## Verifikation

- gezielte Referral-, Auth-, Multi-Role- und Callback-Tests: 36/36 PASS
- vollstaendige Testsuite: 1158/1158 PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler und 7 bereits bestehende Warnungen
- Build: PASS mit nicht geheimen lokalen Build-Platzhaltern
- Migration: keine
- Development/Test-Live-Flow: noch nicht deployt oder getestet
- physischer iPhone-Test: offen, Founder-Gate

Der erste Buildaufruf ohne gesetzte Buildvariablen wurde vom bestehenden
Fail-Closed-Guard erwartungsgemaess beendet. Der anschliessende reine
Compile-/Bundle-Lauf verwendete ausschliesslich nicht geheime lokale
Platzhalter und war erfolgreich. Es wurden keine Supabase-Zugangsdaten aus
anderen Dateien kopiert oder protokolliert.

## Status

CODE LOCK nach gruener technischer Verifikation; FINAL LOCK erst nach echtem
Development/Test- und physischem iPhone-Flow.

## Nachtrag 2026-08-31: Founder-Gate abgeschlossen

Der spaeter ausgefuehrte physische iPhone-Flow wurde vom Founder nach dem
Continuation-Fix als `PASS` bestaetigt. Die bestaetigte Referral-Strecke
umfasste Linkoeffnung, Aktivierung des bestehenden Kontos, Legal Consent,
Einladungsannahme, Customer Portal, qualifizierenden Besuch und den 2x-Bonus
fuer beide Seiten. Der zuvor unnoetige zweite Login-Schritt trat nicht mehr
auf.

Der historische Status `CODE LOCK / physischer iPhone-Test offen` ist damit
fuer die aktuelle Release-Bewertung ueberholt. Referral Continuation:
`FINAL LOCK` auf Basis der spaeteren Founder-Evidenz. Keine erneute Ausfuehrung
des Businessflows fuer diesen Nachtrag.
