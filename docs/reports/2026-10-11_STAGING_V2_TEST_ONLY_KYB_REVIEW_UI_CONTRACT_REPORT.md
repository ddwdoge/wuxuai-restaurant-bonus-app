# Staging v2 – TEST_ONLY-KYB-Review in der Platform-Betriebsprüfung

Datum: 2026-10-11
Checkout: `/private/tmp/wuxuai-staging-v2-access.RHTHJt`
Basis/HEAD: `b8df34614d489110d04836a67a7e09f6ae912920` (`codex/v1-release-integration`)
Status: **CODE LOCK – lokal vollständig geprüft, nicht auf Staging angewendet**

## Aufgabe

Den separaten, synthetischen TEST_ONLY-KYB-Vertrag in die bestehende Platform-Admin-Betriebsprüfung einbinden. Vor jeder Entscheidung müssen Materialrevision, Dokument-ID, Version und SHA-256 der aktuellen GISA- und Gewerbeberechtigungsfassung sichtbar sein. Zwei verschiedene Platform-Identitäten müssen nacheinander mit eigener frischer AAL2/TOTP-Sitzung entscheiden; ein Dokument- oder Revisionswechsel zwischen beiden Schritten muss fail-closed bleiben. Reale KYB-/Legal-Gates, Aktivierung, Trial, PRO, Checkout, Stripe und Versand dürfen nicht verändert werden.

## Gelesene verbindliche Quellen

- `AGENTS.md`
- `docs/00_START_HIER.md`
- `docs/17_CTO_ENTSCHEIDUNGEN.md` (Platform-Admin-, KYB-, AAL2- und TEST_ONLY-Verträge)
- `docs/18_CODEX_REGELN.md`
- `docs/19_CHANGELOG.md` (aktuelle einschlägige KYB-/Platform-Einträge)
- `docs/AI_IMPLEMENTATION_GUARDRAILS.md`
- `docs/V1_CURRENT_CANONICAL_PRODUCT_CONTRACT.md`
- `docs/V1_AUSTRIA_LAUNCH_MASTER_CONTRACT.md`
- `docs/07_WUXUAI_ADMIN.md`
- `docs/14_DATABASE_ARCHITEKTUR.md`
- `docs/23_API_RPC_REGELN.md`
- `docs/24_SECURITY_PRIVACY.md`
- Supabase-Skill und offizielle MFA-/RPC-Dokumentation

## Ursache und notwendige Abweichung vom alten Kandidaten

Der zunächst bytegleiche vierteilige SQL-Kandidat verwendete für `TEST_ONLY_KYB_REVIEW_STALE` den SQLSTATE `40001`. Im echten Browser→PostgREST→DB-Flow wurde ein veralteter zweiter Request dadurch nicht sofort als fachlicher Fehler zurückgegeben, sondern endete reproduzierbar als Gateway-Timeout (`The upstream server is timing out`).

Engste Korrektur:

- beide Stale-Stellen in der Migration: `errcode = '40001'` → `errcode = 'P0001'`;
- statischer Vertragstest verlangt `P0001` und verbietet `40001` für diesen Fehler;
- Fresh-Stack-Test erwartet entsprechend `P0001`.

Danach klassifiziert der vorhandene Frontend-Service die eindeutige Servermeldung sofort als `STALE`. Keine Berechtigung, kein Gate und kein fachlicher Zustand wurde gelockert. Wegen dieser reproduzierten Hosted-Transportabweichung konnten drei der vier ursprünglichen Kandidatendateien nicht bytegleich bleiben; der Upgrade-Test blieb bytegleich.

## Umsetzung

- Neues, klar getrenntes Panel `Synthetischer Prüfpfad` / `Keine reale Freigabe` in der bestehenden Platform-Betriebsprüfung.
- Sichtbarer Readback von Materialrevision, Snapshot-SHA-256 sowie GISA und Gewerbeberechtigung mit Dokument-ID, Fassung und SHA-256.
- Frontend-Service verwendet ausschließlich die beiden engen RPCs `get_platform_test_only_kyb_review` und `decide_platform_test_only_kyb_review`.
- Vor Mutation: Supabase-AAL2-Readback plus TOTP-Methode; die Datenbank prüft Rolle, Projektbindung und TOTP-Frische erneut vor und nach Locks.
- Der zweite Schritt wird für dieselbe Identität blockiert. Request-ID bleibt bei einem unklaren identischen Retry stabil.
- Reale Betriebsprüfung bleibt darunter separat und unverändert.
- Mobile-, Tablet- und Desktopdarstellung ohne horizontales Überlaufen.

## Exakter gemeinsamer Migrations-/UI-Commit-Scope

| Datei | Zeilen | SHA-256 |
| --- | ---: | --- |
| `supabase/migrations/20261011164421_test_only_kyb_review_contract.sql` | 595 | `8b6d1515fd1a59e6e6eff764223134e4d1d4ac776e7228d228816fff85005039` |
| `tests/test-only-kyb-review-contract.test.mjs` | 94 | `90ee5442a8725c7e17082afcb53f267a449efd7427d5ffe75a9ed56ae73b508b` |
| `tests/test-only-kyb-review.local.mjs` | 376 | `aea5a2133bacc3ee3c88eadf9f7934681232425d26c077731bbc5dc9847641ef` |
| `tests/test-only-kyb-review-upgrade.local.mjs` | 94 | `885ae86bb8d05dd7c6778bf2d7148fd70aedee70c77fe4c39ccd077328391a9a` |
| `src/modules/verification/testOnlyKybReviewService.ts` | 157 | `07b246953806146f89fee1202b66caf45927b2565f37c95e726cf719499d9324` |
| `src/modules/verification/PlatformTestOnlyKybReviewPanel.tsx` | 160 | `796e3c26b26c3095f1228072846f2e4dee804bde50eddcf70b52ce61e392bd55` |
| `src/modules/verification/PlatformBusinessVerificationPage.tsx` | 209 | `f11ffbaf1a82cb2cb6079475a2acc719ff77f5fcbedd9a19f9fa8f74657f27be` |
| `src/modules/verification/platform-business-verification.css` | 55 | `1c730c5d1651ab6e3635409f3414afec7a9d2279803849799248417a49ab5e88` |
| `tests/test-only-kyb-review-ui.test.mjs` | 63 | `27f0caca7d9ac378a616ebc88618a7b4f2b8614ba668ef089c2c80e6a34e42fb` |
| `tests/test-only-kyb-review-ui.browser.local.mjs` | 473 | `28f48f1ae9e322d592c51c96852fc3e44f2c0c5794165c0b66588c44435114c0` |

Zu einem späteren gemeinsamen Commit gehören zusätzlich ausschließlich dieser Bericht und sein neues SHA-256-Manifest. Die bereits vorhandenen Access-Berichte/-Manifeste und der ältere, durch die SQLSTATE-Korrektur überholte reine Vertragsreport/-manifest gehören **nicht** in diesen Scope.

## Migration und RPCs

Migration erstellt/geändert: **Ja**, lokal.
Auf Staging angewendet: **Nein**.
`supabase db push`: **Nicht ausgeführt**.
Cloud-/Staging-Writes: **0**.

Der Vertrag bleibt separat:

- private, RLS-geschützte, policylose und unveränderliche Tabellen `test_only_kyb_review_receipts` und `test_only_kyb_review_audit`;
- nur zwei authentifizierte RPC-Einstiege;
- exakte Projekt-, Issuer- und Originbindung;
- exakt zwei aktuelle `UPLOADED`-Dokumente;
- identische Materialrevision, IDs, Versionen, Hashes und Snapshot-Hash über beide Identitäten;
- atomare Receipt-/Audit-Schreibung, Actor-gebundener Replay und Locks gegen Parallelität/Owner-Upload;
- keine reale `VERIFIED`-Entscheidung und kein gemeinsamer Readiness-Grant.

## Lokale Prüfungen

- Fokussierte statische Vertrags-/UI-Suite: **11/11 PASS**.
- Vollständige Repository-Suite nach finalen UI-Bytes: **2422/2422 PASS**.
- Typecheck: **PASS**.
- ESLint: **0 Fehler**, 9 unveränderte Bestandswarnungen; keine Warnung in den neuen Dateien.
- Production-Build: **PASS**, 2184 Module; bestehende Chunkgrößenwarnung bleibt.
- Supabase DB-Lint `public`, Level `error`: **0 Befunde**.
- Fresh-Stack-Matrix: **PASS** – 2 Receipts, 2 Auditereignisse, 2 Identitäten, 8 parallele gleiche Requests = 1 Write + 7 idempotente Replays, fremder Request abgewiesen, Rollback ohne Receipt/Audit.
- Upgrade-Test: **PASS** – bestehender Zustand bytegleich, keine Seed-Receipts/-Audits, reale Resolverdefinitionen unverändert, Environment `DISABLED`, reales AT-Intake `BLOCKED`, Kataloglimit `1`.
- Browser-E2E: **PASS** in Chromium und WebKit.
  - reguläre Owner-Registrierung, geschützter TEST_ONLY-Marker, synthetischer Intake und private Uploads ausschließlich über Produktpfade;
  - zwei getrennte GoTrue-Identitäten mit realer TOTP-AAL2-Sitzung;
  - zwei vollständige UI-Entscheidungsfolgen, Reload und idempotenter Replay;
  - 390 px, 768 px und 1280 px ohne horizontalen Overflow;
  - fremde Identität: keine Tenantdaten/Detailaktion/TEST_ONLY-UI und RPC `42501`;
  - regulärer GISA-v4-Upload zwischen den Schritten: eingefrorener zweiter Snapshot sofort `STALE`, kein zweites Receipt.

Lokale aktuelle v3-Dokument-IDs sind absichtlich zufällig erzeugte Wegwerfstack-IDs. Die Bytes entsprachen exakt:

- GISA: `4149eb645a8218fa9a8a0de49002b502ebfbaa1b30be94ad244f85bb26c96a96`
- Gewerbeberechtigung: `c02b1eabe2d3c4b316521d42e8e254906c72463f6efe292407f73aab99f52918`

## RLS/Security und unveränderte alte Logik

- RLS, Grants, SECURITY-DEFINER-`search_path`, Tenant-/Organisation-/Branchbindung und Runtime-Projektbindung geprüft.
- Keine Rolle aus `user_metadata`; keine Service Role im Produktfrontend.
- Keine direkten Tabellenwrites im Browser-Harness; Registrierung, Marker, Intake und Upload liefen über vorhandene geschützte Produktverträge.
- Fremdrolle und gleicher Erstprüfer bleiben fail-closed.
- Resolver und Writer der realen KYB-/Legal-Prüfung wurden nicht geändert.
- Restaurant bleibt `PENDING_ACTIVATION`; reale KYB bleibt unverifiziert.
- Reales AT-Intake bleibt `BLOCKED`; V1-Katalog bleibt gesperrt.
- Trial-, PRO-, Checkout- und Mailzähler blieben `0`.
- Keine Aktivierung, Zahlung, Stripe-Aktion oder Nachricht.

## Hosted-Gates vor einem späteren Rollout

1. Frischen Remote-Tip und diesen exakten Scope/Manifest erneut prüfen.
2. Migration `20261011164421` allein auf `mbgveqbhessaunrhfudm` anwenden; keine andere ungeprüfte Migration darf mitlaufen.
3. Projektbinding, Issuer `https://mbgveqbhessaunrhfudm.supabase.co/auth/v1`, Origin `https://staging-v2.bonus.wuxuaisbi.com`, Environment `STAGING`, reales AT-Intake `BLOCKED` und Katalogsperre lesen.
4. UI-Assets mit den autoritativen öffentlichen Projektwerten neu bauen, hashen und hinter unverändertem Cloudflare Access ausrollen.
5. Gehosteten Readback für genau GISA v3 `26a876f3-ebaf-4313-85b7-9a2a83da1070` und Gewerbeberechtigung v3 `c4c515f5-0864-4ae0-8336-d318cfc88c80` samt Version und den oben genannten Hashes prüfen.
6. Erst dann zwei bestehende, getrennte Platform-Identitäten jeweils mit eigener frischer TOTP-AAL2-Sitzung verwenden; zwischen den Schritten erneut Revision/Dokumentmanifest lesen.
7. Bei jeder Abweichung keine zweite Entscheidung, keine reale Freigabe und keine Aktivierung ausführen.

Die gehosteten Dokument-IDs, Hosted-Migration, Workerbytes und echten Hosted-AAL2-Sitzungen wurden in diesem Paket bewusst nicht getestet. Daher kein FINAL LOCK.

## Nicht geändert

- Kein Staging-/Cloudwrite, Deployment oder Commit.
- Keine Cloudflare-, Access-, WAF- oder Workeränderung.
- Keine reale KYB-/Legal-Freigabe.
- Keine Aktivierung, Trial-, PRO-, Checkout-, Stripe- oder Mailaktion.
- Keine fremden Worktree-Dateien berührt.

## Ergebnis

- Aufgabe: Lokale Platform-UI-Anbindung des separaten TEST_ONLY-KYB-Vertrags
- Build: Ja
- Migration: Erstellt/geändert, lokal Fresh/Upgrade geprüft, nicht auf Staging angewendet
- Flow-Test: Ja, Chromium und WebKit, Mobile/Tablet/Desktop
- RLS/Security: Ja, lokal
- Alte Logik geprüft: Ja, reale Resolver und Gates unverändert
- Offene Risiken: ausschließlich die oben genannten Hosted-Gates
- Status: **CODE LOCK**

Empfohlenes Modell für den späteren sicherheitskritischen Rollout: **GPT-6 Astra – High**.
