import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildPasswordRecoveryPath,
  portalLoginLinks,
  readPasswordRecoveryContext,
  recoveryLoginPath,
} from "../src/modules/auth/portalRecoveryUx.mjs";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("all public portals use one contextual password recovery route", () => {
  assert.equal(buildPasswordRecoveryPath("customer"), "/auth/forgot-password?portal=customer");
  assert.equal(buildPasswordRecoveryPath("owner"), "/auth/forgot-password?portal=owner");
  assert.equal(
    buildPasswordRecoveryPath("staff", "mein-lokal"),
    "/auth/forgot-password?portal=staff&restaurant=mein-lokal",
  );
  assert.equal(buildPasswordRecoveryPath("staff", "../admin"), "/auth/forgot-password?portal=staff");
});

test("recovery callback returns only to a validated public portal", () => {
  assert.deepEqual(readPasswordRecoveryContext("?portal=staff&restaurant=mein-lokal"), {
    portal: "staff",
    staffSlug: "mein-lokal",
  });
  assert.equal(recoveryLoginPath({ portal: "customer", staffSlug: null }), "/customer/login");
  assert.equal(recoveryLoginPath({ portal: "owner", staffSlug: null }), "/restaurant/login");
  assert.equal(
    recoveryLoginPath({ portal: "staff", staffSlug: "mein-lokal" }),
    "/staff/login?restaurant=mein-lokal",
  );
  assert.deepEqual(readPasswordRecoveryContext("?portal=platform&restaurant=../admin"), {
    portal: "owner",
    staffSlug: null,
  });
});

test("login navigation advertises only the other public areas", () => {
  assert.deepEqual(portalLoginLinks("customer").map(({ label }) => label), [
    "Mitarbeiterbereich",
    "Restaurant-Portal",
  ]);
  assert.deepEqual(portalLoginLinks("staff").map(({ label }) => label), [
    "Kundenbereich",
    "Restaurant-Portal",
  ]);
  assert.deepEqual(portalLoginLinks("owner").map(({ label }) => label), [
    "Kundenbereich",
    "Mitarbeiterbereich",
  ]);
  assert.equal(portalLoginLinks("owner").some(({ path }) => path.includes("platform")), false);
});

test("Customer Staff and Owner login pages expose the shared UX", async () => {
  const [customer, staff, owner, navigation] = await Promise.all([
    read("../src/modules/customer/CustomerAuthPage.tsx"),
    read("../src/modules/auth/StaffLoginPage.tsx"),
    read("../src/modules/auth/LoginPage.tsx"),
    read("../src/modules/auth/PortalLoginNavigation.tsx"),
  ]);

  assert.match(customer, /buildPasswordRecoveryPath\("customer"\)/);
  assert.match(staff, /buildPasswordRecoveryPath\("staff", restaurantSlug\)/);
  assert.match(owner, /buildPasswordRecoveryPath\("owner"\)/);
  assert.match(navigation, /Anderen Bereich öffnen/);
  for (const source of [customer, staff, owner]) {
    assert.match(source, /PortalLoginNavigation/);
  }
});

test("shared reset stays anti-enumerating and updates only Supabase Auth", async () => {
  const [forgot, service, update] = await Promise.all([
    read("../src/modules/auth/ForgotPasswordPage.tsx"),
    read("../src/modules/auth/ownerAuthService.ts"),
    read("../src/modules/auth/UpdatePasswordPage.tsx"),
  ]);

  assert.match(forgot, /Wenn ein Konto mit dieser E-Mail-Adresse existiert/);
  assert.doesNotMatch(forgot, /nicht registriert|unbekannte E-Mail/i);
  assert.match(service, /resetPasswordForEmail/);
  assert.match(service, /searchParams\.set\("portal", context\.portal\)/);
  assert.match(service, /auth\.updateUser\(\{ password \}\)/);
  assert.match(update, /recoveryLoginPath\(recoveryContext\)/);
  assert.doesNotMatch([service, update].join("\n"), /start_restaurant_owner_trial|activate_authenticated_customer_account/);
});

test("existing Staff can log in directly while QR context remains exact when present", async () => {
  const staff = await read("../src/modules/auth/StaffLoginPage.tsx");
  assert.doesNotMatch(staff, /Dieser Mitarbeiter-QR ist ungültig/);
  assert.match(staff, /if \(!restaurantSlug\)[\s\S]*portalAccess\.staff_access[\s\S]*navigate\("\/staff"/);
  assert.match(staff, /if \(restaurantSlug && !restaurantName\) return/);
  assert.match(staff, /resolveMyStaffRestaurantAccess\(restaurantSlug\)/);
  assert.match(staff, /access\.restaurant_slug !== restaurantSlug/);
});
