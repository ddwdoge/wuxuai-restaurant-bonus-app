import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const authProvider = readFileSync(new URL("../src/modules/auth/AuthProvider.tsx", import.meta.url), "utf8");
const tenantProvider = readFileSync(new URL("../src/modules/tenant/TenantProvider.tsx", import.meta.url), "utf8");
const adminLayout = readFileSync(new URL("../src/modules/admin/AdminLayout.tsx", import.meta.url), "utf8");
const protectedRoute = readFileSync(new URL("../src/modules/auth/ProtectedRoute.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/app/App.tsx", import.meta.url), "utf8");

test("Logout beendet die Supabase-Sitzung und setzt den Auth-Zustand zurück", () => {
  assert.match(authProvider, /supabase\.auth\.signOut\(\)/);
  assert.match(authProvider, /if \(error\)[\s\S]*supabase\.auth\.signOut\(\{ scope: "local" \}\)/);
  assert.match(authProvider, /setSession\(null\)/);
  assert.match(authProvider, /setUser\(null\)/);
  assert.match(authProvider, /setRestaurantRole\(null\)/);
  assert.match(authProvider, /setPlatformRole\(null\)/);
  assert.match(authProvider, /AuthSessionMissingError/);
});

test("Logout entfernt Tenant-Daten und leitet zum Restaurant-Login", () => {
  assert.match(tenantProvider, /clearTenantState/);
  assert.match(tenantProvider, /setRestaurants\(\[\]\)/);
  assert.match(tenantProvider, /setActiveRestaurantId\(""\)/);
  assert.match(tenantProvider, /setBranding\(null\)/);
  assert.match(adminLayout, /clearTenantState\(\)/);
  assert.match(adminLayout, /navigate\("\/restaurant\/login"/);
  assert.match(protectedRoute, /: "\/restaurant\/login"/);
  assert.match(protectedRoute, /buildStaffLoginPath\(staffSlug\)/);
  assert.match(app, /path="\/restaurant\/login" element=\{<LoginPage \/>\}/);
});

test("Desktop und Mobile bieten echte Logout-Aktionen", () => {
  assert.match(adminLayout, /profile-menu desktop-profile-menu/);
  assert.match(adminLayout, /role="menuitem"/);
  assert.match(adminLayout, /className="mobile-menu-logout"/);
  assert.match(adminLayout, /Abmelden/);
  assert.match(adminLayout, /disabled=\{loggingOut\}/);
});
