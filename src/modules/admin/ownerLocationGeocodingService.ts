import { supabase } from "../../shared/lib/supabase";

export type OwnerLocationCandidate = {
  latitude: number;
  longitude: number;
  displayName: string;
  address: string;
  postalCode: string;
  city: string;
  country: string;
};

export type OwnerLocationAddress = {
  restaurantId: string;
  address: string;
  postalCode: string;
  city: string;
  country: string;
};

export class OwnerLocationGeocodingError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

export function ownerLocationAddressKey(address: Pick<OwnerLocationAddress, "address" | "postalCode" | "city" | "country">) {
  return [address.address, address.postalCode, address.city, address.country]
    .map((value) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("de-AT"))
    .join("|");
}

export async function geocodeOwnerLocation(address: OwnerLocationAddress) {
  if (!supabase) throw new OwnerLocationGeocodingError("SERVICE_NOT_CONFIGURED");
  const { data, error } = await supabase.functions.invoke("owner-location-geocode", { body: address });
  if (error) {
    const context = error.context as Response | undefined;
    let code = context?.status === 429 ? "RATE_LIMITED" : "GEOCODING_UNAVAILABLE";
    try {
      const payload = await context?.clone().json() as { error?: unknown } | undefined;
      if (typeof payload?.error === "string") code = payload.error;
    } catch {
      // The UI only needs a stable, non-technical fallback code.
    }
    throw new OwnerLocationGeocodingError(code);
  }
  return Array.isArray(data?.candidates) ? data.candidates as OwnerLocationCandidate[] : [];
}
