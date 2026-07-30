const ACCESS_VERSION = 1;
const ACCESS_PREFIX = "wuxuai_customer_access";
const LEGACY_STORE_KEY = "wuxuai_customer_tokens";

function normalizeSlug(restaurantSlug) {
  return typeof restaurantSlug === "string" ? restaurantSlug.trim().toLowerCase() : "";
}

function accessKey(restaurantSlug) {
  return `${ACCESS_PREFIX}:${encodeURIComponent(normalizeSlug(restaurantSlug))}`;
}

function isAccessRecord(value, restaurantSlug) {
  return Boolean(
    value
    && typeof value === "object"
    && value.version === ACCESS_VERSION
    && value.restaurant_slug === normalizeSlug(restaurantSlug)
    && typeof value.customer_token === "string"
    && value.customer_token.trim().length > 0
    && typeof value.created_at === "string"
    && Number.isFinite(new Date(value.created_at).getTime())
    && typeof value.last_used_at === "string"
    && Number.isFinite(new Date(value.last_used_at).getTime()),
  );
}

function legacyToken(storage, restaurantSlug) {
  const slug = normalizeSlug(restaurantSlug);
  try {
    const parsed = JSON.parse(storage.getItem(LEGACY_STORE_KEY) ?? "{}");
    const mappedToken = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed[slug]?.customer_token
      : null;
    return typeof mappedToken === "string" && mappedToken.trim()
      ? mappedToken
      : storage.getItem(`wuxuai-customer-token:${slug}`);
  } catch {
    return storage.getItem(`wuxuai-customer-token:${slug}`);
  }
}

export function persistCustomerAccess(storage, input, now = new Date()) {
  const slug = normalizeSlug(input?.restaurantSlug);
  const token = typeof input?.customerToken === "string" ? input.customerToken.trim() : "";
  if (!storage || !slug || !token) return { ok: false, access: null, reason: "invalid_input" };

  const timestamp = now.toISOString();
  const access = {
    version: ACCESS_VERSION,
    restaurant_slug: slug,
    restaurant_id: input.restaurantId ?? null,
    customer_id: input.customerId ?? null,
    membership_id: input.membershipId ?? null,
    customer_token: token,
    device_id: input.deviceId ?? null,
    created_at: input.createdAt ?? timestamp,
    last_used_at: timestamp,
  };

  try {
    const key = accessKey(slug);
    storage.setItem(key, JSON.stringify(access));
    const verified = JSON.parse(storage.getItem(key) ?? "null");
    if (!isAccessRecord(verified, slug) || verified.customer_token !== token) {
      throw new Error("storage_verification_failed");
    }
    return { ok: true, access: verified, reason: null };
  } catch {
    return { ok: false, access: null, reason: "storage_unavailable" };
  }
}

export function readCustomerAccess(storage, restaurantSlug, now = new Date()) {
  const slug = normalizeSlug(restaurantSlug);
  if (!storage || !slug) return { status: "missing", access: null };

  try {
    const key = accessKey(slug);
    const raw = storage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!isAccessRecord(parsed, slug)) {
        storage.removeItem(key);
        return { status: "invalid", access: null };
      }
      return { status: "found", access: parsed };
    }

    const token = legacyToken(storage, slug);
    if (!token) return { status: "missing", access: null };
    const timestamp = now.toISOString();
    const migrated = persistCustomerAccess(storage, {
      restaurantSlug: slug,
      customerToken: token,
    }, now);
    return migrated.ok
      ? { status: "found", access: migrated.access }
      : {
          status: "found",
          access: {
            version: ACCESS_VERSION,
            restaurant_slug: slug,
            restaurant_id: null,
            customer_id: null,
            membership_id: null,
            customer_token: token,
            device_id: null,
            created_at: timestamp,
            last_used_at: timestamp,
          },
        };
  } catch {
    return { status: "unavailable", access: null };
  }
}

export function removeCustomerAccess(storage, restaurantSlug) {
  const slug = normalizeSlug(restaurantSlug);
  if (!storage || !slug) return false;
  try {
    storage.removeItem(accessKey(slug));
    const parsed = JSON.parse(storage.getItem(LEGACY_STORE_KEY) ?? "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      delete parsed[slug];
      storage.setItem(LEGACY_STORE_KEY, JSON.stringify(parsed));
    }
    storage.removeItem(`wuxuai-customer-token:${slug}`);
    return true;
  } catch {
    return false;
  }
}

export function customerAccessStorageKey(restaurantSlug) {
  return accessKey(restaurantSlug);
}
