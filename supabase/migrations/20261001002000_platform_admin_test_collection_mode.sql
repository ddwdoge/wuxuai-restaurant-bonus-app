-- Migration 190: narrow Platform Admin control for a temporary TEST_ONLY
-- points-collection mode transition. No tenant is changed by this migration.

begin;
select pg_advisory_xact_lock(hashtextextended('migration:20261001002000', 0));

create table if not exists public.platform_test_collection_mode_audit (
  id uuid primary key default extensions.gen_random_uuid(),
  idempotency_key uuid not null unique,
  actor_id uuid not null references auth.users(id) on delete restrict,
  actor_role text not null check (actor_role in ('platform_owner', 'platform_admin')),
  tenant_id uuid not null,
  organization_id uuid not null,
  loyalty_settings_id uuid not null,
  previous_mode text not null,
  new_mode text not null,
  action_code text not null default 'TEST_ONLY_PRO_REWARD_FLOW'
    check (action_code = 'TEST_ONLY_PRO_REWARD_FLOW'),
  status text not null default 'COMPLETED' check (status = 'COMPLETED'),
  policy_version text not null default 'platform-test-collection-mode-v1'
    check (policy_version = 'platform-test-collection-mode-v1'),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  session_fingerprint text not null check (session_fingerprint ~ '^[0-9a-f]{64}$'),
  result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  check (
    (previous_mode = 'restaurant_controlled_only' and new_mode = 'both')
    or (previous_mode = 'both' and new_mode = 'restaurant_controlled_only')
  )
);

create index if not exists platform_test_collection_mode_audit_target_idx
  on public.platform_test_collection_mode_audit
    (tenant_id, created_at, idempotency_key);

alter table public.platform_test_collection_mode_audit enable row level security;
revoke all on table public.platform_test_collection_mode_audit
  from public, anon, authenticated, service_role;

create or replace function public.protect_platform_test_collection_mode_audit()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  raise exception 'PLATFORM_TEST_COLLECTION_MODE_AUDIT_IMMUTABLE' using errcode = '42501';
end
$function$;

drop trigger if exists protect_platform_test_collection_mode_audit_rows
  on public.platform_test_collection_mode_audit;
create trigger protect_platform_test_collection_mode_audit_rows
before update or delete on public.platform_test_collection_mode_audit
for each row execute function public.protect_platform_test_collection_mode_audit();

drop trigger if exists protect_platform_test_collection_mode_audit_truncate
  on public.platform_test_collection_mode_audit;
create trigger protect_platform_test_collection_mode_audit_truncate
before truncate on public.platform_test_collection_mode_audit
for each statement execute function public.protect_platform_test_collection_mode_audit();

create or replace function public.set_platform_test_collection_mode(
  input_tenant_id uuid,
  input_expected_current_mode text,
  input_target_mode text,
  input_idempotency_key uuid,
  input_action_code text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $function$
declare
  actor_id_value uuid := auth.uid();
  role_value text;
  marker_record public.platform_test_tenant_registry%rowtype;
  restaurant_record public.restaurants%rowtype;
  settings_record public.loyalty_settings%rowtype;
  settings_after public.loyalty_settings%rowtype;
  prior_audit public.platform_test_collection_mode_audit%rowtype;
  before_without_mode jsonb;
  after_without_mode jsonb;
  payload_hash_value text;
  session_fingerprint_value text;
  audit_id_value uuid := extensions.gen_random_uuid();
  result_value jsonb;
  changed_rows integer;
begin
  role_value := public.current_platform_role();
  if actor_id_value is null
    or coalesce(role_value in ('platform_owner', 'platform_admin'), false) is not true then
    raise exception 'PLATFORM_TEST_COLLECTION_MODE_ACCESS_DENIED' using errcode = '42501';
  end if;
  -- Canonical helper: live Auth session, current verified TOTP factor, AAL2
  -- TOTP AMR and the existing ten-minute recent-TOTP boundary.
  perform public.require_recent_platform_auth_internal();

  if input_tenant_id is null or input_idempotency_key is null then
    raise exception 'PLATFORM_TEST_COLLECTION_MODE_REQUEST_INVALID' using errcode = '22023';
  end if;
  if input_action_code is distinct from 'TEST_ONLY_PRO_REWARD_FLOW' then
    raise exception 'PLATFORM_TEST_COLLECTION_MODE_ACTION_INVALID' using errcode = '22023';
  end if;
  if not (
    (input_expected_current_mode = 'restaurant_controlled_only' and input_target_mode = 'both')
    or (input_expected_current_mode = 'both' and input_target_mode = 'restaurant_controlled_only')
  ) then
    raise exception 'PLATFORM_TEST_COLLECTION_MODE_TRANSITION_INVALID' using errcode = '22023';
  end if;
  if coalesce(auth.jwt()->>'session_id', '') !~
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
    raise exception 'PLATFORM_TEST_COLLECTION_MODE_SESSION_INVALID' using errcode = '42501';
  end if;

  payload_hash_value := encode(extensions.digest(convert_to(jsonb_build_object(
    'actor_id', actor_id_value,
    'tenant_id', input_tenant_id,
    'expected_current_mode', input_expected_current_mode,
    'target_mode', input_target_mode,
    'action_code', input_action_code,
    'policy_version', 'platform-test-collection-mode-v1'
  )::text, 'UTF8'), 'sha256'), 'hex');
  session_fingerprint_value := encode(extensions.digest(
    convert_to(auth.jwt()->>'session_id', 'UTF8'), 'sha256'), 'hex');

  -- One request lock makes equal idempotency keys deterministic. The tenant
  -- lock serializes different request keys before the row-level lock below.
  perform pg_advisory_xact_lock(hashtextextended(
    'platform-test-collection-mode-request:' || input_idempotency_key::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(
    'platform-test-collection-mode-tenant:' || input_tenant_id::text, 0));

  select * into prior_audit
  from public.platform_test_collection_mode_audit
  where idempotency_key = input_idempotency_key;
  if prior_audit.id is not null then
    if prior_audit.actor_id is distinct from actor_id_value
      or prior_audit.tenant_id is distinct from input_tenant_id
      or prior_audit.previous_mode is distinct from input_expected_current_mode
      or prior_audit.new_mode is distinct from input_target_mode
      or prior_audit.action_code is distinct from input_action_code
      or prior_audit.payload_hash is distinct from payload_hash_value then
      raise exception 'PLATFORM_TEST_COLLECTION_MODE_IDEMPOTENCY_CONFLICT' using errcode = '22023';
    end if;
    return prior_audit.result || jsonb_build_object('idempotent', true);
  end if;

  select * into marker_record
  from public.platform_test_tenant_registry
  where restaurant_id = input_tenant_id
  for share;
  if marker_record.restaurant_id is null or marker_record.deleted_at is not null then
    raise exception 'ACTIVE_TEST_ONLY_MARKER_REQUIRED' using errcode = '42501';
  end if;

  select * into restaurant_record
  from public.restaurants
  where id = input_tenant_id
  for share;
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
    and settings.active = true
  for update;
  if settings_record.id is null then
    raise exception 'ACTIVE_TEST_LOYALTY_SETTINGS_REQUIRED' using errcode = 'P0002';
  end if;
  if settings_record.points_collection_mode is distinct from input_expected_current_mode then
    raise exception 'PLATFORM_TEST_COLLECTION_MODE_STALE_EXPECTED_MODE' using errcode = '40001';
  end if;

  before_without_mode := to_jsonb(settings_record) - 'points_collection_mode';
  update public.loyalty_settings settings
  set points_collection_mode = input_target_mode
  where settings.id = settings_record.id
    and settings.restaurant_id = restaurant_record.id
    and settings.organization_id = restaurant_record.organization_id
    and settings.branch_id = restaurant_record.primary_branch_id
    and settings.active = true
    and settings.points_collection_mode = input_expected_current_mode;
  get diagnostics changed_rows = row_count;
  if changed_rows <> 1 then
    raise exception 'PLATFORM_TEST_COLLECTION_MODE_CONCURRENT_CHANGE' using errcode = '40001';
  end if;

  select * into settings_after
  from public.loyalty_settings settings
  where settings.id = settings_record.id;
  after_without_mode := to_jsonb(settings_after) - 'points_collection_mode';
  if settings_after.points_collection_mode is distinct from input_target_mode
    or after_without_mode is distinct from before_without_mode then
    raise exception 'PLATFORM_TEST_COLLECTION_MODE_POSTCONDITION_FAILED' using errcode = '40001';
  end if;

  result_value := jsonb_build_object(
    'changed', true,
    'idempotent', false,
    'tenant_id', restaurant_record.id,
    'previous_mode', settings_record.points_collection_mode,
    'new_mode', settings_after.points_collection_mode,
    'action_code', input_action_code,
    'policy_version', 'platform-test-collection-mode-v1',
    'audit_id', audit_id_value
  );

  insert into public.platform_test_collection_mode_audit(
    id, idempotency_key, actor_id, actor_role, tenant_id, organization_id,
    loyalty_settings_id, previous_mode, new_mode, action_code, status,
    policy_version, payload_hash, session_fingerprint, result
  ) values (
    audit_id_value, input_idempotency_key, actor_id_value, role_value,
    restaurant_record.id, restaurant_record.organization_id, settings_record.id,
    settings_record.points_collection_mode, settings_after.points_collection_mode,
    input_action_code, 'COMPLETED', 'platform-test-collection-mode-v1',
    payload_hash_value, session_fingerprint_value, result_value
  );

  return result_value;
end
$function$;

revoke all on function public.set_platform_test_collection_mode(
  uuid, text, text, uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.set_platform_test_collection_mode(
  uuid, text, text, uuid, text
) to authenticated;

revoke all on function public.protect_platform_test_collection_mode_audit()
  from public, anon, authenticated, service_role;

comment on table public.platform_test_collection_mode_audit is
  'Append-only idempotency receipt and audit for the narrow AAL2 TEST_ONLY collection-mode transition. Contains no token, TOTP value, cookie or e-mail address.';
comment on function public.set_platform_test_collection_mode(uuid, text, text, uuid, text) is
  'AAL2/recent-TOTP protected TEST_ONLY transition: restaurant_controlled_only to both or the exact reverse. No other loyalty setting is mutable.';

notify pgrst, 'reload schema';
commit;
