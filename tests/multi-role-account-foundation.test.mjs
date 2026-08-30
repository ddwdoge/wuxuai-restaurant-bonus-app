import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = async (path) => readFile(new URL(path, import.meta.url), "utf8");
const migration = await read("../supabase/migrations/20260830002000_multi_role_account_foundation.sql");

test("Customer role activation reuses the confirmed current Auth identity", () => {
  assert.match(migration, /activate_authenticated_customer_account\(/);
  assert.match(migration, /where id = auth\.uid\(\)/);
  assert.match(migration, /email_confirmed_at is null/);
  assert.match(migration, /where auth_user_id = auth\.uid\(\) and disabled_at is null[\s\S]*for update/);
  assert.doesNotMatch(migration, /insert into auth\.users|admin\.createUser|signUp/i);
});

test("Customer activation is authenticated-only and idempotent", () => {
  assert.match(migration, /security definer[\s\S]*set search_path = public, auth, pg_temp/i);
  assert.match(migration, /revoke all on function public\.activate_authenticated_customer_account\(text, text, date\)[\s\S]*public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.activate_authenticated_customer_account\(text, text, date\)[\s\S]*to authenticated/);
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\('customer-account:' \|\| auth\.uid\(\)::text, 0\)\)/);
  assert.match(migration, /if found then[\s\S]*update public\.customer_accounts[\s\S]*else[\s\S]*insert into public\.customer_accounts/);
});

test("Staff invitation no longer rejects unrelated Customer Owner or Platform roles globally", () => {
  assert.doesNotMatch(migration, /STAFF_AUTH_IDENTITY_ROLE_CONFLICT/);
  assert.doesNotMatch(migration, /from public\.customer_accounts ca/);
  assert.doesNotMatch(migration, /from public\.platform_admins pa/);
  assert.match(migration, /where restaurant_id = input_restaurant_id and user_id = input_auth_user_id/);
  assert.match(migration, /existing_role in \('owner', 'admin', 'manager'\)/);
});

test("Existing authenticated users receive additive Customer and Owner activation UX", async () => {
  const customerPage = await read("../src/modules/customer/CustomerAuthPage.tsx");
  const ownerPage = await read("../src/modules/auth/RegisterPage.tsx");
  const referral = await read("../src/modules/customer/ReferralLanding.tsx");
  assert.match(customerPage, /activateAuthenticatedCustomerAccount/);
  assert.match(customerPage, /Kundenbereich aktivieren/);
  assert.match(customerPage, /portalAccessError[\s\S]*Es wurde nichts angelegt/);
  assert.match(ownerPage, /activateRestaurantOwnerForCurrentUser/);
  assert.match(ownerPage, /Restaurantbereich aktivieren/);
  assert.match(ownerPage, /!activatingExistingAccount && !passwordValidation\.valid/);
  assert.match(ownerPage, /portalAccessError[\s\S]*Es wurde nichts angelegt/);
  assert.match(referral, /!portalAccess\.customer_access/);
});

test("Role switching keeps one session and exposes only verified available areas", async () => {
  const adminLayout = await read("../src/modules/admin/AdminLayout.tsx");
  const customerPortal = await read("../src/modules/customer/CustomerPortal.tsx");
  assert.match(adminLayout, /portalAccess\.customer_access/);
  assert.match(adminLayout, /portalAccess\.staff_access/);
  assert.match(customerPortal, /Bereich wechseln/);
  assert.doesNotMatch(adminLayout, /signOut\(\)[\s\S]{0,120}Kundenbereich/);
});
