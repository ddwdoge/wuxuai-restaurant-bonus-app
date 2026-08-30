import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { requiresAuthenticatedSession, shouldHydrateAuthSession } from "../src/modules/auth/authRoutePolicy.mjs";

const authProvider = readFileSync(new URL("../src/modules/auth/AuthProvider.tsx", import.meta.url), "utf8");
const supabaseClient = readFileSync(new URL("../src/shared/lib/supabase.ts", import.meta.url), "utf8");
const authSessionGuard = readFileSync(new URL("../src/modules/auth/authSessionGuard.mjs", import.meta.url), "utf8");

test("öffentliche Seiten initialisieren nur für additive Rollenaktivierung eine bestehende Session", () => {
  for (const path of ["/", "/customer/login", "/customer/register", "/customer/auth/callback", "/customer/email/confirm", "/customer/email/unsubscribe", "/w/cafe", "/legal/cafe", "/login", "/restaurant/login", "/register", "/r/cafe/referral"]) {
    assert.equal(requiresAuthenticatedSession(path), false, path);
  }
  for (const path of ["/register", "/customer/login", "/customer/register", "/r/cafe/abcdefghijklmnopqrstuvwxyz123456"]) {
    assert.equal(shouldHydrateAuthSession(path), true, path);
  }
  for (const path of ["/", "/w/cafe", "/legal/cafe", "/restaurant/login", "/r/cafe/referral"]) {
    assert.equal(shouldHydrateAuthSession(path), false, path);
  }
  assert.match(supabaseClient, /autoRefreshToken:\s*false/);
  assert.match(authProvider, /const sessionHydrationEnabled = shouldHydrateAuthSession\(location\.pathname\)/);
  assert.match(authProvider, /if \(!sessionHydrationEnabled\)[\s\S]*refreshController\.stop\(\)/);
});

test("geschützte Kunden-, Restaurant-, Staff- und Plattformrouten laden Sitzungen", () => {
  for (const path of ["/customer", "/customer/restaurants", "/customer/cafe", "/customer/cafe/offers", "/admin", "/admin/rewards", "/admin/platform", "/staff/cafe", "/platform-admin", "/platform-admin/restaurants"]) {
    assert.equal(requiresAuthenticatedSession(path), true, path);
  }
  assert.match(authProvider, /createAuthRefreshController/);
  assert.doesNotMatch(authProvider, /authClient\.startAutoRefresh\(\)/);
  assert.match(authProvider, /authClient\.getSession\(\)/);
  assert.match(authSessionGuard, /refreshPromise/);
});

test("Sessionfehler werden abgefangen und als ausgeloggter Zustand behandelt", () => {
  assert.match(authProvider, /\.catch\(async \(error\) =>/);
  assert.match(authProvider, /if \(error\)/);
  assert.match(authProvider, /invalidSessionHandler\.handle\(error\)/);
  assert.match(authProvider, /setSession\(null\)/);
  assert.match(authProvider, /setUser\(null\)/);
  assert.doesNotMatch(authProvider, /console\.(error|warn).*Session/);
});
