const storageKey = "wuxuai.test-only-basic-reauth-continuation";
const maximumAgeMs = 2 * 60 * 1000;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createTestOnlyBasicReauthContinuation({
  restaurantId,
  identityId,
  continuationId = globalThis.crypto?.randomUUID?.(),
  now = Date.now(),
}) {
  if (!uuidPattern.test(String(continuationId ?? ""))) {
    throw new Error("TEST_ONLY_BASIC_REAUTH_CONTINUATION_ID_REQUIRED");
  }
  return JSON.stringify({
    version: 1,
    restaurantId,
    identityId,
    continuationId,
    startedAt: now,
  });
}

export function matchesTestOnlyBasicReauthContinuation(raw, {
  restaurantId,
  identityId,
  now = Date.now(),
}) {
  try {
    const parsed = JSON.parse(String(raw ?? ""));
    return parsed.version === 1
      && parsed.restaurantId === restaurantId
      && parsed.identityId === identityId
      && uuidPattern.test(String(parsed.continuationId ?? ""))
      && Number.isFinite(parsed.startedAt)
      && parsed.startedAt <= now
      && now - parsed.startedAt <= maximumAgeMs;
  } catch {
    return false;
  }
}

export function writeTestOnlyBasicReauthContinuation(storage, value) {
  storage?.setItem(storageKey, value);
}

export function readTestOnlyBasicReauthContinuation(storage) {
  return storage?.getItem(storageKey) ?? null;
}

export function consumeTestOnlyBasicReauthContinuation(storage, expectedValue = undefined) {
  const value = storage?.getItem(storageKey) ?? null;
  if (expectedValue !== undefined && value !== expectedValue) return null;
  storage?.removeItem(storageKey);
  return value;
}

export function clearTestOnlyBasicReauthContinuation(storage) {
  storage?.removeItem(storageKey);
}
