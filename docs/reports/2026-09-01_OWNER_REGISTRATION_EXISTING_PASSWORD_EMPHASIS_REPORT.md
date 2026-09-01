# Owner Registration Existing Password Emphasis Report

Datum: 2026-09-01

## Ursache

Der bestehende Multi-Role-Flow war fachlich korrekt: Eine vorhandene
Customer-/Staff-E-Mail wird direkt im Restaurant-Registrierungsformular mit
dem bestehenden Passwort authentifiziert. Nach der neutralen Kontoerkennung
waren Hinweis, Passwortfeld und naechster Schritt jedoch visuell zu wenig
verbunden.

## Geaenderte Dateien

- `src/modules/auth/RegisterPage.tsx`
- `src/modules/public/public-entry-premium.css`
- `tests/existing-customer-owner-registration.test.mjs`
- kanonische Flow-, Contract- und Changelog-Dokumentation

## Was wurde geaendert

- Hellgruener Erkennungshinweis direkt vor dem bestehenden Passwortfeld.
- Bestehendes Passwortfeld mit gruenem Rahmen, Schloss-Symbol und Autofokus.
- Falsches bestehendes Passwort wird direkt am Feld angezeigt.
- Die bisherige neutrale Folgemeldung wurde verstaendlicher formuliert.

## Was wurde nicht geaendert

- Keine separate Loginseite, Weiterleitung, `returnTo`-Logik oder neue
  Formular-Zwischenspeicherung.
- Keine Aenderung an Multi-Role, Supabase Auth, Pending Intent,
  Owner-Provisionierung, RLS, Tenantgrenzen oder Idempotenz.
- Keine Migration und kein Deployment.

## Sprachvertrag

Der Founder-Auftrag nennt DE, EN, ZH, FR, ES und IT. Der aktive V1-Vertrag in
`AGENTS.md`, `docs/18_CODEX_REGELN.md` und den Guardrails schreibt jedoch
Deutsch als einzige sichtbare V1-Sprache fest und ordnet Mehrsprachigkeit V2
zu. Daher wird dieser V1-UI-Fix ausschliesslich auf Deutsch umgesetzt; die
Mehrsprachenanforderung bleibt ein dokumentierter Contract-Konflikt.

## Qualitaet

- Tests: 1248/1248 PASS.
- Typecheck: PASS.
- Lint: PASS mit sieben bestehenden Warnungen und null Fehlern.
- Build: PASS.
- Responsive-Geometrie: 320, 375, 390, 414, 430 und 1440 Pixel PASS;
  kein horizontaler Ueberlauf, Passwortfeld 52 Pixel hoch.
- `git diff --check`: PASS.
- Gezielter Secret Scan der geaenderten Dateien: PASS, keine Treffer.
- RLS/Security: Keine Policy-, Grant-, RPC-, Auth-Service- oder
  Migrationsaenderung. Multi-Role und atomare Owner-Provisionierung bleiben
  unveraendert.

## Status

CODE LOCK. Ein echter Development/Test-Bestandskonto-Flow wurde in dieser
Aufgabe nicht ausgefuehrt und bleibt Voraussetzung fuer FINAL LOCK.
Production bleibt LOCKED.
