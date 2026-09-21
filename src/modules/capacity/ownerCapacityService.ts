import { supabase } from "../../shared/lib/supabase";

export type CapacityStatus = "AVAILABLE" | "WARNING_80" | "WARNING_90" | "AT_LIMIT" | "OVER_LIMIT";

export type CapacityMetric = {
  base_limit: number;
  addon_units: number;
  addon_capacity: number;
  addon_capacity_per_unit: number;
  effective_limit: number;
  usage: number;
  remaining: number;
  usage_percent: number;
  status: CapacityStatus;
};

export type CapacityAddonCatalog = {
  addon_key: "OFFER_CAPACITY" | "CUSTOMER_CAPACITY";
  version: number;
  capacity_per_unit: number;
  monthly_price_minor: number;
  currency: "EUR";
  tax_treatment: "EX_VAT";
};

export type OwnerCapacitySnapshot = {
  contract_version: "restaurant_capacity_v1";
  as_of: string;
  plan: {
    plan_key: "BASIC" | "PRO";
    version: number;
    monthly_price_minor: number;
    currency: "EUR";
    tax_treatment: "EX_VAT";
    entitlement_source: string | null;
    reason_code: string | null;
    subscription_status: string | null;
    payment_status: string | null;
  };
  offers: CapacityMetric;
  active_customers: CapacityMetric & {
    window_days: number;
    window_from: string;
    window_to_exclusive: string;
  };
  commercial_release: {
    country_code?: string | null;
    release_state?: "LOCKED" | "RELEASED" | null;
    released?: boolean;
  } | null;
  catalog: {
    offer_addon: CapacityAddonCatalog;
    customer_addon: CapacityAddonCatalog;
  };
  warning_contract: {
    thresholds_percent: number[];
    forecast_horizon_days: number;
    minimum_complete_history_days: number;
    dispatch_active: boolean;
    forecast_active: boolean;
    decision_required: boolean;
  };
  write_enforcement: { offers: true; active_customers: true };
  write_enforcement_active: true;
  unlimited: false;
};

export type OwnerCapacityWarning = {
  episode_id: string;
  capacity_type: "offer" | "customer";
  warning_level: "80" | "90" | "100" | "OVER_LIMIT";
  triggered_by: "ACTUAL" | "FORECAST";
  usage: number;
  effective_limit: number;
  remaining: number;
  projected_usage_7d: number | null;
  opened_at: string;
  acknowledged: boolean;
  route: "/admin/settings/tarif-kapazitaet";
};

export async function loadOwnerCapacity(restaurantId: string): Promise<OwnerCapacitySnapshot> {
  if (!supabase) throw new Error("CAPACITY_LIVE_DATA_UNAVAILABLE");
  const { data, error } = await supabase.rpc("get_restaurant_capacity", {
    input_restaurant_id: restaurantId,
  });
  if (error) throw new Error("CAPACITY_LOAD_FAILED");
  return data as OwnerCapacitySnapshot;
}

export async function loadOwnerCapacityWarnings(restaurantId: string): Promise<OwnerCapacityWarning[]> {
  if (!supabase) throw new Error("CAPACITY_LIVE_DATA_UNAVAILABLE");
  const { data, error } = await supabase.rpc("get_owner_capacity_warnings", {
    input_restaurant_id: restaurantId,
  });
  if (error) throw new Error("CAPACITY_WARNING_LOAD_FAILED");
  return (data ?? []) as OwnerCapacityWarning[];
}

export async function acknowledgeOwnerCapacityWarning(restaurantId: string, episodeId: string) {
  if (!supabase) throw new Error("CAPACITY_LIVE_DATA_UNAVAILABLE");
  const { data, error } = await supabase.rpc("acknowledge_owner_capacity_warning", {
    input_restaurant_id: restaurantId,
    input_episode_id: episodeId,
  });
  if (error || data !== true) throw new Error("CAPACITY_WARNING_ACK_FAILED");
}
