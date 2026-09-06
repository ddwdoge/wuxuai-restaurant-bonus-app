import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260905004000_pro_package_entitlements.sql", import.meta.url), "utf8");
const platformPanel = readFileSync(new URL("../src/modules/platform/PlatformPlanEntitlementsPanel.tsx", import.meta.url), "utf8");
const platformService = readFileSync(new URL("../src/modules/platform/platformAdminService.ts", import.meta.url), "utf8");
const offerPage = readFileSync(new URL("../src/modules/admin/pages/RestaurantOffersPage.tsx", import.meta.url), "utf8");
const offerService = readFileSync(new URL("../src/modules/offers/restaurantOfferService.ts", import.meta.url), "utf8");
const templates = readFileSync(new URL("../supabase/functions/_shared/transactionalMailTemplates.mjs", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("central plan catalog defines the approved Basic, Pro and disabled Premium defaults", () => {
  assert.match(migration, /create table if not exists public\.commercial_plan_catalog/);
  assert.match(migration, /'BASIC', 59, true, 5, false, false, false, false/);
  assert.match(migration, /'PRO', 99, false, null, true, true, false, false/);
  assert.match(migration, /'PREMIUM', 199, false, null, true, true, false, false, null/);
  assert.match(migration, /commercial_plan_unbuilt_features_disabled/);
  assert.doesNotMatch(migration, /stripe_(?:secret|api)_key|checkout|webhook_secret/i);
});

test("offer limit is constrained to one through seven with null reserved for unlimited", () => {
  assert.match(migration, /offer_limit integer check \(offer_limit between 1 and 7\)/);
  assert.match(migration, /offer_limit_unlimited = true and offer_limit is null/);
  assert.match(migration, /OFFER_ACTIVE_LIMIT_REACHED:' \|\| effective_limit/);
  assert.match(migration, /if effective_limit is not null then/);
  assert.match(migration, /overlapping_count >= effective_limit/);
});

test("offer terminology remains isolated from gifts, rewards and redemptions", () => {
  const limiter = migration.slice(migration.indexOf("create or replace function public.validate_restaurant_offer_row"), migration.indexOf("alter table public.customer_transactional_email_deliveries"));
  assert.match(limiter, /public\.restaurant_offers/);
  assert.doesNotMatch(limiter, /customer_rewards|gift|redemption|rewards/);
  assert.match(offerPage, /Paket bestimmt die Anzahl gleichzeitig aktiver Angebote/);
});

test("Platform Admin entitlement writes are sensitive, reasoned, confirmed and immutable-audited", () => {
  assert.match(migration, /update_platform_restaurant_entitlements/);
  assert.match(migration, /role_value not in \('platform_owner', 'platform_admin', 'billing_admin'\)/);
  assert.match(migration, /length\(trim\(coalesce\(input_reason, ''\)\)\) < 10/);
  assert.match(migration, /input_confirmation <> 'CONFIRMED'/);
  assert.match(migration, /public\.platform_admin_operations/);
  assert.match(migration, /input_action, 'branch_subscription'/);
  assert.match(migration, /'SENSITIVE'/);
  assert.doesNotMatch(migration, /update public\.platform_admin_operations|delete from public\.platform_admin_operations/);
});

test("browser roles can read only their authorized tenant and cannot edit entitlement tables", () => {
  assert.match(migration, /public\.is_restaurant_admin\(input_restaurant_id\) or public\.is_platform_admin\(\)/);
  assert.match(migration, /revoke all on table public\.commercial_plan_catalog from public, anon, authenticated/);
  assert.match(migration, /revoke all on table public\.branch_entitlement_overrides from public, anon, authenticated/);
  assert.match(migration, /revoke execute on function public\.update_platform_restaurant_entitlements[\s\S]*from public, anon/);
  assert.doesNotMatch(platformService, /\.from\(/);
});

test("notification gates are server-side and preserve the existing queue", () => {
  assert.match(migration, /restaurant_entitlement_enabled\(input_restaurant_id, 'offer_notifications'\)/);
  assert.match(migration, /restaurant_entitlement_enabled\(new\.restaurant_id, 'reward_notifications'\)/);
  assert.match(migration, /'OFFER_PUBLISHED'/);
  assert.match(migration, /offer_record\.id::text \|\| ':' \|\| offer_record\.publication_version/);
  assert.match(migration, /on conflict \(event_type, event_key\) do nothing/);
  assert.match(migration, /customer_offer_email_consents/);
  assert.match(migration, /consent\.status = 'ACTIVE'/);
  assert.match(migration, /consent\.email_confirmed_at is not null/);
  assert.match(templates, /OFFER_PUBLISHED/);
});

test("Platform Admin and Owner views expose effective values without self-upgrade controls", () => {
  for (const label of ["Plan &amp; Funktionen", "Paketstandard Angebote", "Manuelle Ausnahme", "Wirksames Angebotslimit", "Nicht verfügbar / noch nicht aktiviert"]) {
    assert.match(platformPanel, new RegExp(label));
  }
  assert.match(platformPanel, /CONFIRMED/);
  assert.match(platformService, /get_restaurant_entitlements/);
  assert.match(platformService, /update_platform_restaurant_entitlements/);
  assert.match(offerPage, /Aktuelles Paket/);
  assert.match(offerPage, /Plan und Funktionen werden ausschließlich durch WUXUAI verwaltet/);
  assert.doesNotMatch(offerPage, /Paket wechseln|Upgrade kaufen|Plan ändern/);
  assert.match(offerService, /get_restaurant_entitlements/);
});

test("responsive entitlement controls retain 44px targets and mobile single-column layout", () => {
  assert.match(styles, /\.platform-entitlement-controls input,[\s\S]*min-height: 44px/);
  assert.match(styles, /@media \(max-width: 430px\)[\s\S]*\.platform-entitlement-toggle-row[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
});
