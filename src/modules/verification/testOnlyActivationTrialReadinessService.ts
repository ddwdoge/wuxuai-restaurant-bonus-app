import { supabase } from "../../shared/lib/supabase";
import {
  TestOnlyKybReviewError,
  type TestOnlyKybDocument,
} from "./testOnlyKybReviewService";

export type TestOnlyActivationTrialAction =
  | "ACTIVATION_READINESS_TEST"
  | "TRIAL_READINESS_TEST";

type TestOnlyActivationTrialSnapshot = {
  schema_version: 1;
  purpose: "SYNTHETIC_TEST_ONLY_ACTIVATION_TRIAL_READINESS";
  project: {
    project_ref: string;
    auth_issuer: string;
    app_origin: string;
  };
  restaurant_id: string;
  organization_id: string;
  branch_id: string;
  case_id: string;
  material_revision: number;
  kyb: {
    receipt_id: string;
    snapshot_sha256: string;
    documents: TestOnlyKybDocument[];
    synthetic_review_complete: true;
    real_kyb_verified: false;
  };
  legal: {
    platform_publication_id: string;
    platform_version: string;
    platform_sha256: string;
    merchant_publication_id: string;
    merchant_bundle_id: string;
    merchant_bundle_hash: string;
    merchant_manifest: Record<string, unknown>;
    synthetic_test_only: true;
    real_legal_ready: false;
  };
  baseline: {
    restaurant_status: "draft";
    activation_status: "pending_activation";
    branch_status: "draft";
    subscription_status: "pending_activation";
    payment_status: "not_required";
    trial_started_at: null;
    trial_ends_at: null;
    stripe_customer_id: null;
    stripe_subscription_id: null;
    real_intake_status: "BLOCKED";
    catalog_access: false;
  };
};

export type TestOnlyActivationTrialReadinessState = {
  synthetic_test_only: true;
  real_activation: false;
  real_trial: false;
  snapshot: TestOnlyActivationTrialSnapshot;
  snapshot_sha256: string;
  previous_receipt_id: string | null;
  previous_action: TestOnlyActivationTrialAction | null;
  next_action: TestOnlyActivationTrialAction | null;
  synthetic_chain_complete: boolean | null;
};

export type TestOnlyActivationTrialReadinessErrorCode =
  | "NOT_ELIGIBLE"
  | "FRESH_AAL2_REQUIRED"
  | "TOTP_FACTOR_REQUIRED"
  | "TOTP_REAUTH_REJECTED"
  | "IDENTITY_CHANGED"
  | "NEWER_TOTP_REQUIRED"
  | "STALE"
  | "REPLAY_CONFLICT"
  | "PERMISSION"
  | "UNKNOWN";

export class TestOnlyActivationTrialReadinessError extends Error {
  constructor(public readonly code: TestOnlyActivationTrialReadinessErrorCode) {
    super(code);
    this.name = "TestOnlyActivationTrialReadinessError";
  }
}

function client() {
  if (!supabase) throw new TestOnlyActivationTrialReadinessError("UNKNOWN");
  return supabase;
}

function classifyError(error: { code?: string; message?: string; details?: string }) {
  const server = `${error.message ?? ""} ${error.details ?? ""}`;
  if (server.includes("TEST_ONLY_ACTIVATION_TRIAL_CONTEXT_INVALID")) return "NOT_ELIGIBLE";
  if (server.includes("RECENT_PLATFORM_TOTP_REQUIRED")) return "FRESH_AAL2_REQUIRED";
  if (server.includes("TEST_ONLY_ACTIVATION_TRIAL_NEW_TOTP_REQUIRED")) return "NEWER_TOTP_REQUIRED";
  if (server.includes("TEST_ONLY_ACTIVATION_TRIAL_STALE") || error.code === "40001" || error.code === "P0001") return "STALE";
  if (server.includes("TEST_ONLY_ACTIVATION_TRIAL_REPLAY_CONFLICT")) return "REPLAY_CONFLICT";
  if (error.code === "42501") return "PERMISSION";
  return "UNKNOWN";
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function isDocument(value: unknown): value is TestOnlyKybDocument {
  if (!value || typeof value !== "object") return false;
  const document = value as Partial<TestOnlyKybDocument>;
  return isUuid(document.id)
    && (document.type === "GISA_EXTRACT" || document.type === "TRADE_LICENSE")
    && Number.isSafeInteger(document.version)
    && Number(document.version) > 0
    && isSha256(document.sha256);
}

function validateState(value: unknown): TestOnlyActivationTrialReadinessState {
  if (!value || typeof value !== "object") throw new TestOnlyActivationTrialReadinessError("UNKNOWN");
  const state = value as Partial<TestOnlyActivationTrialReadinessState>;
  const snapshot = state.snapshot;
  const documents = snapshot?.kyb?.documents;
  const chainIsConsistent = (
    state.synthetic_chain_complete === true
    && state.previous_action === "TRIAL_READINESS_TEST"
    && isUuid(state.previous_receipt_id)
    && state.next_action === null
  ) || (
    state.synthetic_chain_complete !== true
    && state.previous_action === null
    && state.previous_receipt_id === null
    && state.next_action === "ACTIVATION_READINESS_TEST"
  ) || (
    state.synthetic_chain_complete === false
    && state.previous_action === "ACTIVATION_READINESS_TEST"
    && isUuid(state.previous_receipt_id)
    && state.next_action === "TRIAL_READINESS_TEST"
  );
  if (
    state.synthetic_test_only !== true
    || state.real_activation !== false
    || state.real_trial !== false
    || !snapshot
    || snapshot.schema_version !== 1
    || snapshot.purpose !== "SYNTHETIC_TEST_ONLY_ACTIVATION_TRIAL_READINESS"
    || snapshot.project?.project_ref !== "mbgveqbhessaunrhfudm"
    || snapshot.project?.auth_issuer !== "https://mbgveqbhessaunrhfudm.supabase.co/auth/v1"
    || snapshot.project?.app_origin !== "https://staging-v2.bonus.wuxuaisbi.com"
    || ![snapshot.restaurant_id, snapshot.organization_id, snapshot.branch_id, snapshot.case_id].every(isUuid)
    || !Number.isSafeInteger(snapshot.material_revision)
    || Number(snapshot.material_revision) < 1
    || snapshot.kyb?.synthetic_review_complete !== true
    || snapshot.kyb?.real_kyb_verified !== false
    || !isUuid(snapshot.kyb?.receipt_id)
    || !isSha256(snapshot.kyb?.snapshot_sha256)
    || !Array.isArray(documents)
    || documents.length !== 2
    || !documents.every(isDocument)
    || new Set(documents.map((document) => document.type)).size !== 2
    || snapshot.legal?.synthetic_test_only !== true
    || snapshot.legal?.real_legal_ready !== false
    || !isUuid(snapshot.legal?.platform_publication_id)
    || !/^TEST_ONLY_[A-Z0-9_-]{3,80}$/.test(snapshot.legal?.platform_version ?? "")
    || !isSha256(snapshot.legal?.platform_sha256)
    || !isUuid(snapshot.legal?.merchant_publication_id)
    || typeof snapshot.legal?.merchant_bundle_id !== "string"
    || !snapshot.legal.merchant_bundle_id.startsWith("at-test-")
    || !isSha256(snapshot.legal?.merchant_bundle_hash)
    || !snapshot.legal?.merchant_manifest
    || typeof snapshot.legal.merchant_manifest !== "object"
    || snapshot.baseline?.restaurant_status !== "draft"
    || snapshot.baseline?.activation_status !== "pending_activation"
    || snapshot.baseline?.branch_status !== "draft"
    || snapshot.baseline?.subscription_status !== "pending_activation"
    || snapshot.baseline?.payment_status !== "not_required"
    || snapshot.baseline?.trial_started_at !== null
    || snapshot.baseline?.trial_ends_at !== null
    || snapshot.baseline?.stripe_customer_id !== null
    || snapshot.baseline?.stripe_subscription_id !== null
    || snapshot.baseline?.real_intake_status !== "BLOCKED"
    || snapshot.baseline?.catalog_access !== false
    || !isSha256(state.snapshot_sha256)
    || !chainIsConsistent
  ) {
    throw new TestOnlyActivationTrialReadinessError("UNKNOWN");
  }
  return state as TestOnlyActivationTrialReadinessState;
}

export async function readTestOnlyActivationTrialReadiness(restaurantId: string) {
  const { data, error } = await client().rpc("get_platform_test_only_activation_trial", {
    input_restaurant_id: restaurantId,
  });
  if (error) throw new TestOnlyActivationTrialReadinessError(classifyError(error));
  return validateState(data);
}

export async function decideTestOnlyActivationTrialReadiness(input: {
  action: TestOnlyActivationTrialAction;
  confirmation: string;
  reference: string;
  requestId: string;
  expectedState: TestOnlyActivationTrialReadinessState;
}) {
  // The server read is deliberately repeated immediately before every write.
  // A UI snapshot never becomes write authority.
  const fresh = await readTestOnlyActivationTrialReadiness(input.expectedState.snapshot.restaurant_id);
  if (
    fresh.next_action !== input.action
    || fresh.snapshot_sha256 !== input.expectedState.snapshot_sha256
    || fresh.previous_receipt_id !== input.expectedState.previous_receipt_id
  ) {
    throw new TestOnlyActivationTrialReadinessError("STALE");
  }
  const { data, error } = await client().rpc("decide_platform_test_only_activation_trial", {
    input_restaurant_id: fresh.snapshot.restaurant_id,
    input_action: input.action,
    input_expected_snapshot_sha256: fresh.snapshot_sha256,
    input_expected_previous_receipt_id: fresh.previous_receipt_id,
    input_reference: input.reference,
    input_confirmation: input.confirmation,
    input_request_id: input.requestId,
  });
  if (error) throw new TestOnlyActivationTrialReadinessError(classifyError(error));
  if (!data || typeof data !== "object") throw new TestOnlyActivationTrialReadinessError("UNKNOWN");
  return data as {
    receipt_id: string;
    action: TestOnlyActivationTrialAction;
    synthetic_test_only: true;
    real_activation: false;
    real_trial: false;
    synthetic_chain_complete: boolean;
    idempotent: boolean;
  };
}

export function normalizeReadinessMfaError(error: unknown): TestOnlyActivationTrialReadinessError {
  if (error instanceof TestOnlyActivationTrialReadinessError) return error;
  if (error instanceof TestOnlyKybReviewError) {
    if (error.code === "FRESH_AAL2_REQUIRED") return new TestOnlyActivationTrialReadinessError("FRESH_AAL2_REQUIRED");
    if (error.code === "TOTP_FACTOR_REQUIRED") return new TestOnlyActivationTrialReadinessError("TOTP_FACTOR_REQUIRED");
    if (error.code === "TOTP_REAUTH_REJECTED") return new TestOnlyActivationTrialReadinessError("TOTP_REAUTH_REJECTED");
    if (error.code === "IDENTITY_CHANGED") return new TestOnlyActivationTrialReadinessError("IDENTITY_CHANGED");
  }
  return new TestOnlyActivationTrialReadinessError("UNKNOWN");
}
