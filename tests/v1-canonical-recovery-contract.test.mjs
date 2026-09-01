import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const app = read("../src/app/App.tsx");
const customerAuth = read("../src/modules/customer/CustomerAuthPage.tsx");
const customerAuthService = read("../src/modules/customer/customerAuthService.ts");
const customerPortal = read("../src/modules/customer/CustomerPortal.tsx");
const centralCustomer = read("../src/modules/customer/CentralCustomerPage.tsx");
const centralNavigation = read("../src/modules/customer/components/CentralCustomerNavigation.tsx");
const premiumCustomerUi = read("../src/modules/customer/components/PremiumCustomerUi.tsx");
const referralLanding = read("../src/modules/customer/ReferralLanding.tsx");
const loyaltyService = read("../src/modules/loyalty/loyaltyService.ts");
const loyaltyPage = read("../src/modules/admin/pages/LoyaltyPage.tsx");
const publicHome = read("../src/modules/public/PublicHome.tsx");
const ownerLayout = read("../src/modules/admin/AdminLayout.tsx");
const settingsPage = read("../src/modules/admin/pages/SettingsPage.tsx");
const onboarding = read("../src/modules/admin/pages/RestaurantOnboarding.tsx");
const staffPortal = read("../src/modules/staff/StaffTablet.tsx");
const html = read("../index.html");
const referralMigration = read("../supabase/migrations/20260824001000_v1_referral_owner_duration_split.sql");
const presentationMigration = read("../supabase/migrations/20260803007000_points_redemption_presentation_window.sql");

const activeUi = [
  app,
  customerAuth,
  customerPortal,
  centralCustomer,
  centralNavigation,
  premiumCustomerUi,
  referralLanding,
  publicHome,
  ownerLayout,
  settingsPage,
  onboarding,
  staffPortal,
].join("\n");

test("aktive Oberflächen verwenden WUXUAI Bonus und Meine Vorteile", () => {
  assert.doesNotMatch(activeUi, /Mein WUXUAI|WUXUAI Restaurant Bonus|WUXUAI Restaurant Growth OS/);
  assert.doesNotMatch(activeUi, /Mein Bonus/);
  assert.match(activeUi, /WUXUAI Bonus/);
  assert.match(activeUi, /Meine Vorteile/);
  assert.match(html, /<title>WUXUAI Bonus<\/title>/);
  assert.match(html, /name="application-name" content="WUXUAI Bonus"/);
});

test("Customer Auth behält Doppelpasswort, E-Mail-Bestätigung und Resend", () => {
  assert.match(customerAuth, /confirmPassword/);
  assert.match(customerAuth, /Passwort bestätigen/);
  assert.match(customerAuthService, /emailRedirectTo/);
  assert.match(customerAuthService, /auth\.resend/);
  assert.doesNotMatch(customerAuthService, /confirmPassword/);
});

test("aktive Customer-Registrierung verwendet ausschließlich den Legal-RPC", () => {
  assert.match(loyaltyService, /register_restaurant_customer_legal/);
  assert.match(loyaltyService, /register_referral_customer_legal/);
  assert.doesNotMatch(loyaltyService, /supabase\.rpc\("register_restaurant_customer"/);
  assert.doesNotMatch(loyaltyService, /supabase\.rpc\("register_referral_customer"/);
});

test("15-Minuten-Präsentation bleibt aktiv und Staff erhält keinen Primary-Code-Flow", () => {
  assert.match(presentationMigration, /15 minutes/);
  assert.match(customerPortal, /startCustomerPointsPresentation/);
  assert.doesNotMatch(staffPortal, /Sechsstelliger Einlösecode|consumeRedemptionCode/);
});

test("Referral ist auf 14 Tage, 2x und die halbe Freundesdauer begrenzt", () => {
  assert.match(referralMigration, /referral_boost_duration_days set default 14/);
  assert.match(referralMigration, /beneficiary_role in \('referrer', 'invited_friend'\)/);
  assert.match(referralMigration, /referral_boost_duration_days::double precision \* 43200/);
  assert.match(referralMigration, /multiplier numeric\(8, 2\) not null default 2 check \(multiplier = 2\)/);
  assert.match(loyaltyPage, /referralBonusDurationPresets\.map/);
  assert.match(loyaltyService, /if \(!contextError\) \{/);
  assert.doesNotMatch(loyaltyService, /throw contextError/);
});

test("Routes bleiben unverändert", () => {
  for (const route of [
    'path="/admin"',
    'path="/staff/:slug"',
    'path="/customer/:slug"',
    'path="/w/:slug"',
    'path="/r/:restaurantSlug/:referralToken"',
  ]) assert.match(app, new RegExp(route.replaceAll("/", "\\/")));
});
