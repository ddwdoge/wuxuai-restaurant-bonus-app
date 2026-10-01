-- Migration 191: actor-bound, read-only receipt lookup for the narrow
-- Migration-190 TEST_ONLY collection-mode transition.

begin;
select pg_advisory_xact_lock(hashtextextended('migration:20261001003000', 0));

create or replace function public.get_platform_test_collection_mode_receipt(
  input_tenant_id uuid,
  input_idempotency_key uuid,
  input_expected_previous_mode text,
  input_expected_new_mode text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  actor_id_value uuid := auth.uid();
  role_value text;
  marker_record public.platform_test_tenant_registry%rowtype;
  restaurant_record public.restaurants%rowtype;
  settings_record public.loyalty_settings%rowtype;
  receipt_record public.platform_test_collection_mode_audit%rowtype;
begin
  role_value := public.current_platform_role();
  if actor_id_value is null
    or coalesce(role_value in ('platform_owner', 'platform_admin'), false) is not true then
    raise exception 'PLATFORM_TEST_COLLECTION_MODE_RECEIPT_ACCESS_DENIED' using errcode = '42501';
  end if;
  perform public.require_recent_platform_auth_internal();

  if input_tenant_id is null or input_idempotency_key is null then
    raise exception 'PLATFORM_TEST_COLLECTION_MODE_RECEIPT_REQUEST_INVALID' using errcode = '22023';
  end if;
  if not (
    (input_expected_previous_mode = 'restaurant_controlled_only' and input_expected_new_mode = 'both')
    or (input_expected_previous_mode = 'both' and input_expected_new_mode = 'restaurant_controlled_only')
  ) then
    raise exception 'PLATFORM_TEST_COLLECTION_MODE_RECEIPT_TRANSITION_INVALID' using errcode = '22023';
  end if;

  -- Reuse the exact authoritative TEST_ONLY identity contract enforced by
  -- Migration 190. No client-provided tenant attribute is trusted.
  select * into marker_record
  from public.platform_test_tenant_registry
  where restaurant_id = input_tenant_id;
  if marker_record.restaurant_id is null or marker_record.deleted_at is not null then
    raise exception 'ACTIVE_TEST_ONLY_MARKER_REQUIRED' using errcode = '42501';
  end if;

  select * into restaurant_record
  from public.restaurants
  where id = input_tenant_id;
  if restaurant_record.id is null then
    raise exception 'PLATFORM_TEST_COLLECTION_MODE_TENANT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if marker_record.restaurant_id is distinct from restaurant_record.id
    or marker_record.organization_id is distinct from restaurant_record.organization_id
    or marker_record.owner_user_id is distinct from restaurant_record.owner_id
    or marker_record.restaurant_name is distinct from restaurant_record.name then
    raise exception 'TEST_ONLY_MARKER_IDENTITY_MISMATCH' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.organizations organization
    where organization.id = restaurant_record.organization_id
      and organization.owner_id = restaurant_record.owner_id
  ) or not exists (
    select 1 from public.restaurant_members member
    where member.restaurant_id = restaurant_record.id
      and member.organization_id = restaurant_record.organization_id
      and member.user_id = restaurant_record.owner_id
      and member.role = 'owner'
  ) then
    raise exception 'TEST_ONLY_OWNER_OR_ORGANIZATION_INVALID' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.business_verification_environment environment
    where environment.singleton and environment.environment = 'STAGING'
  ) then
    raise exception 'PLATFORM_TEST_COLLECTION_MODE_STAGING_REQUIRED' using errcode = '42501';
  end if;
  if upper(restaurant_record.name) not like '%WUXUAI%'
    or (upper(restaurant_record.name) not like '%TEST%'
      and upper(restaurant_record.name) not like '%SMOKE%') then
    raise exception 'EXPLICIT_SYNTHETIC_TEST_TENANT_NAME_REQUIRED' using errcode = '42501';
  end if;

  select * into settings_record
  from public.loyalty_settings settings
  where settings.restaurant_id = restaurant_record.id
    and settings.organization_id = restaurant_record.organization_id
    and settings.branch_id = restaurant_record.primary_branch_id
    and settings.active = true;
  if settings_record.id is null then
    raise exception 'ACTIVE_TEST_LOYALTY_SETTINGS_REQUIRED' using errcode = 'P0002';
  end if;

  -- The actor predicate is part of the lookup. A key belonging to another
  -- Platform Admin is indistinguishable from an unknown key.
  select * into receipt_record
  from public.platform_test_collection_mode_audit audit
  where audit.idempotency_key = input_idempotency_key
    and audit.tenant_id = input_tenant_id
    and audit.actor_id = actor_id_value
    and audit.action_code = 'TEST_ONLY_PRO_REWARD_FLOW';

  if receipt_record.id is null then
    return jsonb_build_object(
      'found', false,
      'tenant_id', restaurant_record.id,
      'current_collection_mode', settings_record.points_collection_mode
    );
  end if;

  if receipt_record.previous_mode is distinct from input_expected_previous_mode
    or receipt_record.new_mode is distinct from input_expected_new_mode then
    raise exception 'PLATFORM_TEST_COLLECTION_MODE_RECEIPT_PAYLOAD_CONFLICT' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'found', true,
    'receipt_id', receipt_record.id,
    'tenant_id', receipt_record.tenant_id,
    'action_code', receipt_record.action_code,
    'previous_mode', receipt_record.previous_mode,
    'new_mode', receipt_record.new_mode,
    'committed_at', receipt_record.created_at,
    'status', receipt_record.status,
    'current_collection_mode', settings_record.points_collection_mode
  );
end
$function$;

revoke all on function public.get_platform_test_collection_mode_receipt(
  uuid, uuid, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.get_platform_test_collection_mode_receipt(
  uuid, uuid, text, text
) to authenticated;

comment on function public.get_platform_test_collection_mode_receipt(uuid, uuid, text, text) is
  'Actor-bound read-only receipt for one known Migration-190 TEST_ONLY collection-mode request. Returns no key, session, factor, token, e-mail address or general audit listing.';

notify pgrst, 'reload schema';
commit;
