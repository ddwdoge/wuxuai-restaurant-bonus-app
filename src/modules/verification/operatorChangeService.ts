import { supabase } from "../../shared/lib/supabase";

export type OperatorProfile = {
  legal_name: string;
  legal_form: string;
  register_identifier: string | null;
  register_court: string | null;
  vat_id: string | null;
  registered_address_source: "restaurant" | "separate";
  business_street: string;
  business_postal_code: string;
  business_city: string;
  business_country: string;
  authorized_representative: string;
  gisa_number: string;
  owner_is_authorized_representative: boolean;
  authorized_representative_role: string;
  commercial_register_applicable: boolean;
};

export type OperatorBranchAddress = {
  address: string;
  postal_code: string;
  city: string;
  country: string;
};

export type OwnerOperatorChangeStatus = {
  restaurant_id: string;
  organization_id: string;
  branch_id: string;
  material_revision: number;
  live_profile: OperatorProfile;
  live_branch_address: OperatorBranchAddress;
  draft: null | {
    id: string;
    request_id: string;
    material_revision: number;
    profile: OperatorProfile;
    branch_address: OperatorBranchAddress;
  };
};

export type PlatformOperatorReview = {
  restaurant_name: string;
  kyb: {
    snapshot: {
      restaurant_id: string;
      organization_id: string;
      branch_id: string;
      material_revision: number;
      owner_draft: null | { id: string; profile: OperatorProfile; branch_address: OperatorBranchAddress };
      operator: OperatorProfile;
      documents: Array<{ id: string; type: string; version: number; sha256: string }>;
    };
    hash: string;
    revision: number;
    previous_id: string | null;
    review_request_id: string | null;
    action: "FIRST_REVIEW" | "APPROVE" | "REVOKE" | null;
    same_reviewer: boolean;
    review_hash: string | null;
    review_revision: number | null;
    draft_revision: number | null;
    document_expiries: Record<string, string | null>;
    current: boolean;
  };
  publication: null | { receipt_id: string; request_id: string; draft_id: string; material_revision: number; published_at: string };
};

function api() {
  if (!supabase) throw new Error("Der geschützte Änderungsdienst ist derzeit nicht verfügbar.");
  return supabase;
}

export async function readOwnerOperatorChangeStatus(restaurantId: string): Promise<OwnerOperatorChangeStatus> {
  const { data, error } = await api().rpc("get_owner_operator_change_status", { input_restaurant_id: restaurantId });
  if (error || !data || typeof data !== "object") throw error ?? new Error("Unternehmensdaten konnten nicht geladen werden.");
  return data as OwnerOperatorChangeStatus;
}

export async function submitOwnerOperatorChangeDraft(input: {
  status: OwnerOperatorChangeStatus;
  profile: OperatorProfile;
  branchAddress: OperatorBranchAddress;
  requestId: string;
}) {
  const { data, error } = await api().rpc("submit_owner_operator_change_draft", {
    input_restaurant_id: input.status.restaurant_id,
    input_organization_id: input.status.organization_id,
    input_branch_id: input.status.branch_id,
    input_profile: input.profile,
    input_branch_address: input.branchAddress,
    input_expected_revision: input.status.material_revision,
    input_request_id: input.requestId,
  });
  if (error) throw error;
  return data as { draft_id: string; material_revision: number; idempotent: boolean };
}

export async function readPlatformOperatorReview(restaurantId: string): Promise<PlatformOperatorReview> {
  const { data, error } = await api().rpc("get_platform_operator_review", { input_restaurant_id: restaurantId });
  if (error || !data || typeof data !== "object") throw error ?? new Error("Prüfstand konnte nicht geladen werden.");
  return data as PlatformOperatorReview;
}

export async function decidePlatformOperatorReview(input: {
  state: PlatformOperatorReview;
  action: "FIRST_REVIEW" | "APPROVE";
  reference: string;
  documentExpiries: Record<string, string | null>;
  confirmation: string;
  requestId: string;
}) {
  const { snapshot, hash, previous_id } = input.state.kyb;
  const { data, error } = await api().rpc("decide_platform_operator_review", {
    input_restaurant_id: snapshot.restaurant_id,
    input_organization_id: snapshot.organization_id,
    input_branch_id: snapshot.branch_id,
    input_kind: "KYB",
    input_action: input.action,
    input_expected_hash: hash,
    input_previous_id: previous_id,
    input_reference: input.reference,
    input_document_expiries: input.documentExpiries,
    input_confirmed: true,
    input_confirmation: input.confirmation,
    input_request_id: input.requestId,
  });
  if (error) throw error;
  return data as { receipt_id: string; material_revision: number; idempotent: boolean };
}

export async function publishReviewedOperatorChange(input: {
  state: PlatformOperatorReview;
  confirmation: string;
  requestId: string;
}) {
  const { snapshot, hash, previous_id } = input.state.kyb;
  if (!snapshot.owner_draft?.id || !previous_id) throw new Error("Es liegt keine veröffentlichungsfähige Prüfung vor.");
  const { data, error } = await api().rpc("publish_reviewed_operator_change", {
    input_restaurant_id: snapshot.restaurant_id,
    input_organization_id: snapshot.organization_id,
    input_branch_id: snapshot.branch_id,
    input_draft_id: snapshot.owner_draft.id,
    input_review_id: previous_id,
    input_expected_hash: hash,
    input_confirmed: true,
    input_confirmation: input.confirmation,
    input_request_id: input.requestId,
  });
  if (error) throw error;
  return data as { receipt_id: string; draft_id: string; material_revision: number; published: boolean };
}
