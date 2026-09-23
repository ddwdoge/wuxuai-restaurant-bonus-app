import { useEffect, useState } from 'react';
import { supabase } from '../../shared/lib/supabase';
export type BillingActions = { legacy_eligible: boolean; extend_trial: boolean; activate: boolean; set_payment: boolean; reduce_access: boolean; reason: string };
type Product = { product_code: string; product_kind: string; monthly_price_minor: number; currency: string; base_offer_limit: number | null; base_customer_limit: number | null; capacity_per_unit: number | null; seller_name: string; seller_readiness: string; binding_status: string };
type Business = { restaurant_id: string; name: string; country: string | null; activation: { status: string }; subscription_status: string | null; trial_status: string; kyb_status: string; commercial: { release_state: string }; actions: BillingActions };
export type BillingReadiness = { products: { test: Product; live: Product }[]; businesses: Business[]; pending_count: number; pending_installed: boolean; total: number; live_billing: string };
export function useBillingReadiness(restaurantId?: string, offset = 0) {
 const [result, setResult] = useState<{ key: string; data: BillingReadiness | null; error: boolean } | null>(null);
 const [revision, setRevision] = useState(0);
 const key = `${restaurantId ?? 'all'}:${offset}:${revision}`;
 useEffect(() => {
  let cancelled = false;
  const request = supabase ? supabase.rpc('get_platform_billing_readiness', { input_restaurant_id: restaurantId ?? null, input_offset: offset }) : Promise.resolve({data:null,error:true});
  void Promise.resolve(request)
   .then(({data,error}) => { if (!cancelled) setResult({key,data:error ? null : data as BillingReadiness,error:Boolean(error)}); })
   .catch(() => { if (!cancelled) setResult({key,data:null,error:true}); });
  return () => { cancelled = true; };
 }, [key, restaurantId, offset]);
 return { data: result?.key === key ? result.data : null, error: result?.key === key && result.error, refresh: () => setRevision(value=>value+1) };
}
