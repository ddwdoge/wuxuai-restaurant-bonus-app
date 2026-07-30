import { liveDataUnavailableMessage, supabase } from "../../shared/lib/supabase";

export type ExpiryReminder = {
  id: string;
  reward_id: string;
  customer_reward_id: string | null;
  title: string;
  expires_at: string;
  remaining_days: 7 | 3 | 1 | 0;
  status: "created" | "displayed" | "opened";
};

export type BirthdayGift = {
  assignment_id: string;
  reward_id: string;
  title: string;
  description: string;
  category: string | null;
  image_url: string | null;
  status: "active" | "redemption_started" | "redeemed" | "expired";
  valid_until: string | null;
  birthday_year?: number;
};

export type CustomerRetentionStatus = {
  reminders: ExpiryReminder[];
  birthday: {
    day: number | null;
    month: number | null;
    can_update: boolean;
    eligible: boolean;
    birthday_year: number | null;
    gift: BirthdayGift | null;
  };
  referral: {
    successful_referrals: number;
    boost_multiplier: 2;
    boost_duration_days: 30;
    active_until: string | null;
  };
  push: { subscribed: boolean };
};

export type CustomerIdentitySummary = {
  phone_masked: string | null;
  birthday_masked: string | null;
};

export async function loadCustomerRetentionStatus(
  restaurantSlug: string,
  customerToken: string,
): Promise<CustomerRetentionStatus> {
  if (!supabase) throw new Error(liveDataUnavailableMessage);
  const { data, error } = await supabase.rpc("get_customer_retention_status", {
    input_restaurant_slug: restaurantSlug,
    input_customer_token: customerToken,
  });
  if (error) throw error;
  return data as CustomerRetentionStatus;
}

export async function loadCustomerIdentitySummary(
  restaurantSlug: string,
  customerToken: string,
): Promise<CustomerIdentitySummary> {
  if (!supabase) throw new Error(liveDataUnavailableMessage);
  const { data, error } = await supabase.rpc("get_customer_identity_summary", {
    input_restaurant_slug: restaurantSlug,
    input_customer_token: customerToken,
  });
  if (error) throw error;
  return data as CustomerIdentitySummary;
}

export async function drawCustomerBirthdayGift(
  restaurantSlug: string,
  customerToken: string,
  idempotencyKey: string,
) {
  if (!supabase) throw new Error(liveDataUnavailableMessage);
  const { data, error } = await supabase.rpc("draw_customer_birthday_gift", {
    input_restaurant_slug: restaurantSlug,
    input_customer_token: customerToken,
    input_idempotency_key: idempotencyKey,
  });
  if (error) throw error;
  return data as BirthdayGift & { already_drawn: boolean };
}

export async function markExpiryReminder(
  customerToken: string,
  reminderId: string,
  action: "displayed" | "opened",
) {
  if (!supabase) return;
  const { error } = await supabase.rpc("mark_expiry_reminder", {
    input_customer_token: customerToken,
    input_reminder_id: reminderId,
    input_action: action,
  });
  if (error) throw error;
}

function applicationServerKey(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const raw = window.atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

export function customerPushAvailable() {
  return import.meta.env.PROD
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window
    && Boolean(import.meta.env.VITE_VAPID_PUBLIC_KEY);
}

export async function disableCustomerPush(restaurantSlug: string, customerToken: string) {
  if (!supabase) throw new Error(liveDataUnavailableMessage);
  const { error } = await supabase.rpc("disable_customer_push_subscriptions", {
    input_restaurant_slug: restaurantSlug,
    input_customer_token: customerToken,
  });
  if (error) throw error;
  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    await subscription?.unsubscribe();
  }
}

export async function enableCustomerPush(restaurantSlug: string, customerToken: string) {
  if (!customerPushAvailable()) throw new Error("Push-Benachrichtigungen sind auf diesem Gerät nicht verfügbar.");
  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) throw new Error("Push-Benachrichtigungen sind noch nicht eingerichtet.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Push-Benachrichtigungen wurden nicht erlaubt.");
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey(vapidPublicKey),
  });
  if (!supabase) throw new Error(liveDataUnavailableMessage);
  const { error } = await supabase.rpc("save_customer_push_subscription", {
    input_restaurant_slug: restaurantSlug,
    input_customer_token: customerToken,
    input_subscription: subscription.toJSON(),
    input_user_agent: navigator.userAgent,
  });
  if (error) throw error;
}
