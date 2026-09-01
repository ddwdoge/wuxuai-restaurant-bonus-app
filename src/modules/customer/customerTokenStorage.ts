import {
  persistCustomerAccess,
  readCustomerAccess,
  removeCustomerAccess,
  type StoredCustomerAccess,
} from "./customerAccessStorage.mjs";
export { isPermanentCustomerAccessError } from "./customerAccessErrors.mjs";

type StoredCustomerTokenEntry = {
  customer_token: string;
  restaurant_id?: string | null;
  customer_id?: string | null;
  membership_id?: string | null;
  device_id?: string | null;
};

export type CustomerAccessDiagnosticEvent =
  | "CUSTOMER_ACCESS_LOOKUP_STARTED"
  | "CUSTOMER_ACCESS_FOUND"
  | "CUSTOMER_ACCESS_NOT_FOUND"
  | "CUSTOMER_ACCESS_INVALID"
  | "CUSTOMER_ACCESS_PERSISTED"
  | "CUSTOMER_ACCESS_PERSIST_FAILED"
  | "CUSTOMER_EXISTING_MEMBERSHIP_RESTORED";

export function emitCustomerAccessDiagnostic(eventType: CustomerAccessDiagnosticEvent, restaurantSlug: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("wuxuai:customer-access", {
    detail: {
      event_type: eventType,
      restaurant_slug: restaurantSlug.trim().toLowerCase(),
      occurred_at: new Date().toISOString(),
    },
  }));
}

export function readStoredCustomerAccess(restaurantSlug: string): StoredCustomerAccess | null {
  if (!restaurantSlug || typeof window === "undefined") return null;
  emitCustomerAccessDiagnostic("CUSTOMER_ACCESS_LOOKUP_STARTED", restaurantSlug);
  try {
    const result = readCustomerAccess(window.localStorage, restaurantSlug);
    emitCustomerAccessDiagnostic(
      result.status === "found"
        ? "CUSTOMER_ACCESS_FOUND"
        : result.status === "missing"
          ? "CUSTOMER_ACCESS_NOT_FOUND"
          : "CUSTOMER_ACCESS_INVALID",
      restaurantSlug,
    );
    return result.status === "found" ? result.access : null;
  } catch {
    emitCustomerAccessDiagnostic("CUSTOMER_ACCESS_INVALID", restaurantSlug);
    return null;
  }
}

export function readStoredCustomerToken(restaurantSlug: string) {
  return readStoredCustomerAccess(restaurantSlug)?.customer_token ?? null;
}

export function readStoredCustomerTokens(limit = 100): Record<string, string> {
  if (typeof window === "undefined") return {};
  const slugs = new Set<string>();

  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith("wuxuai_customer_access:")) {
        const encodedSlug = key.slice("wuxuai_customer_access:".length);
        try { slugs.add(decodeURIComponent(encodedSlug)); } catch { /* Ignore malformed legacy keys. */ }
      } else if (key?.startsWith("wuxuai-customer-token:")) {
        slugs.add(key.slice("wuxuai-customer-token:".length));
      }
    }

    const legacy = JSON.parse(window.localStorage.getItem("wuxuai_customer_tokens") ?? "{}");
    if (legacy && typeof legacy === "object" && !Array.isArray(legacy)) {
      Object.keys(legacy).forEach((slug) => slugs.add(slug));
    }
  } catch {
    return {};
  }

  const tokens: Record<string, string> = {};
  for (const slug of [...slugs].sort().slice(0, Math.max(0, Math.min(limit, 100)))) {
    const normalizedSlug = slug.trim().toLowerCase();
    const token = readStoredCustomerToken(normalizedSlug);
    if (normalizedSlug && token) tokens[normalizedSlug] = token;
  }
  return tokens;
}

export function saveStoredCustomerToken(
  restaurantSlug: string,
  entry: StoredCustomerTokenEntry,
) {
  if (!restaurantSlug || !entry.customer_token || typeof window === "undefined") return false;
  try {
    const persisted = persistCustomerAccess(window.localStorage, {
      restaurantSlug,
      customerToken: entry.customer_token,
      restaurantId: entry.restaurant_id,
      customerId: entry.customer_id,
      membershipId: entry.membership_id,
      deviceId: entry.device_id,
      createdAt: readStoredCustomerAccess(restaurantSlug)?.created_at,
    }).ok;
    emitCustomerAccessDiagnostic(
      persisted ? "CUSTOMER_ACCESS_PERSISTED" : "CUSTOMER_ACCESS_PERSIST_FAILED",
      restaurantSlug,
    );
    return persisted;
  } catch {
    emitCustomerAccessDiagnostic("CUSTOMER_ACCESS_PERSIST_FAILED", restaurantSlug);
    return false;
  }
}

export function removeStoredCustomerToken(restaurantSlug: string) {
  if (!restaurantSlug || typeof window === "undefined") return false;
  try {
    return removeCustomerAccess(window.localStorage, restaurantSlug);
  } catch {
    return false;
  }
}
