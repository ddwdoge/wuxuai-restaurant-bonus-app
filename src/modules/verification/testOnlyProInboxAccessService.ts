import { supabase } from "../../shared/lib/supabase";
import { TestOnlyKybReviewError } from "./testOnlyKybReviewService";

export type TestOnlyProInboxAction = "GRANT" | "REVOKE";

export type TestOnlyProInboxAccessState = {
  synthetic_test_only: true;
  real_pro_entitlement: false;
  email_delivery: false;
  push_delivery: false;
  snapshot: {
    schema_version: 1;
    purpose: "SYNTHETIC_TEST_ONLY_PRO_IN_APP";
    project: { project_ref: string; auth_issuer: string; app_origin: string };
    restaurant_id: string;
    organization_id: string;
    branch_id: string;
    customer_id: string;
    account_id: string;
    guest_auth_user_id: string;
    consent_version: "TEST_ONLY_PRO_IN_APP_V1";
    consent_content_sha256: string;
    real_pro_entitlement: false;
    real_offer_notifications: false;
    email_delivery: false;
    push_delivery: false;
  };
  snapshot_sha256: string;
  previous_receipt_id: string | null;
  previous_action: TestOnlyProInboxAction | null;
  active: boolean;
  starts_at: string | null;
  expires_at: string | null;
  consent_active: boolean;
  notification_count: number;
  unread_count: number;
  next_action: TestOnlyProInboxAction;
};

type Receipt = {
  receipt_id: string;
  action: TestOnlyProInboxAction;
  restaurant_id: string;
  customer_id: string;
  guest_auth_user_id: string;
  starts_at: string | null;
  expires_at: string | null;
  synthetic_test_only: true;
  real_pro_entitlement: false;
  email_delivery: false;
  push_delivery: false;
  idempotent: boolean;
};

export type TestOnlyProInboxErrorCode = "NOT_ELIGIBLE" | "FRESH_AAL2_REQUIRED" |
  "TOTP_FACTOR_REQUIRED" | "TOTP_REAUTH_REJECTED" | "IDENTITY_CHANGED" | "STALE" |
  "REPLAY_CONFLICT" | "WINDOW_INVALID" | "PERMISSION" | "UNKNOWN";

export class TestOnlyProInboxError extends Error {
  constructor(public readonly code: TestOnlyProInboxErrorCode) {
    super(code);
    this.name = "TestOnlyProInboxError";
  }
}

const uuid = (value: unknown) => typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value);
const hash = (value: unknown) => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);

function classify(error: { code?: string; message?: string; details?: string }): TestOnlyProInboxErrorCode {
  const server = `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""}`;
  if (server.includes("TEST_ONLY_PRO_IN_APP_CONTEXT_INVALID")) return "NOT_ELIGIBLE";
  if (server.includes("RECENT_PLATFORM_TOTP_REQUIRED") || server.includes("AAL2")) return "FRESH_AAL2_REQUIRED";
  if (server.includes("TEST_ONLY_PRO_IN_APP_STALE") || error.code === "40001" || error.code === "P0001") return "STALE";
  if (server.includes("TEST_ONLY_PRO_IN_APP_REPLAY_CONFLICT")) return "REPLAY_CONFLICT";
  if (server.includes("TEST_ONLY_PRO_IN_APP_WINDOW_INVALID")) return "WINDOW_INVALID";
  if (error.code === "42501" || /permission denied/i.test(server)) return "PERMISSION";
  return "UNKNOWN";
}

function validate(value: unknown): TestOnlyProInboxAccessState {
  if (!value || typeof value !== "object") throw new TestOnlyProInboxError("UNKNOWN");
  const state = value as Partial<TestOnlyProInboxAccessState>;
  const snapshot = state.snapshot;
  if (state.synthetic_test_only !== true || state.real_pro_entitlement !== false
    || state.email_delivery !== false || state.push_delivery !== false || !snapshot
    || snapshot.purpose !== "SYNTHETIC_TEST_ONLY_PRO_IN_APP"
    || ![snapshot.restaurant_id, snapshot.organization_id, snapshot.branch_id, snapshot.customer_id,
      snapshot.account_id, snapshot.guest_auth_user_id].every(uuid)
    || snapshot.consent_version !== "TEST_ONLY_PRO_IN_APP_V1"
    || !hash(snapshot.consent_content_sha256) || !hash(state.snapshot_sha256)
    || snapshot.real_pro_entitlement !== false || snapshot.real_offer_notifications !== false
    || snapshot.email_delivery !== false || snapshot.push_delivery !== false
    || !["GRANT", "REVOKE"].includes(state.next_action ?? "")
    || (state.previous_receipt_id !== null && !uuid(state.previous_receipt_id))) {
    throw new TestOnlyProInboxError("UNKNOWN");
  }
  return state as TestOnlyProInboxAccessState;
}

export async function readTestOnlyProInboxAccess(restaurantId: string) {
  if (!supabase) throw new TestOnlyProInboxError("UNKNOWN");
  const { data, error } = await supabase.rpc("get_platform_test_only_pro_in_app_access", {
    input_restaurant_id: restaurantId,
  });
  if (error) throw new TestOnlyProInboxError(classify(error));
  return validate(data);
}

export async function decideTestOnlyProInboxAccess(input: {
  action: TestOnlyProInboxAction;
  expiresAt: string | null;
  reason: string;
  confirmation: string;
  requestId: string;
  expectedState: TestOnlyProInboxAccessState;
}) {
  if (!supabase) throw new TestOnlyProInboxError("UNKNOWN");
  const fresh = await readTestOnlyProInboxAccess(input.expectedState.snapshot.restaurant_id);
  if (fresh.snapshot_sha256 !== input.expectedState.snapshot_sha256
    || fresh.previous_receipt_id !== input.expectedState.previous_receipt_id
    || fresh.next_action !== input.action) throw new TestOnlyProInboxError("STALE");
  const { data, error } = await supabase.rpc("decide_platform_test_only_pro_in_app_access", {
    input_restaurant_id: fresh.snapshot.restaurant_id,
    input_action: input.action,
    input_expected_snapshot_sha256: fresh.snapshot_sha256,
    input_expected_previous_receipt_id: fresh.previous_receipt_id,
    input_expires_at: input.expiresAt,
    input_reason: input.reason.trim(),
    input_confirmation: input.confirmation,
    input_request_id: input.requestId,
  });
  if (error) throw new TestOnlyProInboxError(classify(error));
  const receipt = data as Partial<Receipt> | null;
  if (!receipt || !uuid(receipt.receipt_id) || receipt.action !== input.action
    || receipt.synthetic_test_only !== true || receipt.real_pro_entitlement !== false
    || receipt.email_delivery !== false || receipt.push_delivery !== false) {
    throw new TestOnlyProInboxError("UNKNOWN");
  }
  return receipt as Receipt;
}

export function normalizeTestOnlyProInboxMfaError(error: unknown) {
  if (error instanceof TestOnlyProInboxError) return error;
  if (error instanceof TestOnlyKybReviewError) {
    if (error.code === "FRESH_AAL2_REQUIRED") return new TestOnlyProInboxError("FRESH_AAL2_REQUIRED");
    if (error.code === "TOTP_FACTOR_REQUIRED") return new TestOnlyProInboxError("TOTP_FACTOR_REQUIRED");
    if (error.code === "TOTP_REAUTH_REJECTED") return new TestOnlyProInboxError("TOTP_REAUTH_REJECTED");
    if (error.code === "IDENTITY_CHANGED") return new TestOnlyProInboxError("IDENTITY_CHANGED");
  }
  return new TestOnlyProInboxError("UNKNOWN");
}
