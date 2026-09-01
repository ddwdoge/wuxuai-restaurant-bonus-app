import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { customerSwitcherMemberships } from "../src/modules/customer/customerRestaurantSwitcher.mjs";

const [portal, header, switcher, switcherCss, access, service, migration] = await Promise.all([
  readFile(new URL("../src/modules/customer/CustomerPortal.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/modules/customer/components/PremiumCustomerUi.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/modules/customer/components/CustomerRestaurantSwitcher.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/modules/customer/components/customer-restaurant-switcher.css", import.meta.url), "utf8"),
  readFile(new URL("../src/modules/customer/CustomerRestaurantAccess.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/modules/customer/customerAccountService.ts", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260804003000_central_customer_login_restaurant_context.sql", import.meta.url), "utf8"),
]);

function membership(index, overrides = {}) {
  return {
    restaurant_id: `restaurant-${index}`,
    name: `Restaurant ${String(index).padStart(2, "0")}`,
    slug: `restaurant-${index}`,
    city: index % 2 ? "Wien" : "Traiskirchen",
    postal_code: "1010",
    membership_status: "active",
    points_balance: index === 2 ? 0 : index * 10,
    ...overrides,
  };
}

test("Header trennt Restaurantwechsel und Restaurantinformation", () => {
  assert.match(header, /aria-label="Aktuelles Restaurant wechseln"/);
  assert.match(header, /premium-customer-restaurant-selector/);
  assert.match(header, /<ChevronDown/);
  assert.match(header, /className="premium-icon-button" onClick=\{onInfo\}/);
  assert.match(portal, /onSwitchRestaurant=\{customer \? \(\) => setRestaurantSwitcherOpen\(true\)/);
});

test("Switcher nutzt nur den autoritativen Account-RPC und den bestehenden servervalidierten Open-RPC", () => {
  assert.match(switcher, /loadCustomerAccount/);
  assert.match(switcher, /openCustomerAccountMembership\(membership\)/);
  assert.doesNotMatch(switcher, /localStorage|sessionStorage|user_metadata|app_metadata/);
  assert.match(service, /rpc\("get_customer_account"\)/);
  assert.match(service, /rpc\("open_customer_account_membership"/);
  assert.match(migration, /where membership\.account_id = account_id_value/);
  assert.match(migration, /and membership\.restaurant_id = input_restaurant_id/);
});

test("aktuelles Restaurant steht zuerst und Nullpunkte bleiben sichtbar", () => {
  const result = customerSwitcherMemberships([membership(1), membership(2), membership(3)], "restaurant-2");
  assert.equal(result[0].slug, "restaurant-2");
  assert.equal(result[0].points_balance, 0);
  assert.equal(result.length, 3);
});

test("inaktive Beziehungen sowie fremde Suchtreffer bleiben verborgen", () => {
  const result = customerSwitcherMemberships([
    membership(1),
    membership(2, { membership_status: "inactive" }),
    membership(3, { city: "Graz" }),
  ], "restaurant-1", "Graz");
  assert.deepEqual(result.map((entry) => entry.slug), ["restaurant-1", "restaurant-3"]);
});

test("ein, fünf und zwanzig Restaurants bleiben deterministisch filterbar", () => {
  for (const count of [1, 5, 20]) {
    const memberships = Array.from({ length: count }, (_, index) => membership(index + 1));
    const result = customerSwitcherMemberships(memberships, "restaurant-1");
    assert.equal(result.length, count);
    assert.equal(result[0].slug, "restaurant-1");
  }
  const twenty = Array.from({ length: 20 }, (_, index) => membership(index + 1));
  assert.equal(customerSwitcherMemberships(twenty, "restaurant-1", "Restaurant 20").at(-1)?.slug, "restaurant-20");
});

test("Slug-Wechsel zeigt erst nach serverseitigem Open den neuen Portalinhalt", () => {
  assert.match(access, /setPortalRestaurantSlug\(null\)/);
  assert.match(access, /await openCustomerMembership\(nextContext\.restaurant_id\)/);
  assert.match(access, /const activeSlug = await openCustomerMembership/);
  assert.match(access, /setPortalRestaurantSlug\(activeSlug\)/);
  assert.match(access, /if \(portalRestaurantSlug\) return <CustomerPortal/);
  assert.match(access, /restaurantSlug=\{portalRestaurantSlug\}/);
  assert.match(switcher, /Restaurant wird gewechselt…/);
  assert.match(switcher, /Restaurant konnte nicht gewechselt werden\./);
});

test("QR und manueller Wechsel enden im selben kanonischen Restaurantzugang", () => {
  assert.match(access, /loadCustomerRestaurantContext\(restaurantSlug\)/);
  assert.match(access, /openCustomerMembership\(nextContext\.restaurant_id\)/);
  assert.match(switcher, /openCustomerAccountMembership\(membership\)/);
  assert.match(switcher, /navigate\(`\/customer\/\$\{encodeURIComponent\(canonicalSlug\)\}`\)/);
  assert.doesNotMatch(`${access}\n${switcher}`, /qrCurrentRestaurant|manualCurrentRestaurant/);
});

test("Drawer bleibt mobil kompakt, scrollbar und ohne starre Seitenbreite", () => {
  assert.match(switcherCss, /max-height: min\(46dvh, 430px\)/);
  assert.match(switcherCss, /overflow-y: auto/);
  assert.match(switcherCss, /min-height: 44px/);
  assert.match(switcherCss, /@media \(max-width: 430px\)/);
  assert.match(switcherCss, /@media \(max-width: 340px\)/);
  assert.doesNotMatch(switcherCss, /(?:^|[;{])\s*width:\s*[4-9]\d\dpx/m);
});
