import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const app = read("src/app/App.tsx");
const authProvider = read("src/modules/auth/AuthProvider.tsx");
const customerLogin = read("src/modules/customer/CustomerAuthPage.tsx");
const ownerLogin = read("src/modules/auth/LoginPage.tsx");
const protectedRoute = read("src/modules/auth/ProtectedRoute.tsx");
const staffLogin = read("src/modules/auth/StaffLoginPage.tsx");
const staffRouteGate = read("src/modules/auth/StaffRestaurantRouteGate.tsx");
const tenantProvider = read("src/modules/tenant/TenantProvider.tsx");

test("all password logins use the canonical post-login synchronization", () => {
  const signInStart = authProvider.indexOf("async signIn(email: string, password: string)");
  const signOutStart = authProvider.indexOf("async signOut()", signInStart);
  const signInFlow = authProvider.slice(signInStart, signOutStart);

  assert.match(signInFlow, /signInWithPassword\(\{ email, password \}\)/);
  assert.match(signInFlow, /setSession\(data\.session\)/);
  assert.match(signInFlow, /setUser\(data\.user\)/);
  assert.match(signInFlow, /await resolveAndCommitAuthorization\(data\.user, true\)/);
  assert.ok(signInFlow.indexOf("setSession(data.session)") < signInFlow.indexOf("await resolveAndCommitAuthorization"));

  assert.match(ownerLogin, /await signIn\(email, password\)[\s\S]*navigate\("\/admin"\)/);
  assert.match(staffLogin, /await signIn\(email, password\)[\s\S]*resolveMyStaffRestaurantAccess/);
  assert.match(customerLogin, /await signIn\(email\.trim\(\)\.toLowerCase\(\), password\)[\s\S]*navigate\(returnTo/);
  assert.doesNotMatch(customerLogin, /auth\.signInWithPassword/);
});

test("authorization completion invalidates only authenticated tenant context", () => {
  assert.match(authProvider, /setContextRevision\(\(current\) => current \+ 1\)/);
  assert.match(tenantProvider, /const \{ contextRevision, user \} = useAuth\(\)/);
  assert.match(tenantProvider, /\[clearTenantState, contextRevision, user\]/);
  assert.doesNotMatch(authProvider, /window\.location\.reload|location\.reload/);
});

test("auth listener and stale-tab restoration revalidate deterministically", () => {
  assert.equal((authProvider.match(/onAuthStateChange\(/g) ?? []).length, 1);
  assert.match(authProvider, /setAuthorizationRevision\(\(current\) => current \+ 1\)/);
  assert.match(authProvider, /authorizationRequestRef/);
  assert.match(authProvider, /sessionRevalidationRef/);
  assert.match(authProvider, /window\.addEventListener\("pageshow", handlePageShow\)/);
  assert.match(authProvider, /event\.persisted/);
  assert.match(authProvider, /document\.addEventListener\("visibilitychange", handleVisibilityChange\)/);
  assert.match(authProvider, /await authClient\.getSession\(\)/);
  assert.doesNotMatch(authProvider, /setTimeout\(/);
});

test("protected portals show loading and retry states instead of a blank page", () => {
  assert.ok(protectedRoute.indexOf("if (loading)") < protectedRoute.indexOf("if (!user)"));
  assert.match(protectedRoute, /Lade Sitzung/);
  assert.match(protectedRoute, /onClick=\{retryAuthorization\}/);
  assert.match(app, /Restaurantdaten konnten nicht geladen werden/);
  assert.match(app, /onClick=\{\(\) => void refreshTenants\(\)\}/);
  assert.match(staffRouteGate, /onClick=\{\(\) => setRevision/);
  assert.match(staffRouteGate, /Erneut versuchen/);
});

test("role-aware guards remain ahead of protected portal content", () => {
  assert.match(app, /portalKind="owner"/);
  assert.match(app, /portalKind="platform"/);
  assert.match(protectedRoute, /if \(effectivePortalKind && !portalAllowed\)/);
  assert.match(customerLogin, /WrongPortalNotice portal="customer"/);
  assert.match(staffLogin, /WrongPortalNotice/);
});
