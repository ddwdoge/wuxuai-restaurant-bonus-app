# Platform Admin Dual-TOTP V1 – lokaler Bericht

Datum: 2026-09-27

Branch: `codex/platform-admin-totp-aal2`

Ausgangs-HEAD: `4607f48ddef3bab80985f439da73285ac8cd95c4`

## Ursache

Migration 173 schützt Platform-RPCs bereits fail-closed mit aktueller Session,
AAL2, TOTP-AMR und dem weiterhin verifizierten Sessionfaktor. Die bisherige UI
wählte bei mehreren Faktoren jedoch automatisch nur einen Faktor und bot weder
explizite Auswahl noch einen sicheren Verlust-/Ersatzablauf.

## Änderung

- Faktorwahl beim Login, wenn mehrere verifizierte TOTP-Faktoren vorhanden sind;
- AAL2-geschützte Ansicht `Anmeldeschutz` mit Ziel zwei Geräte;
- zweiter Faktor wird regulär über die Benutzer-MFA-API registriert/verifiziert;
- verlorener Faktor kann nur nach erneuter Challenge mit einem anderen
  verifizierten Faktor entfernt werden;
- letzter Faktor bleibt unentfernbar;
- Ersatzfaktor wird als neuer zweiter Faktor eingerichtet;
- Faktor-IDs, Secrets, QR-Payloads und Codes werden nicht protokolliert;
- V1-Vertrag auf zwei getrennte Geräte umgestellt; Personen-Recovery, ID
  Austria und vorhandener Auth-Admin-Runner als V3 klassifiziert.

Migration 173 wurde nicht geändert. SHA-256:
`fe76bbbc8b24fc069231bb0f56d4351e801d40216c6625df9d4655d0162913ce`.

## Lokale Nachweise

- fokussierte statische/Helper-Security-Tests: 12/12 PASS;
- echter synthetischer lokaler Supabase-Lauf: zwei verschiedene Faktoren PASS;
- frischer Login mit Faktor 1: PASS;
- frischer Login mit Faktor 2: PASS;
- AAL1-Direkt-RPC blockiert: PASS;
- AAL2/TOTP-RPC erlaubt: PASS;
- regulärer Token-Refresh und anschließender Serverzugang: PASS;
- Challenge mit verbleibendem Faktor, Entfernung des anderen Faktors und
  Einrichtung eines neuen Ersatzfaktors: PASS;
- Full Suite: 2052/2052 PASS;
- Typecheck: PASS;
- Lint: PASS, 0 Fehler und 8 vorbestehende Warnungen;
- Build mit lokalen Public-Bindings: PASS.

Die ersten drei HTTP-Testfehler eines Sandbox-Laufs waren ausschließlich
`listen EPERM`; derselbe vollständige Lauf außerhalb dieser Portbeschränkung
bestand 2052/2052. Die Drawer-Inventur wurde um die neue Sicherheitsansicht von
46 auf 47 aktualisiert.

## Nicht geändert

- Migration 173 und Migrationen 001–172;
- Supabase-Storage-/JWT-Architektur und produktive Auth-Konfiguration;
- Staging, Production, Stripe, Faktoren oder reale Benutzer;
- lokaler Recovery-Runner-Code (für V1 nicht einsetzen/deployen);
- vorbestehende Änderung `supabase/.temp/cli-latest`.

## Restrisiko und offene Staging-Gates

Gleichzeitiger Verlust beider physischen Geräte sperrt V1 absichtlich aus.
Es gibt keinen AAL1-/Auth-Admin-Bypass. ID Austria und unabhängig kontrolliertes
Personen-Recovery sind V3.

Vor Migration 173 auf Staging bleiben offen:

1. tatsächliche Staging-JWT-Laufzeit read-only belegen;
2. zwei getrennte Nutzergeräte bereitstellen und jede reale Einrichtung
   ausdrücklich am jeweiligen Gerät ausführen;
3. kontrolliertes Wartungsfenster für UI-Deployment vor Migration 173;
4. zwei einzelne Faktor-Logins, Verlust-/Ersatzlauf und direkte AAL1/AAL2-RPCs;
5. Migration 173, Repeat, DB-Lint, ACL/RLS/search_path und Fingerprints.

## Status

**LOCAL CODE LOCK / STAGING NOT READY.**

Kein Push, kein Deployment, keine Migration und keine Production-Freigabe.
