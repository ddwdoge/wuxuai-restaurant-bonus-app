-- One-time, migration-operator-only transition for the bound staging-v2 project.
-- This is deliberately not a browser RPC and grants no service_role capability.
begin;
select pg_advisory_xact_lock(hashtextextended('migration:20261011094458', 0));

create table project_bootstrap.staging_environment_setup_audit (
  transition_key text primary key check (transition_key = 'BUSINESS_VERIFICATION_DISABLED_TO_STAGING'),
  request_id uuid not null unique,
  binding_id uuid not null references project_bootstrap.binding(binding_id) on delete restrict,
  project_ref text not null check (project_ref = 'mbgveqbhessaunrhfudm'),
  auth_issuer text not null check (
    auth_issuer = 'https://mbgveqbhessaunrhfudm.supabase.co/auth/v1'
  ),
  app_origin text not null check (
    app_origin = 'https://staging-v2.bonus.wuxuaisbi.com'
  ),
  previous_environment text not null check (previous_environment = 'DISABLED'),
  next_environment text not null check (next_environment = 'STAGING'),
  previous_change_ref text not null,
  next_change_ref text not null,
  operator_ref text not null check (operator_ref ~ '^[A-Za-z0-9_.:-]{3,100}$'),
  evidence_sha256 text not null check (evidence_sha256 ~ '^[a-f0-9]{64}$'),
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  session_actor name not null check (session_actor = 'postgres'),
  recorded_at timestamptz not null default clock_timestamp()
);
alter table project_bootstrap.staging_environment_setup_audit enable row level security;
revoke all on table project_bootstrap.staging_environment_setup_audit
  from public, anon, authenticated, service_role;

create function project_bootstrap.protect_staging_environment_setup_audit()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  raise exception 'STAGING_ENVIRONMENT_SETUP_AUDIT_IMMUTABLE' using errcode = '42501';
end
$function$;
revoke all on function project_bootstrap.protect_staging_environment_setup_audit()
  from public, anon, authenticated, service_role;

create trigger protect_staging_environment_setup_audit_rows
before update or delete on project_bootstrap.staging_environment_setup_audit
for each row execute function project_bootstrap.protect_staging_environment_setup_audit();
create trigger protect_staging_environment_setup_audit_truncate
before truncate on project_bootstrap.staging_environment_setup_audit
for each statement execute function project_bootstrap.protect_staging_environment_setup_audit();

create function project_bootstrap.guard_business_verification_environment_setup()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
declare
  authorized_request text := current_setting('wuxuai.bound_staging_setup_request_id', true);
  authorized_binding text := current_setting('wuxuai.bound_staging_setup_binding_id', true);
begin
  if tg_op <> 'UPDATE'
    or session_user <> 'postgres'
    or current_user <> 'postgres'
    or authorized_request is null
    or authorized_request !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or authorized_binding is null
    or authorized_binding !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or old.singleton is distinct from true
    or new.singleton is distinct from old.singleton
    or old.environment is distinct from 'DISABLED'
    or new.environment is distinct from 'STAGING'
    or new.change_ref is distinct from 'BOUND_PROJECT_SETUP:' || authorized_request
    or new.changed_at is null
    or new.changed_at <= old.changed_at
    or not exists (
      select 1
      from project_bootstrap.binding binding
      where binding.singleton
        and binding.binding_id = authorized_binding::uuid
        and binding.project_ref = 'mbgveqbhessaunrhfudm'
        and binding.auth_issuer = 'https://mbgveqbhessaunrhfudm.supabase.co/auth/v1'
        and binding.app_origin = 'https://staging-v2.bonus.wuxuaisbi.com'
    ) then
    raise exception 'BUSINESS_VERIFICATION_ENVIRONMENT_DIRECT_WRITE_DENIED' using errcode = '42501';
  end if;
  return new;
end
$function$;
revoke all on function project_bootstrap.guard_business_verification_environment_setup()
  from public, anon, authenticated, service_role;

create trigger guard_business_verification_environment_setup
before insert or update or delete on public.business_verification_environment
for each row execute function project_bootstrap.guard_business_verification_environment_setup();
create trigger guard_business_verification_environment_setup_truncate
before truncate on public.business_verification_environment
for each statement execute function project_bootstrap.guard_business_verification_environment_setup();

create function project_bootstrap.activate_bound_staging_environment(
  input_request_id uuid,
  input_expected_binding_id uuid,
  input_expected_project_ref text,
  input_expected_auth_issuer text,
  input_expected_app_origin text,
  input_operator_ref text,
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
  audit_record project_bootstrap.staging_environment_setup_audit%rowtype;
  payload_sha256_value text;
  next_change_ref_value text;
begin
  if session_user <> 'postgres' or current_user <> 'postgres' then
    raise exception 'STAGING_ENVIRONMENT_SETUP_ADMIN_CONNECTION_REQUIRED' using errcode = '42501';
  end if;
  if input_request_id is null
    or input_expected_binding_id is null
    or input_expected_project_ref is distinct from 'mbgveqbhessaunrhfudm'
    or input_expected_auth_issuer is distinct from 'https://mbgveqbhessaunrhfudm.supabase.co/auth/v1'
    or input_expected_app_origin is distinct from 'https://staging-v2.bonus.wuxuaisbi.com'
    or coalesce(input_operator_ref, '') !~ '^[A-Za-z0-9_.:-]{3,100}$'
    or coalesce(input_evidence_sha256, '') !~ '^[a-f0-9]{64}$' then
    raise exception 'STAGING_ENVIRONMENT_SETUP_INPUT_INVALID' using errcode = '22023';
  end if;
  if input_confirmation is distinct from
    'CONFIRMED:BOUND_STAGING_SETUP:' || input_expected_binding_id::text || ':' || input_request_id::text then
    raise exception 'STAGING_ENVIRONMENT_SETUP_STRONG_CONFIRMATION_REQUIRED' using errcode = '42501';
  end if;

  perform project_bootstrap.require_runtime_binding(false);
  perform pg_advisory_xact_lock(hashtextextended('BOUND_STAGING_ENVIRONMENT_SETUP', 0));

  select * into binding_record
  from project_bootstrap.binding
  where singleton
  for share;
  if binding_record.binding_id is null
    or binding_record.binding_id is distinct from input_expected_binding_id
    or binding_record.project_ref is distinct from input_expected_project_ref
    or binding_record.auth_issuer is distinct from input_expected_auth_issuer
    or binding_record.app_origin is distinct from input_expected_app_origin then
    raise exception 'STAGING_ENVIRONMENT_SETUP_BINDING_MISMATCH' using errcode = '42501';
  end if;

  payload_sha256_value := encode(extensions.digest(convert_to(jsonb_build_object(
    'operation', 'BUSINESS_VERIFICATION_DISABLED_TO_STAGING',
    'request_id', input_request_id,
    'binding_id', input_expected_binding_id,
    'project_ref', input_expected_project_ref,
    'auth_issuer', input_expected_auth_issuer,
    'app_origin', input_expected_app_origin,
    'operator_ref', input_operator_ref,
    'evidence_sha256', input_evidence_sha256,
    'confirmation', input_confirmation
  )::text, 'UTF8'), 'sha256'), 'hex');

  select * into audit_record
  from project_bootstrap.staging_environment_setup_audit
  where request_id = input_request_id;
  if audit_record.request_id is not null then
    if audit_record.binding_id is distinct from binding_record.binding_id
      or audit_record.payload_sha256 is distinct from payload_sha256_value then
      raise exception 'STAGING_ENVIRONMENT_SETUP_IDEMPOTENCY_CONFLICT' using errcode = '22023';
    end if;
    return jsonb_build_object(
      'environment', audit_record.next_environment,
      'binding_id', audit_record.binding_id,
      'request_id', audit_record.request_id,
      'audit_recorded_at', audit_record.recorded_at,
      'idempotent', true
    );
  end if;
  if exists (select 1 from project_bootstrap.staging_environment_setup_audit) then
    raise exception 'STAGING_ENVIRONMENT_SETUP_REPLAY_DENIED' using errcode = '42501';
  end if;

  select * into environment_record
  from public.business_verification_environment
  where singleton
  for update;
  if environment_record.singleton is null then
    raise exception 'STAGING_ENVIRONMENT_SETUP_STATE_MISSING' using errcode = '55000';
  end if;
  if environment_record.environment is distinct from 'DISABLED'
    or environment_record.change_ref is distinct from 'LOCAL_MIGRATION_DEFAULT' then
    raise exception 'STAGING_ENVIRONMENT_SETUP_STATE_CONFLICT' using errcode = '55000';
  end if;
  next_change_ref_value := 'BOUND_PROJECT_SETUP:' || input_request_id::text;
  perform set_config('wuxuai.bound_staging_setup_request_id', input_request_id::text, true);
  perform set_config('wuxuai.bound_staging_setup_binding_id', binding_record.binding_id::text, true);
  update public.business_verification_environment
  set environment = 'STAGING',
      changed_at = clock_timestamp(),
      change_ref = next_change_ref_value
  where singleton;
  if not found then
    raise exception 'STAGING_ENVIRONMENT_SETUP_STATE_MISSING' using errcode = '55000';
  end if;

  insert into project_bootstrap.staging_environment_setup_audit(
    transition_key, request_id, binding_id, project_ref, auth_issuer, app_origin,
    previous_environment, next_environment, previous_change_ref, next_change_ref,
    operator_ref, evidence_sha256, payload_sha256, session_actor
  ) values (
    'BUSINESS_VERIFICATION_DISABLED_TO_STAGING', input_request_id, binding_record.binding_id,
    binding_record.project_ref, binding_record.auth_issuer, binding_record.app_origin,
    environment_record.environment, 'STAGING', environment_record.change_ref, next_change_ref_value,
    input_operator_ref, input_evidence_sha256, payload_sha256_value, session_user
  ) returning * into audit_record;

  return jsonb_build_object(
    'environment', audit_record.next_environment,
    'binding_id', audit_record.binding_id,
    'request_id', audit_record.request_id,
    'audit_recorded_at', audit_record.recorded_at,
    'idempotent', false
  );
end
$function$;

revoke all on function project_bootstrap.activate_bound_staging_environment(
  uuid, uuid, text, text, text, text, text, text
) from public, anon, authenticated, service_role;

comment on function project_bootstrap.activate_bound_staging_environment(
  uuid, uuid, text, text, text, text, text, text
) is 'Private one-time DISABLED-to-STAGING transition for the exact installed staging-v2 project binding. PostgreSQL migration operator only; no browser or service_role execution.';

commit;
