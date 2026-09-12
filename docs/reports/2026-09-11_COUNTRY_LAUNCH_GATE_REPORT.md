# Country Launch Gate - Staging technical gate

Date: 2026-09-11
Status: PHYSICAL AUSTRIA ONBOARDING READY; no FINAL LOCK.

## Cause and scope

The existing Owner trial path could create the tenant before an explicit launch
country was validated. A generic server launch policy now protects creation and
completion independently of UI selection, locale, or Customer location.

This is the Country report only. Existing PRO Phase 1 evidence remains separate.
The Founder changed execution order: do not complete the isolated Owner onboarding
until Country technical readiness is verified, then use one Founder-driven AT
TEST_ONLY onboarding for two separate final acceptance reports.

## Changed files

- `supabase/migrations/20260911004000_country_launch_gate.sql`
- `src/modules/onboarding/countryLaunchService.ts`
- `src/modules/onboarding/LaunchCountrySelect.tsx`
- `src/modules/onboarding/pilotOnboardingService.ts`
- `src/modules/auth/RegisterPage.tsx`
- `src/modules/auth/registerOwnerService.ts`
- `src/modules/admin/pages/RestaurantOnboarding.tsx`
- `src/modules/platform/PlatformCountryLaunchPanel.tsx`
- `src/modules/platform/PlatformAdminPage.tsx` (Country panel integration only)
- `src/shared/i18n/countryLaunchMessages.mjs`
- `src/shared/i18n/catalog.mjs` (Country copy integration only)
- `src/styles.css` (Country section styles only)
- `tests/country-launch-gate.test.mjs`
- `tests/country-launch-gate.sql`
- `tests/country-launch-staging-rollback.sql`
- `tests/existing-customer-owner-registration.test.mjs`
- `tests/owner-email-confirmation-password-reset.test.mjs`
- `docs/V1_CURRENT_CANONICAL_PRODUCT_CONTRACT.md`
- `docs/19_CHANGELOG.md`
- this report

The worktree also contains prior, uncommitted PRO changes. Those were preserved;
this report does not claim that the whole worktree is Country-only. No Git commit
or push was performed. Applied PRO migrations were not changed.

## Implementation

AT is the only initially enabled policy row. DE/CH/FR/IT/ES are disabled rows.
The validator is generic, requires an explicit ISO country and rejects unknown
or disabled rows. No Customer geographic/IP restriction was introduced.

Private transaction context authorizes canonical organization/restaurant/branch
creation and final onboarding. Trial/subscription, legal profiles and Kassa
acknowledgement receive tenant-country guards. Browser DML and country-less
internal delegates cannot bypass them. Existing admitted businesses are retained;
existing Owner resume returns existing data without resetting a trial.

Platform country control uses canonical platform authority, exact entity-bound
confirmation, mandatory reason, stable request ID, collision rejection and an
immutable retained audit. RLS is enabled on all four new tables, without direct
anon/authenticated writes. No provider secrets or new credentials are introduced.

## Automated evidence

- Node focused Country tests: 12/12 PASS.
- Full repository tests: 1472/1472 PASS, no skips or failures.
- Local PostgreSQL Country matrix: 38/38 PASS against final migration source.
  Local synthetic fixtures also execute the prior subscription-lock matrix.
  The local onboarding delegate models completion; it is not physical legal
  acceptance evidence.
- Actual Staging PostgreSQL: 36/36 checks PASS, entirely rolled back, including
  real AT canonical trial creation/idempotency and disabled/missing-country,
  direct-write, private-RPC, owner-access, confirmation and audit controls.
- Disabled-country activation/restoration was tested only locally. The Staging
  Platform test repeated AT=true, never enabled any blocked country, and rolled
  back the audit/fixture along with the complete transaction.
- Typecheck: PASS.
- Lint: PASS, zero errors and nine pre-existing warnings.
- Build: PASS, existing large-chunk warning only.
- DB linter with `--linked --level warning --fail-on error`: PASS, zero errors,
  31 existing warnings; no Country function lint findings.
- RLS/table grants: four new tables protected, no anon/authenticated DML grants.
- REST checks: 4/4 PASS. Public six-country list: HTTP 200; anonymous policy RPC,
  direct policy-table PATCH and anonymous Owner trial: HTTP 401. No business
  write occurred. Deployed public binding resolves only to Staging.
- Secret pattern scan: 54 changed/untracked files (including local Wrangler
  artifacts), zero findings
  for private keys, service-role JWTs, secret Stripe/Supabase keys or credential
  connection strings. This is a scoped pattern scan, not an external audit.
- `git diff --check`: PASS.

## Migration and deployment

- Verified Staging ref: `bwhvfjuwixgwduoeqaya`.
- Pre-dry-run: exactly one pending migration, `20260911004000`.
- Applied exactly `20260911004000_country_launch_gate.sql` to Staging.
- Migration SHA-256: `6cf5b10b52edb06e6a1137a217ee88fe2af17b092f8dacf408cefd9bb98d67e3`.
- History after apply: 145/145; post-dry-run: zero pending.
- Worker: `wuxuai-restaurant-bonus-app-staging`.
- Initial deployment: `f464629c-b083-44cc-9c59-2cd1bebbe34f`.
- Current deployment after the narrow Country-dialog touch-target correction:
  `f9b846f7-cf9c-4062-92c5-c6408101411e`.
- The applied migration remains byte-identical; no migration was reapplied.
- Build binding explicitly checked against Staging; public anon credential was
  handled in memory and never printed. No Production value used for deployment.

## Data preservation

No existing restaurant/customer/subscription row was edited by this task.
Before/after aggregate counts: 16 restaurants, 16 organizations, 16 branches,
16 subscriptions. The protected shared tenant retains 13 guests. The isolated
test onboarding remains `draft`; no step was submitted or completed. Synthetic
Staging Auth rows and private transaction context rows remaining: zero.

A broad data-derived checksum query was blocked by the safety reviewer and was
not executed. Evidence is limited to authorized counters, the isolated status,
rollback tests and inspection of migration writes, not a full business-data dump
or all-record byte-identity claim. A temporary registration browser navigation
redirected to the existing Owner onboarding; the tab was closed without editing
or submitting anything.

Production DB/Auth/RLS/configuration, real businesses, Stripe, shared points,
Premium, Customer QR/points/gifts and existing legal wording remain unchanged.
No fabricated address or professional/legal acceptance was supplied.

## Physical Platform Admin and responsive evidence

After reconnecting Chrome, the authorized Staging Platform Admin page was read
successfully. It displays Austria active and Switzerland, Germany, Spain,
France and Italy prepared/blocked. The existing isolated tenant remains setup
incomplete; its Admin plan panel displays BASIC, offer limit 5, both notification
entitlements inactive and no manual override. This is not a substitute for the
remaining physical Owner-page check after onboarding.

The Germany confirmation drawer was opened without any save. Missing/generic
`CONFIRMED` left the submit button disabled; a reason plus exact `CONFIRMED:DE`
enabled it. The drawer was closed without submitting. No country was activated.

The initial physical matrix found a 42px submit button because AppDrawer portals
render outside the Country section. A Country-form-specific class fixes only this
dialog's button to at least 44px. A direct regression test protects that scope.

Verified widths: 320, 375, 390, 414, 430, 768, 1024, 1280 pixels. Country overview
actions: at least 44px; corrected dialog close/submit actions: 44px on every
width. No document or dialog horizontal overflow. Mobile screenshots confirm
readable labels and no overlap. Temporary viewport override was reset.

Two console errors originated from browser-extension infrastructure (Eyeo content
script and missing extension receiver); no application React/render error was
identified. No extension was disabled or modified to bypass this.

## Remaining gate and risks

Technical/browser readiness is complete. The Founder must now finish only
`WUXUAI TEST ONLY - PRO PHASE 1` using AT TEST_ONLY operating and registered
business addresses through the existing onboarding. Do not bypass the flow.
Then verify once-only completion, Country audit and countries still disabled;
separately verify BASIC/offer limit 5/notifications OFF/Catalog OFF/no current or
future PRO override, prior activate/end audit, and Owner subscription write block.

Country Launch Gate FINAL LOCK: NO.
PRO Phase 1 FINAL LOCK: NO new claim.
Production changed: NO.

## Handoff (initial implementation; superseded by completion below)

NEXT GATE: PHYSICAL AUSTRIA ONBOARDING READY.
Founder action: complete only the isolated TEST_ONLY Owner onboarding with
explicit Austrian TEST_ONLY operating and registered addresses. No real business
address is supplied by Codex. Wait for Founder confirmation before the combined
Country and PRO post-onboarding checks and their separate final reports.

Evidence ZIP: `exports/2026-09-11_COUNTRY_LAUNCH_GATE.zip` in the primary local
workspace. It contains this report, the canonical documentation changes and
the explicit Country source/test file list above; no environment files, build,
dependencies, credentials, database dumps or prior ZIPs.

## Country UI and readiness completion - current evidence, 2026-09-11

### Cause and scope

The initial UI-readiness claim above was incomplete and is SUPERSEDED for this
scope. The subsequent physical audit found missing currencies, readiness and
per-country history, German country-name fallbacks in ZH/KO, and no complete
readiness activation barrier. Existing policy records contained only the ISO,
enabled flag, revision and update time. Existing audit already supplied actor,
before/after, time and reason. Tenant legal templates were not a source of
professional national market clearance and were not reused as fake evidence.

### Changed files in this completion (not the entire dirty worktree)

- `supabase/migrations/20260911005000_country_launch_readiness.sql`
- `src/modules/platform/PlatformCountryLaunchPanel.tsx`
- `src/modules/platform/countryLaunchReadiness.mjs`
- `src/modules/platform/countryLaunchReadiness.d.mts`
- `src/shared/countries.mjs`
- `src/shared/i18n/countryLaunchMessages.mjs`
- `src/shared/components/AppDrawer.tsx` (optional localized close label only;
  existing PIN visual-viewport work predates this completion)
- `src/styles.css` (Country section only)
- `tests/country-launch-readiness.test.mjs`
- `tests/country-launch-ui-render.test.mjs`
- `tests/country-launch-readiness-local.sql`
- `tests/country-readiness-staging-negative.sql`
- `tests/customer-activation-setup.test.mjs`
- `tests/kpi-drawer-ux.test.mjs` (both preserve the default close-label assertion)
- This report, `docs/V1_CURRENT_CANONICAL_PRODUCT_CONTRACT.md`,
  `docs/19_CHANGELOG.md`.

Pre-existing PRO, registration, Country 04000 and PIN work is retained, not
reverted, committed or pushed by this task. No unrelated feature was implemented.

### Server contract and migration

Country currencies come from protected server configuration: CH CHF; AT, DE,
FR, IT, ES EUR. Technical registration and public market status are distinct.
The eight readiness categories are legal, privacy, tax, billing, Stripe,
translation, technical smoke and required legal documents/versions. All 48
initial records remain `not_configured`. No professional clearance, document
version or completed test evidence was fabricated. Evidence expiry is evaluated
on read and mutation. A ready document check also requires nonempty version refs.

The platform RPC and policy trigger reject incomplete activation before mutation
or successful audit. Evidence changes and activation serialize on the policy row.
Existing platform-role, strong confirmation, reason and request-id contracts
remain. New evidence data has RLS and no anon/authenticated table access; private
helpers are not browser-executable. No readiness write UI/RPC was invented.
Future evidence setup must be separately reviewed and server-controlled.

Only `20260911005000` was pending in the Staging pre-dry-run and applied once.
Migration SHA-256:
`6a5454901f6cc72221160369077f5e4786a010360f9262fffa63b226f567a907`.
Previous 04000 SHA-256 remains:
`6cf5b10b52edb06e6a1137a217ee88fe2af17b092f8dacf408cefd9bb98d67e3`.
Staging history: 146/146, no mismatch. Post-dry-run: zero pending.
DB linter: PASS, zero errors, 31 pre-existing warnings, no Country findings.

### Technical verification

- Focused Country Node tests: 31/31 PASS (including 10 actual-component render
  tests, not only source-pattern assertions).
- Full suite: 1498/1498 PASS, zero skipped, final run after dialog-label change.
- Local SQL: 22/22 PASS, positive activation, all missing/expired prerequisites,
  idempotency/audit and pause. Positive activation occurred only in isolated
  local PostgreSQL with test changes rolled back.
- Staging SQL: 34/34 PASS, transaction rolled back. All six incomplete activation
  requests rejected, direct table writes rejected, role matrix rejected,
  enabled-state and successful-audit count unchanged, AT allowed, five named
  countries and unknown country blocked, isolated onboarding still draft.
- REST: 5/5 PASS; anonymous RPC/read and direct policy/readiness PATCH rejected
  with 42501/HTTP 401; public registration list still exposes only AT enabled.
- Typecheck PASS; lint PASS with nine existing warnings and zero errors.
- Build PASS, existing large-chunk warning only.
- Secret scan and final diff check are recorded in the close-out below.

### Physical Staging evidence

Current Worker: `wuxuai-restaurant-bonus-app-staging`.
Current version: `1c570058-231a-44e4-86db-eb0b3d235528`.
The Codex Staging Platform Admin session loaded the final build. Each of the
seven languages displayed six cards, 48 textual readiness states, correct
currencies and six disabled public-activation buttons. AT alone is technically
active, all public markets remain prepared/not live. Public activation and
technical registration are explicitly separated in labels and explanation.

ZH names: AT 奥地利, DE 德国, CH 瑞士, FR 法国, IT 意大利, ES 西班牙.
KO names: AT 오스트리아, DE 독일, CH 스위스, FR 프랑스, IT 이탈리아,
ES 스페인. `Intl.DisplayNames` absent/unsupported fallback is also unit-tested.
The physical check found the legacy DOM translation observer translating Stripe
again in ZH. The already localized Country section/form now opt out; physical
recheck preserves Stripe. The Country dialog close label is localized explicitly
without changing default AppDrawer behavior elsewhere.

AT pause dialogs were opened and closed in DE/EN/FR/IT/ES/ZH/KO. Reason and exact
CONFIRMED:AT fields were visible; submit remained disabled. No form was submitted,
no country activated or paused. Incomplete countries offer no activation dialog.
Error/expired/nonempty-audit render states are covered with synthetic local
tests; Staging errors/history were not manufactured just to populate the UI.
Each country physically displays its correct empty-history state. Actual local
SQL tests and render tests verify before/after, actor, reason and localized time.

DOM responsive checks: 320, 375, 390, 414, 430, 768, 1024 and 1280 CSS px; no
horizontal document/card overflow. All seven languages checked at 390px.
Buttons have 44px CSS minimum targets (browser zoom reports ~43.993px rounding).
Dialog has no horizontal overflow. Default-viewport screenshot is readable.
Explicit viewport screenshots exhibited a browser-capture scaling/tiling artifact;
responsive conclusions use live DOM geometry, not that corrupted screenshot.
This is browser-responsive evidence, not a claim of physical iOS/Android hardware
coverage. Viewport was reset and language restored to German. Final captured
browser error log: empty.

### Unchanged data and remaining gate

No enabled country, real Staging business, existing legal acceptance, Owner
onboarding, customer/QR/points/gift/Kassa record or Production resource was changed.
Only the authorized Staging schema and missing configuration/evidence defaults
were added. Existing shared tenant still shows 13 guests; the isolated test
tenant remains setup incomplete. No synthetic Staging business was created.

COUNTRY UI COMPLETION: COMPLETE.
NEXT GATE: PHYSICAL AUSTRIA TEST_ONLY ONBOARDING READY.
Overall COUNTRY LAUNCH GATE FINAL LOCK: NO, pending Founder-completed isolated
AT onboarding and once-only/country-audit evidence. PRO Phase 1 remains a separate
post-onboarding report. No real address is invented and no onboarding is submitted
by Codex. Production changed: NO. No Git push or Production deployment.

### Close-out

- Scoped secret pattern scan: 67 changed/untracked source, test, documentation
  and migration files; zero findings. No credential values printed. This is not
  a guarantee against every possible secret format or an external security audit.
- `git diff --check`: PASS. Additional no-index checks of 40 untracked relevant
  files: zero whitespace findings (normal no-index difference exit is not an error).
- Migration hashes above rechecked after all work: unchanged.
- Report/export finalized; no new feature work started.
- Evidence ZIP in primary workspace:
  `exports/2026-09-11_COUNTRY_UI_READINESS_COMPLETION.zip`.
  Contains only the explicit 17 source/test/migration/documentation files listed
  for this completion. Shared source files include their existing baseline;
  the ZIP is not a standalone deployable repository or a clean Git commit.
- Task: Country UI/readiness completion. Build: YES. Migration: Staging applied.
  Platform Admin flow: YES. RLS/security: YES. Old unsafe activation path: blocked.
  Desktop/tablet/mobile DOM checks: PASS, screenshot limitation stated above.
  Remaining risk/gate: Founder physical AT TEST_ONLY onboarding not yet completed.
- Overall launch status: NOT READY. UI completion: COMPLETE.
