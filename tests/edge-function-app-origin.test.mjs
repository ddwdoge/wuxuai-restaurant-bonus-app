import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  allowedAppOrigins,
  configuredAppOrigin,
} from "../supabase/functions/_shared/appOrigin.mjs";

test("Production und Staging verwenden getrennte kanonische App-Origins", () => {
  assert.equal(configuredAppOrigin("https://app.bonus.wuxuaisbi.com"), "https://app.bonus.wuxuaisbi.com");
  assert.equal(configuredAppOrigin("https://staging-app.bonus.wuxuaisbi.com"), "https://staging-app.bonus.wuxuaisbi.com");
  assert.equal(configuredAppOrigin("https://bonus.wuxuaisbi.com"), null);
  assert.equal(configuredAppOrigin("https://wuxuaisbi.com"), null);
});

test("Allowlist enthält nur die konfigurierte Umgebung und feste lokale Entwicklungsorigins", () => {
  const production = allowedAppOrigins("https://app.bonus.wuxuaisbi.com");
  assert.equal(production.has("https://app.bonus.wuxuaisbi.com"), true);
  assert.equal(production.has("https://staging-app.bonus.wuxuaisbi.com"), false);
  assert.equal(production.has("https://bonus.wuxuaisbi.com"), false);
  assert.equal(production.has("*"), false);
  assert.equal(production.has("http://127.0.0.1:5173"), true);

  const staging = allowedAppOrigins("https://staging-app.bonus.wuxuaisbi.com");
  assert.equal(staging.has("https://staging-app.bonus.wuxuaisbi.com"), true);
  assert.equal(staging.has("https://app.bonus.wuxuaisbi.com"), false);
});

test("Origin-Konfiguration akzeptiert keine Pfade, Credentials oder beliebigen Hosts", () => {
  for (const value of [
    "https://app.bonus.wuxuaisbi.com/customer",
    "https://user@app.bonus.wuxuaisbi.com",
    "https://example.com",
    "http://app.bonus.wuxuaisbi.com",
    "*",
    "",
  ]) {
    assert.equal(configuredAppOrigin(value), null);
  }
});

test("Owner-Functions beziehen CORS und Invite-Redirect aus APP_BASE_URL", async () => {
  const geocode = await readFile(new URL("../supabase/functions/owner-location-geocode/index.ts", import.meta.url), "utf8");
  const staffInvite = await readFile(new URL("../supabase/functions/owner-staff-invite/index.ts", import.meta.url), "utf8");
  const mailDispatcher = await readFile(new URL("../supabase/functions/transactional-mail-dispatcher/index.ts", import.meta.url), "utf8");

  assert.match(geocode, /allowedAppOrigins\(Deno\.env\.get\("APP_BASE_URL"\)\)/);
  assert.match(staffInvite, /configuredAppOrigin\(Deno\.env\.get\("APP_BASE_URL"\)\)/);
  assert.match(mailDispatcher, /configuredAppOrigin\(Deno\.env\.get\("APP_BASE_URL"\)\)/);
  assert.match(staffInvite, /const requestAppBaseUrl = origin && allowedOrigins\.has\(origin\) \? origin : appBaseUrl/);
  assert.match(staffInvite, /new URL\("\/auth\/staff-invite", requestAppBaseUrl\)/);
  assert.doesNotMatch(geocode, /access-control-allow-origin[^\n]*\*/i);
  assert.doesNotMatch(staffInvite, /access-control-allow-origin[^\n]*\*/i);
  assert.doesNotMatch(staffInvite, /https:\/\/bonus\.wuxuaisbi\.com/);
});
