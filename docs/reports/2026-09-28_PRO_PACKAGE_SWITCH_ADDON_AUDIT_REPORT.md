# PRO package switch and add-on audit

Date: 2026-09-28

Scope: local PRO package, entitlement and capacity security audit

Base remote commit: `1fe2bc7e89c8a3fc3cd996dbb99827db74b744fc`

Prior evidence commit: `d9ef0b2a43665777918d7db1a1cf041bd2255d6b`

## Result

The active server contract keeps PRO rights fail-closed and tenant-bound. A clear add-on lifecycle gap was found and fixed additively: a `CANCELLED` capacity add-on revision could previously omit `effective_until`; because cancelled revisions count through their paid period, that malformed state could retain capacity indefinitely. Migration 187 now requires a finite exclusive period end for every cancelled revision.

No PRO entitlement, subscription, payment, Stripe identifier, offer, customer, reward or notification row is created or changed by the migration.

## Confirmed package functions

- The current canonical catalogue is finite: BASIC has 5 offers and 3,000 active unique customers; PRO has 15 offers and 15,000 active unique customers.
- The current net monthly presentation is BASIC EUR 59 and PRO EUR 149. Historical catalogue rows are not treated as current authority.
- Offer add-ons add 5 offer slots; customer add-ons add 5,000 active-customer slots. Multiple units are supported only through effective server revisions.
- Active unique customers use the canonical rolling, half-open 365-day activity window and server evidence.
- BASIC to PRO requires an effective paid/trial source in a released country or the exact bounded, audited internal TEST_ONLY grant. A frontend plan selection is not an entitlement.
- PRO to BASIC, grant expiry and grant revocation remove PRO notification flags and return the effective plan to BASIC.
- Pending activation and safety blocks outrank PRO sources.
- Browser roles have no direct DML rights on plan or add-on authority tables. Owner capacity UI is read-only and exposes no purchase path.
- The internal TEST_ONLY override remains AAL2/TOTP-protected, exact-tenant-bound, bounded, audited, idempotent and unavailable to ordinary browser roles.

## Gap and change

Added migration:

- `supabase/migrations/20260928006000_pro_addon_cancellation_boundary.sql`
- SHA-256: `c3b719717bc4645b06b668ffffe560bce355d8ea0e092547558985f708e99ad5`

Contract:

- `CANCELLED` requires non-null `effective_until`.
- `effective_until` is the exclusive paid-period boundary.
- Existing rows are validated during migration; an invalid historical row makes deployment fail closed.
- No historical row is rewritten, deleted or repaired automatically.
- `EXPIRED`, `REVOKED` and `CHARGEBACK` remain non-effective.

## Verification

- Focused static package/lifecycle/capacity/UI tests: 87/87 PASS.
- Focused PostgreSQL role, capacity and malformed-cancellation matrix: PASS.
- Parallel resolver test: 24/24 deterministic fail-closed; 0 writes.
- Fresh replay: 187/187 PASS.
- Upgrade 186 to 187: PASS.
- Repeat dry-run 1/2: empty / empty.
- DB lint at error level: PASS, 0 findings.
- Full suite: 2117/2117 PASS. The first sandboxed run had three loopback-listen `EPERM` infrastructure failures; the authorized loopback run passed all three and the complete suite.
- Typecheck: PASS.
- Lint: PASS, 0 errors and 8 pre-existing warnings.
- Build: PASS with ephemeral public bindings from the isolated local Supabase stack; no environment file was created.
- Secret scan and staged diff checks: PASS immediately before commit.

## Staging boundary

At the start of this audit, the verified staging database remained at 186/186. Migration 187 has not yet been applied by this report. No staging business write, PRO grant, payment, customer mail or Stripe call occurred.

The positive PRO Inbox browser flow remains OPEN. It requires a regularly created, authorized TEST_ONLY tenant with a synthetic customer. No grant was fabricated, no LEGACY tenant was changed, and no activation gate was relaxed.

## Open payment, legal and product gates

- Real PRO activation and paid add-on ordering remain blocked by Seller, Tax, Legal, country release and Stripe TEST readiness.
- There is no current positive paid add-on order/provider ingestion path in this scope. Capacity revisions therefore must not be interpreted as purchasable from the Owner UI.
- Offer and reward notification consent, withdrawal and retention remain a draft for legal review.
- Reward e-mail remains fail-closed until a dedicated consent contract exists.
- Customer mail scheduler remains disabled; no real recipient was contacted.
- Production and Stripe LIVE remain unchanged.

## Files in the package-hardening scope

- `supabase/migrations/20260928006000_pro_addon_cancellation_boundary.sql`
- `tests/pro-package-switch-addon-hardening.test.mjs`
- `tests/phase-7c2-capacity-contract.local.sql`
- `docs/reports/2026-09-28_PRO_PACKAGE_SWITCH_ADDON_AUDIT_REPORT.md`

Foreign and pre-existing files, including `supabase/.temp/cli-latest` and two unrelated untracked BASIC reports, remain excluded and unmodified by this work package.

## Status

PRO PACKAGE SWITCH AND ADD-ON HARDENING: LOCAL CODE LOCK

PAID PRO / ADD-ON ACTIVATION: BLOCKED

POSITIVE PRO INBOX STAGING BROWSER FLOW: OPEN

PRODUCTION / STRIPE LIVE: UNCHANGED
