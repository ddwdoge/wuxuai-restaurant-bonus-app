import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  isPublicReferralPath,
  requiresAuthenticatedSession,
  shouldHydrateAuthSession,
} from "../src/modules/auth/authRoutePolicy.mjs";
import { safeCustomerReturnPath } from "../src/modules/customer/customerReturnPath.mjs";

const referralPath = "/r/wu-und-xu-group-gmbh/ff3687eb2e04a19d3a6c99b7b45551d41bd946c6";

test("public referral remains public but hydrates an existing auth session", () => {
  assert.equal(isPublicReferralPath(referralPath), true);
  assert.equal(requiresAuthenticatedSession(referralPath), false);
  assert.equal(shouldHydrateAuthSession(referralPath), true);
  assert.equal(safeCustomerReturnPath(referralPath), referralPath);
});

test("malformed or cross-origin referral continuations are rejected", () => {
  assert.equal(isPublicReferralPath("/r/restaurant/short"), false);
  assert.equal(shouldHydrateAuthSession("/r/restaurant/short"), false);
  assert.equal(safeCustomerReturnPath("//evil.example/r/restaurant/abcdefghijklmnopqrstuvwxyz"), "/customer");
  assert.equal(safeCustomerReturnPath("/r/restaurant/../../admin"), "/customer");
});

test("activation and confirmation return directly to the server-revalidated invitation", async () => {
  const [provider, authPage, callback, landing, accountService] = await Promise.all([
    readFile(new URL("../src/modules/auth/AuthProvider.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/modules/customer/CustomerAuthPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/modules/customer/CustomerAuthCallbackPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/modules/customer/ReferralLanding.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/modules/customer/customerAccountService.ts", import.meta.url), "utf8"),
  ]);

  assert.match(provider, /shouldHydrateAuthSession\(location\.pathname\)/);
  assert.match(provider, /referralContinuationPath[\s\S]*location\.pathname\}\$\{location\.search/);
  assert.match(authPage, /activateAuthenticatedCustomerAccount[\s\S]*window\.location\.assign\(returnTo\)/);
  assert.match(callback, /customer_return_to[\s\S]*safeCustomerReturnPath/);
  assert.match(landing, /portalAccess\.customer_access[\s\S]*Einladung bei/);
  assert.match(landing, /Einladung nicht annehmen/);
  assert.match(accountService, /join_authenticated_customer_referral/);
  assert.match(accountService, /input_restaurant_slug: input\.restaurantSlug/);
  assert.match(accountService, /input_referral_token: input\.referralToken/);
  assert.match(accountService, /input_terms_accepted: input\.termsAccepted/);
  assert.match(accountService, /input_privacy_acknowledged: input\.privacyAcknowledged/);
});
