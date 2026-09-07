import { supabase } from "../../shared/lib/supabase";
import type { UiLanguage } from "../../shared/i18n/language.mjs";

export const KASSA_ACKNOWLEDGEMENT_VERSION = "kassa-separation-de-v1";

export type KassaStatus = "OPEN" | "RECORDED" | "OWNER_REVIEWED";
export type KassaComplianceStatus = { contract_version: string; required_text_version: string; accepted: boolean };
export type KassaReconciliationRow = { id: string; activity_number: string; redeemed_at: string; reward_type: string; reward_name: string | null; status: KassaStatus; recorded_at: string | null; owner_reviewed_at: string | null };
export type KassaReconciliation = { date: string; timezone: string; rows: KassaReconciliationRow[] };

function client() { if (!supabase) throw new Error("Live-Daten konnten nicht geladen werden."); return supabase; }

export async function loadKassaComplianceStatus(restaurantId: string) {
  const { data, error } = await client().rpc("get_restaurant_kassa_compliance_status", { input_restaurant_id: restaurantId });
  if (error) throw error;
  return data as KassaComplianceStatus;
}

export async function acceptKassaSeparation(restaurantId: string, language: UiLanguage) {
  const { data, error } = await client().rpc("accept_kassa_separation_acknowledgement", {
    input_restaurant_id: restaurantId, input_text_version: KASSA_ACKNOWLEDGEMENT_VERSION,
    input_ui_language: language, input_request_id: crypto.randomUUID(),
  });
  if (error) throw error;
  return data as { accepted: true; accepted_at: string };
}

export async function loadKassaReconciliation(restaurantId: string, date: string) {
  const { data, error } = await client().rpc("get_restaurant_kassa_reconciliation", { input_restaurant_id: restaurantId, input_date: date });
  if (error) throw error;
  return data as KassaReconciliation;
}

export async function recordKassaRedemption(restaurantId: string, workflowId: string) {
  const { data, error } = await client().rpc("record_kassa_redemption", { input_restaurant_id: restaurantId, input_workflow_id: workflowId, input_request_id: crypto.randomUUID() });
  if (error) throw error;
  return data as { status: KassaStatus; already_completed: boolean };
}

export async function reviewKassaRedemption(restaurantId: string, workflowId: string) {
  const { data, error } = await client().rpc("owner_review_kassa_redemption", { input_restaurant_id: restaurantId, input_workflow_id: workflowId, input_request_id: crypto.randomUUID() });
  if (error) throw error;
  return data as { status: "OWNER_REVIEWED"; already_completed: boolean };
}
