import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  clearSupabaseAuthStorage,
  createAuthRefreshController,
  createInvalidRefreshSessionHandler,
  deriveSupabaseAuthStorageKey,
  isInvalidRefreshTokenError,
} from "../src/modules/auth/authSessionGuard.mjs";

function createStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    removeItem(key) { values.delete(key); },
    setItem(key, value) { values.set(key, String(value)); },
  };
}

test("strukturierte und vergleichbare ungültige Refresh-Token-Fehler werden erkannt", () => {
  for (const code of [
    "refresh_token_not_found",
    "refresh_token_already_used",
    "invalid_refresh_token",
    "refresh_token_expired",
    "refresh_token_revoked",
    "refresh_token_reuse_detected",
  ]) {
    assert.equal(isInvalidRefreshTokenError({ code, status: 400 }), true, code);
  }
  assert.equal(isInvalidRefreshTokenError({ message: "Invalid Refresh Token: Refresh Token Not Found" }), true);
  assert.equal(isInvalidRefreshTokenError({ message: "Refresh token already used" }), true);
});

test("Netzwerk-, Timeout-, 5xx- und unbekannte 400-Fehler löschen keine Sitzung", () => {
  for (const error of [
    new TypeError("Failed to fetch"),
    { message: "request timeout" },
    { status: 503, message: "service unavailable" },
    { status: 400, code: "validation_failed", message: "bad request" },
  ]) {
    assert.equal(isInvalidRefreshTokenError(error), false);
  }
});

test("lokale Sitzung und ausschließlich der projektbezogene Auth-Storage werden bereinigt", async () => {
  const storage = createStorage();
  const storageKey = deriveSupabaseAuthStorageKey("https://bwhvfjuwixgwduoeqaya.supabase.co");
  storage.setItem(storageKey, "session-secret");
  storage.setItem(`${storageKey}-code-verifier`, "pkce-secret");
  storage.setItem("sb-other-project-auth-token", "keep");
  let localSignOuts = 0;
  let redirects = 0;
  const handler = createInvalidRefreshSessionHandler({
    clearStorage() { clearSupabaseAuthStorage(storage, storageKey); },
    async localSignOut() { localSignOuts += 1; },
    onInvalidSession() { redirects += 1; },
  });

  await Promise.all([
    handler.handle({ code: "refresh_token_not_found" }),
    handler.handle({ code: "refresh_token_already_used" }),
  ]);

  assert.equal(localSignOuts, 1);
  assert.equal(redirects, 1);
  assert.equal(storage.getItem(storageKey), null);
  assert.equal(storage.getItem(`${storageKey}-code-verifier`), null);
  assert.equal(storage.getItem("sb-other-project-auth-token"), "keep");
});

test("Storage und Navigation werden auch bei lokalem Sign-out-Fehler genau einmal ausgeführt", async () => {
  let storageClears = 0;
  let redirects = 0;
  const handler = createInvalidRefreshSessionHandler({
    clearStorage() { storageClears += 1; },
    async localSignOut() { throw new Error("local cleanup failed"); },
    onInvalidSession() { redirects += 1; },
  });

  await handler.handle({ code: "refresh_token_revoked" });
  await handler.handle({ code: "refresh_token_revoked" });

  assert.equal(storageClears, 1);
  assert.equal(redirects, 1);
});

test("Single-Flight-Refresh erzeugt nur einen Request und stoppt nach ungültigem Token", async () => {
  const intervals = new Map();
  let nextInterval = 1;
  let refreshes = 0;
  let resolveRefresh;
  const pendingRefresh = new Promise((resolve) => { resolveRefresh = resolve; });
  let invalidErrors = 0;
  const controller = createAuthRefreshController({
    cancelInterval(id) { intervals.delete(id); },
    async handleRefreshError(error) {
      invalidErrors += 1;
      return isInvalidRefreshTokenError(error);
    },
    now: () => 1_000_000,
    onSession() {},
    async refreshSession() {
      refreshes += 1;
      return pendingRefresh;
    },
    scheduleInterval(callback) {
      const id = nextInterval;
      nextInterval += 1;
      intervals.set(id, callback);
      return id;
    },
  });
  const session = { expires_at: 1_000 };
  controller.start(session);
  controller.start(session);
  assert.equal(intervals.size, 1);

  const first = controller.refreshIfNeeded(true);
  const second = controller.refreshIfNeeded(true);
  assert.equal(refreshes, 1);
  resolveRefresh({ data: { session: null }, error: { code: "refresh_token_already_used" } });
  await Promise.all([first, second]);

  assert.equal(invalidErrors, 1);
  assert.equal(intervals.size, 0);
  await controller.refreshIfNeeded(true);
  assert.equal(refreshes, 1);
});

test("temporärer Refresh-Fehler stoppt nicht den Scheduler und wird nicht sofort wiederholt", async () => {
  const intervals = new Map();
  let refreshes = 0;
  const controller = createAuthRefreshController({
    cancelInterval(id) { intervals.delete(id); },
    async handleRefreshError(error) { return isInvalidRefreshTokenError(error); },
    now: () => 1_000_000,
    onSession() {},
    async refreshSession() {
      refreshes += 1;
      return { data: { session: null }, error: { status: 503, message: "temporary" } };
    },
    scheduleInterval(callback) { intervals.set(1, callback); return 1; },
  });
  controller.start({ expires_at: 1_000 });
  await controller.refreshIfNeeded(true);
  assert.equal(refreshes, 1);
  assert.equal(intervals.size, 1);
});

test("App und Recovery verwenden stabile Singleton-Exporte ohne Supabase-Auto-Refresh", () => {
  const source = readFileSync(new URL("../src/shared/lib/supabase.ts", import.meta.url), "utf8");
  assert.equal((source.match(/createClient\(/g) ?? []).length, 2);
  assert.equal((source.match(/autoRefreshToken:\s*false/g) ?? []).length, 2);
  assert.match(source, /storageKey:\s*"wuxuai-owner-recovery-auth"/);
});

test("explizite Registrierungs-Refreshes verwenden denselben ungültigen Session-Guard", () => {
  const source = readFileSync(new URL("../src/modules/auth/registerOwnerService.ts", import.meta.url), "utf8");
  assert.match(source, /createInvalidRefreshSessionHandler/);
  assert.match(source, /signOut\(\{ scope: "local" \}\)/);
  assert.match(source, /clearSupabaseAuthStorage\(window\.localStorage, supabaseAuthStorageKey\)/);
  assert.match(source, /window\.location\.replace\("\/restaurant\/login"\)/);
  assert.equal((source.match(/supabase\.auth\.refreshSession\(\)/g) ?? []).length, 1);
  assert.match(source, /if \(error\) await throwOwnerSessionError\(error\)/);
});
