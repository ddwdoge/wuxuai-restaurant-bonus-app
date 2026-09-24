# Phase 7C.6C3A – Checkout-/Webhook-Architektur und lokales Edge-HTTP-Restgate

Status: **LOCAL EDGE HTTP RESTGATE PASS / ACTIVATION INTENTIONALLY BLOCKED**.
Stand: 2026-09-24. Implementierungscommit: `39472c9` auf
`codex/v1-release-integration` ab `f27ce12d27303125fce0ad0903e1e978e5feaa7d`.
Staging, Stripe und Production wurden nicht berührt. Dies ist kein positiver
Checkout-, Tax-, Seller- oder Aktivierungsnachweis.

## Ursache, Scope und unveränderte Autorität

Die Founder-Entscheidung erlaubt ausschließlich eine gesperrte Checkout-/Webhook-
Architektur. Migrationen 001–166 bleiben bytegleich; Migration 167
`20260924002000_checkout_webhook_architecture_blocked.sql` hat SHA-256
`f392fa30489bbd073defcf9bc5e7f36b1fd6bc80304f87d4fa972361855f794b`.
Pending-, KYB-, Country-, Seller-, Tax- und Commercial-Gates wurden nicht
gelockert. Migration 167 erzeugt nur technische Blocker-Audit- und
Webhook-Inbox-Verträge, niemals Subscription-, Trial- oder Entitlementwrites.
Die vorhandene fremde Änderung `supabase/.temp/cli-latest` blieb unangetastet
und uncommitted.

Der Edge-Wrapper wurde nach dem physischen Staff-Test eng korrigiert: Der
unveränderte RPC-Fehler `42501 CHECKOUT_OWNER_TENANT_UNAVAILABLE` wird nun als
HTTP `403 CHECKOUT_OWNER_REQUIRED` ausgegeben. Der Guard selbst und alle
positiven Aktivierungspfade bleiben unverändert. Identischer Request-Retry
bleibt deterministisch; Payloadkonflikt bleibt `409`.

## Historischer Staff- und Upgrade-Nachweis

Neue isolierte lokale Runtime `wuxuai-7c6c3a3-historical`, Ports 56321/56322,
neues Datenbank-Volume und neue zufällige JWT-/Anon-/Service-Role-/Fake-Webhook-
Testwerte. Nur irreversible SHA-256-Präfixe der neuen Werte wurden beobachtet:
JWT `021335a0d100`, Anon `1b4659bce47a`, Service Role `b572ee6970f6`,
Fake Webhook `c9f1a7134168`. Die CLI bestätigte die Übereinstimmung der drei
aktiven Runtime-Schlüssel; keine Secretwerte stehen in diesem Bericht.
Eine DB-Passwortrotation wird nicht behauptet.

Auf Migrationsstand 162/162 wurden Owner und Staff über lokale Supabase Auth
und die damals kanonischen Funktionen erstellt:
`start_restaurant_owner_trial` → `create_restaurant_staff_invitation` →
`bind_restaurant_staff_auth_identity` →
`accept_my_restaurant_staff_invitation`. Keine direkte Auth-, Staff- oder
Membership-DML und keine Staff-Ausnahme. Vor dem Upgrade: genau eine aktive
Staff-Mitgliedschaft, Fingerprint `9761acec51f5722d4dc0f3d9ffcd2b1c`.
Nach normalem Upgrade 162→163→164→165→166→167: 167/167, dieselbe eine
Staff-Mitgliedschaft mit identischem Fingerprint. Lokaler Repeat-Dry-Run:
keine weitere Migration; Historie bleibt 167/167. DB-Lint Exit 0.

Der Staff-Token wurde regulär über den lokalen Auth-Endpoint bestätigt.
Physischer Checkout-HTTP-Aufruf: `403 CHECKOUT_OWNER_REQUIRED`; der direkte
RPC-Negativnachweis: `403`, SQLSTATE `42501`,
`CHECKOUT_OWNER_TENANT_UNAVAILABLE`. Staff erzeugte keine Checkout-Auditzeile.
Der Owner desselben historischen Betriebs erhielt `403 KYB_NOT_VERIFIED` mit
`BLOCKED` und `ARCHITECTURE_ONLY`. Fremder-Tenant-Injektionsversuch: `400
CHECKOUT_REQUEST_INVALID`; sein eigener Checkout bleibt ebenfalls blockiert.
Provideradapter-Aufrufe: **0**; keine Checkout Session, Subscription,
Trial- oder Entitlementmutation. Die 119 geschützten Geschäftsrelationen
einschließlich Auth blieben vor/nach HTTP fingerprint-identisch:
`329b33bf6c2b4714dce974f9a82abfb9`.

## Getrennter Remote-URL-Guard

Ein separater Lauf des lokalen HTTP-Test-Runners mit
`https://example.invalid` endete mit Exit-Code **2** und dem standardisierten
Fehler `LOCAL_HTTP_TARGET_REQUIRED`. Instrumentierte Zähler vor Secret-Lesen
oder Clientinitialisierung: HTTP **0**, DNS **0**, DB **0**. Die Runner-Allowlist
enthält nur `localhost`, `127.0.0.1` und `[::1]` unter HTTP. Zusätzlich prüfen
die fokussierten Tests, dass die `local_only`-/URL-Gates beider Edge-Wrapper vor
`createClient` liegen. Es gab keine Remote-Auflösung oder Remote-Verbindung.

## Weitere lokale Nachweise

Der vorangegangene physische 7C.6C3A2-HTTP-Lauf bestätigte 24 parallele
blockierte Checkout-Requests mit genau einer Auditzeile, 24 identische
Webhook-Events mit genau einem technischen Inbox-Eintrag, gültige und
ungültige HMAC-Signaturen, Raw-Body-Byte-/Whitespace-Manipulation, Replay,
Event-ID-/Hash-Konflikt, LIVE-/Account-Ablehnung, unbekannte und veraltete
Events sowie kontrollierten Retry. Sein Geschäfts-Fingerprint über 119
Relationen blieb identisch. Der neue historische Staff-Lauf ergänzt diesen
Nachweis, ersetzt ihn nicht.

Nach der engen Fehlerabbildung: Focused Node-Tests **7/7 PASS**;
rollback-geschützter SQL-Security-Test **PASS**; Full Suite **1970/1970 PASS**;
Typecheck **PASS**; Lint **0 Fehler, 8 vorbestehende Warnungen**; Build **PASS**
mit nicht geheimen Platzhalterwerten. `git diff --check` und
`git diff --cached --check` ohne Befund. Secret-Scan über Implementierungs-
und Berichtumfang sowie das entpackte finale ZIP: kein Fund. Die früheren
Migrationen wurden nicht geändert.

## Nicht geändert und offene Folgegates

Kein Stripe-API-Aufruf, kein Checkout Customer, keine Subscription, kein
Trialstart, kein Grant, kein Add-on, kein Country- oder PRO-Release und keine
Produktdatenänderung. Keine Staging-Migration, kein Edge-Deployment, keine
Production-Verbindung und keine LIVE-Nutzung. Der positive Aktivierungspfad
bleibt bis zu separat verifizierten KYB-, Country-, Seller-, Tax-, Legal- und
Payment-Gates absichtlich gesperrt. Das allgemeine 7C.6C3A-ZIP mit SHA-256
`44e0b8dba8305b7b8f5c24db5910c5592dbf995b53fc37ab2293a60aabaf1083`
bleibt historische Code-Lock-Evidenz; das neue finale Prüf-ZIP ist getrennt.

Die task-eigene lokale Runtime und alle synthetischen Daten werden nach dem
Evidenzgate ohne Backup verworfen. Fremde Container und Prozesse bleiben
unverändert. Der ZIP-Hash und Remote-HEAD werden im abschließenden Handoff
ausgewiesen, da ein Bericht seinen eigenen Evidenzcommit nicht referenzieren
kann.
