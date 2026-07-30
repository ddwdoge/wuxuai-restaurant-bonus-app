import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { requiresAuthenticatedSession } from "../src/modules/auth/authRoutePolicy.mjs";

const authProvider = readFileSync(new URL("../src/modules/auth/AuthProvider.tsx", import.meta.url), "utf8");
const supabaseClient = readFileSync(new URL("../src/shared/lib/supabase.ts", import.meta.url), "utf8");

test("öffentliche Seiten initialisieren keine Supabase-Session", () => {
  for (const path of ["/", "/customer", "/customer/restaurants", "/customer/cafe", "/w/cafe", "/legal/cafe", "/login", "/restaurant/login", "/register", "/r/cafe/referral"]) {
    assert.equal(requiresAuthenticatedSession(path), false, path);
  }
  assert.match(supabaseClient, /autoRefreshToken:\s*false/);
  assert.match(authProvider, /if \(!authSessionRequired\)[\s\S]*stopAutoRefresh\(\)/);
});

test("geschützte Restaurant-, Staff- und Plattformrouten laden Sitzungen", () => {
  for (const path of ["/admin", "/admin/rewards", "/admin/platform", "/staff/cafe", "/platform-admin", "/platform-admin/restaurants"]) {
    assert.equal(requiresAuthenticatedSession(path), true, path);
  }
  assert.match(authProvider, /authClient\.startAutoRefresh\(\)/);
  assert.match(authProvider, /authClient\.getSession\(\)/);
});

test("Sessionfehler werden abgefangen und als ausgeloggter Zustand behandelt", () => {
  assert.match(authProvider, /\.catch\(\(\) =>/);
  assert.match(authProvider, /if \(error\)/);
  assert.match(authProvider, /setSession\(null\)/);
  assert.match(authProvider, /setUser\(null\)/);
  assert.doesNotMatch(authProvider, /console\.(error|warn).*Session/);
});
