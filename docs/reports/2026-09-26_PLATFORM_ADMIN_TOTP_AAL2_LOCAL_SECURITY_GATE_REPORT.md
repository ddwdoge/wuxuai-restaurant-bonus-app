# Platform Admin TOTP/AAL2 – Local Security Gate

Date: 2026-09-26

Base commit: `8acb24ca7661d2c8422267885809624842625009`

Isolated branch: `codex/platform-admin-totp-aal2`

Environment: local only

## Result

The existing Platform Admin contract had a P1 authorization gap: `/admin/platform`
and its legacy aliases checked the server-derived Platform role, but did not require
TOTP/AAL2. Newer high-risk mutations required a recent first-factor login while
older mutations checked only the Platform role. A direct authenticated RPC call
therefore did not have a uniform AAL2 boundary.

The local fix adds a fail-closed TOTP/AAL2 gate at both boundaries:

- every Platform route is wrapped only after the existing server-derived Platform
  role and portal-access checks pass;
- `current_platform_role()` and `is_platform_admin()` return authority only when the
  current JWT proves `aal2` and a TOTP authentication method;
- `get_current_platform_role()` remains a narrow role-discovery RPC so an AAL1
  Platform Admin can reach enrollment/challenge without being granted action
  authority;
- recent-auth actions now use the latest TOTP AMR timestamp rather than the older
  first-factor `auth_time` value.

The final full-diff review found and corrected one additional local P1 issue:
the React gate had retained its last successful result across an access-token
change until its asynchronous refresh completed. Server RPCs were still denied,
but protected Platform content could briefly remain rendered. The gate is now
synchronously bound to the exact access token whose AAL/TOTP state was checked;
any token replacement immediately renders the neutral checking state. A request
generation guard also prevents a late response for an older session from
overwriting the current state.

No hosted Auth setting, credential, Platform Admin record, Staging project, Stripe
account, Production system, or real data was changed.

## Platform Admin entry and session flow

| Step | Current local contract | Server authority |
| --- | --- | --- |
| First-factor login | Existing Supabase login and server role discovery | No Platform action authority at AAL1 |
| Platform role discovery | Caller’s own active role only | `get_current_platform_role()`; not an authorization predicate |
| No verified TOTP | Explicit setup screen; no automatic enrollment | Protected RPCs remain denied |
| Verified TOTP, current AAL1 | Six-digit challenge screen | Protected RPCs remain denied until verification |
| Successful TOTP | Session becomes AAL2 and Platform content is rendered | `current_platform_role()` returns the role |
| Refreshed AAL2 token | Gate and server re-evaluate the new token | Access remains valid when TOTP AMR is preserved |
| Replaced/different token | Previous UI proof is synchronously discarded | No Platform content until the new token is checked |
| Missing/signed-out session | Existing login redirect / denied RPC | No role discovery or action authority |
| Recent-auth timeout | Ordinary AAL2 access may continue | High-risk recent-auth mutation returns `RECENT_PLATFORM_TOTP_REQUIRED` |

Enrollment is user-initiated. The QR payload and TOTP secret are held only by the
Supabase client and current browser render; they are not logged, persisted by the
application, included in this report, or placed in the evidence archive.

## Server-side action inventory

The active client and Edge call paths were traced to their current database
definitions. The following action groups authorize through
`current_platform_role()`, `is_platform_admin()`, or
`platform_operation_role_can_write()`, which itself resolves
`current_platform_role()`. Migration 173 therefore supplies the AAL2/TOTP boundary
before action logic or writes.

| Protected surface | Server-side role check | Additional existing gate |
| --- | --- | --- |
| Restaurant list/detail/control, legal, Kassa, health, telemetry, audit and billing reads | `is_platform_admin()` or `current_platform_role()` | Read-specific scope/filtering |
| Country release mutation | `current_platform_role()` | role, confirmation, request ID, readiness |
| Platform operations (restaurant lifecycle, tenant suspension, security flags, membership repair, Staff actions, Customer actions, points correction, QR invalidation, gift expiry, mail retry) | `platform_operation_role_can_write()` → `current_platform_role()` | action-specific role, reason, confirmation, idempotency |
| Owner/Staff auth-support delivery | target RPC and audit RPC both use `platform_operation_role_can_write()` | Edge user validation, origin allowlist, target validation, immutable audit |
| TEST_ONLY tenant mark/cleanup and foreign test-customer cleanup | `current_platform_role()` or `is_platform_admin()` | recent auth where defined, strong confirmation, test registry, deterministic preflight |
| Customer test-mode mutation | `current_platform_role()` | allowed role set, target validation, audit |
| Subscription and legacy billing mutations | `current_platform_role()` | recent auth, confirmation, provider/seller/live guards, immutable legacy rules |
| Plan override and override termination | `current_platform_role()` | recent auth where defined, request identity, bounded validity |
| PRO country release and access grant/revoke | `current_platform_role()` | recent auth, country/seller/provider/commercial gates, immutable audit |
| Business-verification review actions | `current_platform_role()` | recent auth, exact action set, confirmation, idempotency, append-only evidence |
| Platform entitlement mutation | `current_platform_role()` | role and entitlement contract checks |

The direct `platform_admins` reads found outside these helpers are role-discovery,
portal eligibility, or conflict/exclusion checks. They do not grant a Platform
Admin mutation path. No mutation uses the public role-discovery RPC as its
authorization predicate.

## Changed files

- `src/modules/auth/ProtectedRoute.tsx`
- `src/modules/platform/PlatformAdminMfaGate.tsx`
- `src/modules/platform/platformAdminMfa.mjs`
- `src/modules/platform/platformAdminMfa.d.mts`
- `src/styles.css`
- `docs/PLATFORM_ADMIN_TOTP_AAL2_RECOVERY_CONTRACT.md`
- `docs/PLATFORM_ADMIN_TOTP_AAL2_STAGING_CHECKLIST.md`
- `supabase/config.toml` (isolated local TOTP test runtime only)
- `supabase/migrations/20260926001000_platform_admin_totp_aal2_gate.sql`
- `tests/platform-admin-totp-aal2.test.mjs`
- `tests/platform-admin-totp-aal2.local.sql`
- `tests/platform-admin-totp-aal2-auth.local.mjs`
- this report

Migration 173 SHA-256:
`857b2c3ea4b1e617680292b676c9bfa571a29014dcbd9799a54b9fef5fa2673a`

Migrations 001–172 were not modified.

## Verification

### Automated source and security tests

- Focused Platform Admin TOTP/AAL2 tests: 9/9 PASS
- Full test suite: 2013/2013 PASS
- Typecheck: PASS
- Lint: PASS, 0 errors; 8 pre-existing warnings
- Build: PASS

The first sandboxed full-suite run had three local HTTP tests fail with
`listen EPERM` because the sandbox forbade loopback listeners. The complete suite
was repeated with the required local permission and passed 2012/2012; this was an
execution-environment restriction, not a product failure.

### Database gates

- Fresh replay: 173/173 PASS
- Migration 173 repeat run 1: PASS
- Migration 173 repeat run 2: PASS
- DB lint (`error` level): PASS, no findings
- Rollback-protected AAL matrix: PASS
  - AAL1 role discovery available, action authority absent
  - direct protected RPC at AAL1 denied
  - non-TOTP AAL2 denied
  - current TOTP AAL2 allowed
  - stale TOTP rejected by recent-auth helper
  - missing session denied

### Real local Auth flow

A short-lived synthetic local Platform Admin was created and removed within the
test. No real identity or credential was used.

- real TOTP enrollment and challenge: PASS
- direct protected RPC before TOTP/AAL2: denied
- server access after successful TOTP/AAL2: PASS
- actual access-token refresh: new token observed without exposing its value
- TOTP/AAL2 and server access after refresh: PASS
- direct protected RPC after local sign-out: denied
- synthetic users remaining: 0
- synthetic MFA factors remaining: 0

## Not changed

- no Staff-auth product or report file
- no credential-incident report
- no hosted Supabase Auth configuration
- no existing Platform Admin identity, role, password, factor or credential
- no Staging migration or deployment
- no Production or Stripe access
- no push, deployment, Staging change or factor enrollment; commit creation is
  performed only after the local gates and exact-scope review

## Recovery and Staging preparation

The architecture-review artifacts are:

- `docs/PLATFORM_ADMIN_TOTP_AAL2_RECOVERY_CONTRACT.md`
- `docs/PLATFORM_ADMIN_TOTP_AAL2_STAGING_CHECKLIST.md`

The recovery contract requires a Founder/management requestor, an independently
registered second approver, and an MFA-protected Supabase recovery executor. It
uses the official provider control plane to revoke sessions and replace exactly
the lost factor. It expressly forbids an AAL1 exception, service-role bypass,
claim override, shared backup account, or rollback of the AAL2 boundary as an
operational shortcut.

The Staging order is designed to avoid locking out the sole Platform Admin:
approve recovery first, verify Staging TOTP support, deploy the reviewed UI,
physically enroll and prove TOTP/AAL2, then apply Migration 173 and execute the
direct AAL1/AAL2 RPC matrix. A failed migration rolls back transactionally. A
post-migration access problem invokes the recovery contract; it never weakens
the database boundary.

## Open gates

1. Founder/Security architecture review must approve the recovery contract and
   name the independent approver and recovery executor before any Staging change.
2. Staging must separately enable and verify the approved TOTP capability; no
   hosted Auth configuration was changed here.
3. A legitimate Platform Admin must physically complete enrollment/challenge on
   Staging without exposing the QR secret or TOTP code.
4. Direct Staging RPC negatives at AAL1 and positives at TOTP/AAL2 must be verified.
5. The Staff role-switch message still requires its separate physical Staging
   verification after the later Staff-auth deployment.

## Status

**PLATFORM ADMIN TOTP/AAL2 LOCAL CODE LOCK**

**STAGING NOT READY – RECOVERY CONTRACT ARCHITECTURE REVIEW REQUIRED**

**V1 LAUNCH AND PRODUCTION NOT READY**
