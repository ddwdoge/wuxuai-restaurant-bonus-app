import { supabase } from "../../shared/lib/supabase";
import { accountingRowsToCsv } from "./legalCompliance";
import { isLegalBundleReady } from "./legalReadiness.mjs";

export type ConsentType = "marketing_push" | "marketing_sms" | "marketing_email" | "personalized_recommendations" | "birthday_processing";
export type ConsentStatus = "granted" | "withdrawn" | "denied";

export type LegalDocumentView = {
  document_type: "participation_terms" | "privacy" | "imprint" | "storage" | "accessibility";
  title: string;
  version_id: string;
  version: string;
  language: string;
  effective_date: string;
  content: Record<string, unknown> | null;
  rendered_text: string;
  document_hash: string;
  status: "draft" | "published" | "archived";
  reacceptance_required: boolean;
  accepted: boolean | null;
  created_at?: string | null;
  published_at?: string | null;
  last_updated_at?: string | null;
  acceptance_count?: number;
  active_state?: "active" | "archived" | "missing";
  responsible_owner?: string | null;
  master_template_version?: string | null;
  draft_version_id?: string | null;
  draft_version?: string | null;
  draft_created_at?: string | null;
  draft_effective_date?: string | null;
  draft_rendered_text?: string | null;
  draft_content?: Record<string, unknown> | null;
  draft_master_template_version?: string | null;
};

export type PublicLegalCenter = {
  restaurant: { name: string; slug: string };
  roles: { program_operator: string; platform_provider: string; notice: string };
  imprint: Record<string, string | null>;
  documents: LegalDocumentView[];
  consents: Array<{ consent_type: ConsentType; status: ConsentStatus; version: string; updated_at: string }>;
  customer_recognized: boolean;
  points_validity: { months: number | null; oldest_expiry_at: string | null; calculation_status: string; notice: string };
  program: { status: "active" | "scheduled"; planned_end_at?: string; last_points_earning_at?: string; final_redemption_at?: string; customer_notice?: string };
  product_notice: string;
  legal_ready: boolean;
  missing_configuration: boolean;
};

export type LegalCenterState =
  | { status: "loading" }
  | { status: "ready"; data: PublicLegalCenter }
  | { status: "not_configured" }
  | { status: "error"; message: string };

export function legalCenterStateFromResponse(data: PublicLegalCenter): LegalCenterState {
  const todayIso = new Date().toISOString().slice(0, 10);
  return data.legal_ready
    && !data.missing_configuration
    && isLegalBundleReady(data.documents, todayIso)
    ? { status: "ready", data }
    : { status: "not_configured" };
}

export type RegistrationLegalChoices = {
  termsAccepted: boolean;
  privacyAcknowledged: boolean;
  marketingPush: boolean;
  marketingSms: boolean;
  marketingEmail: boolean;
  birthdayProcessing: boolean;
};

export type RestaurantLegalSetup = {
  profile: Record<string, string | null>;
  documents: Array<LegalDocumentView & { status: string; reacceptance_required: boolean }>;
  readiness: {
    operational_ready: boolean;
    legal_ready: boolean;
    security_ready: boolean;
    transition_exempt: boolean;
    registration?: {
      status: "green" | "yellow" | "red";
      label: string;
      reason: string;
      registration_allowed: boolean;
      last_updated_at: string | null;
      missing_profile_fields: string[];
      active_required_documents: number;
      draft_documents: number;
      program_active: boolean;
      legal_update_required: boolean;
    };
  };
  legal_update_required?: boolean;
  termination: null | {
    id: string;
    planned_end_at: string;
    last_points_earning_at: string;
    final_redemption_at: string;
    customer_notice: string;
    status: string;
    created_at?: string;
    read_only_at?: string | null;
    closed_at?: string | null;
    archived_at?: string | null;
    completion_report?: Record<string, unknown> | null;
  };
  privacy_requests: Array<{
    id: string;
    request_type: "access" | "export" | "rectification" | "deletion" | "restriction" | "membership_termination" | "complaint";
    status: "requested" | "in_review" | "completed" | "rejected" | "cancelled";
    created_at: string;
    customer_reference: string;
  }>;
};

function requireSupabase() {
  if (!supabase) throw new Error("Live-Daten konnten nicht geladen werden.");
  return supabase;
}

export async function loadPublicLegalCenter(restaurantSlug: string, customerToken?: string | null) {
  const client = requireSupabase();
  const { data, error } = await client.rpc("get_public_legal_center", {
    input_restaurant_slug: restaurantSlug,
    input_customer_token: customerToken ?? null,
  });
  if (error) throw error;
  return data as PublicLegalCenter;
}

export async function updateCustomerConsent(
  restaurantSlug: string,
  customerToken: string,
  consentType: ConsentType,
  granted: boolean,
) {
  const client = requireSupabase();
  const { data, error } = await client.rpc("update_customer_consent", {
    input_restaurant_slug: restaurantSlug,
    input_customer_token: customerToken,
    input_consent_type: consentType,
    input_granted: granted,
    input_source: "consent_center",
  });
  if (error) throw error;
  return data as { consent_type: ConsentType; status: ConsentStatus; updated_at: string };
}

export async function acceptCurrentLegalDocuments(restaurantSlug: string, customerToken: string) {
  const client = requireSupabase();
  const { data, error } = await client.rpc("accept_current_legal_documents", {
    input_restaurant_slug: restaurantSlug,
    input_customer_token: customerToken,
    input_source: "legal_center",
  });
  if (error) throw error;
  return data as { accepted_versions: number; status: string };
}

export async function createCustomerPrivacyRequest(
  restaurantSlug: string,
  customerToken: string,
  requestType: "access" | "rectification" | "deletion" | "restriction" | "membership_termination" | "complaint",
  message?: string,
) {
  const client = requireSupabase();
  const { data, error } = await client.rpc("create_customer_privacy_request", {
    input_restaurant_slug: restaurantSlug,
    input_customer_token: customerToken,
    input_request_type: requestType,
    input_customer_message: message?.trim() || null,
  });
  if (error) throw error;
  return data as { request_id: string; status: string };
}

export async function downloadCustomerData(restaurantSlug: string, customerToken: string) {
  const client = requireSupabase();
  const { data, error } = await client.rpc("get_customer_data_export", {
    input_restaurant_slug: restaurantSlug,
    input_customer_token: customerToken,
  });
  if (error) throw error;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `wuxuai-bonus-daten-${restaurantSlug}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function loadRestaurantLegalSetup(restaurantId: string) {
  const client = requireSupabase();
  const { data, error } = await client.rpc("get_restaurant_legal_setup", { input_restaurant_id: restaurantId });
  if (error) throw error;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Restaurant legal setup is unavailable.");
  }
  return data as RestaurantLegalSetup;
}

export async function saveRestaurantLegalSetup(input: {
  restaurantId: string;
  profile: Record<string, string | null>;
  terms: Record<string, unknown>;
  privacyText: string;
  effectiveDate: string;
  reacceptanceRequired: boolean;
}) {
  const client = requireSupabase();
  const { data, error } = await client.rpc("save_restaurant_legal_setup", {
    input_restaurant_id: input.restaurantId,
    input_profile: input.profile,
    input_terms: input.terms,
    input_privacy_text: input.privacyText,
    input_effective_date: input.effectiveDate,
    input_reacceptance_required: input.reacceptanceRequired,
  });
  if (error) throw error;
  return data as RestaurantLegalSetup;
}

export async function generateRestaurantLegalPackage(input: {
  restaurantId: string;
  profile: Record<string, string | null>;
  reacceptanceRequired?: boolean;
}) {
  const client = requireSupabase();
  const { data, error } = await client.rpc("generate_restaurant_legal_package", {
    input_restaurant_id: input.restaurantId,
    input_profile: input.profile,
    input_reacceptance_required: input.reacceptanceRequired ?? false,
  });
  if (error) throw error;
  return data as RestaurantLegalSetup;
}

export async function publishRestaurantLegalDrafts(input: {
  restaurantId: string;
  effectiveDate: string;
  reacceptanceRequired: boolean;
  confirmed: boolean;
}) {
  const client = requireSupabase();
  const { data, error } = await client.rpc("publish_restaurant_legal_drafts", {
    input_restaurant_id: input.restaurantId,
    input_effective_date: input.effectiveDate,
    input_reacceptance_required: input.reacceptanceRequired,
    input_confirmed: input.confirmed,
    input_request_id: crypto.randomUUID(),
  });
  if (error) throw error;
  return data as RestaurantLegalSetup;
}

export async function scheduleProgramTermination(input: {
  restaurantId: string;
  plannedEndAt: string;
  lastPointsEarningAt: string;
  finalRedemptionAt: string;
  customerNotice: string;
}) {
  const client = requireSupabase();
  const { data, error } = await client.rpc("schedule_program_termination", {
    input_restaurant_id: input.restaurantId,
    input_planned_end_at: input.plannedEndAt,
    input_last_points_earning_at: input.lastPointsEarningAt,
    input_final_redemption_at: input.finalRedemptionAt,
    input_customer_notice: input.customerNotice,
  });
  if (error) throw error;
  return data as { id: string; status: string };
}

export async function downloadRewardAccountingCsv(restaurantId: string, from: string, to: string) {
  const client = requireSupabase();
  const { data, error } = await client.rpc("get_reward_accounting_export", {
    input_restaurant_id: restaurantId,
    input_from: from,
    input_to: to,
    input_reward_id: null,
    input_status: null,
  });
  if (error) throw error;
  const payload = data as { rows: Array<Record<string, unknown>> };
  const blob = new Blob([accountingRowsToCsv(payload.rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "wuxuai-punkteeinloesungen.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}
