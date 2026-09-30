-- Migration 188: narrow, audited refresh of a stale TEST_ONLY restaurant-name snapshot.
-- This migration does not refresh, create or activate any business, billing or entitlement state.

begin;
select pg_advisory_xact_lock(hashtextextended('migration:20260930001000', 0));

create table if not exists public.platform_test_tenant_marker_refresh_audit (
  id uuid primary key default extensions.gen_random_uuid(),
  idempotency_key uuid not null unique,
  marker_id uuid not null,
  tenant_id uuid not null,
  organization_id uuid not null,
  owner_user_id uuid not null,
  old_restaurant_name_snapshot text not null,
  new_restaurant_name_snapshot text not null,
  actor_id uuid not null references auth.users(id) on delete restrict,
  session_fingerprint text not null check (session_fingerprint ~ '^[0-9a-f]{64}$'),
  reason_code text not null default 'TEST_ONLY_NAME_SNAPSHOT_REFRESH'
    check (reason_code = 'TEST_ONLY_NAME_SNAPSHOT_REFRESH'),
  policy_version text not null default 'test-only-marker-name-refresh-v1'
    check (policy_version = 'test-only-marker-name-refresh-v1'),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  check (marker_id = tenant_id),
  check (old_restaurant_name_snapshot <> new_restaurant_name_snapshot)
);

create index if not exists platform_test_tenant_marker_refresh_audit_target_idx
  on public.platform_test_tenant_marker_refresh_audit
    (tenant_id, created_at, idempotency_key);

alter table public.platform_test_tenant_marker_refresh_audit enable row level security;
revoke all on table public.platform_test_tenant_marker_refresh_audit
  from public, anon, authenticated, service_role;
-- Existing server reads remain untouched. Browser and generic service-role
-- callers cannot update the marker snapshot directly.
revoke update on table public.platform_test_tenant_registry
  from public, anon, authenticated, service_role;

create or replace function public.protect_platform_test_tenant_marker_refresh_audit()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  raise exception 'TEST_ONLY_MARKER_REFRESH_AUDIT_IMMUTABLE' using errcode = '42501';
end
$function$;

drop trigger if exists protect_platform_test_tenant_marker_refresh_audit_rows
  on public.platform_test_tenant_marker_refresh_audit;
create trigger protect_platform_test_tenant_marker_refresh_audit_rows
before update or delete on public.platform_test_tenant_marker_refresh_audit
for each row execute function public.protect_platform_test_tenant_marker_refresh_audit();

drop trigger if exists protect_platform_test_tenant_marker_refresh_audit_truncate
  on public.platform_test_tenant_marker_refresh_audit;
create trigger protect_platform_test_tenant_marker_refresh_audit_truncate
before truncate on public.platform_test_tenant_marker_refresh_audit
for each statement execute function public.protect_platform_test_tenant_marker_refresh_audit();

create or replace function public.refresh_platform_test_tenant_marker_name_snapshot(
  input_restaurant_id uuid,
  input_expected_old_name_snapshot text,
  input_expected_current_restaurant_name text,
  input_confirmation text,
  input_idempotency_key uuid
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
  prior_audit public.platform_test_tenant_marker_refresh_audit%rowtype;
  payload_hash_value text;
  session_fingerprint_value text;
  changed_rows integer;
  audit_id_value uuid := extensions.gen_random_uuid();
  result_value jsonb;
begin
  role_value := public.current_platform_role();
  if actor_id_value is null
    or coalesce(role_value in ('platform_owner', 'platform_admin'), false) is not true then
    raise exception 'PLATFORM_TEST_TENANT_REFRESH_ACCESS_DENIED' using errcode = '42501';
  end if;
  -- Includes live Auth session, current verified TOTP factor, AAL2 AMR and the
  -- existing ten-minute recent-TOTP boundary.
  perform public.require_recent_platform_auth_internal();

  if input_restaurant_id is null
    or input_idempotency_key is null
    or length(trim(coalesce(input_expected_old_name_snapshot, ''))) < 2
    or length(trim(coalesce(input_expected_current_restaurant_name, ''))) < 2
    or input_expected_old_name_snapshot = input_expected_current_restaurant_name then
    raise exception 'TEST_ONLY_MARKER_REFRESH_REQUEST_INVALID' using errcode = '22023';
  end if;

  if coalesce(auth.jwt()->>'session_id', '') !~
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
    raise exception 'TEST_ONLY_MARKER_REFRESH_SESSION_INVALID' using errcode = '42501';
  end if;

  payload_hash_value := encode(extensions.digest(convert_to(jsonb_build_object(
    'actor_id', actor_id_value,
    'operation', 'TEST_ONLY_NAME_SNAPSHOT_REFRESH',
    'restaurant_id', input_restaurant_id,
    'expected_old_name_snapshot', input_expected_old_name_snapshot,
    'expected_current_restaurant_name', input_expected_current_restaurant_name,
    'confirmation', input_confirmation,
    'policy_version', 'test-only-marker-name-refresh-v1'
  )::text, 'UTF8'), 'sha256'), 'hex');
  session_fingerprint_value := encode(extensions.digest(
    convert_to(auth.jwt()->>'session_id', 'UTF8'), 'sha256'), 'hex');

  perform pg_advisory_xact_lock(hashtextextended(
    'TEST_ONLY_NAME_SNAPSHOT_REFRESH:' || input_restaurant_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(
    'test-only-marker-refresh-request:' || input_idempotency_key::text, 0));

  select * into prior_audit
  from public.platform_test_tenant_marker_refresh_audit
  where idempotency_key = input_idempotency_key;
  if prior_audit.id is not null then
    if prior_audit.actor_id is distinct from actor_id_value
      or prior_audit.tenant_id is distinct from input_restaurant_id
      or prior_audit.old_restaurant_name_snapshot is distinct from input_expected_old_name_snapshot
      or prior_audit.new_restaurant_name_snapshot is distinct from input_expected_current_restaurant_name
      or prior_audit.payload_hash is distinct from payload_hash_value then
      raise exception 'TEST_ONLY_MARKER_REFRESH_IDEMPOTENCY_CONFLICT' using errcode = '22023';
    end if;
    return jsonb_build_object(
      'refreshed', true,
      'idempotent', true,
      'reason_code', prior_audit.reason_code,
      'policy_version', prior_audit.policy_version,
      'audit_id', prior_audit.id,
      'restaurant_id', prior_audit.tenant_id
    );
  end if;

  select * into marker_record
  from public.platform_test_tenant_registry
  where restaurant_id = input_restaurant_id
  for update;
  if marker_record.restaurant_id is null then
    raise exception 'TEST_ONLY_MARKER_REQUIRED' using errcode = 'P0002';
  end if;
  if marker_record.deleted_at is not null then
    raise exception 'ACTIVE_TEST_ONLY_MARKER_REQUIRED' using errcode = '42501';
  end if;

  select * into restaurant_record
  from public.restaurants
  where id = input_restaurant_id
  for share;
  if restaurant_record.id is null then
    raise exception 'TEST_ONLY_TENANT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if marker_record.restaurant_id is distinct from restaurant_record.id
    or marker_record.organization_id is distinct from restaurant_record.organization_id
    or marker_record.owner_user_id is distinct from restaurant_record.owner_id then
    raise exception 'TEST_ONLY_MARKER_IDENTITY_MISMATCH' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.organizations organization
    where organization.id = restaurant_record.organization_id
      and organization.owner_id = restaurant_record.owner_id
  ) or not exists (
    select 1 from public.restaurant_members member
    where member.restaurant_id = restaurant_record.id
      and member.user_id = restaurant_record.owner_id
      and member.organization_id = restaurant_record.organization_id
      and member.role = 'owner'
  ) then
    raise exception 'TEST_ONLY_MARKER_OWNER_OR_ORGANIZATION_INVALID' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.business_verification_environment environment
    where environment.singleton and environment.environment = 'STAGING'
  ) then
    raise exception 'TEST_ONLY_MARKER_REFRESH_STAGING_REQUIRED' using errcode = '42501';
  end if;
  if upper(restaurant_record.name) not like '%WUXUAI%'
    or (upper(restaurant_record.name) not like '%TEST%'
      and upper(restaurant_record.name) not like '%SMOKE%') then
    raise exception 'EXPLICIT_SYNTHETIC_TEST_TENANT_NAME_REQUIRED' using errcode = '42501';
  end if;
  if restaurant_record.name is distinct from input_expected_current_restaurant_name then
    raise exception 'TEST_ONLY_MARKER_REFRESH_TARGET_CHANGED' using errcode = '40001';
  end if;
  if input_confirmation is distinct from
    'CONFIRMED:TEST_ONLY_NAME_SNAPSHOT_REFRESH:' || restaurant_record.name || ':' || restaurant_record.id::text then
    raise exception 'TEST_ONLY_MARKER_REFRESH_STRONG_CONFIRMATION_REQUIRED' using errcode = '42501';
  end if;

  if marker_record.restaurant_name = restaurant_record.name then
    select * into prior_audit
    from public.platform_test_tenant_marker_refresh_audit audit
    where audit.marker_id = marker_record.restaurant_id
      and audit.old_restaurant_name_snapshot = input_expected_old_name_snapshot
      and audit.new_restaurant_name_snapshot = restaurant_record.name
    order by audit.created_at desc, audit.id desc
    limit 1;
    if prior_audit.id is null then
      raise exception 'TEST_ONLY_MARKER_REFRESH_NOT_REQUIRED' using errcode = '22023';
    end if;
    return jsonb_build_object(
      'refreshed', true,
      'idempotent', true,
      'reason_code', prior_audit.reason_code,
      'policy_version', prior_audit.policy_version,
      'audit_id', prior_audit.id,
      'restaurant_id', prior_audit.tenant_id
    );
  end if;

  if marker_record.restaurant_name is distinct from input_expected_old_name_snapshot then
    raise exception 'TEST_ONLY_MARKER_REFRESH_STALE_EXPECTED_SNAPSHOT' using errcode = '40001';
  end if;
  if not exists (
    select 1
    from public.audit_log audit
    where audit.restaurant_id = restaurant_record.id
      and audit.action = 'admin_restaurants_updated'
      and audit.target_table = 'restaurants'
      and audit.metadata->'old'->>'name' = marker_record.restaurant_name
      and audit.metadata->'new'->>'name' = restaurant_record.name
      and audit.created_at >= marker_record.marked_at
  ) then
    raise exception 'AUDITED_TEST_ONLY_RESTAURANT_RENAME_REQUIRED' using errcode = '42501';
  end if;

  update public.platform_test_tenant_registry marker
  set restaurant_name = restaurant_record.name
  where marker.restaurant_id = marker_record.restaurant_id
    and marker.organization_id = marker_record.organization_id
    and marker.owner_user_id = marker_record.owner_user_id
    and marker.deleted_at is null
    and marker.restaurant_name = input_expected_old_name_snapshot;
  get diagnostics changed_rows = row_count;
  if changed_rows <> 1 then
    raise exception 'TEST_ONLY_MARKER_REFRESH_CONCURRENT_CHANGE' using errcode = '40001';
  end if;

  insert into public.platform_test_tenant_marker_refresh_audit(
    id, idempotency_key, marker_id, tenant_id, organization_id, owner_user_id,
    old_restaurant_name_snapshot, new_restaurant_name_snapshot, actor_id,
    session_fingerprint, reason_code, policy_version, payload_hash
  ) values (
    audit_id_value, input_idempotency_key, marker_record.restaurant_id,
    restaurant_record.id, restaurant_record.organization_id, restaurant_record.owner_id,
    marker_record.restaurant_name, restaurant_record.name, actor_id_value,
    session_fingerprint_value, 'TEST_ONLY_NAME_SNAPSHOT_REFRESH',
    'test-only-marker-name-refresh-v1', payload_hash_value
  );

  if not exists (
    select 1 from public.platform_test_tenant_registry marker
    where marker.restaurant_id = restaurant_record.id
      and marker.organization_id = restaurant_record.organization_id
      and marker.owner_user_id = restaurant_record.owner_id
      and marker.restaurant_name = restaurant_record.name
      and marker.test_session_id = marker_record.test_session_id
      and marker.marked_by = marker_record.marked_by
      and marker.marked_at = marker_record.marked_at
      and marker.deleted_at is null
  ) then
    raise exception 'TEST_ONLY_MARKER_REFRESH_POSTCONDITION_FAILED' using errcode = '40001';
  end if;

  result_value := jsonb_build_object(
    'refreshed', true,
    'idempotent', false,
    'reason_code', 'TEST_ONLY_NAME_SNAPSHOT_REFRESH',
    'policy_version', 'test-only-marker-name-refresh-v1',
    'audit_id', audit_id_value,
    'restaurant_id', restaurant_record.id
  );
  return result_value;
end
$function$;

revoke all on function public.refresh_platform_test_tenant_marker_name_snapshot(
  uuid, text, text, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.refresh_platform_test_tenant_marker_name_snapshot(
  uuid, text, text, text, uuid
) to authenticated;

revoke all on function public.protect_platform_test_tenant_marker_refresh_audit()
  from public, anon, authenticated, service_role;

comment on table public.platform_test_tenant_marker_refresh_audit is
  'Append-only evidence for the narrow AAL2 TEST_ONLY restaurant-name snapshot refresh. Contains no session ID, token, e-mail address or TOTP value.';
comment on function public.refresh_platform_test_tenant_marker_name_snapshot(uuid, text, text, text, uuid) is
  'AAL2/recent-TOTP protected refresh of only an existing active TEST_ONLY marker restaurant-name snapshot after an exact audited restaurant rename.';

notify pgrst, 'reload schema';
commit;
