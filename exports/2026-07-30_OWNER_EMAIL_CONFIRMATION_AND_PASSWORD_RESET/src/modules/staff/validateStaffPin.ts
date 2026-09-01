import { liveDataUnavailableMessage, supabase } from "../../shared/lib/supabase";

export type StaffSession = {
  staff_member_id: string;
  staff_member_name: string;
  staff_session_token: string;
  expires_at: string;
};

export async function createStaffSession(restaurantId: string, pin: string): Promise<StaffSession> {
  if (!supabase) {
    throw new Error(liveDataUnavailableMessage);
  }

  const { data, error } = await supabase.rpc("create_staff_session", {
    input_restaurant_id: restaurantId,
    input_pin: pin,
  });

  if (error) {
    throw error;
  }

  return data as StaffSession;
}
