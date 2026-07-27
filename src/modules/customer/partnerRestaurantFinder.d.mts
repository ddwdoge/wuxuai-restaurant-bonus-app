export type Coordinates = { latitude: number; longitude: number };

export function filterPartnerRestaurants<T extends {
  name: string;
  address?: string | null;
  postal_code?: string | null;
  city?: string | null;
}>(locations: T[], query: string): T[];

export function distanceInKilometers(origin: Coordinates, destination: Coordinates): number;
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
}): "partner" | "registered" | "member" | "near" | "reward";
