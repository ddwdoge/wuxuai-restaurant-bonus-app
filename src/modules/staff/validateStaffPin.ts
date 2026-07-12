import { supabase } from "../../shared/lib/supabase";

export type StaffSession = {
  staff_member_id: string;
  staff_member_name: string;
  staff_session_token: string;
  expires_at: string;
};

export async function createStaffSession(restaurantId: string, pin: string): Promise<StaffSession> {
  if (!supabase) {
    if (pin !== "1234") {
      throw new Error("PIN ist ungültig.");
    }

    return {
      staff_member_id: "demo-staff",
      staff_member_name: "Demo Team",
      staff_session_token: `demo-session-${Date.now()}`,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    };
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
