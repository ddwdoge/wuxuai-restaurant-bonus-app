import { supabase } from "../../shared/lib/supabase";

export const KYB_DOCUMENT_TYPES = [
  "GISA_EXTRACT",
  "COMPANY_REGISTER_EXTRACT",
  "TRADE_LICENSE",
  "TAX_REGISTRATION",
  "REPRESENTATIVE_ID",
  "POWER_OF_ATTORNEY",
] as const;

export type KybDocumentType = typeof KYB_DOCUMENT_TYPES[number];
export type KybDocumentStatus =
  | "PENDING_UPLOAD"
  | "UPLOADED"
  | "SUPERSEDED"
  | "DELETION_REQUESTED"
  | "DELETED";

export type KybDocument = {
  document_id: string;
  document_type: KybDocumentType;
  version: number;
  status: KybDocumentStatus;
  mime_type: string;
  byte_size: number | null;
  reserved_at: string;
  uploaded_at: string | null;
  deletion_requested_at: string | null;
};

export type KybDocumentErrorCode = "FILE_TYPE" | "FILE_SIZE" | "PERMISSION" | "UPLOAD";

export class KybDocumentError extends Error {
  constructor(public readonly code: KybDocumentErrorCode) {
    super(code);
    this.name = "KybDocumentError";
  }
}

const KYB_BUCKET = "business-verification-documents";
const MAX_KYB_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_KYB_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

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

export type PlatformKybReviewQueueItem = {
  case_id: string;
  restaurant_id: string;
  restaurant_name: string;
  country: string;
  method: "MANUAL" | "DIGITAL";
  status: string;
  submitted_at: string;
  document_count: number;
  latest_document_at: string;
};

export type PlatformKybDocumentEvent = {
  document_id: string;
  event_type: string;
  previous_status: string | null;
  new_status: string;
  reason_code: string;
  created_at: string;
};

export type PlatformKybReviewDetail = {
  case_id: string;
  restaurant_id: string;
  restaurant_name: string;
  country: string;
  method: string;
  status: string;
  submitted_at: string;
  review_started_at: string | null;
  documents: Array<KybDocument & {
    superseded_at: string | null;
  }>;
  document_events: PlatformKybDocumentEvent[];
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
  if (registerType !== "GISA") throw new Error("Einreichung konnte nicht abgeschlossen werden.");
  const { data, error } = await client().rpc("submit_pending_business_verification_intake", {
    input_restaurant_id: restaurantId,
    input_method: "MANUAL",
    input_request_id: requestId,
    input_correlation_id: correlationId,
  });
  if (error) throw new Error(error.code === "42501" ? "Einreichung ist derzeit gesperrt. Bitte prüfe Land und Betriebsstatus." : "Einreichung konnte nicht abgeschlossen werden.");
  return data as { status: "PENDING_ACTIVATION"; idempotent: boolean };
}

export async function listOwnerKybDocuments(restaurantId: string): Promise<KybDocument[]> {
  const { data, error } = await client().rpc("list_business_verification_documents", {
    input_restaurant_id: restaurantId,
  });
  if (error || !Array.isArray(data)) {
    throw new KybDocumentError(error?.code === "42501" ? "PERMISSION" : "UPLOAD");
  }
  return data as KybDocument[];
}

async function sha256(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function uploadOwnerKybDocument(input: {
  restaurantId: string;
  documentType: KybDocumentType;
  file: File;
}) {
  if (!ALLOWED_KYB_MIME_TYPES.has(input.file.type)) throw new KybDocumentError("FILE_TYPE");
  if (input.file.size < 1 || input.file.size > MAX_KYB_FILE_SIZE) throw new KybDocumentError("FILE_SIZE");

  const api = client();
  const reservationRequestId = crypto.randomUUID();
  const reservationCorrelationId = crypto.randomUUID();
  const { data: reservation, error: reservationError } = await api.rpc(
    "reserve_business_verification_document_upload",
    {
      input_restaurant_id: input.restaurantId,
      input_document_type: input.documentType,
      input_mime_type: input.file.type,
      input_request_id: reservationRequestId,
      input_correlation_id: reservationCorrelationId,
    },
  );
  if (reservationError || !reservation || typeof reservation !== "object") {
    throw new KybDocumentError(reservationError?.code === "42501" ? "PERMISSION" : "UPLOAD");
  }

  const reserved = reservation as { document_id?: string; bucket?: string; object_name?: string };
  if (!reserved.document_id || reserved.bucket !== KYB_BUCKET || !reserved.object_name) {
    throw new KybDocumentError("UPLOAD");
  }

  const { error: uploadError } = await api.storage.from(KYB_BUCKET).upload(
    reserved.object_name,
    input.file,
    { contentType: input.file.type, upsert: false },
  );
  if (uploadError) throw new KybDocumentError(uploadError.statusCode === "403" ? "PERMISSION" : "UPLOAD");

  const { data: completion, error: completionError } = await api.rpc(
    "complete_business_verification_document_upload",
    {
      input_document_id: reserved.document_id,
      input_content_sha256: await sha256(input.file),
      input_request_id: crypto.randomUUID(),
      input_correlation_id: crypto.randomUUID(),
    },
  );
  if (completionError || !completion) {
    throw new KybDocumentError(completionError?.code === "42501" ? "PERMISSION" : "UPLOAD");
  }
  return completion as { document_id: string; status: "UPLOADED"; idempotent: boolean };
}

export async function downloadOwnerKybDocument(document: KybDocument) {
  const api = client();
  const { data: object, error: objectError } = await api.rpc(
    "get_business_verification_document_object",
    { input_document_id: document.document_id },
  );
  if (objectError || !object || typeof object !== "object") {
    throw new KybDocumentError(objectError?.code === "42501" ? "PERMISSION" : "UPLOAD");
  }
  const descriptor = object as { bucket?: string; object_name?: string };
  if (descriptor.bucket !== KYB_BUCKET || !descriptor.object_name) throw new KybDocumentError("UPLOAD");
  const { data, error } = await api.storage.from(KYB_BUCKET).download(descriptor.object_name);
  if (error || !data) throw new KybDocumentError(error?.statusCode === "403" ? "PERMISSION" : "UPLOAD");
  return data;
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

export async function readPlatformKybReviewQueue(): Promise<PlatformKybReviewQueueItem[]> {
  const { data, error } = await client().rpc("list_platform_kyb_review_queue");
  if (error || !Array.isArray(data)) throw new Error("KYB-Prüfliste konnte nicht geladen werden.");
  return data as PlatformKybReviewQueueItem[];
}

export async function readPlatformKybReviewDetail(caseId: string): Promise<PlatformKybReviewDetail> {
  const { data, error } = await client().rpc("get_platform_kyb_review_detail", {
    input_case_id: caseId,
  });
  if (error || !data || typeof data !== "object") throw new Error("KYB-Prüfdetails konnten nicht geladen werden.");
  return data as PlatformKybReviewDetail;
}

export async function openPlatformKybDocument(document: KybDocument) {
  const api = client();
  const { data: object, error: objectError } = await api.rpc(
    "get_platform_kyb_document_object",
    { input_document_id: document.document_id },
  );
  if (objectError || !object || typeof object !== "object") {
    throw new KybDocumentError(objectError?.code === "42501" ? "PERMISSION" : "UPLOAD");
  }
  const descriptor = object as { bucket?: string; object_name?: string };
  if (descriptor.bucket !== KYB_BUCKET || !descriptor.object_name) throw new KybDocumentError("UPLOAD");
  const { data, error } = await api.storage.from(KYB_BUCKET).download(descriptor.object_name);
  if (error || !data) throw new KybDocumentError(error?.statusCode === "403" ? "PERMISSION" : "UPLOAD");
  return data;
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
