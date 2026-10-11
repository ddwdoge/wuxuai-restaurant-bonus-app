-- One-time PostgreSQL-administrator bootstrap for the first v2 Platform Owner.
-- The ordinary Auth signup and email-confirmation flow creates the identity.
-- This contract only binds that already-confirmed, otherwise unprivileged user
-- to the first platform role. It is not exposed to PostgREST or service_role.
begin;
select pg_advisory_xact_lock(hashtextextended('migration:20261011113000', 0));

create table project_bootstrap.first_platform_admin_bootstrap_audit (
  bootstrap_key text primary key check (bootstrap_key = 'FIRST_PLATFORM_OWNER'),
  request_id uuid not null unique,
  binding_id uuid not null references project_bootstrap.binding(binding_id) on delete restrict,
  project_ref text not null check (project_ref = 'mbgveqbhessaunrhfudm'),
  auth_issuer text not null check (
    auth_issuer = 'https://mbgveqbhessaunrhfudm.supabase.co/auth/v1'
  ),
  app_origin text not null check (
    app_origin = 'https://staging-v2.bonus.wuxuaisbi.com'
  ),
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  role text not null check (role = 'platform_owner'),
  normalized_email_sha256 text not null check (normalized_email_sha256 ~ '^[a-f0-9]{64}$'),
  auth_email_confirmed_at timestamptz not null,
  operator_ref text not null check (operator_ref ~ '^[A-Za-z0-9_.:-]{3,100}$'),
  reason text not null check (length(trim(reason)) between 20 and 500),
  evidence_sha256 text not null check (evidence_sha256 ~ '^[a-f0-9]{64}$'),
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  session_actor name not null check (session_actor = 'postgres'),
  recorded_at timestamptz not null default clock_timestamp()
);
alter table project_bootstrap.first_platform_admin_bootstrap_audit enable row level security;
revoke all on table project_bootstrap.first_platform_admin_bootstrap_audit
  from public, anon, authenticated, service_role;

create function project_bootstrap.protect_first_platform_admin_bootstrap_audit()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  raise exception 'FIRST_PLATFORM_ADMIN_BOOTSTRAP_AUDIT_IMMUTABLE' using errcode = '42501';
end
$function$;
revoke all on function project_bootstrap.protect_first_platform_admin_bootstrap_audit()
  from public, anon, authenticated, service_role;

create trigger protect_first_platform_admin_bootstrap_audit_rows
before update or delete on project_bootstrap.first_platform_admin_bootstrap_audit
for each row execute function project_bootstrap.protect_first_platform_admin_bootstrap_audit();
create trigger protect_first_platform_admin_bootstrap_audit_truncate
before truncate on project_bootstrap.first_platform_admin_bootstrap_audit
for each statement execute function project_bootstrap.protect_first_platform_admin_bootstrap_audit();

create function project_bootstrap.bootstrap_first_platform_owner(
  input_request_id uuid,
  input_expected_binding_id uuid,
  input_expected_project_ref text,
  input_expected_auth_issuer text,
  input_expected_app_origin text,
  input_auth_user_id uuid,
  input_expected_email text,
  input_operator_ref text,
  input_reason text,
  input_evidence_sha256 text,
  input_confirmation text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_catalog
as $function$
declare
  binding_record project_bootstrap.binding%rowtype;
  environment_record public.business_verification_environment%rowtype;
  auth_record auth.users%rowtype;
  audit_record project_bootstrap.first_platform_admin_bootstrap_audit%rowtype;
  normalized_email_value text;
  normalized_email_sha256_value text;
  payload_sha256_value text;
begin
  if session_user <> 'postgres' or current_user <> 'postgres' then
    raise exception 'FIRST_PLATFORM_ADMIN_BOOTSTRAP_ADMIN_CONNECTION_REQUIRED' using errcode = '42501';
  end if;
  normalized_email_value := lower(trim(coalesce(input_expected_email, '')));
  if input_request_id is null
    or input_expected_binding_id is null
    or input_auth_user_id is null
    or input_expected_project_ref is distinct from 'mbgveqbhessaunrhfudm'
    or input_expected_auth_issuer is distinct from 'https://mbgveqbhessaunrhfudm.supabase.co/auth/v1'
    or input_expected_app_origin is distinct from 'https://staging-v2.bonus.wuxuaisbi.com'
    or normalized_email_value !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or coalesce(input_operator_ref, '') !~ '^[A-Za-z0-9_.:-]{3,100}$'
    or length(trim(coalesce(input_reason, ''))) not between 20 and 500
    or coalesce(input_evidence_sha256, '') !~ '^[a-f0-9]{64}$' then
    raise exception 'FIRST_PLATFORM_ADMIN_BOOTSTRAP_INPUT_INVALID' using errcode = '22023';
  end if;
  if input_confirmation is distinct from
    'CONFIRMED:FIRST_PLATFORM_OWNER:' || input_expected_binding_id::text || ':'
      || input_auth_user_id::text || ':' || input_request_id::text then
    raise exception 'FIRST_PLATFORM_ADMIN_BOOTSTRAP_STRONG_CONFIRMATION_REQUIRED' using errcode = '42501';
  end if;

  perform project_bootstrap.require_runtime_binding(false);
  perform pg_advisory_xact_lock(hashtextextended('BOUND_FIRST_PLATFORM_OWNER_BOOTSTRAP', 0));

  select * into binding_record
  from project_bootstrap.binding
  where singleton
  for share;
  if binding_record.binding_id is null
    or binding_record.binding_id is distinct from input_expected_binding_id
    or binding_record.project_ref is distinct from input_expected_project_ref
    or binding_record.auth_issuer is distinct from input_expected_auth_issuer
    or binding_record.app_origin is distinct from input_expected_app_origin then
    raise exception 'FIRST_PLATFORM_ADMIN_BOOTSTRAP_BINDING_MISMATCH' using errcode = '42501';
  end if;

  select * into environment_record
  from public.business_verification_environment
  where singleton
  for share;
  if environment_record.singleton is null
    or environment_record.environment is distinct from 'STAGING'
    or environment_record.change_ref not like 'BOUND_PROJECT_SETUP:%' then
    raise exception 'FIRST_PLATFORM_ADMIN_BOOTSTRAP_ENVIRONMENT_MISMATCH' using errcode = '42501';
  end if;

  normalized_email_sha256_value := encode(extensions.digest(
    convert_to(normalized_email_value, 'UTF8'), 'sha256'
  ), 'hex');
  payload_sha256_value := encode(extensions.digest(convert_to(jsonb_build_object(
    'operation', 'FIRST_PLATFORM_OWNER',
    'request_id', input_request_id,
    'binding_id', input_expected_binding_id,
    'project_ref', input_expected_project_ref,
    'auth_issuer', input_expected_auth_issuer,
    'app_origin', input_expected_app_origin,
    'auth_user_id', input_auth_user_id,
    'normalized_email_sha256', normalized_email_sha256_value,
    'operator_ref', input_operator_ref,
    'reason', trim(input_reason),
    'evidence_sha256', input_evidence_sha256,
    'confirmation', input_confirmation
  )::text, 'UTF8'), 'sha256'), 'hex');

  select * into audit_record
  from project_bootstrap.first_platform_admin_bootstrap_audit
  where request_id = input_request_id;
  if audit_record.request_id is not null then
    if audit_record.binding_id is distinct from binding_record.binding_id
      or audit_record.auth_user_id is distinct from input_auth_user_id
      or audit_record.payload_sha256 is distinct from payload_sha256_value
      or not exists (
        select 1 from public.platform_admins platform_admin
        where platform_admin.user_id = audit_record.auth_user_id
          and platform_admin.role = 'platform_owner'
          and platform_admin.active
      ) then
      raise exception 'FIRST_PLATFORM_ADMIN_BOOTSTRAP_IDEMPOTENCY_CONFLICT' using errcode = '22023';
    end if;
    return jsonb_build_object(
      'auth_user_id', audit_record.auth_user_id,
      'role', audit_record.role,
      'binding_id', audit_record.binding_id,
      'request_id', audit_record.request_id,
      'audit_recorded_at', audit_record.recorded_at,
      'totp_aal2_required', true,
      'idempotent', true
    );
  end if;
  if exists (select 1 from project_bootstrap.first_platform_admin_bootstrap_audit)
    or exists (select 1 from public.platform_admins) then
    raise exception 'FIRST_PLATFORM_ADMIN_BOOTSTRAP_ALREADY_COMPLETED' using errcode = '42501';
  end if;

  select * into auth_record
  from auth.users
  where id = input_auth_user_id
  for share;
  if auth_record.id is null
    or lower(trim(coalesce(auth_record.email, ''))) is distinct from normalized_email_value
    or auth_record.email_confirmed_at is null
    or auth_record.deleted_at is not null
    or coalesce(auth_record.is_anonymous, false)
    or (auth_record.banned_until is not null and auth_record.banned_until > statement_timestamp()) then
    raise exception 'FIRST_PLATFORM_ADMIN_BOOTSTRAP_AUTH_IDENTITY_INVALID' using errcode = '42501';
  end if;

  -- The first Platform Owner must be a separate internal identity. In
  -- particular it must not be the Owner of the TEST_ONLY candidate, because
  -- that is an explicit blocker in the marker preflight contract.
  if exists (select 1 from public.restaurants where owner_id = input_auth_user_id)
    or exists (select 1 from public.organizations where owner_id = input_auth_user_id)
    or exists (select 1 from public.restaurant_members where user_id = input_auth_user_id)
    or exists (select 1 from public.staff_members where auth_user_id = input_auth_user_id)
    or exists (select 1 from public.customers where auth_user_id = input_auth_user_id)
    or exists (select 1 from public.customer_accounts where auth_user_id = input_auth_user_id)
    or exists (select 1 from public.platform_terms_test_identities where auth_user_id = input_auth_user_id) then
    raise exception 'FIRST_PLATFORM_ADMIN_BOOTSTRAP_IDENTITY_NOT_SEPARATE' using errcode = '42501';
  end if;

  insert into public.platform_admins(user_id, role, active)
  values (auth_record.id, 'platform_owner', true);

  insert into project_bootstrap.first_platform_admin_bootstrap_audit(
    bootstrap_key, request_id, binding_id, project_ref, auth_issuer, app_origin,
    auth_user_id, role, normalized_email_sha256, auth_email_confirmed_at,
    operator_ref, reason, evidence_sha256, payload_sha256, session_actor
  ) values (
    'FIRST_PLATFORM_OWNER', input_request_id, binding_record.binding_id,
    binding_record.project_ref, binding_record.auth_issuer, binding_record.app_origin,
    auth_record.id, 'platform_owner', normalized_email_sha256_value,
    auth_record.email_confirmed_at, input_operator_ref, trim(input_reason),
    input_evidence_sha256, payload_sha256_value, session_user
  ) returning * into audit_record;

  return jsonb_build_object(
    'auth_user_id', audit_record.auth_user_id,
    'role', audit_record.role,
    'binding_id', audit_record.binding_id,
    'request_id', audit_record.request_id,
    'audit_recorded_at', audit_record.recorded_at,
    'totp_aal2_required', true,
    'idempotent', false
  );
end
$function$;

revoke all on function project_bootstrap.bootstrap_first_platform_owner(
  uuid, uuid, text, text, text, uuid, text, text, text, text, text
) from public, anon, authenticated, service_role;

comment on function project_bootstrap.bootstrap_first_platform_owner(
  uuid, uuid, text, text, text, uuid, text, text, text, text, text
) is 'Private one-time first Platform Owner binding for the exact installed staging-v2 project. PostgreSQL administrator only; the confirmed Auth identity must have no tenant role. TOTP/AAL2 remains mandatory for every protected Platform action.';

commit;
