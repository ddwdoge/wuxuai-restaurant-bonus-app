import { supabase } from "../../shared/lib/supabase";

export type StaffDailyActivity = {
  staff_member_id: string;
  staff_name: string;
  points_issued: number;
  stamps_issued: number;
  rewards_redeemed: number;
};

export async function loadStaffDailyActivity(restaurantId: string): Promise<StaffDailyActivity[]> {
  if (!supabase) {
    return [
      {
        staff_member_id: "demo-staff-1",
        staff_name: "Mina",
        points_issued: 90,
        stamps_issued: 4,
        rewards_redeemed: 2,
      },
      {
        staff_member_id: "demo-staff-2",
        staff_name: "Lukas",
        points_issued: 40,
        stamps_issued: 3,
        rewards_redeemed: 1,
      },
    ];
  }

  const { data, error } = await supabase.rpc("get_staff_daily_activity", {
    input_restaurant_id: restaurantId,
  });

  if (error) throw error;
  return (data ?? []) as StaffDailyActivity[];
}
