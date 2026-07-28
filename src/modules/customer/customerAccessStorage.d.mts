export type StoredCustomerAccess = {
  version: 1;
  restaurant_slug: string;
  restaurant_id: string | null;
  customer_id: string | null;
  membership_id: string | null;
  customer_token: string;
  device_id: string | null;
  created_at: string;
  last_used_at: string;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function persistCustomerAccess(
  storage: StorageLike,
  input: {
    restaurantSlug: string;
    customerToken: string;
    restaurantId?: string | null;
    customerId?: string | null;
    membershipId?: string | null;
    deviceId?: string | null;
    createdAt?: string;
  },
  now?: Date,
): { ok: true; access: StoredCustomerAccess; reason: null } | { ok: false; access: null; reason: string };

export function readCustomerAccess(
  storage: StorageLike,
  restaurantSlug: string,
  now?: Date,
): { status: "found"; access: StoredCustomerAccess } | { status: "missing" | "invalid" | "unavailable"; access: null };

export function removeCustomerAccess(storage: StorageLike, restaurantSlug: string): boolean;
export function customerAccessStorageKey(restaurantSlug: string): string;
