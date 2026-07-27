const STORAGE_VERSION = 1;
const INDEX_PREFIX = "wuxuai:active-redemption-index:v1";
const RECORD_PREFIX = "wuxuai:active-redemption:v1";
const redemptionTypes = new Set(["welcome_gift", "birthday_gift", "points_redemption"]);

function normalizeSlug(restaurantSlug) {
  return restaurantSlug.trim().toLowerCase();
}

export function isUsableRestaurantSlug(restaurantSlug) {
  return typeof restaurantSlug === "string"
    && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalizeSlug(restaurantSlug));
}

async function tokenFingerprint(customerToken) {
  if (typeof customerToken !== "string" || !customerToken.trim()) return null;
  if (!globalThis.crypto?.subtle) return null;
  const bytes = new globalThis.TextEncoder().encode(customerToken);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

function scopeKey(prefix, restaurantSlug, fingerprint) {
  return `${prefix}:${encodeURIComponent(normalizeSlug(restaurantSlug))}:${fingerprint}`;
}

function isActiveRedemption(value) {
  return Boolean(
    value
    && typeof value === "object"
    && typeof value.redemptionId === "string"
    && value.redemptionId.length > 0
    && typeof value.rewardId === "string"
    && value.rewardId.length > 0
    && /^\d{6}$/.test(value.code)
    && typeof value.expiresAt === "string"
    && Number.isFinite(new Date(value.expiresAt).getTime())
    && typeof value.title === "string"
    && redemptionTypes.has(value.redemptionType)
    && Number.isFinite(value.pointsSpent)
    && value.pointsSpent >= 0
  );
}

export async function persistScopedActiveRedemption(storage, input) {
  if (!storage || !isUsableRestaurantSlug(input.restaurantSlug) || !isActiveRedemption(input.redemption)) {
    return null;
  }
  const fingerprint = await tokenFingerprint(input.customerToken);
  if (!fingerprint) return null;

  const indexKey = scopeKey(INDEX_PREFIX, input.restaurantSlug, fingerprint);
  const recordKey = `${scopeKey(RECORD_PREFIX, input.restaurantSlug, fingerprint)}:${encodeURIComponent(input.redemption.redemptionId)}`;
  const previousRecordKey = storage.getItem(indexKey);
  if (previousRecordKey && previousRecordKey !== recordKey) storage.removeItem(previousRecordKey);

  storage.setItem(recordKey, JSON.stringify({
    version: STORAGE_VERSION,
    restaurantSlug: normalizeSlug(input.restaurantSlug),
    tokenFingerprint: fingerprint,
    redemption: input.redemption,
  }));
  storage.setItem(indexKey, recordKey);
  return recordKey;
}

export async function readScopedActiveRedemption(storage, input) {
  if (!storage || !isUsableRestaurantSlug(input.restaurantSlug)) return null;
  const fingerprint = await tokenFingerprint(input.customerToken);
  if (!fingerprint) return null;

  const indexKey = scopeKey(INDEX_PREFIX, input.restaurantSlug, fingerprint);
  const recordKey = storage.getItem(indexKey);
  if (!recordKey) return null;

  try {
    const parsed = JSON.parse(storage.getItem(recordKey) ?? "null");
    const expectedRecordKey = parsed?.redemption?.redemptionId
      ? `${scopeKey(RECORD_PREFIX, input.restaurantSlug, fingerprint)}:${encodeURIComponent(parsed.redemption.redemptionId)}`
      : null;
    const valid = parsed?.version === STORAGE_VERSION
      && parsed.restaurantSlug === normalizeSlug(input.restaurantSlug)
      && parsed.tokenFingerprint === fingerprint
      && recordKey === expectedRecordKey
      && isActiveRedemption(parsed.redemption);
    if (!valid) throw new Error("Ungültiger Einlösezustand");
    return parsed.redemption;
  } catch {
    storage.removeItem(recordKey);
    storage.removeItem(indexKey);
    return null;
  }
}

export async function restoreScopedActiveRedemption(storage, input, loadServerStatus) {
  const redemption = await readScopedActiveRedemption(storage, input);
  if (!redemption) return { state: "none", redemption: null, serverStatus: null };

  const serverStatus = await loadServerStatus({
    restaurantSlug: normalizeSlug(input.restaurantSlug),
    customerToken: input.customerToken,
    redemptionId: redemption.redemptionId,
  });
  if (serverStatus?.active && serverStatus.status === "active") {
    return {
      state: "active",
      redemption: {
        ...redemption,
        expiresAt: serverStatus.expires_at ?? redemption.expiresAt,
      },
      serverStatus,
    };
  }

  await removeScopedActiveRedemption(storage, {
    ...input,
    redemptionId: redemption.redemptionId,
  });
  return {
    state: serverStatus?.status === "redeemed"
      ? "redeemed"
      : serverStatus?.status === "expired"
        ? "expired"
        : "inactive",
    redemption,
    serverStatus,
  };
}

export async function removeScopedActiveRedemption(storage, input) {
  if (!storage || !isUsableRestaurantSlug(input.restaurantSlug)) return;
  const fingerprint = await tokenFingerprint(input.customerToken);
  if (!fingerprint) return;

  const indexKey = scopeKey(INDEX_PREFIX, input.restaurantSlug, fingerprint);
  const indexedRecordKey = storage.getItem(indexKey);
  const requestedRecordKey = input.redemptionId
    ? `${scopeKey(RECORD_PREFIX, input.restaurantSlug, fingerprint)}:${encodeURIComponent(input.redemptionId)}`
    : null;

  if (requestedRecordKey) storage.removeItem(requestedRecordKey);
  if (indexedRecordKey && (!requestedRecordKey || indexedRecordKey === requestedRecordKey)) {
    storage.removeItem(indexedRecordKey);
    storage.removeItem(indexKey);
  }
}

export async function loadPortalForRestaurant(input) {
  if (!isUsableRestaurantSlug(input.restaurantSlug)) {
    return { status: "invalid", data: null, error: null };
  }
  try {
    const data = await input.loadPortal(normalizeSlug(input.restaurantSlug), input.customerToken);
    return { status: "loaded", data, error: null };
  } catch (error) {
    return { status: "error", data: null, error };
  }
}
