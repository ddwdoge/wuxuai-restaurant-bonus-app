# WUXUAI Bonus – Stale Deployment Chunk / Blank Screen Recovery

Datum: 2026-08-26  
Branch: `codex/v1-canonical-recovery`  
Ausgangscommit: `044b10071209c454b28f82a0ab14e3682d44d1fc`  
Production: `LOCKED`  
Stripe: `DEFERRED`

## Ursache

Ein vor einem neuen Cloudflare-Deployment geöffneter Browser-Tab verwies noch
auf den nicht mehr vorhandenen Lazy-Chunk
`/assets/AdminDashboard-BaeUb8ST.js`. Die Cloudflare-Einstellung
`not_found_handling: single-page-application` beantwortete auch diesen
fehlenden statischen Assetpfad mit `HTTP 200`, `Content-Type: text/html` und
dem Inhalt von `index.html`. Der Browser verweigerte die HTML-Antwort als
JavaScript-Modul und React erhielt einen abgelehnten dynamischen Import. Ohne
globalen Recovery-Guard blieb die Anwendung leer.

Vor der Reparatur:

- alter Chunk: `AdminDashboard-BaeUb8ST.js`
- damaliger aktueller Chunk: `AdminDashboard-v3rtux2o.js`
- fehlender Assetstatus: `HTTP 200`
- fehlender Assettyp: `text/html`
- SPA-Fallback für `/assets/*`: aktiv und ursächlich
- Index-Cache: `public, max-age=0, must-revalidate`
- Hash-Asset-Cache: `public, max-age=0, must-revalidate`

## Geänderte Dateien

- `src/app/deploymentRecovery.mjs`
- `src/app/deploymentRecovery.d.mts`
- `src/main.tsx`
- `worker/index.mjs`
- `wrangler.jsonc`
- `tests/deployment-stale-chunk-recovery.test.mjs`
- `docs/19_CHANGELOG.md`
- dieser Bericht

## Was wurde geändert

### Cloudflare-Assetvertrag

Ein kleiner Worker sitzt vor den statischen Assets:

- echte vorhandene SPA-Routen bleiben `HTTP 200 text/html`;
- eine als HTML aufgelöste Anfrage unter `/assets/*` wird zu
  `HTTP 404 text/plain`;
- fehlende Assets erhalten `Cache-Control: no-store`;
- vorhandene Hash-Assets erhalten
  `Cache-Control: public, max-age=31536000, immutable`;
- HTML erhält `Cache-Control: no-cache, must-revalidate`;
- alle Antworten erhalten `X-Content-Type-Options: nosniff`.

### Browser-Recovery

Vor dem React-Render wird ein globaler Guard installiert:

- `vite:preloadError` wird kontrolliert abgefangen;
- ausschließlich bekannte Dynamic-Import-/Chunk-Fehler werden zusätzlich über
  `error` und `unhandledrejection` erkannt;
- der erste Fehler speichert einen kurzlebigen buildbezogenen Versuch und lädt
  die Seite einmal neu;
- derselbe Fehler desselben Builds innerhalb von 30 Sekunden lädt nicht erneut,
  sondern zeigt den sicheren deutschen Aktualisierungszustand;
- der neue Build entfernt den alten Guard nach erfolgreicher Initialisierung;
- der CTA `Jetzt aktualisieren` erlaubt einen bewussten weiteren Versuch;
- `pageshow` mit `persisted = true` vergleicht das geladene Entry-Asset mit
  einem nicht gecachten aktuellen Dokument und lädt nur bei nachgewiesenem
  Buildwechsel neu;
- das aktuelle Entry-Asset wird sicher als `data-wuxuai-build` exponiert.

## Was wurde nicht geändert

- keine Businesslogik
- keine Rollen- oder Portalzuordnung
- keine Supabase-Abfrage
- keine RLS-Policy
- keine RPC- oder Datenbankmigration
- keine Punkte-, Referral-, Reward- oder Angebotslogik
- keine Service-Role im Browser
- kein neuer Service-Worker-Cache

`public/sw.js` besitzt weiterhin nur Push- und Notification-Click-Listener und
keinen `fetch`- oder Asset-Cache-Handler.

## Auth-Einordnung

Der beobachtete `refresh_token`-Fehler `400` ist getrennt vom White Screen. Der
vorhandene Auth-Guard erkennt ungültige beziehungsweise wiederverwendete
Refresh-Tokens, versucht `signOut({ scope: "local" })`, entfernt den
projektbezogenen Auth-Storage auch bei Sign-out-Fehlern und navigiert genau
einmal zum passenden Login.

Ein Server-Logout `403` blockiert die lokale Bereinigung nicht: Der reguläre
Logout versucht anschließend den lokalen Sign-out und entfernt im `finally`
den lokalen Auth-Zustand. Diese Logik wurde nicht verändert.

## Lokale Verifikation

- fehlender Chunk: `404 text/plain`, `no-store`
- `/admin`: `200 text/html`, `no-cache, must-revalidate`
- vorhandenes Hash-Asset: `200 text/javascript`, ein Jahr `immutable`
- automatisierte neue Tests: 6/6 bestanden
- vollständige autoritative Tests: 1007/1007 bestanden
- Typecheck: bestanden
- Lint: 0 Fehler, 7 bestehende Warnungen
- Build: bestanden
- Wrangler Dry Run: bestanden mit Node 22
- `git diff --check`: bestanden
- Secret Scan: keine Zugangsdaten oder privaten Schluessel im Aenderungsumfang

## Staging-Ergebnis

Erste Guard-Aktivierung:

- Version: `44ee8052-ad08-472d-b63a-36732a970698`

Finaler kontrollierter Hashwechsel:

- Version: `ee1af7af-2ccb-4c3c-9548-bc39ce01717f`
- Entry vor Hashwechsel: `index-D-flLFyY.js`
- Entry danach: `index-DojKTL-l.js`
- alter Lazy-Chunk: `RegisterPage-WchaNm8C.js` → `HTTP 404`
- aktueller Lazy-Chunk: `RegisterPage-Dm0g-jM1.js`

Ein bereits offener Guard-fähiger Startseiten-Tab navigierte nach dem finalen
Deployment clientseitig zu `/register`. Der veraltete Lazy-Import schlug fehl,
der Guard lud automatisch genau einmal das aktuelle Dokument und zeigte danach:

- URL: `/register`
- Build: `index-DojKTL-l.js`
- Überschrift: `Restaurant starten`
- White Screen: nein
- manueller Refresh: nicht erforderlich
- Reload-Schleife: nein

Finale bereinigte Auslieferung des Repository-Stands:

- Cloudflare-Version: `f410b260-2f78-4201-9503-584053c57fac`
- Entry: `index-C3xA-i_L.js`
- Admin-Chunk: `AdminDashboard-B5uXr6xo.js`
- `/assets/AdminDashboard-BaeUb8ST.js`: `HTTP 404`, `text/plain`, `no-store`
- aktuelles Entry- und Admin-Asset: `HTTP 200`, `text/javascript`, ein Jahr
  `immutable`
- `/` und `/register`: `HTTP 200`, `text/html`, `no-cache, must-revalidate`
- frischer Browseraufruf `/register`: Build `index-C3xA-i_L.js`, Ueberschrift
  `Restaurant starten`, kein leerer Bildschirm

Die nur fuer den kontrollierten Hashwechsel verwendete Markierung am
Registrierungsformular wurde vor dieser finalen Auslieferung vollstaendig
entfernt und ist nicht Teil des Aenderungsumfangs.

## Offene Live-Gates

Der globale Codepfad gilt für alle Portale und ist automatisiert geprüft. Für
einen **FINAL LOCK** fehlen jedoch noch getrennte echte Alt-Tab-Sitzungen für:

- authentifizierten Owner
- authentifizierten Staff
- authentifizierten Customer
- authentifizierten Platform Admin
- physisches iPhone Safari mit altem Tab

Diese Sitzungen dürfen nicht durch Test-Metadaten oder Rollenbypässe ersetzt
werden.

## Risiken

- Die erste Auslieferung des Guards kann naturgemäß keine Tabs reparieren, die
  bereits vor dieser Guard-Version geöffnet wurden; jede folgende Version ist
  geschützt.
- Ein wiederholt inkonsistentes Deployment zeigt bewusst die sichere
  Aktualisierungsseite statt einer Reload-Schleife.
- Offline- und normale Netzwerkfehler lösen keine automatische
  Stale-Chunk-Bereinigung aus.

## Status

`CODE LOCK / STAGING TECHNICALLY VERIFIED`

`FINAL LOCK` bleibt bis zu den fünf physischen beziehungsweise
rollenbezogenen Alt-Tab-Gates offen.

## Finale Klassifikation

```text
ROOT CAUSE:
Cloudflare SPA-Fallback lieferte fuer fehlende /assets/*.js die index.html mit
HTTP 200 und text/html; ein alter Tab konnte den ersetzten Vite-Lazy-Chunk
deshalb nicht als JavaScript-Modul laden.

STALE CHUNK CONFIRMED: YES
OLD ASSET RETURNS HTML: YES BEFORE / NO AFTER
ASSET SPA FALLBACK FIXED: PASS
VITE PRELOAD ERROR RECOVERY: PASS
GENERIC DYNAMIC IMPORT RECOVERY: PASS
RELOAD LOOP PROTECTION: PASS
SAFE UPDATE UI: PASS
INDEX CACHE HEADERS: PASS
HASHED ASSET CACHE: PASS
REFRESH TOKEN 400 HANDLING: PASS
LOGOUT 403 CLEANUP: PASS
OWNER OLD TAB AFTER DEPLOY: NOT LIVE TESTED
STAFF OLD TAB AFTER DEPLOY: NOT LIVE TESTED
CUSTOMER OLD TAB AFTER DEPLOY: NOT LIVE TESTED
PLATFORM ADMIN OLD TAB AFTER DEPLOY: NOT LIVE TESTED
BLANK SCREEN: NO IN CONTROLLED LIVE OLD-TAB TEST
MANUAL REFRESH REQUIRED: NO IN CONTROLLED LIVE OLD-TAB TEST
IPHONE SAFARI OLD TAB: NOT LIVE TESTED
BUSINESS LOGIC CHANGED: NO
DB MIGRATION: NONE
TESTS: 1007/1007 PASS
DEPLOYMENT STALE-CHUNK RECOVERY READY: NO - PHYSICAL ROLE GATES OPEN
GLOBAL POST-LOGIN HYDRATION FINAL LOCK: NO
PRODUCTION: LOCKED
STRIPE: DEFERRED
```
