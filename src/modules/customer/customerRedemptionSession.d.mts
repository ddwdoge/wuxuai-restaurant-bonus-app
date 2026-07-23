export type ScopedActiveRedemption = {
  code: string;
  expiresAt: string;
  redemptionId: string;
  rewardId: string;
  assignmentId: string | null;
  title: string;
  redemptionType: "welcome_gift" | "birthday_gift" | "points_redemption";
  pointsSpent: number;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type RedemptionScope = {
  restaurantSlug: string;
  customerToken: string;
};

export function isUsableRestaurantSlug(restaurantSlug: string): boolean;

export function persistScopedActiveRedemption(
  storage: StorageLike,
  input: RedemptionScope & { redemption: ScopedActiveRedemption },
): Promise<string | null>;

export function readScopedActiveRedemption(
  storage: StorageLike,
  input: RedemptionScope,
): Promise<ScopedActiveRedemption | null>;

type CustomerRedemptionStatus = {
  active: boolean;
  status: "active" | "redeemed" | "expired" | "cancelled" | "disabled";
  expires_at?: string;
};

export function restoreScopedActiveRedemption(
  storage: StorageLike,
  input: RedemptionScope,
  loadServerStatus: (input: RedemptionScope & { redemptionId: string }) => Promise<CustomerRedemptionStatus>,
): Promise<{
  state: "none" | "active" | "redeemed" | "expired" | "inactive";
  redemption: ScopedActiveRedemption | null;
  serverStatus: CustomerRedemptionStatus | null;
}>;

export function removeScopedActiveRedemption(
  storage: StorageLike,
  input: RedemptionScope & { redemptionId?: string },
): Promise<void>;

export function loadPortalForRestaurant<T>(input: {
  restaurantSlug: string;
  customerToken: string | null;
  loadPortal: (restaurantSlug: string, customerToken: string | null) => Promise<T>;
}): Promise<
  | { status: "loaded"; data: T; error: null }
  | { status: "invalid"; data: null; error: null }
  | { status: "error"; data: null; error: unknown }
>;
