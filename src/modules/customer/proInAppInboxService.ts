import { supabase } from "../../shared/lib/supabase";

export type ProInAppNotification = {
  id: string;
  event_type: "OFFER_PUBLISHED" | "POINT_REWARD_AVAILABLE";
  title: string;
  created_at: string;
  read_at: string | null;
};

export type ProInAppInbox = {
  available: boolean;
  legal_mode: "SYNTHETIC_TEST_ONLY_ONLY";
  unread_count: number;
  items: ProInAppNotification[];
};

const emptyInbox: ProInAppInbox = {
  available: false,
  legal_mode: "SYNTHETIC_TEST_ONLY_ONLY",
  unread_count: 0,
  items: [],
};

export async function loadProInAppInbox(
  restaurantSlug: string,
  customerToken: string,
): Promise<ProInAppInbox> {
  if (!supabase) return emptyInbox;
  const { data, error } = await supabase.rpc("get_customer_pro_in_app_inbox", {
    input_restaurant_slug: restaurantSlug,
    input_customer_token: customerToken,
  });
  if (error) throw error;
  return (data ?? emptyInbox) as ProInAppInbox;
}

export async function markProInAppNotificationRead(
  restaurantSlug: string,
  customerToken: string,
  notificationId: string,
): Promise<ProInAppInbox> {
  if (!supabase) throw new Error("Benachrichtigungen sind gerade nicht verfügbar.");
  const { data, error } = await supabase.rpc("mark_customer_pro_in_app_notification_read", {
    input_restaurant_slug: restaurantSlug,
    input_customer_token: customerToken,
    input_notification_id: notificationId,
  });
  if (error) throw error;
  return data as ProInAppInbox;
}
