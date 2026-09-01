# WUXUAI Bonus - First Authorized Platform Admin Identity

> **Ueberholt durch Korrektur am 2026-08-24:** Die in diesem historischen
> Bericht verwendete Adresse `office@wuxusbi.com` war ein Tippfehler. Die
> einzige freigegebene Identitaet ist `office@wuxuaisbi.com`. Der falsche
> Auth-User und seine Zuordnung wurden entfernt. Massgeblich ist der Bericht
> `2026-08-24_PLATFORM_ADMIN_AUTHORIZED_EMAIL_CORRECTION_REPORT.md`.

Datum: 2026-08-24  
Branch: `codex/v1-canonical-recovery`  
Staging: `wuxuai-bonus-staging` (`bwhv...qaya`)  
Freigegebene Identitaet: `office@wuxusbi.com`

## Auth-Bootstrap

Die exakte E-Mail-Adresse war vor dem Lauf nicht in Staging Auth vorhanden.
Sie wurde einmalig ueber den serverseitigen Supabase-Admin-Invite-Flow
angelegt. Es wurde kein Passwort erzeugt, kein oeffentlicher Platform-Admin-
Signup eingerichtet und keine zweite Adresse substituiert.

- Auth User ID: `a6927f7a-a781-4160-83b4-9b0fb8a9c4c0`
- Account aktiv: Ja
- Einladung gesendet: Ja
- E-Mail bestaetigt: Nein
- Erster Login: noch nicht erfolgt
- Restaurant-Membership: keine
- Customer-Verknuepfung: keine
- Staff verwendet in V1 keine eigene Auth-User-Zuordnung

## Autoritative Zuordnung

Die bestehende Tabelle `public.platform_admins` verlangt `user_id`, `role` und
`active`; ID und Zeitstempel besitzen sichere Defaults. Fuer die freigegebene
Auth-ID wurde serverseitig genau eine aktive Zuordnung mit der Rolle
`platform_admin` erstellt.

- Aktive Platform-Admin-Zuordnungen gesamt: 1
- Freigegebene Adresse aktiv: 1
- Andere aktive Zuordnungen: 0
- Bootstrap-Zeitpunkt ist in der Zuordnungszeile gespeichert.
- Der Supabase-Auth-Auditlog enthaelt `user_invited` mit Zeitstempel und
  Actor-/Target-Bezug.

## Migration 030

Die spaetere Referral-Migration `040` wurde voruebergehend mit SHA-256
`e0e90809d20208828f65240f00b7de2a642a413c44cf505dfd834a0976f86a72`
aus dem CLI-Lauf gehalten und unmittelbar danach bytegleich wiederhergestellt.
Die Migrationshistorie wurde nicht repariert, uebersprungen oder manuell
markiert.

- Dry Run: ausschliesslich `20260824003000`.
- Anwendung auf Staging: erfolgreich.
- Local/Remote fuer `030`: synchron.
- Einzige verbleibende Migration: `20260824004000`.
- DB-Linter nach Anwendung: 0 Fehler.

## Sicherheitspruefung

- `current_platform_role()` liest nur `platform_admins`, nicht
  `app_metadata` oder `user_metadata`.
- Alle drei Rollenfunktionen sind `SECURITY DEFINER`, Owner `postgres`, mit
  `search_path=public, pg_temp`.
- Nur `get_current_platform_role()` ist fuer `authenticated` ausfuehrbar.
- Anon besitzt kein EXECUTE; direkter REST-RPC-Test: HTTP 401 / SQLSTATE 42501.
- `platform_admins`: RLS aktiv; anon und authenticated besitzen weder SELECT
  noch INSERT.
- Freigegebene Auth-ID loest serverseitig `platform_admin` auf.
- Echter Owner mit gefaelschtem `app_metadata.role=platform_admin`: keine
  Plattformrolle.
- Nicht zugeordnete Identitaet mit gefaelschtem `app_metadata` und
  `user_metadata`: keine Plattformrolle.
- Transaktionaler Owner-Selbstbefoerderungsversuch: `permission denied` und
  keine Datenveraenderung.
- Normale Tenant-RLS wurde durch `030` nicht veraendert.

## Verbleibendes Gate

Der echte Login unter `/platform-admin` kann erst nach Annahme der Einladung
und Einrichtung der Auth-Anmeldedaten durch den Inhaber von
`office@wuxusbi.com` geprueft werden. Ein Login wurde nicht durch einen
Service-Role-Link oder eine erfundene Zugangsinformation vorgetaeuscht.

Weil der echte positive Login und eine erste echte Platform-Admin-Aktion noch
ausstehen, bleibt `PLATFORM ADMIN FOUNDATION READY = NO`. Entsprechend wurde
`20260824004000_authenticated_referral_registration_bridge.sql` nicht
angewendet.

## Qualitaet

- Autoritative Tests: 822/822 PASS.
- Typecheck: PASS.
- Lint: PASS, 0 Fehler und 7 bestehende Warnungen.
- Build: PASS.
- `git diff --check`: PASS.
- Staging DB Linter: 0 Fehler.
- Production: nicht verbunden oder veraendert.

## Finale Matrix

```text
AUTHORIZED PLATFORM ADMIN EMAIL:
office@wuxusbi.com

AUTH USER FOUND:
NO - CREATED ONCE THROUGH SECURE ADMIN INVITE

AUTH USER VERIFIED:
NO - INVITE PENDING EMAIL CONFIRMATION

AUTH USER ID:
a6927f7a-a781-4160-83b4-9b0fb8a9c4c0

PLATFORM ADMIN BOOTSTRAP:
PASS

PLATFORM ADMINS ACTIVE COUNT:
1

OFFICE@WUXUSBI.COM ACTIVE PLATFORM ADMIN:
YES

OTHER UNAUTHORIZED PLATFORM ADMINS:
0

SELF PROMOTION:
BLOCKED

03000 APPLIED:
YES

PLATFORM ADMIN ACCESS:
FAIL - SERVER ROLE PASS, LIVE LOGIN PENDING

OWNER ACCESS:
BLOCKED

STAFF ACCESS:
BLOCKED BY AUTHORITATIVE ROLE CONTRACT

CUSTOMER ACCESS:
BLOCKED BY AUTHORITATIVE ROLE CONTRACT

ANON ACCESS:
BLOCKED

CLIENT METADATA ESCALATION:
BLOCKED

AUDIT:
PASS - AUTH INVITE AUDIT AND MAPPING TIMESTAMPS PRESENT

PLATFORM ADMIN FOUNDATION READY:
NO

READY FOR 04000:
NO

PRODUCTION:
LOCKED

STRIPE:
DEFERRED
```

Status: **NOT READY**
