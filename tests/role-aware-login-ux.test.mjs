import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  emptyPortalAccess,
  portalDestination,
  portalLoginPath,
  wrongPortalCopy,
} from "../src/modules/auth/portalAccessUx.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260825007000_role_aware_portal_access.sql");
const app = read("src/app/App.tsx");
const authProvider = read("src/modules/auth/AuthProvider.tsx");
const protectedRoute = read("src/modules/auth/ProtectedRoute.tsx");
const staffLogin = read("src/modules/auth/StaffLoginPage.tsx");
const notice = read("src/modules/auth/WrongPortalNotice.tsx");

function access(overrides = {}) {
  return { ...emptyPortalAccess, authenticated: true, ...overrides };
}

test("Customer wrong-role copy and destinations use confirmed access only", () => {
  const staff = access({ staff_access: true, preferred_staff_slug: "test-lokal" });
  assert.equal(wrongPortalCopy("customer", staff), "Du bist mit einem Mitarbeiterkonto angemeldet.");
  assert.deepEqual(portalDestination("customer", staff), {
    label: "Zum Mitarbeiterbereich",
    path: "/staff/test-lokal",
  });

  const owner = access({ owner_access: true, staff_access: true });
  assert.equal(wrongPortalCopy("customer", owner), "Du bist mit einem Restaurantbetreiber-Konto angemeldet.");
  assert.deepEqual(portalDestination("customer", owner), {
    label: "Zum Restaurantbereich",
    path: "/admin",
  });
});

test("Owner and Staff wrong-role messages remain restaurant specific", () => {
  const customer = access({ customer_access: true });
  assert.equal(wrongPortalCopy("owner", customer), "Dieses Konto hat keinen Restaurantbetreiber-Zugang.");
  assert.equal(wrongPortalCopy("staff", customer), "Dieses Konto hat keinen Mitarbeiterzugang zu diesem Restaurant.");
  assert.deepEqual(portalDestination("staff", customer), {
    label: "Zur Kundenansicht",
    path: "/customer",
  });
});

test("Mixed roles retain independent portal destinations", () => {
  const mixed = access({
    customer_access: true,
    owner_access: true,
    platform_access: true,
    preferred_staff_slug: "mein-lokal",
    staff_access: true,
  });
  assert.deepEqual(portalDestination("customer", mixed), { label: "Zum Restaurantbereich", path: "/admin" });
  assert.deepEqual(portalDestination("owner", mixed), { label: "Zum Mitarbeiterbereich", path: "/staff/mein-lokal" });
  assert.deepEqual(portalDestination("platform", mixed), { label: "Zum Restaurantbereich", path: "/admin" });
});

test("Account switch returns to the intended portal login", () => {
  assert.equal(portalLoginPath("customer"), "/customer/login");
  assert.equal(portalLoginPath("owner"), "/restaurant/login");
  assert.equal(portalLoginPath("platform"), "/restaurant/login");
  assert.equal(portalLoginPath("staff", "mein-lokal"), "/staff/login?restaurant=mein-lokal");
  assert.match(notice, /await signOut\(\)/);
  assert.match(notice, /replace: true/);
  assert.match(notice, /Mit anderem Konto anmelden/);
});

test("Portal access RPC is authenticated-only and relationship authoritative", () => {
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = public, pg_temp/i);
  assert.match(migration, /customer_accounts ca[\s\S]*ca\.auth_user_id = auth\.uid\(\)/);
  assert.match(migration, /restaurant_members rm[\s\S]*rm\.user_id = auth\.uid\(\)/);
  assert.match(migration, /staff_members sm[\s\S]*sm\.auth_user_id = auth\.uid\(\)/);
  assert.match(migration, /platform_admins pa[\s\S]*pa\.user_id = auth\.uid\(\)/);
  assert.doesNotMatch(migration, /user_metadata|app_metadata|raw_user_meta_data/);
  assert.match(migration, /revoke all on function public\.get_current_portal_access\(\)[\s\S]*public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.get_current_portal_access\(\)[\s\S]*to authenticated/);
});

test("Customer data routes activate an additional Customer role before portal RPC components", () => {
  assert.match(authProvider, /rpc\("get_current_portal_access"\)/);
  assert.match(app, /if \(user && !portalAccess\.customer_access\) return <Navigate replace to=\{`\/customer\/register\?returnTo=/);
  assert.match(app, /if \(!portalAccess\.customer_access\) return <Navigate replace to=\{`\/customer\/register\?returnTo=/);
  assert.ok(app.indexOf("!portalAccess.customer_access") < app.indexOf("<CentralCustomerPage view=\"home\""));
});

test("Owner, Staff and Platform routes declare explicit portal guards", () => {
  assert.match(app, /allowedRoles=\{\["owner", "admin", "manager"\]\} requireConfirmedEmail portalKind="owner"/);
  assert.match(protectedRoute, /effectivePortalKind = portalKind \?\?/);
  assert.match(app, /portalKind="platform"/);
  assert.match(protectedRoute, /if \(effectivePortalKind && !portalAllowed\)/);
  assert.match(staffLogin, /setAccessDenied\(true\)/);
  assert.doesNotMatch(staffLogin, /if \(!access\.success[\s\S]{0,180}await signOut\(\)/);
});

test("Role disclosure is rendered only after an authenticated user exists", () => {
  const unauthenticatedCheck = protectedRoute.indexOf("if (!user)");
  const wrongPortalCheck = protectedRoute.indexOf("if (effectivePortalKind && !portalAllowed)");
  assert.ok(unauthenticatedCheck >= 0 && unauthenticatedCheck < wrongPortalCheck);
  assert.match(notice, /Deine Anmeldung ist gültig/);
});
