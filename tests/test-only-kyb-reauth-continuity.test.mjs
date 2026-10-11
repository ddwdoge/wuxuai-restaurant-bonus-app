import assert from "node:assert/strict";
import test from "node:test";
import { shouldPreserveAuthorizedSurface } from "../src/modules/auth/authEventContinuity.mjs";
import {
  clearTestOnlyKybReauthContinuation,
  createTestOnlyKybReauthContinuation,
  matchesTestOnlyKybReauthContinuation,
  readTestOnlyKybReauthContinuation,
  writeTestOnlyKybReauthContinuation,
} from "../src/modules/verification/testOnlyKybReauthContinuation.mjs";

test("only same-identity MFA verification preserves an already authorized surface", () => {
  assert.equal(shouldPreserveAuthorizedSurface({
    event: "MFA_CHALLENGE_VERIFIED",
    currentUserId: "reviewer-one",
    nextUserId: "reviewer-one",
  }), true);
  for (const candidate of [
    { event: "TOKEN_REFRESHED", currentUserId: "reviewer-one", nextUserId: "reviewer-one" },
    { event: "MFA_CHALLENGE_VERIFIED", currentUserId: "reviewer-one", nextUserId: "reviewer-two" },
    { event: "MFA_CHALLENGE_VERIFIED", currentUserId: null, nextUserId: "reviewer-one" },
    { event: "MFA_CHALLENGE_VERIFIED", currentUserId: "reviewer-one", nextUserId: null },
  ]) assert.equal(shouldPreserveAuthorizedSurface(candidate), false);
});

test("reload continuation is short-lived and bound to the exact tenant and identity", () => {
  const now = 1_800_000_000_000;
  const marker = createTestOnlyKybReauthContinuation({
    restaurantId: "tenant-one",
    identityId: "reviewer-one",
    now,
  });
  assert.equal(matchesTestOnlyKybReauthContinuation(marker, {
    restaurantId: "tenant-one",
    identityId: "reviewer-one",
    now: now + 120_000,
  }), true);
  assert.equal(matchesTestOnlyKybReauthContinuation(marker, {
    restaurantId: "tenant-two",
    identityId: "reviewer-one",
    now: now + 1,
  }), false);
  assert.equal(matchesTestOnlyKybReauthContinuation(marker, {
    restaurantId: "tenant-one",
    identityId: "reviewer-two",
    now: now + 1,
  }), false);
  assert.equal(matchesTestOnlyKybReauthContinuation(marker, {
    restaurantId: "tenant-one",
    identityId: "reviewer-one",
    now: now + 120_001,
  }), false);
  assert.equal(matchesTestOnlyKybReauthContinuation(marker, {
    restaurantId: "tenant-one",
    identityId: "reviewer-one",
    now: now - 1,
  }), false);
  assert.equal(matchesTestOnlyKybReauthContinuation("not-json", {
    restaurantId: "tenant-one",
    identityId: "reviewer-one",
    now,
  }), false);
});

test("reload continuation storage can be consumed and cleared without secrets", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const marker = createTestOnlyKybReauthContinuation({
    restaurantId: "tenant-one",
    identityId: "reviewer-one",
    now: 1_800_000_000_000,
  });
  writeTestOnlyKybReauthContinuation(storage, marker);
  assert.equal(readTestOnlyKybReauthContinuation(storage), marker);
  assert.doesNotMatch(marker, /code|token|password/i);
  clearTestOnlyKybReauthContinuation(storage);
  assert.equal(readTestOnlyKybReauthContinuation(storage), null);
});
