# Staff Auth Role Switch and WebKit Restgate Report

Date: 2026-09-26
Source commit: `27d1174beb0ef9121643d83d51b73b87ac35ba5a`
Scope: local code and tests plus read-only staging browser verification; no deployment

## Ursache

The earlier Staff reload failure was not reproducible in an isolated Staff browser profile. The current auth architecture intentionally uses one Supabase auth storage key per project and browser profile. Signing in with another identity on the same origin and profile therefore replaces the previously stored identity.

The existing wrong-portal screen named only a generic access mismatch. It did not explain the confirmed same-profile account replacement when the hydrated, server-resolved session belonged to another portal identity.

## Geänderte Dateien

- `src/modules/auth/StaffLoginPage.tsx`
- `src/modules/auth/WrongPortalNotice.tsx`
- `src/modules/auth/portalAccessUx.mjs`
- `src/modules/auth/portalAccessUx.d.mts`
- `src/shared/i18n/gastronomyTerminologyMessages.mjs`
- `tests/role-aware-login-ux.test.mjs`
- this report

## Änderung

The new guidance is selected only when all of the following are true:

1. auth hydration has produced an authenticated session;
2. the server-resolved portal contract confirms no Staff access;
3. the same server-resolved contract confirms Customer, Owner, or Platform access.

German wording:

> In diesem Browserprofil ist bereits ein anderes Konto angemeldet. Melde dich ab und erneut als Mitarbeiter an oder verwende für beide Konten separate Browserprofile.

The same meaning is present for DE, EN, FR, IT, ES, ZH, and KO. A missing Staff relation, a foreign restaurant slug, or an unresolved authorization result does not claim an account collision. Valid Staff access, including additive roles, never triggers this guidance.

## Nicht geändert

- no Supabase storage key or persistence architecture;
- no auth, role, RLS, tenant, or restaurant security boundary;
- no refresh interval or token lifetime;
- no database migration;
- no staging or production deployment;
- no Stripe or business data access;
- no tokens, cookies, identities, or credentials recorded.

## Automatisierte Prüfungen

- focused role-aware login tests: 11/11 PASS;
- fresh combined auth/Staff/refresh/role/terminology commit-gate tests: 55/55 PASS;
- full suite: 2004/2004 PASS;
- typecheck: PASS;
- lint: PASS with 0 errors and 8 pre-existing warnings;
- build: PASS with local non-secret placeholder client bindings;
- `git diff --check`: PASS;
- `git diff --cached --check`: PASS;
- changed-scope secret scan: PASS; one benign match was the source identifier `buildPasswordRecoveryPath`.

## Physische Browserprüfung

### WebKit / Safari Staff

- isolated private Safari context was authenticated as Staff before the check;
- server-authorized Staff portal was visible;
- one reload showed the expected intermediate `Lade Sitzung...` hydration state;
- hydration completed and returned to the Staff portal without a login redirect;
- no credential value was displayed or retained in evidence.

### Tab schließen und wiederherstellen

- the private Staff tab was closed exactly once after explicit user confirmation;
- Safari returned to the separate normal Customer window;
- `Zuletzt geschlossen` was invoked exactly once;
- Safari restored the private Staff window after a delayed UI update;
- the restored page first showed the expected `Lade Sitzung...` hydration state and then returned to the server-authorized Staff portal without another login;
- no second restoration attempt was made.

Result: PASS. The earlier immediate observation was incomplete; the delayed restored window was subsequently observed and verified without another close/restore attempt.

### Eigenes normales Safari-Staff-Profil

- Safari exposed the default normal window and the private window, but no separate named normal profile dedicated to Staff;
- the existing normal Safari context belongs to the separate Customer session and was not repurposed;
- no profile was created and no credentials were requested.

Result: NOT REQUIRED. The confirmed isolated private Safari Staff session is the authoritative WebKit gate for this work package. A second normal Safari profile is not a local Staff-auth release requirement.

### Tatsächlicher Access-Token-Refresh

The isolated private Safari Staff session was observed until the regular refresh occurred. An in-page memory-only comparison recorded only boolean evidence and confirmed both that the access token changed and that the expiry advanced. No token value, fragment, user identifier, cookie, or credential was displayed, copied, persisted, or added to evidence.

After the confirmed refresh, one reload showed `Lade Sitzung...`, completed auth hydration, and returned to the server-authorized Staff portal. This reload is evidence of the post-refresh session check, not the refresh event itself. No token lifetime was shortened, no auth setting was weakened, and no refresh was artificially forced.

Result: PASS.

## Gate-Ergebnis

| Gate | Evidence | Result |
| --- | --- | --- |
| clearer role-switch guidance | server-resolved alternative portal identity only | PASS |
| normal Staff entry unaffected | focused and full regression tests | PASS |
| existing Customer/Owner sessions unaffected | separate contexts remained valid in established baseline; no auth architecture change | PASS |
| authenticated WebKit Staff reload | physical private Safari test | PASS |
| private Staff tab restore | one close and one restore invocation; delayed private window restoration, hydration and Staff access observed | PASS |
| dedicated normal Safari Staff profile restore | no dedicated normal Staff profile/session available; not required after Founder scope decision | NOT REQUIRED |
| actual token refresh | access token changed and expiry advanced; post-refresh hydration and server-authorized Staff portal confirmed | PASS |

## Risiken und Status

No security boundary was weakened. The role-switch implementation and isolated private WebKit Staff session are verified, including reload, delayed private-tab restoration, a genuine regularly scheduled token refresh, completed auth hydration, and subsequent server-authorized Staff access.

The Staff-auth work package is locally ready. This is not a V1 launch, staging-deployment, or production approval. After a later staging deployment, the role-switch message must be physically revalidated there. All remaining launch and production gates stay open.

Status: **STAFF-AUTH LOCAL READY / V1-LAUNCH AND PRODUCTION NOT READY**

## Prozess- und Cleanup-Matrix

- task-owned background processes started during final closeout: 7 transient test/build processes;
- task-owned background processes stopped during final closeout: 7;
- task-owned background processes still running: 0;
- retained process purpose: NONE;
- RAM cleanup: PASS;
- unrelated processes changed: NO.
