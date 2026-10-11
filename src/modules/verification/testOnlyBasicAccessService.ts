import { supabase } from "../../shared/lib/supabase";
import { TestOnlyKybReviewError } from "./testOnlyKybReviewService";

export type TestOnlyBasicAction = "GRANT" | "REVOKE";

export type TestOnlyBasicAccessState = {
  synthetic_test_only: true;
  real_activation: false;
  real_trial: false;
  real_entitlement: false;
  snapshot: {
    schema_version: 1;
    purpose: "SYNTHETIC_TEST_ONLY_BASIC_OPERATIONAL_ACCESS";
    project: { project_ref: string; auth_issuer: string; app_origin: string };
    restaurant_id: string;
    organization_id: string;
    branch_id: string;
    test_session_id: string;
    readiness_receipt_id: string;
    readiness_snapshot_sha256: string;
    customer_join_receipt_id: string;
    customer_id: string;
    basic: {
      plan_key: "BASIC";
      offer_limit: 5;
      offer_notifications: false;
      reward_notifications: false;
      catalog_access: false;
    };
    real_activation: false;
    real_trial: false;
    real_kyb_verified: false;
    real_legal_ready: false;
    real_state: Record<string, unknown>;
  };
  snapshot_sha256: string;
  previous_receipt_id: string | null;
  previous_action: TestOnlyBasicAction | null;
  active: boolean;
  starts_at: string | null;
  expires_at: string | null;
  next_action: TestOnlyBasicAction;
};

export type TestOnlyBasicReceipt = {
  receipt_id: string;
  action: TestOnlyBasicAction;
  restaurant_id: string;
  organization_id: string;
  branch_id: string;
  starts_at: string | null;
  expires_at: string | null;
  synthetic_test_only: true;
  effective_plan: "BASIC" | null;
  real_activation: false;
  real_trial: false;
  real_entitlement: false;
  offer_notifications: false;
  reward_notifications: false;
  catalog_access: false;
  idempotent: boolean;
};

export type TestOnlyBasicErrorCode =
  | "NOT_ELIGIBLE"
  | "FRESH_AAL2_REQUIRED"
  | "TOTP_FACTOR_REQUIRED"
  | "TOTP_REAUTH_REJECTED"
  | "IDENTITY_CHANGED"
  | "STALE"
  | "REPLAY_CONFLICT"
  | "WINDOW_INVALID"
  | "PERMISSION"
  | "UNKNOWN";

export class TestOnlyBasicError extends Error {
  constructor(public readonly code: TestOnlyBasicErrorCode) {
    super(code);
    this.name = "TestOnlyBasicError";
  }
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isHash(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function classifyError(error: { code?: string; message?: string; details?: string }) : TestOnlyBasicErrorCode {
  const server = `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""}`;
  if (server.includes("TEST_ONLY_BASIC_CONTEXT_INVALID") || server.includes("TEST_ONLY_BASIC_READINESS_REQUIRED")) return "NOT_ELIGIBLE";
  if (server.includes("RECENT_PLATFORM_TOTP_REQUIRED") || server.includes("AAL2")) return "FRESH_AAL2_REQUIRED";
  if (server.includes("TEST_ONLY_BASIC_STALE") || error.code === "40001" || error.code === "P0001") return "STALE";
  if (server.includes("TEST_ONLY_BASIC_REPLAY_CONFLICT")) return "REPLAY_CONFLICT";
  if (server.includes("TEST_ONLY_BASIC_WINDOW_INVALID")) return "WINDOW_INVALID";
  if (error.code === "42501" || /permission denied/i.test(server)) return "PERMISSION";
  return "UNKNOWN";
}

function validateState(value: unknown): TestOnlyBasicAccessState {
  if (!value || typeof value !== "object") throw new TestOnlyBasicError("UNKNOWN");
  const state = value as Partial<TestOnlyBasicAccessState>;
  const snapshot = state.snapshot;
  if (state.synthetic_test_only !== true
    || state.real_activation !== false
    || state.real_trial !== false
    || state.real_entitlement !== false
    || !snapshot
    || snapshot.schema_version !== 1
    || snapshot.purpose !== "SYNTHETIC_TEST_ONLY_BASIC_OPERATIONAL_ACCESS"
    || !isUuid(snapshot.restaurant_id)
    || !isUuid(snapshot.organization_id)
    || !isUuid(snapshot.branch_id)
    || !isUuid(snapshot.readiness_receipt_id)
    || !isUuid(snapshot.customer_join_receipt_id)
    || !isUuid(snapshot.customer_id)
    || !isHash(snapshot.readiness_snapshot_sha256)
    || !isHash(state.snapshot_sha256)
    || snapshot.basic?.plan_key !== "BASIC"
    || snapshot.basic.offer_limit !== 5
    || snapshot.basic.offer_notifications !== false
    || snapshot.basic.reward_notifications !== false
    || snapshot.basic.catalog_access !== false
    || snapshot.real_activation !== false
    || snapshot.real_trial !== false
    || snapshot.real_kyb_verified !== false
    || snapshot.real_legal_ready !== false
    || !["GRANT", "REVOKE"].includes(state.next_action ?? "")
    || (state.previous_receipt_id !== null && !isUuid(state.previous_receipt_id))) {
    throw new TestOnlyBasicError("UNKNOWN");
  }
  return state as TestOnlyBasicAccessState;
}

export async function readTestOnlyBasicAccess(restaurantId: string) {
  if (!supabase) throw new TestOnlyBasicError("UNKNOWN");
  const { data, error } = await supabase.rpc("get_platform_test_only_basic_access", {
    input_restaurant_id: restaurantId,
  });
  if (error) throw new TestOnlyBasicError(classifyError(error));
  return validateState(data);
}

export async function decideTestOnlyBasicAccess(input: {
  action: TestOnlyBasicAction;
  expiresAt: string | null;
  reason: string;
  confirmation: string;
  requestId: string;
  expectedState: TestOnlyBasicAccessState;
}) {
  if (!supabase) throw new TestOnlyBasicError("UNKNOWN");
  const fresh = await readTestOnlyBasicAccess(input.expectedState.snapshot.restaurant_id);
  if (fresh.snapshot_sha256 !== input.expectedState.snapshot_sha256
    || fresh.previous_receipt_id !== input.expectedState.previous_receipt_id
    || fresh.next_action !== input.action) {
    throw new TestOnlyBasicError("STALE");
  }
  const { data, error } = await supabase.rpc("decide_platform_test_only_basic_access", {
    input_restaurant_id: fresh.snapshot.restaurant_id,
    input_action: input.action,
    input_expected_snapshot_sha256: fresh.snapshot_sha256,
    input_expected_previous_receipt_id: fresh.previous_receipt_id,
    input_expires_at: input.expiresAt,
    input_reason: input.reason.trim(),
    input_confirmation: input.confirmation,
    input_request_id: input.requestId,
  });
  if (error) throw new TestOnlyBasicError(classifyError(error));
  if (!data || typeof data !== "object") throw new TestOnlyBasicError("UNKNOWN");
  const receipt = data as Partial<TestOnlyBasicReceipt>;
  if (!isUuid(receipt.receipt_id)
    || receipt.action !== input.action
    || receipt.synthetic_test_only !== true
    || receipt.real_activation !== false
    || receipt.real_trial !== false
    || receipt.real_entitlement !== false
    || receipt.offer_notifications !== false
    || receipt.reward_notifications !== false
    || receipt.catalog_access !== false) {
    throw new TestOnlyBasicError("UNKNOWN");
  }
  return receipt as TestOnlyBasicReceipt;
}

export function normalizeTestOnlyBasicMfaError(error: unknown) {
  if (error instanceof TestOnlyBasicError) return error;
  if (error instanceof TestOnlyKybReviewError) {
    if (error.code === "FRESH_AAL2_REQUIRED") return new TestOnlyBasicError("FRESH_AAL2_REQUIRED");
    if (error.code === "TOTP_FACTOR_REQUIRED") return new TestOnlyBasicError("TOTP_FACTOR_REQUIRED");
    if (error.code === "TOTP_REAUTH_REJECTED") return new TestOnlyBasicError("TOTP_REAUTH_REJECTED");
    if (error.code === "IDENTITY_CHANGED") return new TestOnlyBasicError("IDENTITY_CHANGED");
  }
  return new TestOnlyBasicError("UNKNOWN");
}
