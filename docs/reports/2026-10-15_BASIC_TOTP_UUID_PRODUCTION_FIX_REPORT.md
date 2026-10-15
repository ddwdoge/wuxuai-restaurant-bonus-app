# BASIC-TOTP-Fortsetzungsmarker: Production-UUID-Fix

Datum: 2026-10-15

Projekt: `mbgveqbhessaunrhfudm`

Host: `https://staging-v2.bonus.wuxuaisbi.com`

Code-Commit: `14a21cf6c0b0c80a13b3308e06680b559715c01c`

Parent: `45dc3adf579bd85b40bf31c05cbb60cd263e3201`

## Aufgabe

Ausschließlich den `ReferenceError: o is not defined` beim Erzeugen des
kurzlebigen BASIC-TOTP-Fortsetzungsmarkers beheben. Der serverseitige
Recent-TOTP-Guard, Grant-Vertrag, Checkout-Vertrag und sämtliche realen Gates
durften nicht geändert oder aufgerufen werden.

## Gelesene Vertragsdateien

- `AGENTS.md`
- `docs/00_START_HIER.md`
- `docs/17_CTO_ENTSCHEIDUNGEN.md`
- `docs/18_CODEX_REGELN.md`
- `docs/19_CHANGELOG.md`
- `docs/AI_IMPLEMENTATION_GUARDRAILS.md`
- `docs/reports/2026-10-15_STAGING_V2_BASIC_TOTP_RELOAD_CONTINUATION_REPORT.md`

## Ursache

Der echte alte Production-Chunk
`PlatformBusinessVerificationPage-Kol1aDrT.js` enthielt für den optionalen
Aufruf im Default-Parameter
`globalThis.crypto?.randomUUID?.()` einen minifizierten Receiver-Aufruf über
eine nicht deklarierte Variable. Die Exception entstand vor dem TOTP-Aufruf.
Es wurde dadurch weder ein TOTP bestätigt noch ein Grant oder Checkout
geschrieben.

## Geänderte Dateien

1. `src/modules/verification/testOnlyBasicReauthContinuation.mjs`
2. `tests/test-only-basic-reauth-continuity.test.mjs`
3. `tests/test-only-basic-operational-ui.browser.local.mjs`

Dateihashes des geprüften Stands:

- `a436fa410c14a970f95c7d6e2cad52e5b2cdfe772f77a3f0668c8c04435221fd`
  – Marker-Modul
- `637ec391f55ad8e61abbcf138bd55f24da3d2a18a429c291a872b7ccf67378ad`
  – fokussierter Vertragstest
- `9fec7e80368ef5e6ffe44e36a09204dc8f133cdf07e4b8c10f221b91209b11cb`
  – Production-Browsertest

## Was wurde geändert

- UUID-Erzeugung aus dem Default-Parameter entfernt.
- `crypto.randomUUID()` wird mit festem Web-Crypto-Receiver aufgerufen.
- Browser ohne `randomUUID()` verwenden einen kryptografisch sicheren
  RFC-4122-v4-Fallback auf Basis von `crypto.getRandomValues()`.
- Fehlt Web Crypto vollständig, bleibt der Markerpfad fail-closed.
- Der Production-Browsertest erzeugt den Marker über die echte minifizierte
  UI, prüft die UUID und den einmaligen Reload-Pfad in Chromium und WebKit.
- Abbruch, Identitätswechsel und Replay bleiben fail-closed.

## Was wurde nicht geändert

- keine Migration
- keine Datenbankfunktion, ACL oder RLS
- kein serverseitiger Recent-TOTP-Guard
- keine Grant-, Checkout-, Stripe-, Access-, WAF- oder Routenregel
- kein TOTP, Grant, Checkout oder Testevent im Hosted-System

## Build und Tests

- Fokussierte Suite: `8/8` PASS.
- Typecheck: PASS.
- Lint: PASS, `0` Fehler; acht bereits vorhandene Warnungen.
- Verpflichtende Gesamtsuite: `2502/2502` PASS.
- Production-Build: PASS, `2201` Module.
- Chromium: Markeranlage, Reload, Abbruch, Identitätswechsel und Replay PASS.
- WebKit: Markeranlage, Reload, Abbruch, Identitätswechsel und Replay PASS.
- Desktop, Tablet und Mobile ohne horizontalen Overflow.
- `git diff --check`: PASS.
- Secret-Muster im Commit-Diff: keine Treffer.

## Assetprüfung

- Dateien: `124`.
- Manifest-SHA-256:
  `c1718d3a9288084e55973289cec1d80d8736e8320e16d069c89782f0be030af5`.
- `index.html`:
  `698d475e9be5345872564796fafc1f8648c57de65f62167ace511a17c368b676`.
- Platform-Chunk:
  `PlatformBusinessVerificationPage-Zzy5w5t3.js`.
- Platform-Chunk-SHA-256:
  `8c1d898682b1b41a1c9eac58c81402730bc5d46d748213763a6f0e52f32a1fdb`.
- Der minifizierte Chunk enthält `randomUUID`, `getRandomValues` und den
  fail-closed Fehlercode; das alte ungebundene `.call(...)`-Muster fehlt.
- Einzige eingebettete Supabase-Projektreferenz:
  `mbgveqbhessaunrhfudm.supabase.co`.

## Staging-Ergebnis

- Worker-Version:
  `522ee7c7-0df6-4b90-8f5b-d1410ce968a5` bei `100 %`.
- Deployment:
  `0d85b816-3874-4986-b374-14d938682c30`.
- Rückfallversion:
  `61419c67-60f9-4a6c-b125-ce8f0fe1f8d0`.
- `ASSETS`, App-Origin, Access-Issuer und Access-AUD stimmen hashgleich mit
  der vorherigen Version überein; `run_worker_first` bleibt aktiv.
- Das frische authentifizierte Browser-Tab lädt den neuen Platform-Chunk und
  meldet keine Konsolenfehler. Es wurde kein Hosted-TOTP ausgelöst.
- Anonym liefern Root, Customer, Checkout und der neue Assetpfad für
  GET/HEAD/POST ausschließlich Access-Redirects (`302`) und für OPTIONS
  `403`; keine App- oder Assetbytes wurden anonym ausgeliefert.

## Geschlossener Hosted-Readback

- BASIC-Grant: inaktiv; der letzte Beleg ist abgelaufen.
- Restaurant: `draft` / `pending_activation`.
- isolierte Checkout-Requests/Events/Audits: `0/0/0`.
- reale Paid-Acceptances, Entitlements, Trial-Claims und Subscription-Wirkung:
  jeweils `0`.
- reales AT-Intake: `BLOCKED`.

## Risiken

Keine offene Abweichung im beauftragten Scope. Der eigentliche Hosted-TOTP-
Submit wurde absichtlich nicht erneut ausgeführt; die Fehlerfreiheit wurde
durch den erfolgreichen Production-Browserflow, die geprüften minifizierten
Bytes, den bytegleichen Uploadpfad und das frische fehlerfreie Laden des neuen
Hosted-Chunks nachgewiesen.

## Status

`LOCK`
