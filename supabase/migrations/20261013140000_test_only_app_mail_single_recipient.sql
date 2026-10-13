-- Local-first, single-recipient TEST_ONLY app-mail contract for staging v2.
-- Applying this migration creates no binding, event, queue row, scheduler or mail.
begin;

create schema test_only_app_mail;
revoke all on schema test_only_app_mail from public, anon, authenticated, service_role;

create table test_only_app_mail.recipient_binding (
  singleton boolean primary key default true check (singleton),
  id uuid not null unique default extensions.gen_random_uuid(),
  project_ref text not null check (project_ref = 'mbgveqbhessaunrhfudm'),
  app_origin text not null check (app_origin = 'https://staging-v2.bonus.wuxuaisbi.com'),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  account_id uuid not null references public.customer_accounts(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  recipient_email text not null check (
    recipient_email = lower(trim(recipient_email))
    and recipient_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  event_type text not null check (event_type = 'TEST_ONLY_APP_MAIL_SMOKE'),
  event_version integer not null check (event_version > 0),
  content_sha256 text not null check (content_sha256 ~ '^[a-f0-9]{64}$'),
  valid_until timestamptz not null,
  revoked_at timestamptz,
  configuration_request_id uuid not null unique,
  operator_ref text not null check (operator_ref ~ '^[A-Za-z0-9_.:-]{3,100}$'),
  evidence_sha256 text not null check (evidence_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  check (event_version = 1),
  check (content_sha256 = '1663c63b2cf0edc11188a8fdf035e726704e10a1bfb33cce6703346cad0c30bb'),
  check (valid_until > created_at and valid_until <= created_at + interval '24 hours'),
  check (revoked_at is null or revoked_at >= created_at)
);

create table test_only_app_mail.queue (
  id uuid primary key,
  binding_id uuid not null references test_only_app_mail.recipient_binding(id) on delete restrict,
  request_id uuid not null unique,
  event_type text not null check (event_type = 'TEST_ONLY_APP_MAIL_SMOKE'),
  event_version integer not null check (event_version > 0),
  content_sha256 text not null check (content_sha256 ~ '^[a-f0-9]{64}$'),
  deterministic_message_id text not null unique,
  status text not null check (status in (
    'PENDING', 'RESERVED', 'SUBMITTING', 'ACCEPTED', 'UNKNOWN', 'SKIPPED'
  )),
  attempt_count integer not null default 0 check (attempt_count between 0 and 1),
  reserved_at timestamptz,
  provider_started_at timestamptz,
  finished_at timestamptz,
  block_reason text,
  created_at timestamptz not null default clock_timestamp(),
  unique (binding_id, event_type, event_version),
  check (deterministic_message_id = '<wuxuai-test-only-' || id::text || '@wuxuai.invalid>')
);

create table test_only_app_mail.provider_receipts (
  id uuid primary key default extensions.gen_random_uuid(),
  queue_id uuid not null unique references test_only_app_mail.queue(id) on delete restrict,
  outcome text not null check (outcome in ('ACCEPTED', 'UNKNOWN')),
  deterministic_message_id text not null,
  provider_message_id text,
  error_code text,
  created_at timestamptz not null default clock_timestamp(),
  check (provider_message_id is null or length(provider_message_id) between 3 and 320),
  check (error_code is null or error_code ~ '^[A-Z0-9_-]{3,120}$'),
  check (
    (outcome = 'ACCEPTED' and provider_message_id is not null and error_code is null)
    or (outcome = 'UNKNOWN' and error_code is not null)
  )
);

create table test_only_app_mail.audit (
  id uuid primary key default extensions.gen_random_uuid(),
  binding_id uuid not null references test_only_app_mail.recipient_binding(id) on delete restrict,
  queue_id uuid references test_only_app_mail.queue(id) on delete restrict,
  event text not null check (event in (
    'BINDING_CREATED', 'BINDING_REVOKED', 'ENQUEUED', 'RESERVED',
    'PROVIDER_HANDOFF_STARTED', 'BLOCKED', 'PROVIDER_ACCEPTED', 'PROVIDER_UNKNOWN'
  )),
  request_id uuid not null,
  reason_code text,
  detail text,
  evidence_sha256 text,
  actor_ref text not null,
  created_at timestamptz not null default clock_timestamp(),
  check (reason_code is null or reason_code ~ '^[A-Z0-9_-]{3,120}$'),
  check (detail is null or length(detail) between 3 and 500),
  check (evidence_sha256 is null or evidence_sha256 ~ '^[a-f0-9]{64}$')
);

alter table test_only_app_mail.recipient_binding enable row level security;
alter table test_only_app_mail.queue enable row level security;
alter table test_only_app_mail.provider_receipts enable row level security;
alter table test_only_app_mail.audit enable row level security;
revoke all on all tables in schema test_only_app_mail from public, anon, authenticated, service_role;
revoke all on all sequences in schema test_only_app_mail from public, anon, authenticated, service_role;

create function test_only_app_mail.guard_controlled_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if tg_op in ('DELETE', 'TRUNCATE') then
    raise exception 'TEST_ONLY_APP_MAIL_DELETE_FORBIDDEN' using errcode = '42501';
  end if;
  if coalesce(current_setting('wuxuai.test_only_app_mail_write', true), '') <> 'on' then
    raise exception 'TEST_ONLY_APP_MAIL_CONTROLLED_WRITER_REQUIRED' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;
revoke all on function test_only_app_mail.guard_controlled_mutation()
  from public, anon, authenticated, service_role;

create function test_only_app_mail.reject_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  raise exception 'TEST_ONLY_APP_MAIL_EVIDENCE_IMMUTABLE' using errcode = '42501';
end;
$function$;
revoke all on function test_only_app_mail.reject_mutation()
  from public, anon, authenticated, service_role;

create trigger guard_test_only_app_mail_binding
before insert or update or delete on test_only_app_mail.recipient_binding
for each row execute function test_only_app_mail.guard_controlled_mutation();
create trigger guard_test_only_app_mail_binding_truncate
before truncate on test_only_app_mail.recipient_binding
for each statement execute function test_only_app_mail.guard_controlled_mutation();
create trigger guard_test_only_app_mail_queue
before insert or update or delete on test_only_app_mail.queue
for each row execute function test_only_app_mail.guard_controlled_mutation();
create trigger guard_test_only_app_mail_queue_truncate
before truncate on test_only_app_mail.queue
for each statement execute function test_only_app_mail.guard_controlled_mutation();
create trigger immutable_test_only_app_mail_provider_receipts
before update or delete or truncate on test_only_app_mail.provider_receipts
for each statement execute function test_only_app_mail.reject_mutation();
create trigger immutable_test_only_app_mail_audit
before update or delete or truncate on test_only_app_mail.audit
for each statement execute function test_only_app_mail.reject_mutation();

create function test_only_app_mail.binding_block_reason(
  input_binding_id uuid,
  input_event_version integer,
  input_content_sha256 text
)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth, project_bootstrap, test_only_app_mail
as $function$
declare
  binding_record test_only_app_mail.recipient_binding%rowtype;
  server_binding jsonb;
begin
  select * into binding_record
  from test_only_app_mail.recipient_binding binding
  where binding.id = input_binding_id;
  if binding_record.id is null then return 'BINDING_MISSING'; end if;
  if binding_record.revoked_at is not null then return 'BINDING_REVOKED'; end if;
  if binding_record.valid_until <= statement_timestamp() then return 'BINDING_EXPIRED'; end if;
  if input_event_version is distinct from binding_record.event_version
    or input_event_version is distinct from 1
    or input_content_sha256 is distinct from binding_record.content_sha256
    or input_content_sha256 is distinct from
      '1663c63b2cf0edc11188a8fdf035e726704e10a1bfb33cce6703346cad0c30bb' then
    return 'CONTRACT_VERSION_CHANGED';
  end if;

  server_binding := public.get_server_project_binding();
  if server_binding is null
    or server_binding->>'project_ref' is distinct from 'mbgveqbhessaunrhfudm'
    or server_binding->>'backend_url' is distinct from 'https://mbgveqbhessaunrhfudm.supabase.co'
    or server_binding->>'auth_issuer' is distinct from 'https://mbgveqbhessaunrhfudm.supabase.co/auth/v1'
    or server_binding->>'app_origin' is distinct from 'https://staging-v2.bonus.wuxuaisbi.com'
    or binding_record.project_ref is distinct from server_binding->>'project_ref'
    or binding_record.app_origin is distinct from server_binding->>'app_origin' then
    return 'PROJECT_BINDING_MISMATCH';
  end if;
  if not exists (
    select 1 from public.business_verification_environment environment
    where environment.singleton and environment.environment = 'STAGING'
  ) then return 'STAGING_ENVIRONMENT_REQUIRED'; end if;
  if not exists (
    select 1
    from public.restaurants restaurant
    join public.branches branch
      on branch.id = binding_record.branch_id
     and branch.restaurant_id = restaurant.id
     and branch.organization_id = restaurant.organization_id
    join public.platform_test_tenant_registry marker
      on marker.restaurant_id = restaurant.id
     and marker.organization_id = restaurant.organization_id
     and marker.owner_user_id = restaurant.owner_id
     and marker.restaurant_name = restaurant.name
     and marker.deleted_at is null
    join public.customers customer
      on customer.id = binding_record.customer_id
     and customer.restaurant_id = restaurant.id
     and customer.branch_id = branch.id
     and customer.organization_id = restaurant.organization_id
     and customer.is_test_customer is true
     and customer.membership_status = 'active'
    join public.customer_account_memberships membership
      on membership.account_id = binding_record.account_id
     and membership.restaurant_id = restaurant.id
     and membership.customer_id = customer.id
    join public.customer_accounts account
      on account.id = membership.account_id
     and account.auth_user_id = binding_record.auth_user_id
     and account.email_confirmed_at is not null
     and account.disabled_at is null
    join auth.users auth_user
      on auth_user.id = account.auth_user_id
     and auth_user.email_confirmed_at is not null
     and lower(trim(auth_user.email)) = binding_record.recipient_email
    join public.customer_account_emails account_email
      on account_email.account_id = account.id
     and account_email.status = 'CONFIRMED'
     and account_email.confirmed_at is not null
     and lower(trim(account_email.email)) = binding_record.recipient_email
    where restaurant.id = binding_record.restaurant_id
      and restaurant.status in ('draft', 'pending_activation')
      and upper(restaurant.name) like '%WUXUAI%'
      and (upper(restaurant.name) like '%TEST%' or upper(restaurant.name) like '%SMOKE%')
      and (customer.auth_user_id is null or customer.auth_user_id = account.auth_user_id)
  ) then return 'RECIPIENT_BINDING_MISMATCH'; end if;
  return null;
end;
$function$;
revoke all on function test_only_app_mail.binding_block_reason(uuid, integer, text)
  from public, anon, authenticated, service_role;

create function project_bootstrap.configure_test_only_app_mail_recipient(
  input_restaurant_id uuid,
  input_branch_id uuid,
  input_account_id uuid,
  input_customer_id uuid,
  input_auth_user_id uuid,
  input_recipient_email text,
  input_valid_until timestamptz,
  input_request_id uuid,
  input_operator_ref text,
  input_evidence_sha256 text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public, auth, project_bootstrap, test_only_app_mail
as $function$
declare
  existing test_only_app_mail.recipient_binding%rowtype;
  created test_only_app_mail.recipient_binding%rowtype;
  server_binding jsonb;
  normalized_email text := lower(trim(coalesce(input_recipient_email, '')));
begin
  if session_user <> 'postgres' or current_user <> 'postgres' then
    raise exception 'TEST_ONLY_APP_MAIL_ADMIN_CONNECTION_REQUIRED' using errcode = '42501';
  end if;
  if input_request_id is null or input_restaurant_id is null or input_branch_id is null
    or input_account_id is null or input_customer_id is null or input_auth_user_id is null
    or input_operator_ref is null or input_operator_ref !~ '^[A-Za-z0-9_.:-]{3,100}$'
    or input_evidence_sha256 is null or input_evidence_sha256 !~ '^[a-f0-9]{64}$'
    or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or input_valid_until is null or input_valid_until <= statement_timestamp()
    or input_valid_until > statement_timestamp() + interval '24 hours' then
    raise exception 'TEST_ONLY_APP_MAIL_BINDING_INVALID' using errcode = '22023';
  end if;
  server_binding := public.get_server_project_binding();
  if server_binding is null
    or server_binding->>'project_ref' is distinct from 'mbgveqbhessaunrhfudm'
    or server_binding->>'backend_url' is distinct from 'https://mbgveqbhessaunrhfudm.supabase.co'
    or server_binding->>'auth_issuer' is distinct from 'https://mbgveqbhessaunrhfudm.supabase.co/auth/v1'
    or server_binding->>'app_origin' is distinct from 'https://staging-v2.bonus.wuxuaisbi.com' then
    raise exception 'PROJECT_BINDING_MISMATCH' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.business_verification_environment environment
    where environment.singleton and environment.environment = 'STAGING'
  ) then raise exception 'STAGING_ENVIRONMENT_REQUIRED' using errcode = '42501'; end if;
  if not exists (
    select 1
    from public.restaurants restaurant
    join public.branches branch on branch.id = input_branch_id
      and branch.restaurant_id = restaurant.id and branch.organization_id = restaurant.organization_id
    join public.platform_test_tenant_registry marker on marker.restaurant_id = restaurant.id
      and marker.organization_id = restaurant.organization_id
      and marker.owner_user_id = restaurant.owner_id
      and marker.restaurant_name = restaurant.name and marker.deleted_at is null
    join public.customers customer on customer.id = input_customer_id
      and customer.restaurant_id = restaurant.id and customer.branch_id = branch.id
      and customer.organization_id = restaurant.organization_id
      and customer.is_test_customer is true and customer.membership_status = 'active'
    join public.customer_account_memberships membership on membership.account_id = input_account_id
      and membership.restaurant_id = restaurant.id and membership.customer_id = customer.id
    join public.customer_accounts account on account.id = membership.account_id
      and account.auth_user_id = input_auth_user_id and account.email_confirmed_at is not null
      and account.disabled_at is null
    join auth.users auth_user on auth_user.id = account.auth_user_id
      and auth_user.email_confirmed_at is not null and lower(trim(auth_user.email)) = normalized_email
    join public.customer_account_emails account_email on account_email.account_id = account.id
      and account_email.status = 'CONFIRMED' and account_email.confirmed_at is not null
      and lower(trim(account_email.email)) = normalized_email
    where restaurant.id = input_restaurant_id
      and restaurant.status in ('draft', 'pending_activation')
      and upper(restaurant.name) like '%WUXUAI%'
      and (upper(restaurant.name) like '%TEST%' or upper(restaurant.name) like '%SMOKE%')
      and (customer.auth_user_id is null or customer.auth_user_id = account.auth_user_id)
  ) then raise exception 'TEST_ONLY_APP_MAIL_RECIPIENT_NOT_ELIGIBLE' using errcode = '42501'; end if;

  perform pg_advisory_xact_lock(hashtextextended('test-only-app-mail-binding', 0));
  select * into existing from test_only_app_mail.recipient_binding where singleton for update;
  if existing.id is not null then
    if existing.restaurant_id = input_restaurant_id and existing.branch_id = input_branch_id
      and existing.account_id = input_account_id and existing.customer_id = input_customer_id
      and existing.auth_user_id = input_auth_user_id and existing.recipient_email = normalized_email
      and existing.valid_until = input_valid_until and existing.configuration_request_id = input_request_id
      and existing.operator_ref = input_operator_ref and existing.evidence_sha256 = input_evidence_sha256
      and existing.revoked_at is null then
      return jsonb_build_object('binding_id', existing.id, 'created', false, 'replay', true,
        'valid_until', existing.valid_until, 'event_version', existing.event_version,
        'content_sha256', existing.content_sha256);
    end if;
    raise exception 'TEST_ONLY_APP_MAIL_BINDING_CONFLICT' using errcode = '23505';
  end if;
  perform set_config('wuxuai.test_only_app_mail_write', 'on', true);
  insert into test_only_app_mail.recipient_binding(
    project_ref, app_origin, restaurant_id, branch_id, account_id, customer_id,
    auth_user_id, recipient_email, event_type, event_version, content_sha256,
    valid_until, configuration_request_id, operator_ref, evidence_sha256
  ) values (
    'mbgveqbhessaunrhfudm', 'https://staging-v2.bonus.wuxuaisbi.com',
    input_restaurant_id, input_branch_id, input_account_id, input_customer_id,
    input_auth_user_id, normalized_email, 'TEST_ONLY_APP_MAIL_SMOKE', 1,
    '1663c63b2cf0edc11188a8fdf035e726704e10a1bfb33cce6703346cad0c30bb',
    input_valid_until, input_request_id, input_operator_ref, input_evidence_sha256
  ) returning * into created;
  insert into test_only_app_mail.audit(
    binding_id, event, request_id, detail, evidence_sha256, actor_ref
  ) values (
    created.id, 'BINDING_CREATED', input_request_id,
    'Bound through the PostgreSQL administrative contract.',
    input_evidence_sha256, input_operator_ref
  );
  return jsonb_build_object('binding_id', created.id, 'created', true, 'replay', false,
    'valid_until', created.valid_until, 'event_version', created.event_version,
    'content_sha256', created.content_sha256);
end;
$function$;
revoke all on function project_bootstrap.configure_test_only_app_mail_recipient(
  uuid, uuid, uuid, uuid, uuid, text, timestamptz, uuid, text, text
) from public, anon, authenticated, service_role;

create function project_bootstrap.revoke_test_only_app_mail_recipient(
  input_binding_id uuid,
  input_request_id uuid,
  input_operator_ref text,
  input_reason text,
  input_evidence_sha256 text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_catalog, project_bootstrap, test_only_app_mail
as $function$
declare binding_record test_only_app_mail.recipient_binding%rowtype;
  queue_record test_only_app_mail.queue%rowtype;
begin
  if session_user <> 'postgres' or current_user <> 'postgres' then
    raise exception 'TEST_ONLY_APP_MAIL_ADMIN_CONNECTION_REQUIRED' using errcode = '42501';
  end if;
  if input_binding_id is null or input_request_id is null
    or input_operator_ref is null or input_operator_ref !~ '^[A-Za-z0-9_.:-]{3,100}$'
    or length(trim(coalesce(input_reason, ''))) < 20
    or input_evidence_sha256 is null or input_evidence_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'TEST_ONLY_APP_MAIL_REVOKE_INVALID' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('test-only-app-mail-binding', 0));
  select * into binding_record from test_only_app_mail.recipient_binding
  where id = input_binding_id for update;
  if binding_record.id is null then
    raise exception 'TEST_ONLY_APP_MAIL_BINDING_MISSING' using errcode = 'P0002';
  end if;
  if binding_record.revoked_at is not null then
    if exists (
      select 1 from test_only_app_mail.audit audit
      where audit.binding_id = binding_record.id and audit.event = 'BINDING_REVOKED'
        and audit.request_id = input_request_id and audit.actor_ref = input_operator_ref
        and audit.evidence_sha256 = input_evidence_sha256
    ) then
      return jsonb_build_object('binding_id', binding_record.id, 'revoked', true, 'replay', true,
        'revoked_at', binding_record.revoked_at);
    end if;
    raise exception 'TEST_ONLY_APP_MAIL_REVOKE_REPLAY_CONFLICT' using errcode = '23505';
  end if;
  perform set_config('wuxuai.test_only_app_mail_write', 'on', true);
  update test_only_app_mail.recipient_binding set revoked_at = clock_timestamp()
  where id = binding_record.id returning * into binding_record;
  update test_only_app_mail.queue set status = 'SKIPPED', finished_at = clock_timestamp(),
    block_reason = 'BINDING_REVOKED'
  where binding_id = binding_record.id and status in ('PENDING', 'RESERVED')
  returning * into queue_record;
  insert into test_only_app_mail.audit(
    binding_id, queue_id, event, request_id, reason_code, detail,
    evidence_sha256, actor_ref
  ) values (
    binding_record.id, queue_record.id, 'BINDING_REVOKED', input_request_id,
    'BINDING_REVOKED', trim(input_reason), input_evidence_sha256, input_operator_ref
  );
  return jsonb_build_object('binding_id', binding_record.id, 'revoked', true, 'replay', false,
    'revoked_at', binding_record.revoked_at);
end;
$function$;
revoke all on function project_bootstrap.revoke_test_only_app_mail_recipient(
  uuid, uuid, text, text, text
) from public, anon, authenticated, service_role;

create function public.enqueue_test_only_app_mail(
  input_binding_id uuid,
  input_request_id uuid,
  input_event_version integer,
  input_content_sha256 text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, test_only_app_mail
as $function$
declare binding_record test_only_app_mail.recipient_binding%rowtype;
  queue_record test_only_app_mail.queue%rowtype;
  delivery_id uuid;
  block_reason text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'TEST_ONLY_APP_MAIL_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if input_binding_id is null or input_request_id is null then
    raise exception 'TEST_ONLY_APP_MAIL_REQUEST_INVALID' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('test-only-app-mail-binding', 0));
  select * into binding_record from test_only_app_mail.recipient_binding
  where id = input_binding_id for update;
  block_reason := test_only_app_mail.binding_block_reason(
    input_binding_id, input_event_version, input_content_sha256
  );
  if block_reason is not null then
    raise exception '%', block_reason using errcode = '42501';
  end if;
  select * into queue_record from test_only_app_mail.queue
  where request_id = input_request_id;
  if queue_record.id is not null then
    if queue_record.binding_id = input_binding_id
      and queue_record.event_type = 'TEST_ONLY_APP_MAIL_SMOKE'
      and queue_record.event_version = input_event_version
      and queue_record.content_sha256 = input_content_sha256 then
      return jsonb_build_object('delivery_id', queue_record.id, 'created', false,
        'replay', true, 'status', queue_record.status);
    end if;
    raise exception 'TEST_ONLY_APP_MAIL_REPLAY_CONFLICT' using errcode = '23505';
  end if;
  if exists (
    select 1 from test_only_app_mail.queue queue
    where queue.binding_id = input_binding_id
      and queue.event_type = 'TEST_ONLY_APP_MAIL_SMOKE'
      and queue.event_version = input_event_version
  ) then raise exception 'TEST_ONLY_APP_MAIL_EVENT_ALREADY_EXISTS' using errcode = '23505'; end if;
  delivery_id := extensions.gen_random_uuid();
  perform set_config('wuxuai.test_only_app_mail_write', 'on', true);
  insert into test_only_app_mail.queue(
    id, binding_id, request_id, event_type, event_version, content_sha256,
    deterministic_message_id, status
  ) values (
    delivery_id, input_binding_id, input_request_id, 'TEST_ONLY_APP_MAIL_SMOKE',
    input_event_version, input_content_sha256,
    '<wuxuai-test-only-' || delivery_id::text || '@wuxuai.invalid>', 'PENDING'
  ) returning * into queue_record;
  insert into test_only_app_mail.audit(binding_id, queue_id, event, request_id, actor_ref)
  values (input_binding_id, queue_record.id, 'ENQUEUED', input_request_id, 'service_role');
  return jsonb_build_object('delivery_id', queue_record.id, 'created', true,
    'replay', false, 'status', queue_record.status);
end;
$function$;
revoke all on function public.enqueue_test_only_app_mail(uuid, uuid, integer, text)
  from public, anon, authenticated;
grant execute on function public.enqueue_test_only_app_mail(uuid, uuid, integer, text)
  to service_role;

create function public.reserve_test_only_app_mail(input_request_id uuid)
returns table(
  delivery_id uuid,
  event_type text,
  event_version integer,
  content_sha256 text,
  email text,
  deterministic_message_id text,
  attempt_count integer
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, test_only_app_mail
as $function$
declare queue_record test_only_app_mail.queue%rowtype;
  binding_record test_only_app_mail.recipient_binding%rowtype;
  block_reason_value text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'TEST_ONLY_APP_MAIL_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  select queue.binding_id into queue_record.binding_id
  from test_only_app_mail.queue queue where queue.request_id = input_request_id;
  if queue_record.binding_id is null then return; end if;
  perform pg_advisory_xact_lock(hashtextextended('test-only-app-mail-binding', 0));
  select * into binding_record from test_only_app_mail.recipient_binding
  where id = queue_record.binding_id for update;
  select * into queue_record from test_only_app_mail.queue queue
  where queue.request_id = input_request_id for update;
  if queue_record.status <> 'PENDING' then return; end if;
  block_reason_value := test_only_app_mail.binding_block_reason(
    queue_record.binding_id, queue_record.event_version, queue_record.content_sha256
  );
  perform set_config('wuxuai.test_only_app_mail_write', 'on', true);
  if block_reason_value is not null then
    update test_only_app_mail.queue set status = 'SKIPPED', finished_at = clock_timestamp(),
      block_reason = block_reason_value where id = queue_record.id;
    insert into test_only_app_mail.audit(
      binding_id, queue_id, event, request_id, reason_code, actor_ref
    ) values (
      queue_record.binding_id, queue_record.id, 'BLOCKED', queue_record.request_id,
      block_reason_value, 'service_role'
    );
    return;
  end if;
  update test_only_app_mail.queue set status = 'RESERVED', attempt_count = 1,
    reserved_at = clock_timestamp() where id = queue_record.id returning * into queue_record;
  insert into test_only_app_mail.audit(binding_id, queue_id, event, request_id, actor_ref)
  values (queue_record.binding_id, queue_record.id, 'RESERVED', queue_record.request_id, 'service_role');
  return query select queue_record.id, queue_record.event_type, queue_record.event_version,
    queue_record.content_sha256, binding_record.recipient_email,
    queue_record.deterministic_message_id, queue_record.attempt_count;
end;
$function$;
revoke all on function public.reserve_test_only_app_mail(uuid)
  from public, anon, authenticated;
grant execute on function public.reserve_test_only_app_mail(uuid) to service_role;

create function public.begin_test_only_app_mail_delivery(input_delivery_id uuid)
returns table(authorized boolean, reason_code text)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, test_only_app_mail
as $function$
declare queue_record test_only_app_mail.queue%rowtype;
  binding_record test_only_app_mail.recipient_binding%rowtype;
  block_reason_value text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'TEST_ONLY_APP_MAIL_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  select queue.binding_id into queue_record.binding_id
  from test_only_app_mail.queue queue where queue.id = input_delivery_id;
  if queue_record.binding_id is null then
    return query select false, 'DELIVERY_MISSING'::text; return;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('test-only-app-mail-binding', 0));
  select * into binding_record from test_only_app_mail.recipient_binding
  where id = queue_record.binding_id for update;
  select * into queue_record from test_only_app_mail.queue where id = input_delivery_id for update;
  if queue_record.status <> 'RESERVED' then
    return query select false, 'DELIVERY_NOT_RESERVED'::text; return;
  end if;
  block_reason_value := test_only_app_mail.binding_block_reason(
    queue_record.binding_id, queue_record.event_version, queue_record.content_sha256
  );
  perform set_config('wuxuai.test_only_app_mail_write', 'on', true);
  if block_reason_value is not null then
    update test_only_app_mail.queue set status = 'SKIPPED', finished_at = clock_timestamp(),
      block_reason = block_reason_value where id = queue_record.id;
    insert into test_only_app_mail.audit(
      binding_id, queue_id, event, request_id, reason_code, actor_ref
    ) values (
      queue_record.binding_id, queue_record.id, 'BLOCKED', queue_record.request_id,
      block_reason_value, 'service_role'
    );
    return query select false, block_reason_value; return;
  end if;
  update test_only_app_mail.queue set status = 'SUBMITTING',
    provider_started_at = clock_timestamp() where id = queue_record.id;
  insert into test_only_app_mail.audit(binding_id, queue_id, event, request_id, actor_ref)
  values (queue_record.binding_id, queue_record.id, 'PROVIDER_HANDOFF_STARTED',
    queue_record.request_id, 'service_role');
  return query select true, null::text;
end;
$function$;
revoke all on function public.begin_test_only_app_mail_delivery(uuid)
  from public, anon, authenticated;
grant execute on function public.begin_test_only_app_mail_delivery(uuid) to service_role;

create function public.complete_test_only_app_mail_delivery(
  input_delivery_id uuid,
  input_outcome text,
  input_provider_message_id text,
  input_error_code text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, test_only_app_mail
as $function$
declare queue_record test_only_app_mail.queue%rowtype;
  receipt_record test_only_app_mail.provider_receipts%rowtype;
  normalized_error text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'TEST_ONLY_APP_MAIL_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if input_outcome is null or input_outcome not in ('ACCEPTED', 'UNKNOWN') then
    raise exception 'TEST_ONLY_APP_MAIL_OUTCOME_INVALID' using errcode = '22023';
  end if;
  normalized_error := case when input_outcome = 'UNKNOWN' then
    left(upper(regexp_replace(coalesce(nullif(input_error_code, ''),
      'PROVIDER_OUTCOME_UNKNOWN'), '[^A-Za-z0-9_-]', '_', 'g')), 120) else null end;
  select * into queue_record from test_only_app_mail.queue
  where id = input_delivery_id for update;
  if queue_record.id is null then return false; end if;
  select * into receipt_record from test_only_app_mail.provider_receipts
  where queue_id = queue_record.id;
  if receipt_record.id is not null then
    return receipt_record.outcome = input_outcome
      and receipt_record.deterministic_message_id = queue_record.deterministic_message_id
      and receipt_record.provider_message_id is not distinct from input_provider_message_id
      and receipt_record.error_code is not distinct from normalized_error;
  end if;
  if queue_record.status <> 'SUBMITTING' then return false; end if;
  if input_outcome = 'ACCEPTED' and nullif(trim(coalesce(input_provider_message_id, '')), '') is null then
    raise exception 'TEST_ONLY_APP_MAIL_PROVIDER_MESSAGE_REQUIRED' using errcode = '22023';
  end if;
  insert into test_only_app_mail.provider_receipts(
    queue_id, outcome, deterministic_message_id, provider_message_id, error_code
  ) values (
    queue_record.id, input_outcome, queue_record.deterministic_message_id,
    nullif(trim(input_provider_message_id), ''), normalized_error
  );
  perform set_config('wuxuai.test_only_app_mail_write', 'on', true);
  update test_only_app_mail.queue set status = input_outcome,
    finished_at = clock_timestamp(), block_reason = normalized_error
  where id = queue_record.id;
  insert into test_only_app_mail.audit(
    binding_id, queue_id, event, request_id, reason_code, actor_ref
  ) values (
    queue_record.binding_id, queue_record.id,
    case when input_outcome = 'ACCEPTED' then 'PROVIDER_ACCEPTED' else 'PROVIDER_UNKNOWN' end,
    queue_record.request_id, normalized_error, 'service_role'
  );
  return true;
end;
$function$;
revoke all on function public.complete_test_only_app_mail_delivery(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.complete_test_only_app_mail_delivery(uuid, text, text, text)
  to service_role;

create function public.get_test_only_app_mail_result(input_request_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, test_only_app_mail
as $function$
  select jsonb_build_object(
    'delivery_id', queue.id,
    'status', queue.status,
    'event_type', queue.event_type,
    'event_version', queue.event_version,
    'content_sha256', queue.content_sha256,
    'deterministic_message_id', queue.deterministic_message_id,
    'attempt_count', queue.attempt_count,
    'provider_receipt_count', count(distinct receipt.id),
    'audit_count', count(distinct audit.id),
    'provider_outcome', max(receipt.outcome)
  )
  from test_only_app_mail.queue queue
  left join test_only_app_mail.provider_receipts receipt on receipt.queue_id = queue.id
  left join test_only_app_mail.audit audit on audit.queue_id = queue.id
  where queue.request_id = input_request_id
  group by queue.id
$function$;
revoke all on function public.get_test_only_app_mail_result(uuid)
  from public, anon, authenticated;
grant execute on function public.get_test_only_app_mail_result(uuid) to service_role;

notify pgrst, 'reload schema';
commit;
