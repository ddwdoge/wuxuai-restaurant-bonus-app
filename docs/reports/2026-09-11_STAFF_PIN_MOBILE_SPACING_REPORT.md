# Staff PIN Mobile Spacing

Date: 2026-09-11
Status: NOT READY for complete physical gate; implementation deployed to Staging.

## Cause

The mobile operational scanner imposed `height: min(92dvh, 860px)` even
during PIN confirmation. The expanding drawer body separated the PIN card
from the actions. The primary action also followed the secondary actions.

## Changed Files

- `src/modules/staff/StaffTablet.tsx`: PIN-only drawer class and opt-in visual
  viewport handling; existing primary submit button moved before secondary
  actions. Text, handlers and disabled condition unchanged.
- `src/modules/staff/staff-premium.css`: content-sized mobile PIN sheet;
  shrinking, scrollable body; non-growing footer with 20px top spacing,
  full-width primary action, two secondary columns, bottom safe-area padding.
  Buttons and PIN input have 46px minimum height, input text is 16px to avoid
  mobile Safari input zoom. No sticky positioning or model-specific sizing.
- `src/shared/components/AppDrawer.tsx`: opt-in VisualViewport resize/scroll
  listener, removed on close. Default drawers remain unchanged. Focus trap,
  Escape handling, overlay dismissal and focus restoration unchanged.
- `tests/staff-pin-mobile-layout.test.mjs`: seven direct regression tests,
  including executable viewport resize/pan/cleanup checks.
- This report.

## Not Changed

PIN validation, points calculation, limits, QR identity/expiry/one-time rules,
tenant/role checks, submit business logic, server errors, Country Gate and
entitlements. No database migration, SQL execution, business-data changes,
Production action, Git commit or push. Pre-existing worktree changes preserved.

## Quality Gates

- Focused drawer/scanner/active-task suite: 75/75 PASS.
- Full tests after final CSS change: 1479/1479 PASS.
- Typecheck: PASS, including deployment build.
- Lint: PASS, 0 errors / 9 pre-existing unrelated warnings.
- Build: PASS; pre-existing large-chunk warning retained.
- Scoped secret scan: 0 findings.
- git diff --check: PASS.
- RLS/security: no RLS/grant/server changes; existing scanner security and
  active-task tests pass. No new live DB-security test claimed.

## Local Browser Evidence

Used a backend-free local fixture with the actual PIN content/footer renderer
functions extracted from StaffTablet, actual AppDrawer and actual application
styles. Fixture handlers simulate local close/minimize/error outcomes only;
they do not verify a server booking and are not a canonical Staging E2E flow.

Codex browser viewport matrix, measured CSS widths 320, 375, 390, 430 and
heights 800, 480, 320: 12/12 layout cases passed. At 800px height the form-to-
primary-action gap is 20px without body overflow. At short heights the body
scrolls while all footer buttons stay inside the viewport. Primary width
matches the form width, no horizontal document overflow, all action targets
at least 44px. Final 320x640 check: PIN input and primary button approximately
46px, gap 20px. Browser zoom was accounted for using measured CSS dimensions.

Empty PIN disables submit; filled PIN enables submit. Synthetic error remains
inside the scrollable content. PIN can be scrolled into view at 320px height.
Tab from last action wraps to Close. Local cancel/minimize handlers respond.
Actual application handlers remain unchanged and are covered by existing tests.
Screenshot inspection completed; the in-app capture showed compositing artifacts,
so geometry claims above use read-only DOM measurements, not screenshot pixels.

## Staging

- Worker: `wuxuai-restaurant-bonus-app-staging`.
- App: `https://staging-app.bonus.wuxuaisbi.com`.
- Supabase binding: `bwhvfjuwixgwduoeqaya`, public key checked in memory only.
- Deployment: `69a6d0c4-f984-4f7a-95da-5c33231c757b`.
- Staging index, StaffTablet JS/CSS and AppDrawer JS: HTTP 200 and byte-identical
  to the local build.
- Physical read-only staff login smoke: PASS; login fields/routes present.
- No PIN submission, QR consumption, points transaction or test-data mutation.

## Open Physical Gates

- Real iPhone/Safari with keyboard closed/open and browser chrome/safe areas.
- Real Android/Chrome keyboard and browser-navigation occlusion.
- Authenticated Staging PIN sheet, actual cancel confirmation and minimize/resume.
- Real screenreader interaction (ARIA and keyboard source/local checks passed).
- Desktop/tablet authenticated PIN-flow regression not physically repeated.

No real device is available through the connected browser surfaces. Chrome
extension timed out; local responsive verification used the Codex browser.
Do not label these unperformed checks PASS or report COMPLETE/FINAL LOCK.

Next safe action: inspect the deployed PIN step using an authorized isolated
Staging test session on iPhone/Safari and Android/Chrome without booking points.
Production unchanged. Database migration: NONE.
