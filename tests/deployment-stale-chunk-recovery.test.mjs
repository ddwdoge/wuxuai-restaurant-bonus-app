import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import worker from "../worker/index.mjs";
import {
  CHUNK_RECOVERY_STORAGE_KEY,
  createDeploymentRecoveryController,
  entryBuildIdFromHtml,
  isStaleChunkError,
} from "../src/app/deploymentRecovery.mjs";

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.get(key) ?? null; },
    removeItem(key) { values.delete(key); },
    setItem(key, value) { values.set(key, value); },
  };
}

test("recognizes only deployment-related dynamic import failures", () => {
  assert.equal(isStaleChunkError(new TypeError("Failed to fetch dynamically imported module")), true);
  assert.equal(isStaleChunkError(new Error("Importing a module script failed")), true);
  assert.equal(isStaleChunkError({ name: "ChunkLoadError", message: "Loading chunk 4 failed" }), true);
  assert.equal(isStaleChunkError(new Error("Customer account query failed")), false);
});

test("reloads once and renders the safe update state on an immediate repeat", () => {
  let now = 1_000;
  let reloads = 0;
  let fallbacks = 0;
  const storage = createStorage();
  const controller = createDeploymentRecoveryController({
    buildId: "index-old.js",
    now: () => now,
    reload: () => { reloads += 1; },
    renderFallback: () => { fallbacks += 1; },
    storage,
  });

  assert.equal(controller.recover(new Error("Failed to fetch dynamically imported module")), "reload");
  now += 500;
  assert.equal(controller.recover(new Error("Failed to fetch dynamically imported module")), "fallback");
  assert.equal(reloads, 1);
  assert.equal(fallbacks, 1);
});

test("a newly loaded build clears the previous build recovery guard", () => {
  const storage = createStorage({
    [CHUNK_RECOVERY_STORAGE_KEY]: JSON.stringify({ attemptedAt: 1_000, buildId: "index-old.js" }),
  });
  const controller = createDeploymentRecoveryController({
    buildId: "index-new.js",
    reload() {},
    renderFallback() {},
    storage,
  });

  controller.markCurrentBuildInitialized();
  assert.equal(storage.getItem(CHUNK_RECOVERY_STORAGE_KEY), null);
  assert.equal(entryBuildIdFromHtml('<script type="module" src="/assets/index-new.js"></script>', "https://bonus.example"), "index-new.js");
});

test("asset worker returns a real 404 for an asset swallowed by SPA fallback", async () => {
  const request = new Request("https://bonus.example/assets/AdminDashboard-oldhash.js");
  const response = await worker.fetch(request, {
    ASSETS: { fetch: async () => new Response("<!doctype html>", { headers: { "Content-Type": "text/html" } }) },
  });

  assert.equal(response.status, 404);
  assert.match(response.headers.get("content-type"), /^text\/plain/);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("asset worker keeps SPA routes and applies the intended cache contract", async () => {
  const assets = {
    fetch: async (request) => request.url.includes("/assets/")
      ? new Response("export{}", { headers: { "Content-Type": "text/javascript" } })
      : new Response("<!doctype html>", { headers: { "Content-Type": "text/html" } }),
  };
  const assetResponse = await worker.fetch(new Request("https://bonus.example/assets/index-AbCd1234.js"), { ASSETS: assets });
  const routeResponse = await worker.fetch(new Request("https://bonus.example/customer"), { ASSETS: assets });

  assert.equal(assetResponse.status, 200);
  assert.equal(assetResponse.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.equal(routeResponse.status, 200);
  assert.equal(routeResponse.headers.get("cache-control"), "no-cache, must-revalidate");
});

test("entry installs preload, generic import and BFCache recovery without changing auth", async () => {
  const main = await readFile(new URL("../src/main.tsx", import.meta.url), "utf8");
  const recovery = await readFile(new URL("../src/app/deploymentRecovery.mjs", import.meta.url), "utf8");
  const authProvider = await readFile(new URL("../src/modules/auth/AuthProvider.tsx", import.meta.url), "utf8");

  assert.match(main, /installDeploymentRecovery\(\)/);
  assert.match(recovery, /vite:preloadError/);
  assert.match(recovery, /unhandledrejection/);
  assert.match(recovery, /event\.persisted/);
  assert.match(recovery, /Eine neue Version von WUXUAI Bonus ist verfügbar\./);
  assert.match(authProvider, /signOut\(\{ scope: "local" \}\)/);
  assert.match(authProvider, /clearSupabaseAuthStorage\(window\.localStorage/);
});
