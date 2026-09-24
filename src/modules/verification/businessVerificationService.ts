import { supabase } from "../../shared/lib/supabase";

export type VerificationReadiness = {
  status: string;
  block_code?: string;
  real_verified: boolean;
  checkout_allowed: boolean;
};

export type VerificationOwnerStatus = {
  status: string;
  submission_allowed: boolean;
  pending_tenant: boolean;
  rejection_reason: string | null;
  submitted_at: string | null;
  review_started_at: string | null;
  profile_revision: number | null;
};

export type VerificationProfile = {
  status: string;
  revision?: number;
  legal_name?: string;
  legal_form?: string;
  register_type?: string | null;
  register_identifier?: string | null;
  vat_id?: string | null;
  business_street?: string;
  business_postal_code?: string;
  business_city?: string;
  business_country?: string;
};

export type VerificationQueueItem = {
  case_id: string;
  restaurant_id: string;
  country: string;
  method: "MANUAL" | "DIGITAL";
  status: string;
  submitted_at: string;
};

export type VerificationAdminDetail = {
  case_id: string;
  restaurant_id: string;
  restaurant_name: string;
  country: string;
  method: string;
  status: string;
  allowed_actions: VerificationAdminAction[];
  profiles: Array<VerificationProfile & { id: string; revision: number; created_at: string }>;
  history: Array<{ action: string; previous_status: string; new_status: string; reason_code: string; reason: string; decided_at: string }>;
  evidence: Array<{ evidence_type: string; content_hash: string; retention_class: string; uploaded_at: string; reviewed_at: string | null }>;
};

export type VerificationAdminAction = "START_REVIEW" | "REJECT" | "SUSPEND" | "CORRECT_PROFILE" | "GRANT_TEST" | "REVOKE_TEST";

function client() {
  if (!supabase) throw new Error("Verifikationsdienst derzeit nicht verfügbar.");
  return supabase;
}

export async function readOwnerVerification(restaurantId: string) {
  const api = client();
  const [readiness, profile, ownerStatus] = await Promise.all([
    api.rpc("get_business_verification_readiness", { input_restaurant_id: restaurantId, input_environment: "TEST" }),
    api.rpc("get_business_verification_profile", { input_restaurant_id: restaurantId }),
    api.rpc("get_business_verification_owner_status", { input_restaurant_id: restaurantId }),
  ]);
  if (readiness.error || profile.error || ownerStatus.error) throw new Error("Verifikationsstatus konnte nicht geladen werden.");
  return { readiness: readiness.data as VerificationReadiness, profile: profile.data as VerificationProfile,
    ownerStatus: ownerStatus.data as VerificationOwnerStatus };
}

export async function submitOwnerVerification(restaurantId: string, registerType: string, requestId: string, correlationId: string) {
  const { data, error } = await client().rpc("submit_pending_business_verification", {
    input_restaurant_id: restaurantId,
    input_method: "MANUAL",
    input_register_type: registerType,
    input_request_id: requestId,
    input_correlation_id: correlationId,
  });
  if (error) throw new Error(error.code === "42501" ? "Einreichung ist derzeit gesperrt. Bitte prüfe Land und Betriebsstatus." : "Einreichung konnte nicht abgeschlossen werden.");
  return data as { status: "PENDING_ACTIVATION"; idempotent: boolean };
}

export async function readVerificationQueue(): Promise<VerificationQueueItem[]> {
  const { data, error } = await client().rpc("list_business_verification_queue");
  if (error || !Array.isArray(data)) throw new Error("Prüfliste konnte nicht geladen werden.");
  return data as VerificationQueueItem[];
}

export async function readVerificationAdminDetail(caseId: string): Promise<VerificationAdminDetail> {
  const { data, error } = await client().rpc("get_business_verification_admin_detail", { input_case_id: caseId });
  if (error || !data || typeof data !== "object") throw new Error("Prüfdetails konnten nicht geladen werden.");
  return data as VerificationAdminDetail;
}

export async function manageVerification(input: {
  restaurantId: string;
  action: VerificationAdminAction;
  method?: "MANUAL" | "DIGITAL";
  reasonCode: string;
  reason: string;
  profile?: Record<string, string>;
  requestId: string;
  correlationId: string;
  confirmation: string;
}) {
  const { data, error } = await client().rpc("manage_business_verification", {
    input_restaurant_id: input.restaurantId,
    input_action: input.action,
    input_method: input.action === "START_REVIEW" ? input.method ?? "MANUAL" : null,
    input_reason_code: input.reasonCode,
    input_reason: input.reason,
    input_profile: input.action === "CORRECT_PROFILE" ? input.profile : null,
    input_request_id: input.requestId,
    input_correlation_id: input.correlationId,
    input_confirmation: input.confirmation,
  });
  if (error) throw new Error(error.code === "42501" ? "Aktion gesperrt: Rolle, letzte Anmeldung oder Bestätigungsphrase prüfen." : "Aktion konnte nicht abgeschlossen werden.");
  return data as { status: string; idempotent: boolean };
}
