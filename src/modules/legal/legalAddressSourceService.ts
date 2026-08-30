import { supabase } from "../../shared/lib/supabase";

type LegalAddressProfile = Record<string, string | boolean | null>;

function requireSupabase() {
  if (!supabase) throw new Error("Live-Daten konnten nicht geladen werden.");
  return supabase;
}

function profileUsesRestaurantAddress(profile: LegalAddressProfile) {
  return profile.registered_address_matches_restaurant === true
    || profile.registered_address_source === "restaurant";
}

export async function syncRestaurantAddressFromLegalProfile(
  restaurantId: string,
  profile: LegalAddressProfile,
) {
  if (!profileUsesRestaurantAddress(profile)) return;

  const address = typeof profile.street === "string" ? profile.street.trim() : "";
  const postalCode = typeof profile.postal_code === "string" ? profile.postal_code.trim() : "";
  const city = typeof profile.city === "string" ? profile.city.trim() : "";
  const country = typeof profile.country === "string" ? profile.country.trim() : "";

  if (!address || !postalCode || !city || !country) {
    throw new Error("Die gemeinsame Restaurant- und Geschäftsanschrift ist unvollständig.");
  }

  const client = requireSupabase();
  const { data: restaurant, error: restaurantError } = await client
    .from("restaurants")
    .select("organization_id, primary_branch_id")
    .eq("id", restaurantId)
    .single();

  if (restaurantError) throw restaurantError;

  let branchQuery = client
    .from("branches")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("organization_id", restaurant.organization_id);

  if (restaurant.primary_branch_id) {
    branchQuery = branchQuery.eq("id", restaurant.primary_branch_id);
  } else {
    branchQuery = branchQuery.order("created_at", { ascending: true }).limit(1);
  }

  const { data: branch, error: branchError } = await branchQuery.maybeSingle();
  if (branchError) throw branchError;
  if (!branch?.id) throw new Error("Der Restaurantstandort konnte nicht gefunden werden.");

  const { error: updateError } = await client
    .from("branches")
    .update({ address, postal_code: postalCode, city, country })
    .eq("id", branch.id)
    .eq("restaurant_id", restaurantId)
    .eq("organization_id", restaurant.organization_id);

  if (updateError) throw updateError;
}
