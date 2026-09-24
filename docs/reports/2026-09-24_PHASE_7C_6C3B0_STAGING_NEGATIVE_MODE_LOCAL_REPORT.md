# Phase 7C.6C3B0 – fail-closed Staging-Negativmodus, lokaler Codevertrag

Stand: 2026-09-24. Status: **LOCAL CODE LOCK / STAGING NOT EXECUTED**.
Basis: `codex/v1-release-integration` bei
`5712d50f511051f6c639612bf5aa0d1dd0bd7bb9` vor den lokalen Aenderungen.
Enger Implementierungscommit: `d584783`.
Die fremde Abweichung `supabase/.temp/cli-latest` blieb unveraendert und ist
nicht Teil des freigegebenen Umfangs.

## Ursache und enge Aenderung

Beide Edge-Funktionen waren absichtlich auf `local_only` und lokale HTTP-Ziele
begrenzt. Fuer den separat freigegebenen spaeteren Staging-Negativtest wurde
genau ein weiterer serverseitiger Modus `staging_negative_only` eingebaut.
Er verlangt die exakte Staging-Projektreferenz und -URL, `STAGING`, keine
Live-Key-aehnliche Umgebungsvariable sowie eine schreibfreie Datenbankpruefung.
Andere, fehlende und manipulierte Modi bleiben gesperrt. Der Modus kann nicht
aus Body, Query, Browserheader, JWT oder Usermetadata gesetzt werden.

Die bestehenden privaten Billing-Tabellen sind fuer Runtime-Rollen bewusst
nicht direkt lesbar. Deshalb war eine additive, auf `service_role` beschraenkte
Read-Migration 168 zwingend: Sie prueft Seller `PLANNED`, TEST-Tax
`PENDING_CONFIGURATION` mit Automatic Tax aus, vier verifizierte TEST-Bindungen,
vier ungebundene LIVE-Bindungen und den bestehenden Resolverausgang
`commercial_activation_allowed=false`/`purchase_allowed=false`.
Sie liefert nur Boolean, keine Provider-IDs oder PII, hat festen `search_path`
und keine Businesswrites. Migrationen 001–167 sind bytegleich; Migration 167
hat weiterhin SHA-256
`f392fa30489bbd073defcf9bc5e7f36b1fd6bc80304f87d4fa972361855f794b`.
Migration 168 hat SHA-256
`45c4bf29ffb9e7e294d76536fd7b734f2d151a48438d8147780962d1e84f0815`.

Checkout nutzt weiter ausschliesslich den blockierten Owner-/Tenant-RPC;
kein Provideradapter ist erreichbar. Der Staging-Webhook verlangt ein
eigenstaendiges, mindestens 32 Zeichen langes Signing-Secret, gueltige
Raw-Body-Signatur, einen getrennten serverseitig geprueften Marker,
`environment=STAGING`, `synthetic_test=true`, die fest konfigurierten
Request-/Correlation-/Event-IDs, synthetisches Event-Praefix, `livemode=false`
und leeres Businessobjekt. Nur die technische Inbox darf `ACTIVATION_BLOCKED`
erhalten. Ohne Signing-Secret gibt es weder Inbox- noch Auditwrite.

## Geaenderte Dateien

- `supabase/functions/billing-checkout-architecture/index.ts`
- `supabase/functions/billing-local-fake-webhook/index.ts`
- `supabase/migrations/20260924003000_staging_negative_billing_readiness.sql`
- `tests/phase-7c6c3b0-staging-negative.test.mjs`
- `tests/phase-7c6c3b0-edge-http.test.mjs`
- `tests/phase-7c6c3b0-staging-negative.local.sql`
- `docs/V1_CURRENT_CANONICAL_PRODUCT_CONTRACT.md`
- dieser Bericht

## Lokale Nachweise

- Fresh Replay: **168/168 PASS** in isoliertem lokalen Supabase-Projekt.
- Migration 168 Repeat 1/2: **PASS**. Upgrade 167→168 wurde nicht in einer
  separaten historischen Runtime ausgefuehrt; das bleibt ein offenes Gate.
- DB-Lint: Exit 0; Legacy-Warnungen, kein Befund zur neuen Read-Funktion.
- Readiness-RPC: Service Role `true` im lokalen Baselinezustand; simulierte
  Seller-Revision `TEST_READY` innerhalb einer zurueckgerollten Transaktion
  ergibt `false`. Anon/Auth ohne EXECUTE, direkte Runtime-Tabellenreads gesperrt.
- HTTP-Negativtests: echte lokale Loopback-HTTP-Anfragen gegen die
  transpilierten Edge-Handler mit vollstaendig isoliertem Supabase-Transport,
  **nicht** gegen eine gehostete Supabase-Edge-Runtime. `local_only` und
  simuliertes `staging_negative_only` bleiben blockiert. 24 parallele
  Checkout-Requests, keine Provideraufrufe. Fehlende/falsche Signatur,
  falscher Marker, Raw-Body-Manipulation, falsche IDs, `livemode=true`,
  nichtsynthetisches Event und fehlendes Testsecret werden abgewiesen.
  Ein exakt synthetischer Event erzeugt hoechstens einen technischen
  Inbox-Eintrag im isolierten Testdouble; Replay bleibt idempotent,
  Event-ID-/Hash-Konflikt wird abgewiesen. Es entstand kein Remote-Kontakt.
- Focused Tests: **6/6 PASS**; bestehende Architektur-Tests **7/7 PASS**.
- Full Tests: **1976/1976 PASS**.
- Typecheck **PASS**; Lint **PASS** mit 0 Fehlern und 8 vorbestehenden
  Warnungen; Build **PASS** mit nicht geheimen lokalen Platzhaltern.
- `git diff --check` und `git diff --cached --check`: **PASS**.
- Secret-Scan im freigegebenen Umfang: kein echter Secretwert gefunden.

## Unveraendert und offene Gates

Migration 167 wurde weder umgeschrieben noch auf Staging angewendet.
Kein Staging-Secret, Edge-Deployment, Stripe-API-Aufruf, Stripe Customer,
Checkout Session, Subscription, Trial, Entitlement, Grant, Add-on,
Country Release, Seller-/Tax-Statuswrite, externe E-Mail, Production- oder
LIVE-Aktion. Der lokale HTTP-Test ist kein Hosted-Edge-Nachweis. Auch
Migration 168 ist **nur lokal**; die fruehere Freigabe „ausschliesslich
Migration 167 auf Staging“ umfasst sie nicht. Vor einem spaeteren
Staging-Deployment sind eine separate Freigabe und ein Upgrade-/Hosted-Gate
fuer Migration 168 erforderlich. Positive Aktivierung bleibt absichtlich
gesperrt.

Beim lokalen CLI-Start wurden ausschliesslich lokale Standard-Testzugangswerte
in fluechtiger Toolausgabe angezeigt. Sie wurden nicht in Dateien, Bericht,
Git oder ZIP uebernommen; keine Remote-Zugangsdaten wurden gelesen. Die
task-eigene lokale Runtime wurde nach der Evidenzpruefung gestoppt.

Prozess-/Container-Cleanup: Der lokale Supabase-Stack startete fuenf
task-eigene Container und wurde ueber die CLI mit exakter Project-ID ohne
Volume-Loeschung gestoppt. Danach laufen **0** task-eigene Container oder
Hintergrundprozesse. Der fremde Container `welcome-to-docker` blieb
unveraendert. RAM-Cleanup: PASS.

Status: **PHASE 7C.6C3B0 LOCAL CODE LOCK / LOCAL_ONLY PRESERVED /
STAGING DEPLOYMENT NOT EXECUTED / STRIPE CALLS 0 / ACTIVATION BLOCKED**.
