import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260922006000_pending_activation_registration_and_live_gates.sql");
test("registration uses private transaction-scoped server context, never browser mode", () => {
  assert.match(migration,/c\.transaction_id=txid_current\(\)/);
  assert.match(migration,/c\.actor_id=r\.owner_id/);
  assert.match(migration,/c\.purpose='REGISTRATION'/);
  assert.match(migration,/return 'LEGACY_TRIAL'/);
  assert.match(migration,/case when pending_value then 'pending_activation' else 'trialing' end/);
  assert.match(migration,/case when not pending_value then now\(\) end/);
  assert.match(migration,/PENDING_REGISTRATION_CONTEXT_REQUIRED/);
});
test("pending audit immutable; authority and tenant moves fail closed", () => {
  assert.match(migration,/before update or delete or truncate/);
  assert.match(migration,/PENDING_TENANT_MOVE_FORBIDDEN/);
  assert.match(migration,/new\.trial_ends_at is not null/);
  assert.match(migration,/new\.stripe_subscription_id is not null/);
  assert.match(migration,/new\.operational_ready/);
  for (const name of ["restaurant_daily_pins","customers","points_transactions","customer_rewards","staff_members","customer_transactional_email_deliveries","commercial_pro_access_grants","country_launch_existing_businesses"]) assert.ok(migration.includes("'" + name + "'"),name);
});
test("entitlements, capacity and warnings remain inert for pending registrations", () => {
  assert.match(migration,/'effective_plan',null/);
  assert.match(migration,/'effective_limit',0/);
  assert.match(migration,/'SKIPPED'/);
  assert.match(migration,/activation_snapshot|activation_state_internal/);
});
test("pending setup cannot publish legal documents or start staff invitations", () => {
  assert.match(migration,/security_ready = not coalesce\(pending_setup,false\)/);
  assert.match(migration,/set legal_ready = case when pending_setup then false/);
  assert.match(migration,/public\.save_pending_restaurant_setup_internal/);
  assert.match(read("src/modules/onboarding/pilotOnboardingService.ts"),/if \(!pendingActivation\)/);
  const edge = read("supabase/functions/owner-staff-invite/index.ts");
  assert.ok(edge.indexOf('rpc("get_restaurant_activation_state"') < edge.indexOf("auth.admin.inviteUserByEmail"));
  assert.match(edge,/activation\?\.operational !== true/);
});
test("pending QR, staff and capacity components never mount operational hooks", () => {
  for (const page of ["QrCenterPage","StaffPage","OwnerCapacityPage"]) {
    const source = read("src/modules/admin/pages/" + page + ".tsx");
    assert.match(source,/if \(isPendingActivation\(activeRestaurant\)\) return <PendingActivationNotice preview/);
    assert.ok(source.indexOf("PendingActivationNotice preview") < source.indexOf("function Operational"+page));
  }
  const onboarding = read("src/modules/admin/pages/RestaurantOnboarding.tsx");
  assert.match(onboarding,/restaurantQrUrl = pendingActivation \? ""/);
  assert.match(onboarding,/if \(pendingActivation \|\| draftLoading/);
  assert.match(onboarding,/pendingActivation \? <PendingActivationNotice preview/);
  assert.match(read("src/modules/admin/AdminLayout.tsx"),/return activeRestaurant && !pendingActivation &&/);
});
test("pending messages cover seven locales without trial or capacity activation", () => {
  const source = read("src/modules/tenant/pendingActivation.ts");
  for (const language of ["de","en","fr","it","es","zh","ko"]) assert.match(source,new RegExp("  "+language+": \\{ title:"));
  assert.match(source,/Kein aktiver Tarif/);
  assert.match(source,/keine gestartete Testphase/);
  assert.match(read("src/modules/tenant/TenantProvider.tsx"),/status, activation_status,/);
  assert.match(read("src/modules/admin/pages/SettingsPage.tsx"),/trialStartedAt = pending \? null/);
});
