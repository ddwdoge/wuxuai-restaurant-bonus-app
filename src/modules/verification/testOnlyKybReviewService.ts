import { supabase } from "../../shared/lib/supabase";
import { hasTotpAuthenticationMethod } from "../platform/platformAdminMfa.mjs";

export type TestOnlyKybDocument = {
  id: string;
  type: "GISA_EXTRACT" | "TRADE_LICENSE";
  version: number;
  sha256: string;
};

export type TestOnlyKybReviewSnapshot = {
  schema_version: 1;
  purpose: "SYNTHETIC_TEST_ONLY_KYB_REVIEW";
  project: {
    project_ref: string;
    auth_issuer: string;
    app_origin: string;
  };
  restaurant_id: string;
  organization_id: string;
  branch_id: string;
  owner_id: string;
  case_id: string;
  country: "AT";
  case_status: "PENDING_ACTIVATION";
  test_only: true;
  material_revision: number;
  documents: TestOnlyKybDocument[];
};

export type TestOnlyKybReviewState = {
  synthetic_test_only: true;
  real_kyb_verified: false;
  snapshot: TestOnlyKybReviewSnapshot;
  snapshot_sha256: string;
  material_revision: number;
  documents: TestOnlyKybDocument[];
  previous_receipt_id: string | null;
  previous_action: "FIRST_REVIEW" | "APPROVE_TEST" | null;
  same_reviewer: boolean;
  synthetic_review_complete: boolean;
};

export type TestOnlyKybReviewAction = "FIRST_REVIEW" | "APPROVE_TEST";
export type TestOnlyKybTotpFactor = {
  id: string;
  friendly_name?: string;
  created_at?: string;
};
export type TestOnlyKybReviewErrorCode =
  | "NOT_ELIGIBLE"
  | "FRESH_AAL2_REQUIRED"
  | "TOTP_FACTOR_REQUIRED"
  | "TOTP_REAUTH_REJECTED"
  | "IDENTITY_CHANGED"
  | "SECOND_PERSON_REQUIRED"
  | "STALE"
  | "REPLAY_CONFLICT"
  | "PERMISSION"
  | "UNKNOWN";

export class TestOnlyKybReviewError extends Error {
  constructor(public readonly code: TestOnlyKybReviewErrorCode) {
    super(code);
    this.name = "TestOnlyKybReviewError";
  }
}

function client() {
  if (!supabase) throw new TestOnlyKybReviewError("UNKNOWN");
  return supabase;
}

function classifyError(error: { code?: string; message?: string; details?: string }) {
  const server = `${error.message ?? ""} ${error.details ?? ""}`;
  if (server.includes("TEST_ONLY_KYB_REVIEW_CONTEXT_INVALID")) return "NOT_ELIGIBLE";
  if (server.includes("RECENT_PLATFORM_TOTP_REQUIRED")) return "FRESH_AAL2_REQUIRED";
  if (server.includes("TEST_ONLY_KYB_REVIEW_SECOND_PERSON_REQUIRED")) return "SECOND_PERSON_REQUIRED";
  if (server.includes("TEST_ONLY_KYB_REVIEW_STALE") || error.code === "40001") return "STALE";
  if (server.includes("TEST_ONLY_KYB_REVIEW_REPLAY_CONFLICT")) return "REPLAY_CONFLICT";
  if (error.code === "42501") return "PERMISSION";
  return "UNKNOWN";
}

function validateState(value: unknown): TestOnlyKybReviewState {
  if (!value || typeof value !== "object") throw new TestOnlyKybReviewError("UNKNOWN");
  const state = value as Partial<TestOnlyKybReviewState>;
  const snapshot = state.snapshot;
  const documents = state.documents;
  if (
    state.synthetic_test_only !== true
    || state.real_kyb_verified !== false
    || !snapshot
    || snapshot.purpose !== "SYNTHETIC_TEST_ONLY_KYB_REVIEW"
    || snapshot.case_status !== "PENDING_ACTIVATION"
    || snapshot.test_only !== true
    || !Number.isSafeInteger(state.material_revision)
    || !Array.isArray(documents)
    || documents.length !== 2
    || !documents.every((document) =>
      (document.type === "GISA_EXTRACT" || document.type === "TRADE_LICENSE")
      && Number.isSafeInteger(document.version)
      && /^[0-9a-f]{64}$/.test(document.sha256)
      && /^[0-9a-f-]{36}$/.test(document.id))
    || new Set(documents.map((document) => document.type)).size !== 2
    || !/^[0-9a-f]{64}$/.test(state.snapshot_sha256 ?? "")
  ) {
    throw new TestOnlyKybReviewError("UNKNOWN");
  }
  return state as TestOnlyKybReviewState;
}

export async function readTestOnlyKybReview(restaurantId: string) {
  const { data, error } = await client().rpc("get_platform_test_only_kyb_review", {
    input_restaurant_id: restaurantId,
  });
  if (error) throw new TestOnlyKybReviewError(classifyError(error));
  return validateState(data);
}

export async function prepareTestOnlyKybReauthentication() {
  const auth = client().auth;
  const [sessionResult, userResult, factorsResult] = await Promise.all([
    auth.getSession(),
    auth.getUser(),
    auth.mfa.listFactors(),
  ]);
  const sessionUserId = sessionResult.data.session?.user.id ?? null;
  const verifiedUserId = userResult.data.user?.id ?? null;
  if (
    sessionResult.error
    || userResult.error
    || factorsResult.error
    || !sessionUserId
    || !verifiedUserId
    || sessionUserId !== verifiedUserId
  ) {
    throw new TestOnlyKybReviewError("IDENTITY_CHANGED");
  }
  const factors = factorsResult.data.totp
    .filter((factor) => factor.status === "verified")
    .map((factor) => ({
      id: factor.id,
      friendly_name: factor.friendly_name,
      created_at: factor.created_at,
    }));
  if (!factors.length) throw new TestOnlyKybReviewError("TOTP_FACTOR_REQUIRED");
  return { identityId: verifiedUserId, factors };
}

export async function confirmTestOnlyKybReauthentication(input: {
  expectedIdentityId: string;
  factorId: string;
  code: string;
}) {
  const auth = client().auth;
  const before = await auth.getUser();
  if (before.error || before.data.user?.id !== input.expectedIdentityId) {
    throw new TestOnlyKybReviewError("IDENTITY_CHANGED");
  }
  const factors = await auth.mfa.listFactors();
  if (factors.error || !factors.data.totp.some((factor) =>
    factor.id === input.factorId && factor.status === "verified")) {
    throw new TestOnlyKybReviewError("TOTP_FACTOR_REQUIRED");
  }
  const verified = await auth.mfa.challengeAndVerify({
    factorId: input.factorId,
    code: input.code,
  });
  if (verified.error) throw new TestOnlyKybReviewError("TOTP_REAUTH_REJECTED");

  const [afterSession, afterUser, assurance] = await Promise.all([
    auth.getSession(),
    auth.getUser(),
    auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  if (
    afterSession.error
    || afterUser.error
    || afterSession.data.session?.user.id !== input.expectedIdentityId
    || afterUser.data.user?.id !== input.expectedIdentityId
  ) {
    throw new TestOnlyKybReviewError("IDENTITY_CHANGED");
  }
  if (
    assurance.error
    || assurance.data.currentLevel !== "aal2"
    || !hasTotpAuthenticationMethod(assurance.data.currentAuthenticationMethods)
  ) {
    throw new TestOnlyKybReviewError("FRESH_AAL2_REQUIRED");
  }
  return { identityId: input.expectedIdentityId };
}

async function requireCurrentTotpAal2() {
  const { data, error } = await client().auth.mfa.getAuthenticatorAssuranceLevel();
  if (
    error
    || data.currentLevel !== "aal2"
    || !hasTotpAuthenticationMethod(data.currentAuthenticationMethods)
  ) {
    throw new TestOnlyKybReviewError("FRESH_AAL2_REQUIRED");
  }
}

export async function decideTestOnlyKybReview(input: {
  action: TestOnlyKybReviewAction;
  confirmation: string;
  reference: string;
  requestId: string;
  state: TestOnlyKybReviewState;
}) {
  await requireCurrentTotpAal2();
  const snapshot = input.state.snapshot;
  const { data, error } = await client().rpc("decide_platform_test_only_kyb_review", {
    input_restaurant_id: snapshot.restaurant_id,
    input_organization_id: snapshot.organization_id,
    input_branch_id: snapshot.branch_id,
    input_action: input.action,
    input_expected_material_revision: input.state.material_revision,
    input_expected_snapshot_sha256: input.state.snapshot_sha256,
    input_expected_previous_receipt_id: input.state.previous_receipt_id,
    input_documents: input.state.documents,
    input_reference: input.reference,
    input_confirmed: true,
    input_confirmation: input.confirmation,
    input_request_id: input.requestId,
  });
  if (error) throw new TestOnlyKybReviewError(classifyError(error));
  if (!data || typeof data !== "object") throw new TestOnlyKybReviewError("UNKNOWN");
  return data as {
    receipt_id: string;
    action: TestOnlyKybReviewAction;
    synthetic_test_only: true;
    real_kyb_verified: false;
    synthetic_review_complete: boolean;
    idempotent: boolean;
  };
}
