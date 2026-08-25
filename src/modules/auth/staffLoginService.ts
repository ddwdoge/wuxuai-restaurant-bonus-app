import { liveDataUnavailableMessage, supabase } from "../../shared/lib/supabase";

export type PublicStaffLoginContext = {
  available: boolean;
  restaurant_name?: string;
  restaurant_slug?: string;
};

export type StaffRestaurantAccess = {
  success: boolean;
  error_code?: "AUTH_REQUIRED" | "STAFF_ACCESS_DENIED";
  restaurant_id?: string;
  restaurant_name?: string;
  restaurant_slug?: string;
  staff_role?: "staff" | "supervisor";
};

function requireClient() {
  if (!supabase) throw new Error(liveDataUnavailableMessage);
  return supabase;
}

export async function loadPublicStaffLoginContext(restaurantSlug: string): Promise<PublicStaffLoginContext> {
  const { data, error } = await requireClient().rpc("get_public_staff_login_context", {
    input_restaurant_slug: restaurantSlug,
  });
  if (error) throw new Error("Der Mitarbeiterzugang konnte gerade nicht geladen werden.");
  return data as PublicStaffLoginContext;
}

export async function resolveMyStaffRestaurantAccess(restaurantSlug: string): Promise<StaffRestaurantAccess> {
  const { data, error } = await requireClient().rpc("get_my_staff_restaurant_access", {
    input_restaurant_slug: restaurantSlug,
  });
  if (error) throw new Error("Der Mitarbeiterzugang konnte gerade nicht geprüft werden.");
  return data as StaffRestaurantAccess;
}
