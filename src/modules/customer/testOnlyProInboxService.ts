import { supabase } from "../../shared/lib/supabase";

export const TEST_ONLY_PRO_INBOX_CONSENT_VERSION = "TEST_ONLY_PRO_IN_APP_V1";
export const TEST_ONLY_PRO_INBOX_CONSENT_SHA256 = "91ef364b74afdb9884feed55c712692181fbf70bbd3df58b325947a68dd7ad97";

export type TestOnlyProInbox = {
  synthetic_test_only: true;
  available: true;
  active: true;
  access_receipt_id: string;
  expires_at: string;
  consent_active: boolean;
  consent_version: typeof TEST_ONLY_PRO_INBOX_CONSENT_VERSION;
  consent_content_sha256: typeof TEST_ONLY_PRO_INBOX_CONSENT_SHA256;
  unread_count: number;
  email_delivery: false;
  push_delivery: false;
  items: Array<{
    id: string;
    created_at: string;
    read_at: string | null;
    payload_sha256: string;
    offer: { id: string; title: string; short_description: string; valid_to: string; synthetic_test_only: true };
  }>;
};

function client() {
  if (!supabase) throw new Error("TEST_ONLY_PRO_IN_APP_UNAVAILABLE");
  return supabase;
}

function validate(value: unknown): TestOnlyProInbox {
  const inbox = value as Partial<TestOnlyProInbox> | null;
  if (!inbox || inbox.synthetic_test_only !== true || inbox.available !== true || inbox.active !== true
    || inbox.email_delivery !== false || inbox.push_delivery !== false
    || inbox.consent_version !== TEST_ONLY_PRO_INBOX_CONSENT_VERSION
    || inbox.consent_content_sha256 !== TEST_ONLY_PRO_INBOX_CONSENT_SHA256
    || !Array.isArray(inbox.items) || !Number.isSafeInteger(inbox.unread_count)) {
    throw new Error("TEST_ONLY_PRO_IN_APP_INVALID_RESPONSE");
  }
  return inbox as TestOnlyProInbox;
}

export async function readTestOnlyProInbox(restaurantId: string) {
  const { data, error } = await client().rpc("get_test_only_pro_in_app_inbox", { input_restaurant_id: restaurantId });
  if (error) throw error;
  return validate(data);
}

export async function setTestOnlyProInboxConsent(restaurantId: string, action: "ACCEPT" | "WITHDRAW", requestId: string) {
  const { data, error } = await client().rpc("set_test_only_pro_in_app_consent", {
    input_restaurant_id: restaurantId,
    input_action: action,
    input_expected_version: TEST_ONLY_PRO_INBOX_CONSENT_VERSION,
    input_expected_content_sha256: TEST_ONLY_PRO_INBOX_CONSENT_SHA256,
    input_request_id: requestId,
  });
  if (error) throw error;
  return data as { receipt_id: string; consent_active: boolean; idempotent: boolean };
}

export async function openTestOnlyProInboxNotification(restaurantId: string, notificationId: string, requestId: string) {
  const { data, error } = await client().rpc("open_test_only_pro_in_app_notification", {
    input_restaurant_id: restaurantId,
    input_notification_id: notificationId,
    input_request_id: requestId,
  });
  if (error) throw error;
  return data as { notification_id: string; read_at: string; idempotent: boolean };
}
