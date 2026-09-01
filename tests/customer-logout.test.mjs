import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const portal = readFileSync(new URL("../src/modules/customer/CustomerPortal.tsx", import.meta.url), "utf8");

test("restaurant customer logout ends the central auth session before opening login", () => {
  const start = portal.indexOf("async function handleCustomerLogout()");
  const end = portal.indexOf("function openRewardRedemption", start);
  const logoutFlow = portal.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(logoutFlow, /removeStoredCustomerToken\(restaurantSlug\)/);
  assert.match(logoutFlow, /await signOut\(\)/);
  assert.match(logoutFlow, /finally[\s\S]*window\.location\.assign\("\/customer\/login"\)/);
  assert.doesNotMatch(logoutFlow, /window\.location\.assign\(`\/customer\/\$\{restaurantSlug\}`\)/);
});
