-- Phase 7C.5F: one-shot, staging-only scheduler transport proof.
-- The scheduler can invoke only an already-created synthetic test row. It has
-- no path to the customer or capacity-warning queues.

create extension if not exists pg_net with schema extensions;

create table if not exists public.capacity_warning_synthetic_scheduler_tests (
  id uuid primary key default extensions.gen_random_uuid(),
  synthetic_email_test_id uuid not null unique
    references public.capacity_warning_synthetic_email_tests(id) on delete restrict,
  request_id uuid not null unique,
  correlation_id uuid not null unique,
  environment text not null check (environment = 'staging'),
  recipient_email text not null check (recipient_email = 'office@wuxuaisbi.com'),
  token_hash bytea,
  status text not null default 'SCHEDULED'
    check (status in ('SCHEDULED', 'RUNNING', 'SENT', 'FAILED', 'CANCELLED')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 1),
  scheduled_for timestamptz not null,
  expires_at timestamptz not null,
  cron_job_name text not null unique,
  authorized_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  check (expires_at > scheduled_for),
  check (
    (status = 'SCHEDULED' and attempt_count = 0 and token_hash is not null and authorized_at is null and completed_at is null)
    or (status = 'RUNNING' and attempt_count = 1 and token_hash is null and authorized_at is not null and completed_at is null)
    or (status in ('SENT', 'FAILED') and attempt_count = 1 and token_hash is null and authorized_at is not null and completed_at is not null)
    or (status = 'CANCELLED' and token_hash is null and completed_at is not null)
  )
);

create table if not exists public.capacity_warning_synthetic_scheduler_audit (
  id bigint generated always as identity primary key,
  scheduler_test_id uuid not null
    references public.capacity_warning_synthetic_scheduler_tests(id) on delete restrict,
  request_id uuid not null,
  correlation_id uuid not null,
  event_type text not null
    check (event_type in ('SCHEDULED', 'AUTHORIZED', 'PROVIDER_ACCEPTED', 'FAILED', 'CANCELLED')),
  created_at timestamptz not null default statement_timestamp()
);

alter table public.capacity_warning_synthetic_scheduler_tests enable row level security;
alter table public.capacity_warning_synthetic_scheduler_audit enable row level security;
revoke all on table public.capacity_warning_synthetic_scheduler_tests
from public, anon, authenticated, service_role;
revoke all on table public.capacity_warning_synthetic_scheduler_audit
from public, anon, authenticated, service_role;

create or replace function public.protect_capacity_warning_synthetic_scheduler_audit()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  raise exception 'CAPACITY_WARNING_SYNTHETIC_SCHEDULER_AUDIT_APPEND_ONLY' using errcode = '55000';
end;
$function$;

revoke execute on function public.protect_capacity_warning_synthetic_scheduler_audit()
from public, anon, authenticated, service_role;

drop trigger if exists capacity_warning_synthetic_scheduler_audit_immutable
  on public.capacity_warning_synthetic_scheduler_audit;
create trigger capacity_warning_synthetic_scheduler_audit_immutable
before update or delete on public.capacity_warning_synthetic_scheduler_audit
for each row execute function public.protect_capacity_warning_synthetic_scheduler_audit();

create or replace function public.schedule_capacity_warning_synthetic_email_test(
  input_function_url text,
  input_scheduled_for timestamptz default statement_timestamp() + interval '1 minute'
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, cron, pg_temp
as $function$
declare
  scheduler_test_id uuid := extensions.gen_random_uuid();
  request_value uuid := extensions.gen_random_uuid();
  correlation_value uuid := extensions.gen_random_uuid();
  scheduler_token text := encode(extensions.gen_random_bytes(32), 'hex');
  synthetic_test_id uuid;
  job_name text := 'wuxuai-staging-synthetic-mail-' || replace(scheduler_test_id::text, '-', '');
  request_body jsonb;
  job_command text;
begin
  if current_user <> 'postgres' then
    raise exception 'SYNTHETIC_SCHEDULER_POSTGRES_ONLY' using errcode = '42501';
  end if;
  if input_function_url is null
     or input_function_url !~ '^https://[a-z]{20}\.supabase\.co/functions/v1/transactional-mail-dispatcher$' then
    raise exception 'SYNTHETIC_SCHEDULER_FUNCTION_URL_REJECTED' using errcode = '22023';
  end if;
  if input_scheduled_for < statement_timestamp()
     or input_scheduled_for > statement_timestamp() + interval '10 minutes' then
    raise exception 'SYNTHETIC_SCHEDULER_TIME_REJECTED' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.capacity_warning_synthetic_scheduler_tests
    where status in ('SCHEDULED', 'RUNNING')
  ) then
    raise exception 'SYNTHETIC_SCHEDULER_ACTIVE_RUN_EXISTS' using errcode = '55000';
  end if;

  synthetic_test_id := public.enqueue_capacity_warning_synthetic_email_test(
    request_value,
    correlation_value,
    'staging',
    true,
    'office@wuxuaisbi.com',
    'notifications@wuxuaibonus.com',
    'support@wuxuaibonus.com'
  );

  insert into public.capacity_warning_synthetic_scheduler_tests (
    id, synthetic_email_test_id, request_id, correlation_id, environment,
    recipient_email, token_hash, scheduled_for, expires_at, cron_job_name
  ) values (
    scheduler_test_id, synthetic_test_id, request_value, correlation_value, 'staging',
    'office@wuxuaisbi.com', extensions.digest(scheduler_token, 'sha256'),
    input_scheduled_for, input_scheduled_for + interval '10 minutes', job_name
  );

  insert into public.capacity_warning_synthetic_scheduler_audit (
    scheduler_test_id, request_id, correlation_id, event_type
  ) values (scheduler_test_id, request_value, correlation_value, 'SCHEDULED');

  request_body := jsonb_build_object(
    'mode', 'scheduled_synthetic_capacity_test',
    'message_type', 'synthetic_capacity',
    'request_id', request_value,
    'correlation_id', correlation_value,
    'environment', 'staging',
    'synthetic_test', true,
    'recipient', 'office@wuxuaisbi.com',
    'scheduler_token', scheduler_token
  );
  job_command := format(
    'select net.http_post(url := %L, headers := %L::jsonb, body := %L::jsonb, timeout_milliseconds := 30000);',
    input_function_url,
    '{"Content-Type":"application/json"}',
    request_body::text
  );
  perform cron.schedule(job_name, '* * * * *', job_command);
  return scheduler_test_id;
end;
$function$;

revoke execute on function public.schedule_capacity_warning_synthetic_email_test(text, timestamptz)
from public, anon, authenticated, service_role;

create or replace function public.authorize_capacity_warning_synthetic_scheduler_test(
  input_request_id uuid,
  input_correlation_id uuid,
  input_scheduler_token text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, cron, pg_temp
as $function$
declare
  run_record public.capacity_warning_synthetic_scheduler_tests%rowtype;
begin
  if input_request_id is null or input_correlation_id is null
     or length(coalesce(input_scheduler_token, '')) <> 64 then
    return false;
  end if;

  select * into run_record
  from public.capacity_warning_synthetic_scheduler_tests scheduler_test
  where scheduler_test.request_id = input_request_id
    and scheduler_test.correlation_id = input_correlation_id
  for update;

  if run_record.id is null
     or run_record.status <> 'SCHEDULED'
     or statement_timestamp() < run_record.scheduled_for
     or statement_timestamp() >= run_record.expires_at
     or run_record.token_hash <> extensions.digest(input_scheduler_token, 'sha256') then
    return false;
  end if;

  update public.capacity_warning_synthetic_scheduler_tests scheduler_test
  set status = 'RUNNING', attempt_count = 1, token_hash = null,
      authorized_at = statement_timestamp(), updated_at = statement_timestamp()
  where scheduler_test.id = run_record.id;

  insert into public.capacity_warning_synthetic_scheduler_audit (
    scheduler_test_id, request_id, correlation_id, event_type
  ) values (run_record.id, run_record.request_id, run_record.correlation_id, 'AUTHORIZED');

  perform cron.unschedule(run_record.cron_job_name);
  return true;
end;
$function$;

revoke execute on function public.authorize_capacity_warning_synthetic_scheduler_test(uuid, uuid, text)
from public, anon, authenticated, service_role;
grant execute on function public.authorize_capacity_warning_synthetic_scheduler_test(uuid, uuid, text)
to service_role;

create or replace function public.sync_capacity_warning_synthetic_scheduler_test()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  run_record public.capacity_warning_synthetic_scheduler_tests%rowtype;
  audit_event text;
begin
  if new.status not in ('SENT', 'FAILED') or new.status is not distinct from old.status then
    return new;
  end if;

  update public.capacity_warning_synthetic_scheduler_tests scheduler_test
  set status = new.status, completed_at = statement_timestamp(), updated_at = statement_timestamp()
  where scheduler_test.synthetic_email_test_id = new.id
    and scheduler_test.status = 'RUNNING'
  returning * into run_record;

  if run_record.id is not null then
    audit_event := case when new.status = 'SENT' then 'PROVIDER_ACCEPTED' else 'FAILED' end;
    insert into public.capacity_warning_synthetic_scheduler_audit (
      scheduler_test_id, request_id, correlation_id, event_type
    ) values (run_record.id, run_record.request_id, run_record.correlation_id, audit_event);
  end if;
  return new;
end;
$function$;

revoke execute on function public.sync_capacity_warning_synthetic_scheduler_test()
from public, anon, authenticated, service_role;

drop trigger if exists capacity_warning_synthetic_scheduler_sync
  on public.capacity_warning_synthetic_email_tests;
create trigger capacity_warning_synthetic_scheduler_sync
after update of status on public.capacity_warning_synthetic_email_tests
for each row execute function public.sync_capacity_warning_synthetic_scheduler_test();

comment on function public.schedule_capacity_warning_synthetic_email_test(text, timestamptz) is
  'Postgres-only one-shot staging scheduler proof. It creates one fixed-recipient synthetic row and never scans a general outbox.';
comment on function public.authorize_capacity_warning_synthetic_scheduler_test(uuid, uuid, text) is
  'Consumes a generated one-time scheduler capability and unschedules its cron job before the provider call.';

notify pgrst, 'reload schema';
