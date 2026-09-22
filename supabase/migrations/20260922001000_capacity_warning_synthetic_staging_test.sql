-- Phase 7C.5D: isolated, single-recipient staging transport proof.
-- This contract never scans or mutates the customer transactional queue or the
-- general capacity warning queue. It is service-role only and staging-only.

create table if not exists public.capacity_warning_synthetic_email_tests (
  id uuid primary key default extensions.gen_random_uuid(),
  request_id uuid not null,
  correlation_id uuid not null,
  environment text not null check (environment = 'staging'),
  synthetic_test boolean not null check (synthetic_test),
  recipient_email text not null check (recipient_email = 'office@wuxuaisbi.com'),
  sender_email text not null check (sender_email = 'notifications@wuxuaibonus.com'),
  reply_to_email text not null check (reply_to_email = 'support@wuxuaibonus.com'),
  status text not null default 'PENDING' check (status in ('PENDING', 'PROCESSING', 'SENT', 'FAILED')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 1),
  processing_started_at timestamptz,
  provider_accepted_at timestamptz,
  provider_message_id text,
  last_error_code text,
  payload jsonb not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (request_id, correlation_id),
  check (
    (status = 'PENDING' and attempt_count = 0 and processing_started_at is null and provider_accepted_at is null)
    or (status = 'PROCESSING' and attempt_count = 1 and processing_started_at is not null and provider_accepted_at is null)
    or (status = 'SENT' and attempt_count = 1 and processing_started_at is null and provider_accepted_at is not null and provider_message_id is not null)
    or (status = 'FAILED' and attempt_count = 1 and processing_started_at is null and provider_accepted_at is null and last_error_code is not null)
  )
);

create unique index if not exists capacity_warning_synthetic_request_id_idx
  on public.capacity_warning_synthetic_email_tests (request_id);
create unique index if not exists capacity_warning_synthetic_correlation_id_idx
  on public.capacity_warning_synthetic_email_tests (correlation_id);

create table if not exists public.capacity_warning_synthetic_email_audit (
  id bigint generated always as identity primary key,
  synthetic_email_test_id uuid not null references public.capacity_warning_synthetic_email_tests(id) on delete restrict,
  request_id uuid not null,
  correlation_id uuid not null,
  event_type text not null check (event_type in ('ENQUEUED', 'RESERVED', 'PROVIDER_ACCEPTED', 'FAILED')),
  detail_code text,
  created_at timestamptz not null default statement_timestamp()
);

alter table public.capacity_warning_synthetic_email_tests enable row level security;
alter table public.capacity_warning_synthetic_email_audit enable row level security;
revoke all on table public.capacity_warning_synthetic_email_tests from public, anon, authenticated, service_role;
revoke all on table public.capacity_warning_synthetic_email_audit from public, anon, authenticated, service_role;

create or replace function public.protect_capacity_warning_synthetic_email_audit()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  raise exception 'CAPACITY_WARNING_SYNTHETIC_AUDIT_APPEND_ONLY' using errcode = '55000';
end;
$function$;

revoke execute on function public.protect_capacity_warning_synthetic_email_audit()
from public, anon, authenticated, service_role;

drop trigger if exists capacity_warning_synthetic_email_audit_immutable
  on public.capacity_warning_synthetic_email_audit;
create trigger capacity_warning_synthetic_email_audit_immutable
before update or delete on public.capacity_warning_synthetic_email_audit
for each row execute function public.protect_capacity_warning_synthetic_email_audit();

create or replace function public.enqueue_capacity_warning_synthetic_email_test(
  input_request_id uuid,
  input_correlation_id uuid,
  input_environment text,
  input_synthetic_test boolean,
  input_recipient_email text,
  input_sender_email text,
  input_reply_to_email text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  existing_record public.capacity_warning_synthetic_email_tests%rowtype;
  created_id uuid;
  fixed_payload jsonb := jsonb_build_object(
    'capacity_type', 'offer',
    'warning_level', '80',
    'usage', 4,
    'effective_limit', 5,
    'remaining', 1,
    'projected_usage_7d', 5,
    'language', 'de',
    'synthetic_test', true
  );
begin
  if input_request_id is null or input_correlation_id is null then
    raise exception 'SYNTHETIC_TEST_IDS_REQUIRED' using errcode = '22023';
  end if;
  if input_environment is distinct from 'staging' or input_synthetic_test is distinct from true then
    raise exception 'SYNTHETIC_TEST_STAGING_ONLY' using errcode = '42501';
  end if;
  if lower(trim(coalesce(input_recipient_email, ''))) <> 'office@wuxuaisbi.com'
     or lower(trim(coalesce(input_sender_email, ''))) <> 'notifications@wuxuaibonus.com'
     or lower(trim(coalesce(input_reply_to_email, ''))) <> 'support@wuxuaibonus.com' then
    raise exception 'SYNTHETIC_TEST_MAIL_CONTRACT_REJECTED' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(input_request_id::text || ':' || input_correlation_id::text, 0)
  );

  select * into existing_record
  from public.capacity_warning_synthetic_email_tests test
  where test.request_id = input_request_id or test.correlation_id = input_correlation_id
  order by test.created_at
  limit 1
  for update;

  if existing_record.id is not null then
    if existing_record.request_id <> input_request_id
       or existing_record.correlation_id <> input_correlation_id
       or existing_record.environment <> input_environment
       or existing_record.synthetic_test is distinct from input_synthetic_test
       or existing_record.recipient_email <> lower(trim(input_recipient_email))
       or existing_record.sender_email <> lower(trim(input_sender_email))
       or existing_record.reply_to_email <> lower(trim(input_reply_to_email))
       or existing_record.payload <> fixed_payload then
      raise exception 'SYNTHETIC_TEST_IDEMPOTENCY_COLLISION' using errcode = '23505';
    end if;
    return existing_record.id;
  end if;

  insert into public.capacity_warning_synthetic_email_tests (
    request_id, correlation_id, environment, synthetic_test,
    recipient_email, sender_email, reply_to_email, payload
  ) values (
    input_request_id, input_correlation_id, input_environment, input_synthetic_test,
    lower(trim(input_recipient_email)), lower(trim(input_sender_email)),
    lower(trim(input_reply_to_email)), fixed_payload
  ) returning id into created_id;

  insert into public.capacity_warning_synthetic_email_audit (
    synthetic_email_test_id, request_id, correlation_id, event_type
  ) values (created_id, input_request_id, input_correlation_id, 'ENQUEUED');
  return created_id;
end;
$function$;

revoke execute on function public.enqueue_capacity_warning_synthetic_email_test(uuid, uuid, text, boolean, text, text, text)
from public, anon, authenticated, service_role;
grant execute on function public.enqueue_capacity_warning_synthetic_email_test(uuid, uuid, text, boolean, text, text, text)
to service_role;

create or replace function public.reserve_capacity_warning_synthetic_email_test(
  input_request_id uuid,
  input_correlation_id uuid
)
returns table (
  delivery_id uuid,
  event_type text,
  email text,
  restaurant_name text,
  restaurant_slug text,
  payload jsonb,
  attempt_count integer,
  sender_email text,
  reply_to_email text,
  request_id uuid,
  correlation_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  reserved_record public.capacity_warning_synthetic_email_tests%rowtype;
begin
  if input_request_id is null or input_correlation_id is null then
    raise exception 'SYNTHETIC_TEST_IDS_REQUIRED' using errcode = '22023';
  end if;

  select * into reserved_record
  from public.capacity_warning_synthetic_email_tests test
  where test.request_id = input_request_id
    and test.correlation_id = input_correlation_id
  for update;

  if reserved_record.id is null then
    raise exception 'SYNTHETIC_TEST_NOT_FOUND' using errcode = 'P0002';
  end if;
  if reserved_record.status <> 'PENDING' then
    return;
  end if;

  update public.capacity_warning_synthetic_email_tests test
  set status = 'PROCESSING', attempt_count = 1,
      processing_started_at = statement_timestamp(), updated_at = statement_timestamp()
  where test.id = reserved_record.id
  returning * into reserved_record;

  insert into public.capacity_warning_synthetic_email_audit (
    synthetic_email_test_id, request_id, correlation_id, event_type
  ) values (reserved_record.id, reserved_record.request_id, reserved_record.correlation_id, 'RESERVED');

  return query select
    reserved_record.id, 'CAPACITY_WARNING_SYNTHETIC_TEST'::text,
    reserved_record.recipient_email, 'WUXUAI Bonus Staging Test'::text,
    'staging-test'::text, reserved_record.payload, reserved_record.attempt_count,
    reserved_record.sender_email, reserved_record.reply_to_email,
    reserved_record.request_id, reserved_record.correlation_id;
end;
$function$;

revoke execute on function public.reserve_capacity_warning_synthetic_email_test(uuid, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.reserve_capacity_warning_synthetic_email_test(uuid, uuid) to service_role;

create or replace function public.complete_capacity_warning_synthetic_email_test(
  input_delivery_id uuid,
  input_request_id uuid,
  input_correlation_id uuid,
  input_success boolean,
  input_provider_message_id text default null,
  input_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  completed_record public.capacity_warning_synthetic_email_tests%rowtype;
begin
  select * into completed_record
  from public.capacity_warning_synthetic_email_tests test
  where test.id = input_delivery_id
    and test.request_id = input_request_id
    and test.correlation_id = input_correlation_id
  for update;

  if completed_record.id is null then
    raise exception 'SYNTHETIC_TEST_NOT_FOUND' using errcode = 'P0002';
  end if;
  if completed_record.status = 'SENT' then return true; end if;
  if completed_record.status <> 'PROCESSING' then return false; end if;

  if input_success and nullif(trim(coalesce(input_provider_message_id, '')), '') is null then
    raise exception 'PROVIDER_MESSAGE_ID_REQUIRED' using errcode = '22023';
  end if;

  update public.capacity_warning_synthetic_email_tests test
  set status = case when input_success then 'SENT' else 'FAILED' end,
      processing_started_at = null,
      provider_accepted_at = case when input_success then statement_timestamp() else null end,
      provider_message_id = case when input_success then left(trim(input_provider_message_id), 240) else null end,
      last_error_code = case when input_success then null else left(coalesce(nullif(trim(input_error_code), ''), 'DELIVERY_FAILED'), 120) end,
      updated_at = statement_timestamp()
  where test.id = completed_record.id
  returning * into completed_record;

  insert into public.capacity_warning_synthetic_email_audit (
    synthetic_email_test_id, request_id, correlation_id, event_type, detail_code
  ) values (
    completed_record.id, completed_record.request_id, completed_record.correlation_id,
    case when input_success then 'PROVIDER_ACCEPTED' else 'FAILED' end,
    case when input_success then null else completed_record.last_error_code end
  );
  return input_success;
end;
$function$;

revoke execute on function public.complete_capacity_warning_synthetic_email_test(uuid, uuid, uuid, boolean, text, text)
from public, anon, authenticated, service_role;
grant execute on function public.complete_capacity_warning_synthetic_email_test(uuid, uuid, uuid, boolean, text, text)
to service_role;

comment on table public.capacity_warning_synthetic_email_tests is
  'Phase 7C.5D staging-only transport proof. It is deliberately separate from all production-capable customer and capacity queues.';
comment on function public.reserve_capacity_warning_synthetic_email_test(uuid, uuid) is
  'Reserves only the exact request/correlation pair; it never scans any general outbox.';

notify pgrst, 'reload schema';
