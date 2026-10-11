const storageKey = "wuxuai.test-only-activation-trial-reauth-continuation";
const maximumAgeMs = 2 * 60 * 1000;

export function createTestOnlyActivationTrialReauthContinuation({ restaurantId, identityId, now = Date.now() }) {
  return JSON.stringify({ version: 1, restaurantId, identityId, startedAt: now });
}

export function matchesTestOnlyActivationTrialReauthContinuation(raw, { restaurantId, identityId, now = Date.now() }) {
  try {
    const parsed = JSON.parse(String(raw ?? ""));
    return parsed.version === 1
      && parsed.restaurantId === restaurantId
      && parsed.identityId === identityId
      && Number.isFinite(parsed.startedAt)
      && parsed.startedAt <= now
      && now - parsed.startedAt <= maximumAgeMs;
  } catch {
    return false;
  }
}

export function readTestOnlyActivationTrialReauthContinuation(storage) {
  return storage?.getItem(storageKey) ?? null;
}

export function writeTestOnlyActivationTrialReauthContinuation(storage, value) {
  storage?.setItem(storageKey, value);
}

export function clearTestOnlyActivationTrialReauthContinuation(storage) {
  storage?.removeItem(storageKey);
}
