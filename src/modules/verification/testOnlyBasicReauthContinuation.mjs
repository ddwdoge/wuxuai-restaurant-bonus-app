const storageKey = "wuxuai.test-only-basic-reauth-continuation";
const maximumAgeMs = 2 * 60 * 1000;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createSecureContinuationId() {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi) throw new Error("TEST_ONLY_BASIC_REAUTH_SECURE_RANDOM_REQUIRED");
  if (typeof cryptoApi.randomUUID === "function") return cryptoApi.randomUUID();
  if (typeof cryptoApi.getRandomValues !== "function") {
    throw new Error("TEST_ONLY_BASIC_REAUTH_SECURE_RANDOM_REQUIRED");
  }

  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

export function createTestOnlyBasicReauthContinuation({
  restaurantId,
  identityId,
  continuationId,
  now = Date.now(),
}) {
  const resolvedContinuationId = continuationId ?? createSecureContinuationId();
  if (!uuidPattern.test(String(resolvedContinuationId))) {
    throw new Error("TEST_ONLY_BASIC_REAUTH_CONTINUATION_ID_REQUIRED");
  }
  return JSON.stringify({
    version: 1,
    restaurantId,
    identityId,
    continuationId: resolvedContinuationId,
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
