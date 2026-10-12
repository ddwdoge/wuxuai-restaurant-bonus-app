-- Return the same synthetic offer usage that the TEST_ONLY BASIC write guard
-- enforces. This is a read-only extension of the existing runtime contract;
-- it does not create grants, publish offers, or touch real entitlements.
begin;

create or replace function public.get_test_only_basic_runtime(input_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  snapshot_value jsonb;
  latest public.test_only_basic_access_receipts%rowtype;
  actor_allowed boolean := false;
  active_value boolean := false;
  offer_usage_value bigint := 0;
begin
  if auth.uid() is null or auth.role() is distinct from 'authenticated' then
    raise exception 'TEST_ONLY_BASIC_RUNTIME_DENIED' using errcode = '42501';
  end if;

  actor_allowed := public.is_restaurant_member(input_restaurant_id)
    or public.test_only_basic_customer_authorized_internal(input_restaurant_id)
    or coalesce(public.current_platform_role() in ('platform_owner', 'platform_admin'), false);
  if not actor_allowed then
    raise exception 'TEST_ONLY_BASIC_RUNTIME_DENIED' using errcode = '42501';
  end if;

  snapshot_value := public.test_only_basic_access_snapshot_internal(input_restaurant_id);
  if snapshot_value is null then
    raise exception 'TEST_ONLY_BASIC_CONTEXT_INVALID' using errcode = '42501';
  end if;

  select * into latest
  from public.test_only_basic_access_receipts receipt
  where receipt.restaurant_id = input_restaurant_id
  order by receipt.created_at desc, receipt.id desc
  limit 1;

  active_value := public.test_only_basic_access_active_internal(input_restaurant_id);
  if active_value then
    select count(*)::bigint into offer_usage_value
    from public.restaurant_offers offer
    where offer.restaurant_id = input_restaurant_id
      and offer.status = 'PUBLISHED'
      and offer.is_active = true
      and offer.valid_to > statement_timestamp();
  end if;

  return jsonb_build_object(
    'synthetic_test_only', true,
    'active', active_value,
    'effective_plan', case when active_value then 'BASIC' else null end,
    'offer_limit', case when active_value then 5 else 0 end,
    'offer_usage', offer_usage_value,
    'offer_notifications', false,
    'reward_notifications', false,
    'catalog_access', false,
    'real_activation', false,
    'real_trial', false,
    'starts_at', latest.starts_at,
    'expires_at', latest.expires_at,
    'receipt_id', latest.id,
    'readiness_receipt_id', snapshot_value->>'readiness_receipt_id'
  );
end;
$function$;

revoke all on function public.get_test_only_basic_runtime(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.get_test_only_basic_runtime(uuid) to authenticated;

comment on function public.get_test_only_basic_runtime(uuid) is
  'Returns the bound TEST_ONLY BASIC runtime and its server-authoritative synthetic offer usage. It does not expose a real entitlement.';

notify pgrst, 'reload schema';
commit;
