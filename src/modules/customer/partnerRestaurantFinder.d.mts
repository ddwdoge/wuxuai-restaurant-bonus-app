export type Coordinates = { latitude: number; longitude: number };

export function filterPartnerRestaurants<T extends {
  name: string;
  address?: string | null;
  postal_code?: string | null;
  city?: string | null;
}>(locations: T[], query: string): T[];

export function distanceInKilometers(origin: Coordinates, destination: Coordinates): number;
export const partnerFilterKeys: readonly ["all", "nearby", "visited", "points", "near_reward", "open"];
export function rewardProgressPercent(location: {
  membership?: { registered?: boolean; points_balance?: number; next_reward?: { required_points: number } | null } | null;
}): number;
export function isRewardNear(location: {
  membership?: { registered?: boolean; points_balance?: number; available_rewards?: unknown[]; next_reward?: { required_points: number } | null } | null;
}): boolean;
export function filterPartnerRestaurantsByCategory<T extends {
  distance_km?: number | null;
  opening_status?: { isOpen: boolean } | null;
  membership?: { visits_count?: number; points_balance?: number; registered?: boolean; available_rewards?: unknown[]; next_reward?: { required_points: number } | null } | null;
}>(locations: T[], filter: typeof partnerFilterKeys[number]): T[];
export function sortPartnerRestaurants<T extends {
  name: string;
  distance_km?: number | null;
  membership?: {
    available_rewards?: Array<{ expires_at?: string | null }>;
    next_reward?: { missing_points: number } | null;
    last_visit_at?: string | null;
  } | null;
}>(locations: T[]): T[];
export function googleMapsUrl(location: Coordinates, mode?: "search" | "directions"): string;
export function markerStatus(location: {
  membership?: {
    registered?: boolean;
    points_balance?: number;
    available_rewards?: unknown[];
    next_reward?: { missing_points: number } | null;
  } | null;
  opening_status?: { isOpen: boolean } | null;
}): "partner" | "registered" | "member" | "near" | "reward" | "closed";
