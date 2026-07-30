import { liveDataUnavailableMessage, supabase } from "../../shared/lib/supabase";

export type StaffDailyActivity = {
  staff_member_id: string;
  staff_name: string;
  points_issued: number;
  stamps_issued: number;
  rewards_redeemed: number;
};

export async function loadStaffDailyActivity(restaurantId: string): Promise<StaffDailyActivity[]> {
  if (!supabase) {
    throw new Error(liveDataUnavailableMessage);
  }

  const { data, error } = await supabase.rpc("get_staff_daily_activity", {
    input_restaurant_id: restaurantId,
  });

  if (error) throw error;
  return (data ?? []) as StaffDailyActivity[];
}
