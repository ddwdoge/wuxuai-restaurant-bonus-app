import assert from "node:assert/strict";
import test from "node:test";

import {
  clearOwnerRecoveryMarker,
  createOwnerRecoveryLifecycle,
  createOwnerRecoverySessionEstablisher,
  establishOwnerRecoverySessionCore,
  OWNER_RECOVERY_MARKER_KEY,
  readOwnerRecoveryMarker,
  writeOwnerRecoveryMarker,
} from "../src/modules/auth/ownerRecoveryFlow.mjs";

function createStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    removeItem(key) { values.delete(key); },
    setItem(key, value) { values.set(key, String(value)); },
  };
}

function sessionResult(id = "owner-1") {
  return { data: { session: { access_token: "managed-by-supabase", user: { id } } }, error: null };
}

test("PKCE-Code wird genau einmal gegen eine Recovery-Session getauscht", async () => {
  const storage = createStorage();
  let exchanges = 0;
  const auth = {
    async exchangeCodeForSession(code) {
      exchanges += 1;
      assert.equal(code, "pkce-code");
      return sessionResult();
    },
  };

  const result = await establishOwnerRecoverySessionCore({
    auth,
    storage,
    url: "https://bonus.example/auth/update-password?code=pkce-code",
  });

  assert.equal(result.flowType, "pkce");
  assert.equal(result.user.id, "owner-1");
  assert.equal(exchanges, 1);
  assert.equal(readOwnerRecoveryMarker(storage), true);
});

test("Implicit-Hash setzt eine Recovery-Session mit vollständigem Tokenpaar", async () => {
  const storage = createStorage();
  let received = null;
  const auth = {
    async setSession(tokens) {
      received = tokens;
      return sessionResult();
    },
  };

  const result = await establishOwnerRecoverySessionCore({
    auth,
    storage,
    url: "https://bonus.example/auth/update-password#access_token=access&refresh_token=refresh&type=recovery",
  });

  assert.equal(result.flowType, "implicit");
  assert.deepEqual(received, { access_token: "access", refresh_token: "refresh" });
});

test("bereits bestehende Supabase-Recovery-Session wird nur mit gültigem Marker akzeptiert", async () => {
  const storage = createStorage();
  writeOwnerRecoveryMarker(storage);
  let reads = 0;
  const auth = {
    async getSession() {
      reads += 1;
      return sessionResult();
    },
  };

  const result = await establishOwnerRecoverySessionCore({
    auth,
    storage,
    url: "https://bonus.example/auth/update-password",
  });

  assert.equal(result.flowType, "existing");
  assert.equal(reads, 1);
});

test("Hash ohne Refresh Token wird abgelehnt und entfernt den Marker", async () => {
  const storage = createStorage();
  writeOwnerRecoveryMarker(storage);

  await assert.rejects(
    establishOwnerRecoverySessionCore({
      auth: { async setSession() { throw new Error("darf nicht aufgerufen werden"); } },
      storage,
      url: "https://bonus.example/auth/update-password#access_token=access&type=recovery",
    }),
    /ungültig oder abgelaufen/,
  );
  assert.equal(storage.getItem(OWNER_RECOVERY_MARKER_KEY), null);
});

test("Reload ohne URL, Marker und Session wird abgelehnt", async () => {
  const storage = createStorage();
  let sessionReads = 0;

  await assert.rejects(
    establishOwnerRecoverySessionCore({
      auth: { async getSession() { sessionReads += 1; return sessionResult(); } },
      storage,
      url: "https://bonus.example/auth/update-password",
    }),
    /ungültig oder abgelaufen/,
  );
  assert.equal(sessionReads, 0);
});

test("Recovery-Marker ist kurzlebig und enthält keine sensitiven Werte", () => {
  const storage = createStorage();
  const now = 1_000_000;
  writeOwnerRecoveryMarker(storage, now);
  const raw = storage.getItem(OWNER_RECOVERY_MARKER_KEY);

  assert.match(raw, /"version":1/);
  assert.doesNotMatch(raw, /access|refresh|code|password|email/i);
  assert.equal(readOwnerRecoveryMarker(storage, now + 60_000), true);
  assert.equal(readOwnerRecoveryMarker(storage, now + 21 * 60_000), false);
});

test("abgelaufene und beschädigte Marker werden entfernt", () => {
  const storage = createStorage();
  storage.setItem(OWNER_RECOVERY_MARKER_KEY, "not-json");
  assert.equal(readOwnerRecoveryMarker(storage), false);
  assert.equal(storage.getItem(OWNER_RECOVERY_MARKER_KEY), null);

  writeOwnerRecoveryMarker(storage, 1_000);
  assert.equal(readOwnerRecoveryMarker(storage, 1_000 + 21 * 60_000), false);
});

test("Single-Flight verhindert konkurrierende PKCE-Exchanges", async () => {
  const storage = createStorage();
  let exchanges = 0;
  let resolveExchange;
  const exchange = new Promise((resolve) => { resolveExchange = resolve; });
  const auth = {
    async exchangeCodeForSession() {
      exchanges += 1;
      return exchange;
    },
  };
  const establish = createOwnerRecoverySessionEstablisher();
  const options = {
    auth,
    storage,
    url: "https://bonus.example/auth/update-password?flow=recovery&code=one-use-code",
  };

  const first = establish(options);
  const second = establish(options);
  assert.equal(first, second);
  assert.equal(exchanges, 1);
  resolveExchange(sessionResult());
  await Promise.all([first, second]);
});

function createLifecycleHarness() {
  const queued = new Map();
  let nextTimer = 1;
  let signOuts = 0;
  let markerClears = 0;
  const lifecycle = createOwnerRecoveryLifecycle({
    cancel(timer) { queued.delete(timer); },
    clearMarker() { markerClears += 1; },
    async localSignOut() { signOuts += 1; },
    schedule(callback) {
      const timer = nextTimer;
      nextTimer += 1;
      queued.set(timer, callback);
      return timer;
    },
  });
  return {
    lifecycle,
    async flush() {
      const callbacks = [...queued.values()];
      queued.clear();
      callbacks.forEach((callback) => callback());
      await Promise.resolve();
    },
    markerClears: () => markerClears,
    signOuts: () => signOuts,
  };
}

test("Unmount ohne Passwortänderung führt zu genau einem lokalen Logout", async () => {
  const harness = createLifecycleHarness();
  const release = harness.lifecycle.acquire();
  harness.lifecycle.markEstablished();
  release();
  await harness.flush();

  assert.equal(harness.signOuts(), 1);
  assert.equal(harness.markerClears(), 1);
});

test("erfolgreiches Passwort-Update bereinigt genau einmal", async () => {
  const harness = createLifecycleHarness();
  const release = harness.lifecycle.acquire();
  harness.lifecycle.markEstablished();
  await harness.lifecycle.complete();
  release();
  await harness.flush();

  assert.equal(harness.signOuts(), 1);
  assert.equal(harness.markerClears(), 1);
});

test("Strict-Mode-Setup nach Cleanup-Ankündigung verhindert konkurrierenden Logout", async () => {
  const harness = createLifecycleHarness();
  const releaseFirstEffect = harness.lifecycle.acquire();
  harness.lifecycle.markEstablished();
  releaseFirstEffect();
  const releaseSecondEffect = harness.lifecycle.acquire();
  await harness.flush();
  assert.equal(harness.signOuts(), 0);

  releaseSecondEffect();
  await harness.flush();
  assert.equal(harness.signOuts(), 1);
});

test("mehrfaches Release erzeugt keinen doppelten Cleanup", async () => {
  const harness = createLifecycleHarness();
  const release = harness.lifecycle.acquire();
  harness.lifecycle.markEstablished();
  release();
  release();
  await harness.flush();
  assert.equal(harness.signOuts(), 1);
});

test("Cleanup-Logoutfehler bleiben kontrolliert", async () => {
  let markerClears = 0;
  const queued = [];
  const lifecycle = createOwnerRecoveryLifecycle({
    cancel() {},
    clearMarker() { markerClears += 1; },
    async localSignOut() { throw new Error("offline"); },
    schedule(callback) { queued.push(callback); return queued.length; },
  });
  const release = lifecycle.acquire();
  lifecycle.markEstablished();
  release();
  queued.forEach((callback) => callback());
  await Promise.resolve();
  assert.equal(markerClears, 1);
});

test("Marker kann nach Erfolg oder Abbruch explizit entfernt werden", () => {
  const storage = createStorage();
  writeOwnerRecoveryMarker(storage);
  clearOwnerRecoveryMarker(storage);
  assert.equal(storage.getItem(OWNER_RECOVERY_MARKER_KEY), null);
});
