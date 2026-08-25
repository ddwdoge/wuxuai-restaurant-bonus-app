import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = async (path) => readFile(new URL(path, import.meta.url), "utf8");
const [app, gate, accessContext, loginPage, service, staffTablet, migration, teamMigration] = await Promise.all([
  read("../src/app/App.tsx"),
  read("../src/modules/auth/StaffRestaurantRouteGate.tsx"),
  read("../src/modules/auth/staffPortalAccessContext.ts"),
  read("../src/modules/auth/StaffLoginPage.tsx"),
  read("../src/modules/auth/staffLoginService.ts"),
  read("../src/modules/staff/StaffTablet.tsx"),
  read("../supabase/migrations/20260825005000_owner_own_staff_portal_access.sql"),
  read("../supabase/migrations/20260825002000_owner_staff_account_management.sql"),
]);

test("Staff routes admit operator roles only before the restaurant-scoped server gate", () => {
  assert.equal((app.match(/allowedRoles=\{\["owner", "admin", "manager", "staff", "supervisor"\]\}/g) ?? []).length, 2);
  assert.match(app, /<StaffRestaurantRouteGate>/);
  assert.match(gate, /resolveMyStaffRestaurantAccess\(slug\)/);
  assert.match(gate, /access\.success && access\.restaurant_slug === slug/);
});

test("server resolver authorizes only an exact authoritative restaurant relation", () => {
  assert.match(migration, /rm\.restaurant_id = r\.id/);
  assert.match(migration, /rm\.user_id = auth\.uid\(\)/);
  assert.match(migration, /rm\.role in \('owner', 'admin', 'manager'\)/);
  assert.match(migration, /rm\.role in \('staff', 'supervisor'\)/);
  assert.match(migration, /sm\.restaurant_id = r\.id/);
  assert.match(migration, /sm\.auth_user_id = auth\.uid\(\)/);
  assert.match(migration, /sm\.active = true/);
  assert.match(migration, /sm\.account_status = 'active'/);
  assert.match(migration, /r\.slug = lower\(btrim\(input_restaurant_slug\)\)/);
  assert.doesNotMatch(migration, /platform_admins|current_platform_role|user_metadata|app_metadata|email\s*=/i);
});

test("operator access is explicit and never creates or impersonates Staff", () => {
  assert.match(migration, /'access_mode', case[\s\S]*then 'operator'/);
  assert.match(migration, /'restaurant_role', rm\.role/);
  assert.match(service, /access_mode\?: "operator" \| "staff"/);
  assert.match(service, /restaurant_role\?: "owner" \| "admin" \| "manager" \| "staff" \| "supervisor"/);
  assert.doesNotMatch(migration, /insert into public\.staff_members|update public\.staff_members|insert into public\.restaurant_members/i);
});

test("owner operational actions retain the real actor and normalize the audit role", () => {
  assert.match(migration, /input_actor_id = auth\.uid\(\)/);
  assert.match(migration, /actor_type_value := 'admin'/);
  assert.match(migration, /'actor_restaurant_role', actor_restaurant_role/);
  assert.match(migration, /input_actor_id, lower\(input_event_type\)/);
  assert.doesNotMatch(migration, /staff_member_id/);
});

test("the Staff UI clearly labels authoritative operator access", () => {
  assert.match(gate, /StaffPortalAccessContext\.Provider value=\{access\}/);
  assert.match(accessContext, /export function useStaffPortalAccess/);
  assert.match(staffTablet, /useStaffPortalAccess\(\)/);
  assert.match(staffTablet, /Mitarbeiterbereich – Betreiberzugriff/);
  assert.match(loginPage, /Mit deinem persönlichen Konto anmelden\./);
});

test("team management remains owner-admin only", () => {
  assert.match(teamMigration, /rm\.role in \('owner', 'admin'\)/);
  assert.match(teamMigration, /create or replace function public\.can_manage_restaurant_staff/);
  assert.doesNotMatch(migration, /can_manage_restaurant_staff/);
});

test("security definer contracts retain fixed search paths and narrow grants", () => {
  assert.equal((migration.match(/security definer/g) ?? []).length, 2);
  assert.equal((migration.match(/set search_path = public, pg_temp/g) ?? []).length, 2);
  assert.match(migration, /revoke all on function public\.get_my_staff_restaurant_access\(text\)[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.get_my_staff_restaurant_access\(text\)[\s\S]*to authenticated/);
  assert.match(migration, /revoke execute on function public\.write_audit_event\([\s\S]*from public, anon, authenticated/);
});
