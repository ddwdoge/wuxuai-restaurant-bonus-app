-- Phase 7C.5: owner-facing, read-only capacity presentation contract.
-- This migration adds no warning dispatcher, notification, billing mutation,
-- entitlement mutation, country release or product-data write path.

create or replace function public.get_restaurant_capacity(input_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
stable
as $function$
declare
  at_value timestamptz := statement_timestamp();
  capacity_snapshot jsonb;
  entitlement_snapshot jsonb;
  offer_addon_record public.commercial_capacity_addon_versions%rowtype;
  customer_addon_record public.commercial_capacity_addon_versions%rowtype;
  offer_usage bigint;
  offer_limit bigint;
  offer_addon_units bigint;
  customer_usage bigint;
  customer_limit bigint;
  customer_addon_units bigint;
  offer_status text;
  customer_status text;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if not public.is_restaurant_admin(input_restaurant_id)
     and not public.is_platform_admin() then
    raise exception 'CAPACITY_READ_FORBIDDEN' using errcode = '42501';
  end if;

  capacity_snapshot := public.resolve_restaurant_capacity_internal(
    input_restaurant_id,
    at_value
  );
  entitlement_snapshot := public.resolve_restaurant_entitlements_internal(input_restaurant_id);

  select * into offer_addon_record
  from public.commercial_capacity_addon_versions addon
  where addon.addon_key = 'OFFER_CAPACITY'
    and addon.effective_from <= at_value
    and (addon.effective_until is null or addon.effective_until > at_value)
  order by addon.effective_from desc, addon.version desc
  limit 1;

  select * into customer_addon_record
  from public.commercial_capacity_addon_versions addon
  where addon.addon_key = 'CUSTOMER_CAPACITY'
    and addon.effective_from <= at_value
    and (addon.effective_until is null or addon.effective_until > at_value)
  order by addon.effective_from desc, addon.version desc
  limit 1;

  if offer_addon_record.id is null or customer_addon_record.id is null then
    raise exception 'CAPACITY_ADDON_CATALOG_NOT_CONFIGURED' using errcode = '55000';
  end if;

  offer_usage := (capacity_snapshot #>> '{offers,usage}')::bigint;
  offer_limit := (capacity_snapshot #>> '{offers,effective_limit}')::bigint;
  offer_addon_units := (capacity_snapshot #>> '{offers,addon_units}')::bigint;
  customer_usage := (capacity_snapshot #>> '{active_customers,usage}')::bigint;
  customer_limit := (capacity_snapshot #>> '{active_customers,effective_limit}')::bigint;
  customer_addon_units := (capacity_snapshot #>> '{active_customers,addon_units}')::bigint;

  offer_status := case
    when offer_usage > offer_limit then 'OVER_LIMIT'
    when offer_usage = offer_limit then 'AT_LIMIT'
    when offer_usage * 100 >= offer_limit * 90 then 'WARNING_90'
    when offer_usage * 100 >= offer_limit * 80 then 'WARNING_80'
    else 'AVAILABLE'
  end;
  customer_status := case
    when customer_usage > customer_limit then 'OVER_LIMIT'
    when customer_usage = customer_limit then 'AT_LIMIT'
    when customer_usage * 100 >= customer_limit * 90 then 'WARNING_90'
    when customer_usage * 100 >= customer_limit * 80 then 'WARNING_80'
    else 'AVAILABLE'
  end;

  capacity_snapshot := jsonb_set(capacity_snapshot, '{offers,status}', to_jsonb(offer_status), true);
  capacity_snapshot := jsonb_set(
    capacity_snapshot,
    '{offers,usage_percent}',
    to_jsonb(least(100, (offer_usage * 100 / offer_limit)::integer)),
    true
  );
  capacity_snapshot := jsonb_set(
    capacity_snapshot,
    '{offers,addon_capacity}',
    to_jsonb(offer_addon_units * offer_addon_record.capacity_per_unit),
    true
  );
  capacity_snapshot := jsonb_set(capacity_snapshot, '{active_customers,status}', to_jsonb(customer_status), true);
  capacity_snapshot := jsonb_set(
    capacity_snapshot,
    '{active_customers,usage_percent}',
    to_jsonb(least(100, (customer_usage * 100 / customer_limit)::integer)),
    true
  );
  capacity_snapshot := jsonb_set(
    capacity_snapshot,
    '{active_customers,addon_capacity}',
    to_jsonb(customer_addon_units * customer_addon_record.capacity_per_unit),
    true
  );
  capacity_snapshot := jsonb_set(capacity_snapshot, '{write_enforcement_active}', 'true'::jsonb, true);
  capacity_snapshot := jsonb_set(
    capacity_snapshot,
    '{write_enforcement}',
    jsonb_build_object('offers', true, 'active_customers', true),
    true
  );

  return capacity_snapshot || jsonb_build_object(
    'commercial_release', entitlement_snapshot->'commercial_release',
    'catalog', jsonb_build_object(
      'offer_addon', jsonb_build_object(
        'addon_key', offer_addon_record.addon_key,
        'version', offer_addon_record.version,
        'capacity_per_unit', offer_addon_record.capacity_per_unit,
        'monthly_price_minor', offer_addon_record.monthly_price_minor,
        'currency', offer_addon_record.currency,
        'tax_treatment', offer_addon_record.tax_treatment
      ),
      'customer_addon', jsonb_build_object(
        'addon_key', customer_addon_record.addon_key,
        'version', customer_addon_record.version,
        'capacity_per_unit', customer_addon_record.capacity_per_unit,
        'monthly_price_minor', customer_addon_record.monthly_price_minor,
        'currency', customer_addon_record.currency,
        'tax_treatment', customer_addon_record.tax_treatment
      )
    ),
    'warning_contract', jsonb_build_object(
      'thresholds_percent', jsonb_build_array(80, 90, 100),
      'forecast_horizon_days', 7,
      'minimum_complete_history_days', 28,
      'dispatch_active', false,
      'forecast_active', false,
      'decision_required', true
    )
  );
end;
$function$;

revoke execute on function public.get_restaurant_capacity(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.get_restaurant_capacity(uuid) to authenticated;

comment on function public.get_restaurant_capacity(uuid) is
  'Authorized, privacy-minimal Phase 7C.5 owner capacity snapshot. Page reads never dispatch warnings or mutate billing, entitlements, country policy or product data.';

notify pgrst, 'reload schema';
