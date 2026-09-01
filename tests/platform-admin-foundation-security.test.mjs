import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  canAccessPlatformAdmin,
  canWritePlatformAdmin,
  PLATFORM_ADMIN_ROLES,
} from "../src/modules/platform/platformAdminAuthorization.mjs";

const app = readFileSync(new URL("../src/app/App.tsx", import.meta.url), "utf8");
const authProvider = readFileSync(new URL("../src/modules/auth/AuthProvider.tsx", import.meta.url), "utf8");
const service = readFileSync(new URL("../src/modules/platform/platformAdminService.ts", import.meta.url), "utf8");
const hardeningMigration = readFileSync(
  new URL("../supabase/migrations/20260824003000_platform_admin_foundation_hardening.sql", import.meta.url),
  "utf8",
);
const managementMigration = readFileSync(
  new URL("../supabase/migrations/20260713002000_platform_admin_restaurant_management.sql", import.meta.url),
  "utf8",
);

test("platform_admin ist erlaubt und normale Produktrrollen sind blockiert", () => {
  assert.equal(canAccessPlatformAdmin("platform_admin"), true);
  for (const role of ["owner", "admin", "manager", "staff", "supervisor", "customer", null, undefined]) {
    assert.equal(canAccessPlatformAdmin(role), false, `${String(role)} darf kein Plattform-Admin sein`);
  }
});

test("nur dokumentierte interne Rollen gehören zur Plattformmatrix", () => {
  assert.deepEqual(PLATFORM_ADMIN_ROLES, [
    "platform_owner",
    "platform_admin",
    "app_admin",
    "super_admin",
    "wuxuai_admin",
    "support",
    "billing_admin",
    "security_admin",
    "viewer",
  ]);
  assert.equal(canWritePlatformAdmin("platform_admin"), true);
  assert.equal(canWritePlatformAdmin("support"), false);
  assert.equal(canWritePlatformAdmin("security_admin"), false);
  assert.equal(canWritePlatformAdmin("viewer"), false);
});

test("Plattformrouten verwenden ausschließlich den zentralen Plattform-Scope", () => {
  assert.match(app, /path="\/platform-admin"[\s\S]*allowedRoles=\{\[\.\.\.PLATFORM_ADMIN_ROLES\]\}[\s\S]*roleScope="platform"/);
  assert.match(app, /path="\/admin\/platform"[\s\S]*allowedRoles=\{\[\.\.\.PLATFORM_ADMIN_ROLES\]\}[\s\S]*roleScope="platform"/);
  assert.doesNotMatch(app, /path="\/platform-admin"[\s\S]{0,500}allowedRoles=\{\["owner"/);
});

test("Client akzeptiert keine Plattformrolle aus Metadaten", () => {
  assert.match(authProvider, /supabase\.rpc\("get_current_platform_role"\)/);
  assert.match(authProvider, /return isPlatformAdminRole\(data\) \? data : null/);
  assert.doesNotMatch(authProvider, /readAppMetadataPlatformRole/);
  assert.doesNotMatch(authProvider, /app_metadata[^\n]*platform/i);
});

test("dedizierter Plattform-Service verwendet nur eng begrenzte RPCs", () => {
  assert.match(service, /supabase\.rpc\("get_platform_restaurants"\)/);
  assert.match(service, /supabase\.rpc\("get_platform_restaurant_detail"/);
  assert.match(service, /supabase\.rpc\("update_platform_restaurant_subscription"/);
  assert.match(service, /supabase\.rpc\("get_platform_audit_events"/);
  assert.doesNotMatch(service, /\.from\(/);
  assert.doesNotMatch(service, /service[_-]?role/i);
});

test("serverseitige Plattformrolle stammt nur aus aktiven internen Rollen", () => {
  assert.match(hardeningMigration, /from public\.platform_admins pa/);
  assert.match(hardeningMigration, /pa\.user_id = auth\.uid\(\)/);
  assert.match(hardeningMigration, /pa\.active = true/);
  assert.doesNotMatch(hardeningMigration, /auth\.jwt|app_metadata|user_metadata|restaurant_members/);
  assert.match(hardeningMigration, /security definer[\s\S]*set search_path = public, pg_temp/);
});

test("Plattformrollentabelle und Helper besitzen keine direkten Browserrechte", () => {
  assert.match(hardeningMigration, /alter table public\.platform_admins enable row level security/);
  assert.match(hardeningMigration, /revoke all on table public\.platform_admins from public, anon, authenticated/);
  assert.match(hardeningMigration, /revoke execute on function public\.current_platform_role\(\) from public, anon, authenticated/);
  assert.match(hardeningMigration, /revoke execute on function public\.is_platform_admin\(\) from public, anon, authenticated/);
  assert.match(hardeningMigration, /grant execute on function public\.get_current_platform_role\(\) to authenticated/);
});

test("bestehender Plattform-Auditvertrag enthält Actor, Ziel, Zustände und Grund", () => {
  assert.match(managementMigration, /insert into public\.audit_log/);
  assert.match(managementMigration, /actor_type,[\s\S]*actor_id,[\s\S]*action,[\s\S]*target_table,[\s\S]*target_id/);
  assert.match(managementMigration, /'previous_subscription', previous_subscription/);
  assert.match(managementMigration, /'next_subscription', to_jsonb\(subscription_record\)/);
  assert.match(managementMigration, /'reason', nullif/);
  assert.doesNotMatch(service, /deletePlatform|\.delete\(/);
});

test("Hardening verändert keine normale Tenant-RLS oder Businesslogik", () => {
  const alteredTables = [...hardeningMigration.matchAll(/alter table public\.([a-z_]+)/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(alteredTables)], ["platform_admins"]);
  assert.doesNotMatch(hardeningMigration, /customers|restaurant_members|points_transactions|rewards|referral|redemption/);
  assert.doesNotMatch(hardeningMigration, /disable row level security|drop policy|create policy/);
});
