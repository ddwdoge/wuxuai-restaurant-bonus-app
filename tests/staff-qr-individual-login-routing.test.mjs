import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildStaffLoginPath,
  isIndividualStaffRole,
  normalizeStaffRestaurantSlug,
  staffSlugFromLegacyPath,
} from "../src/modules/auth/staffLoginFlow.mjs";

const read = async (path) => readFile(new URL(path, import.meta.url), "utf8");
const [app, protectedRoute, loginPage, loginService, routeGate, invitePage, inviteService, qrCenter, onboarding, migration] = await Promise.all([
  read("../src/app/App.tsx"),
  read("../src/modules/auth/ProtectedRoute.tsx"),
  read("../src/modules/auth/StaffLoginPage.tsx"),
  read("../src/modules/auth/staffLoginService.ts"),
  read("../src/modules/auth/StaffRestaurantRouteGate.tsx"),
  read("../src/modules/auth/StaffInvitePage.tsx"),
  read("../src/modules/auth/staffInviteService.ts"),
  read("../src/modules/admin/pages/QrCenterPage.tsx"),
  read("../src/modules/admin/pages/RestaurantOnboarding.tsx"),
  read("../supabase/migrations/20260825004000_staff_qr_individual_login_routing.sql"),
]);

test("Staff slug and login URL preserve only a valid restaurant context", () => {
  assert.equal(normalizeStaffRestaurantSlug(" Kaffee-Wien "), "kaffee-wien");
  assert.equal(normalizeStaffRestaurantSlug("../admin"), null);
  assert.equal(buildStaffLoginPath("kaffee-wien"), "/staff/login?restaurant=kaffee-wien");
  assert.equal(buildStaffLoginPath(""), "/staff/login");
  assert.equal(staffSlugFromLegacyPath("/staff/kaffee-wien"), "kaffee-wien");
  assert.equal(staffSlugFromLegacyPath("/staff/login"), null);
  assert.equal(staffSlugFromLegacyPath("/staff/%E0%A4%A"), null);
});

test("only individual Staff roles qualify for the Staff portal", () => {
  assert.equal(isIndividualStaffRole("staff"), true);
  assert.equal(isIndividualStaffRole("supervisor"), true);
  for (const role of ["owner", "admin", "manager", "platform_admin", "customer", null]) {
    assert.equal(isIndividualStaffRole(role), false, String(role));
  }
  assert.match(app, /path="\/staff\/login" element=\{<StaffLoginPage \/>\}/);
  assert.equal((app.match(/<ProtectedRoute allowedRoles=\{\["staff", "supervisor"\]\}>/g) ?? []).length, 2);
  assert.doesNotMatch(app, /allowedRoles=\{\["staff", "supervisor", "owner"/);
});

test("legacy Staff QR redirects anonymous users to the restaurant-specific Staff login", () => {
  assert.match(protectedRoute, /staffSlugFromLegacyPath\(location\.pathname\)/);
  assert.match(protectedRoute, /buildStaffLoginPath\(staffSlug\)/);
  assert.match(protectedRoute, /<Navigate to=\{loginPath\}/);
  assert.match(app, /<StaffRestaurantRouteGate>/);
});

test("new QR and Starter Kit links point directly to the individual Staff login", () => {
  assert.match(qrCenter, /staffTabletUrl = restaurantSlug \? `\$\{publicBaseUrl\}\$\{buildStaffLoginPath\(restaurantSlug\)\}`/);
  assert.match(onboarding, /staffTabletUrl = `\$\{publicBaseUrl\}\$\{buildStaffLoginPath\(restaurantSlug\)\}`/);
  assert.doesNotMatch(qrCenter, /staffTabletUrl = restaurantSlug \? `\$\{publicBaseUrl\}\/staff\/\$\{restaurantSlug\}`/);
});

test("Staff login uses individual credentials and checks exact server access", () => {
  assert.match(loginPage, /title="Mitarbeiterbereich"/);
  assert.match(loginPage, /Mit deinem persönlichen Mitarbeiterkonto anmelden\./);
  assert.match(loginPage, /label="E-Mail"/);
  assert.match(loginPage, /label="Passwort"/);
  assert.match(loginPage, /await signIn\(email, password\)/);
  assert.match(loginPage, /resolveMyStaffRestaurantAccess\(restaurantSlug\)/);
  assert.match(loginPage, /access\.restaurant_slug === restaurantSlug/);
  assert.doesNotMatch(loginPage, /completePendingOwnerRegistration|Restaurant Login|Bonusprogramm verwalten/);
  assert.match(loginService, /rpc\("get_my_staff_restaurant_access"/);
});

test("server contract blocks inactive, foreign and non-Staff identities", () => {
  assert.match(migration, /security definer[\s\S]*set search_path = public, pg_temp/);
  assert.match(migration, /rm\.user_id = auth\.uid\(\)/);
  assert.match(migration, /rm\.role in \('staff', 'supervisor'\)/);
  assert.match(migration, /sm\.auth_user_id = auth\.uid\(\)/);
  assert.match(migration, /sm\.active = true/);
  assert.match(migration, /sm\.account_status = 'active'/);
  assert.match(migration, /sm\.archived_at is null/);
  assert.match(migration, /r\.slug = lower\(btrim\(input_restaurant_slug\)\)/);
  assert.match(routeGate, /access\.success && access\.restaurant_slug === slug/);
});

test("RPC grants expose only public display context to anon", () => {
  assert.match(migration, /revoke all on function public\.get_public_staff_login_context\(text\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.get_public_staff_login_context\(text\) to anon, authenticated/);
  assert.match(migration, /revoke all on function public\.get_my_staff_restaurant_access\(text\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.get_my_staff_restaurant_access\(text\) to authenticated/);
  assert.doesNotMatch(migration, /grant execute on function public\.get_my_staff_restaurant_access\(text\) to anon/);
});

test("invite acceptance and logout return to the Staff login flow", () => {
  assert.match(inviteService, /select\("slug"\)\.eq\("id", restaurantId\)/);
  assert.match(inviteService, /return \{ restaurantSlug: restaurant\.slug \}/);
  assert.match(invitePage, /buildStaffLoginPath\(result\.restaurantSlug\)/);
  assert.doesNotMatch(invitePage, /navigate\("\/restaurant\/login"/);
});
