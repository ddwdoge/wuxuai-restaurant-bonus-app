import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  clearTestOnlyBasicReauthContinuation,
  consumeTestOnlyBasicReauthContinuation,
  createTestOnlyBasicReauthContinuation,
  matchesTestOnlyBasicReauthContinuation,
  readTestOnlyBasicReauthContinuation,
  writeTestOnlyBasicReauthContinuation,
} from "../src/modules/verification/testOnlyBasicReauthContinuation.mjs";

const panel = await readFile(new URL(
  "../src/modules/verification/PlatformTestOnlyBasicAccessPanel.tsx",
  import.meta.url,
), "utf8");
const migration = await readFile(new URL(
  "../supabase/migrations/20261011225244_test_only_basic_operational_access.sql",
  import.meta.url,
), "utf8");
const legalMigration = await readFile(new URL(
  "../supabase/migrations/20261003001000_at_legal_bundle_publication_contract.sql",
  import.meta.url,
), "utf8");

const continuationId = "11111111-1111-4111-8111-111111111111";
const uuidPatternForTest = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function storageFixture() {
  const values = new Map();
  return {
    storage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
    values,
  };
}

test("BASIC reload continuation is short-lived and bound to tenant and identity", () => {
  const now = 1_800_000_000_000;
  const marker = createTestOnlyBasicReauthContinuation({
    restaurantId: "tenant-one",
    identityId: "admin-one",
    continuationId,
    now,
  });
  assert.equal(matchesTestOnlyBasicReauthContinuation(marker, {
    restaurantId: "tenant-one", identityId: "admin-one", now: now + 120_000,
  }), true);
  for (const candidate of [
    { restaurantId: "tenant-two", identityId: "admin-one", now: now + 1 },
    { restaurantId: "tenant-one", identityId: "admin-two", now: now + 1 },
    { restaurantId: "tenant-one", identityId: "admin-one", now: now + 120_001 },
    { restaurantId: "tenant-one", identityId: "admin-one", now: now - 1 },
  ]) assert.equal(matchesTestOnlyBasicReauthContinuation(marker, candidate), false);
  assert.equal(matchesTestOnlyBasicReauthContinuation("not-json", {
    restaurantId: "tenant-one", identityId: "admin-one", now,
  }), false);
});

test("BASIC reload continuation is consumed once and contains no authentication secret", () => {
  const { storage } = storageFixture();
  const marker = createTestOnlyBasicReauthContinuation({
    restaurantId: "tenant-one",
    identityId: "admin-one",
    continuationId,
    now: 1_800_000_000_000,
  });
  writeTestOnlyBasicReauthContinuation(storage, marker);
  assert.equal(readTestOnlyBasicReauthContinuation(storage), marker);
  assert.equal(consumeTestOnlyBasicReauthContinuation(storage), marker);
  assert.equal(consumeTestOnlyBasicReauthContinuation(storage), null);
  assert.doesNotMatch(marker, /code|token|password|factor/i);
  writeTestOnlyBasicReauthContinuation(storage, marker);
  clearTestOnlyBasicReauthContinuation(storage);
  assert.equal(consumeTestOnlyBasicReauthContinuation(storage), null);
});

test("malformed continuation ids cannot create or resume a marker", () => {
  assert.throws(() => createTestOnlyBasicReauthContinuation({
    restaurantId: "tenant-one", identityId: "admin-one", continuationId: "predictable",
  }), /CONTINUATION_ID_REQUIRED/);
  const malformed = JSON.stringify({
    version: 1, restaurantId: "tenant-one", identityId: "admin-one",
    continuationId: "predictable", startedAt: 1_800_000_000_000,
  });
  assert.equal(matchesTestOnlyBasicReauthContinuation(malformed, {
    restaurantId: "tenant-one", identityId: "admin-one", now: 1_800_000_000_001,
  }), false);
});

test("an omitted continuation id uses browser Web Crypto without an unbound receiver", () => {
  const marker = JSON.parse(createTestOnlyBasicReauthContinuation({
    restaurantId: "tenant-one",
    identityId: "admin-one",
    now: 1_800_000_000_000,
  }));
  assert.match(marker.continuationId, uuidPatternForTest);
});

test("the secure fallback creates an RFC 4122 v4 id from getRandomValues", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  try {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        getRandomValues(bytes) {
          bytes.set(Array.from({ length: 16 }, (_, index) => index));
          return bytes;
        },
      },
    });
    const marker = JSON.parse(createTestOnlyBasicReauthContinuation({
      restaurantId: "tenant-one",
      identityId: "admin-one",
      now: 1_800_000_000_000,
    }));
    assert.equal(marker.continuationId, "00010203-0405-4607-8809-0a0b0c0d0e0f");
  } finally {
    Object.defineProperty(globalThis, "crypto", descriptor);
  }
});

test("the panel consumes once only after server read plus identity match", () => {
  assert.match(panel, /readTestOnlyBasicReauthContinuation\(window\.sessionStorage\)/);
  assert.match(panel, /const fresh = await readTestOnlyBasicAccess\(restaurantId\);[\s\S]*?supabase\.auth\.getUser\(\)[\s\S]*?matchesTestOnlyBasicReauthContinuation/);
  assert.match(panel, /matches[\s\S]*?consumeTestOnlyBasicReauthContinuation\(window\.sessionStorage, continuation/);
  assert.match(panel, /setRecentReadbackPassed\(resumed\)/);
  assert.match(panel, /writeTestOnlyBasicReauthContinuation\(window\.sessionStorage, continuation\)[\s\S]*?confirmTestOnlyKybReauthentication/);
  assert.match(panel, /clearTestOnlyBasicReauthContinuation\(window\.sessionStorage\)/);
});

test("the authoritative BASIC readback enforces server-side recent TOTP", () => {
  assert.match(migration, /perform public\.require_legal_bundle_admin_internal\(\);/);
  assert.match(legalMigration, /create or replace function public\.require_legal_bundle_admin_internal\(\)[\s\S]*?perform public\.require_recent_platform_auth_internal\(\);/);
});

test("a continuation cannot call a writer or grant any BASIC capability", () => {
  const moduleSource = panel.match(/from "\.\/testOnlyBasicReauthContinuation\.mjs"/)?.[0] ?? "";
  assert.ok(moduleSource);
  assert.doesNotMatch(panel, /continuation[\s\S]{0,120}(?:decideTestOnlyBasicAccess|rpc\()/);
  assert.match(panel, /recentReadbackPassed \? <div className="platform-test-only-decision">/);
});
