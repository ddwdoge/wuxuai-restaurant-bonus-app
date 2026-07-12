const customerTokenStoreKey = "wuxuai_customer_tokens";

type StoredCustomerTokenEntry = {
  customer_token: string;
  restaurant_id?: string | null;
  saved_at: string;
  customer_name?: string;
};

type StoredCustomerTokens = Record<string, StoredCustomerTokenEntry>;

function readStoredCustomerTokens(): StoredCustomerTokens {
  try {
    const parsed = JSON.parse(localStorage.getItem(customerTokenStoreKey) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as StoredCustomerTokens : {};
  } catch {
    return {};
  }
}

export function readStoredCustomerToken(restaurantSlug: string) {
  if (!restaurantSlug) return null;
  try {
    const storedTokens = readStoredCustomerTokens();
    return storedTokens[restaurantSlug]?.customer_token ?? localStorage.getItem(`wuxuai-customer-token:${restaurantSlug}`);
  } catch {
    return null;
  }
}

export function saveStoredCustomerToken(
  restaurantSlug: string,
  entry: Omit<StoredCustomerTokenEntry, "saved_at">,
) {
  if (!restaurantSlug || !entry.customer_token) return;
  try {
    const storedTokens = readStoredCustomerTokens();
    storedTokens[restaurantSlug] = {
      ...entry,
      saved_at: new Date().toISOString(),
    };
    localStorage.setItem(customerTokenStoreKey, JSON.stringify(storedTokens));
    localStorage.setItem(`wuxuai-customer-token:${restaurantSlug}`, entry.customer_token);
  } catch {
    // Der Bonus funktioniert weiter; nur das automatische Merken ist dann nicht verfuegbar.
  }
}

export function removeStoredCustomerToken(restaurantSlug: string) {
  if (!restaurantSlug) return;
  try {
    const storedTokens = readStoredCustomerTokens();
    delete storedTokens[restaurantSlug];
    localStorage.setItem(customerTokenStoreKey, JSON.stringify(storedTokens));
    localStorage.removeItem(`wuxuai-customer-token:${restaurantSlug}`);
  } catch {
    // Wenn der Browser Speicher blockiert, gibt es lokal nichts Verlaessliches zu entfernen.
  }
}

export function isInvalidCustomerTokenError(error: unknown) {
  return error instanceof Error && error.message.toLowerCase().includes("customer token not valid");
}
