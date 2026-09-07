# Active Staging i18n Source Recovery Report

Date: 2026-09-08

## Ursache

The active Staging Worker contained the completed seven-language i18n, unified UI,
legal-jurisdiction, and Kassa Compliance source state while authoritative `main`
still ended at `e1a758221b73ca55f3f36ff51be29a7a29535a7b` without that source.
Deploying the separate offer-limit UI fix from that older baseline would therefore
have overwritten the active Staging application with incomplete source.

## Source provenance

- Worker: `wuxuai-restaurant-bonus-app-staging`
- Active deployment/version: `410be00d-acf9-4778-b2b8-f40e25b9478d`
- Deployment timestamp: `2026-09-06T21:40:54.944Z`
- Cloudflare source metadata: `Unknown (deployment)`; no Git commit SHA was recorded.
- Original source worktree: `/private/tmp/wuxuai-i18n-legal`
- Original branch: `codex/i18n-legal-architecture`
- Original base: authoritative `main` at `e1a758221b73ca55f3f36ff51be29a7a29535a7b`
- Recovery evidence: complete local Codex patch history, translation checkpoints,
  historical source reconstruction, and deterministic comparison with the active
  Staging JavaScript assets.

The source was recovered from the original source-level patch history. Minified
assets were used only as an independent parity check and to recover the exact
generated catalog values where no committed source existed.

## Recovered scope

The pre-report recovery contains 92 source-controlled files:

- Runtime/source: 46 files
- Direct tests: 22 files
- Documentation and prior verified reports: 14 files
- Audit/build scripts: 7 files
- Exact Staging-applied migrations: 3 files
- Unrelated files: 0

The separate offer-limit fix files are not included in this recovery branch.

Recovered functionality includes:

- DE / EN / FR / IT / ES / ZH / KO catalogs with 2,254 keys per locale
- Language selector, explicit preference, device-language resolution, and EN fallback
- Unified UI primitives and responsive/CJK-safe styling
- Legal jurisdiction architecture without translated legal-document bodies
- Kassa Compliance V3 and isolated test-tenant cleanup contract
- Existing Platform Admin integrations and direct regression evidence

## Translation integrity

- Completed translations were preserved; Google Translate was not called.
- Catalog key parity: PASS
- Protected placeholder integrity: PASS
- German leakage in EN / FR / IT / ES / ZH / KO: 0
- User-visible unclassified strings in the frozen audit: 0
- Canonical `WUXUAI® Bonus`, BASIC, PRO, and PREMIUM labels: preserved
- Legal document bodies: not externally translated and not introduced here

## Migration reconciliation

Staging migration history is represented through the latest remote version:

- `20260906001000_i18n_legal_jurisdiction_architecture.sql`
  SHA-256 `0c1c4a33b8611ab5a13cde6ecf8cf82e7fae5c4b5714503fd91a6a18ddafed00`
- `20260906002000_kassa_compliance_v3.sql`
  SHA-256 `152cebb01dbef476ab1217bb0606843af30eadd5722e36dcb99b3712678d3740`
- `20260907001000_kassa_test_tenant_cleanup_contract.sql`
  SHA-256 `ec38ce39d61e6c4f7853a06af28328a4a516a0ef5d23c87888d8cfc1a512d732`

Read-only Staging verification:

- Migration list: local/remote aligned through `20260907001000`
- Migration dry-run: up to date, zero pending migrations
- DB linter at error level: zero findings
- Migration execution during recovery: none

## Verification

- Focused i18n/unified UI tests: 33/33 PASS
- Platform Admin tests: 53/53 PASS
- Kassa/legal/cleanup tests: 22/22 PASS
- Full tests: 1,344/1,344 PASS
- Typecheck: PASS
- Lint: PASS (0 errors; 9 pre-existing warnings)
- Staging-configured production build: PASS
- Secret scan: PASS
- `git diff --check`: PASS

## Was nicht geändert wurde

- No Production repository, Worker, DNS, Supabase, Auth, RLS, tenant data, or secrets
- No Staging database mutation or migration replay
- No Google translation request
- No offer-limit UI change mixed into the recovery branch
- No credentials, build output, temporary worktree files, or test data included

## Risiken und nächster Schritt

Cloudflare did not retain a source commit SHA for the active manual deployment.
The exact source state is therefore proven through the source patch history and
active-asset parity rather than a historical commit object. The recovery must be
merged before the separate three-file offer-limit fix is rebased and deployed to
Staging.

Status: LOCK for source recovery. Staging FINAL LOCK remains pending the separate
offer-limit deployment and physical seven-language verification.
