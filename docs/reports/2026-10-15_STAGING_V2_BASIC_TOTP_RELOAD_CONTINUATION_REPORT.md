# Staging v2 BASIC TOTP Reload Continuation

Datum: 2026-10-15

Projekt: `mbgveqbhessaunrhfudm`

Host: `https://staging-v2.bonus.wuxuaisbi.com`

Code-Commit: `5fa4095d6f0e333005d7d7e92df62db3d7ba8d20`

Parent: `27bb572bf4ea8ccc13b905fddbe54b54473ac64a`

## Aufgabe

Der Inline-TOTP-Pfad des `PlatformTestOnlyBasicAccessPanel` musste einen
authentifizierungsbedingten Seiten-Reload überstehen, ohne den BASIC-Grant oder
einen anderen Writer auszulösen. Der Fortsetzungsmarker musste kurzlebig,
einmal verwendbar und an die exakte Auth-Identität sowie den exakten Tenant
gebunden sein. Ein Marker allein durfte keine Entscheidung freischalten.

## Exakter Code-Diff

Der Commit umfasst ausschließlich sechs Dateien (`303` Einfügungen,
`6` Löschungen):

1. `src/modules/verification/PlatformTestOnlyBasicAccessPanel.tsx`
2. `src/modules/verification/testOnlyBasicReauthContinuation.mjs`
3. `src/modules/verification/testOnlyBasicReauthContinuation.d.mts`
4. `tests/test-only-basic-reauth-continuity.test.mjs`
5. `tests/test-only-basic-operational.test.mjs`
6. `tests/test-only-basic-operational-ui.browser.local.mjs`

Dateihashes des CODE-LOCK-Stands:

- `44aedf2c2b08b644daeca2e8ee5bf6e069c3808765c90c7b048a733f3e2bbef2`
  – `PlatformTestOnlyBasicAccessPanel.tsx`
- `2fb70732579c98b8be15b7884087aa673e905887f8021d310d1b0e48297edb41`
  – `testOnlyBasicReauthContinuation.mjs`
- `f25cc487b308ef61e86b59795f2948177972728c1944a26db4d57a9c799218b4`
  – `testOnlyBasicReauthContinuation.d.mts`
- `893174e133a0438b2eb4a9a7e0781df453d04ac17873f7d36655eb0849a8bd4d`
  – `test-only-basic-reauth-continuity.test.mjs`
- `222143cac97142099b558a81acdbc4b2b1d9c82a6e8ffba4197490fde54760d3`
  – `test-only-basic-operational.test.mjs`
- `a428b1072ea23b2c0d73b3ffa22a40e0c965df63551ddbbf1dbf084785241950`
  – `test-only-basic-operational-ui.browser.local.mjs`

## Sicherheitsvertrag

- `sessionStorage`-Key:
  `wuxuai.test-only-basic-reauth-continuation`.
- Lebensdauer: exakt zwei Minuten.
- Bindung: `restaurantId`, aktuelle Auth-`identityId`, zufällige UUID und
  Startzeit.
- Der Marker enthält keinen TOTP-Code, Faktor, Token, Cookie oder Passwort.
- Abbruch, Identitätswechsel, Tenantwechsel, Ablauf, fehlgeschlagener
  Readback und Replay entfernen beziehungsweise verwerfen den Marker.
- Der Marker wird erst nach erfolgreichem autoritativem
  `get_platform_test_only_basic_access`-Readback und erneutem
  `supabase.auth.getUser()`-Identitätsabgleich einmalig konsumiert.
- Der Read-RPC ruft unverändert `require_legal_bundle_admin_internal()` auf;
  dieser erzwingt serverseitig `require_recent_platform_auth_internal()` mit
  Live-Session, AAL2, verifiziertem TOTP-Faktor und maximal zehn Minuten alter
  TOTP-AMR.
- Der Marker ruft keinen Writer auf. Die Entscheidung bleibt zusätzlich von
  `recentReadbackPassed` abhängig.
- Es gibt keine Migration und keine ACL-/RLS-Änderung.

## Build und Tests

- Fokussierte Node-Suite: `28/28` PASS.
- Typecheck: PASS (`npm run typecheck`).
- Verpflichtende Gesamtsuite: `2500/2500` PASS, `0` Fehler.
- Build: PASS (`2201` Module, nur bekannte Chunk-Größenwarnung).
- Browser-Flow: PASS in Chromium und WebKit, Desktop/Tablet/Mobile.
- Browser-Reload-Nachweis: `ONE_TIME_PASS`; zweiter Reload `CLOSED`.
- Abbruch: `FAIL_CLOSED`.
- Fehlgeschlagener Recent-TOTP-Readback: `CLOSED`.
- Identitäts-/Tenantwechsel, Ablauf und Replay: PASS/fail-closed.
- `git diff --check`: PASS.
- Secret-Muster im Commit-Diff: keine Treffer.
- Cloudwrites während der lokalen Browsertests: `0`.

Die vollständige Pflichtsuite benötigte für drei lokale HTTP-Tests einen
Sandbox-Lauf mit freigegebenem Loopback. Der erste EPERM war ausschließlich
eine Sandbox-Beschränkung; der vollständige Wiederholungslauf bestand
`2500/2500`.

## Assetmanifest

- Lokale Dateien: `124`.
- Manifest-SHA-256:
  `033d36d3157c4354339b6dd498b054e5d06b9eec0df1ea7c7cfb5bf92b6f9fab`.
- `index.html`:
  `a65e6f3f4334357a48f7704775d9cf3d2261e360265481ff7081363d4e9ae0df`.
- Hauptchunk `index-CQBGeAAs.js`:
  `a0c60f7c2272696ab561ac38576af4e697be9b8d515eabd130555fa9ecd69484`.
- Platform-Chunk `PlatformBusinessVerificationPage-Kol1aDrT.js`:
  `1aa2ffb78e3aae9b5648daa644ce962b03a2f6e6ad9a29a530de7c5f1ad37859`.
- Neue Projekt-Referenz vorhanden; alte Projekt-Referenz: `0`.

Wrangler meldete beim Enumerieren `125`, weil es zusätzlich den virtuellen
Verzeichniseintrag `/assets` protokollierte. Der eigentliche Uploadabgleich
war `73 neu/geändert + 51 bereits vorhanden = 124` Dateien und stimmt damit
mit dem lokalen Manifest überein.

## Hosted-Rollout

- Vorher aktive Version und Rückfallziel:
  `bcf6110c-9c93-456e-9102-8d895f310c1d`.
- Zunächst nur hochgeladene, gelesene Version:
  `61419c67-60f9-4a6c-b125-ce8f0fe1f8d0`.
- Danach kontrolliert zu `100 %` aktiviert.
- Deployment:
  `38b2932b-6ea4-40de-92e1-83c912da2024`.
- `ASSETS` vorhanden; SPA-Fallback aktiv; `serve_directly=false`;
  `raw_run_worker_first=true`.
- Projekt, Backend-, Auth-Issuer-, Access-Issuer-, Access-AUD- und
  Host-Origin-Bindung stimmen mit Staging v2 überein.
- `workers.dev=false`; Preview-URLs deaktiviert.
- Route, Access-Policy, WAF, Supabase, Stripe und Businessdaten wurden nicht
  geändert.

## Hosted-Readback

- Die anonyme Matrix für Root, Customer, Checkout und den echten neuen
  Platform-Assetpfad lieferte für GET/HEAD/POST ausschließlich Cloudflare-
  Access-Redirects (`302`) und für OPTIONS geschlossene Antworten (`400`).
  Keine App- oder Assetbytes wurden anonym ausgeliefert.
- Die autorisierte Owner-Sitzung blieb `PENDING_ACTIVATION`; BASIC ist nur
  vorgemerkt, kein Tarif aktiv, kein Trial gestartet und kein Checkout-Panel
  sichtbar.
- Die autorisierte Platform-Admin-Sitzung lud den exakten neuen Hauptchunk
  `index-CQBGeAAs.js` und den exakten neuen Platform-Chunk
  `PlatformBusinessVerificationPage-Kol1aDrT.js`.
- Der frische BASIC-Readback blieb ohne neue TOTP-Bestätigung geschlossen:
  `Der serverseitige TOTP-Nachweis ist abgelaufen.`
- Der Button `TEST_ONLY BASIC befristet öffnen` war nicht vorhanden.
- Es wurde keine TOTP-Challenge gestartet und kein Fortsetzungsmarker erzeugt.

Eine vollständige nachträgliche Byte-Rückladung aller Cloudflare-Assets ist
hinter Cloudflare Access nicht als Provider-API verfügbar. Nachgewiesen sind
das lokale SHA-256-Manifest, der Wrangler-Uploadabgleich, die unveränderliche
Worker-Version, die exakten gehosteten Chunknamen und der autorisierte
Browser-Readback. Diese Nachweisgrenze wird nicht als vollständiger
Body-Download aller 124 Dateien ausgegeben.

## Rückfall

Bei einer später festgestellten Hosted-Abweichung wird ausschließlich Version
`bcf6110c-9c93-456e-9102-8d895f310c1d` wieder zu `100 %` aktiviert. Access,
Route, WAF und Supabase bleiben dabei unverändert. Der Rückfall wurde in diesem
PASS-Lauf nicht benötigt.

## Nicht ausgeführt

- kein BASIC-Grant,
- kein Checkout oder Stripe-Test,
- kein direkter Ersatz-RPC,
- keine reale Aktivierung,
- keine Migration,
- kein Testevent und kein Businesswrite.

Status: **CODE LOCK / CLOSED HOSTED ROLLOUT PASS**
