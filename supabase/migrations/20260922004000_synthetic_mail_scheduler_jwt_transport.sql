-- Phase 7C.5F: keep the Supabase Edge JWT boundary in front of the one-time
-- database capability. The JWT is used only in the transient cron command and
-- disappears when the authorization RPC atomically unschedules that job.

drop function if exists public.schedule_capacity_warning_synthetic_email_test(text, timestamptz);

create or replace function public.schedule_capacity_warning_synthetic_email_test(
  input_function_url text,
  input_authorization_jwt text,
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
  request_headers jsonb;
  job_command text;
begin
  if current_user <> 'postgres' then
    raise exception 'SYNTHETIC_SCHEDULER_POSTGRES_ONLY' using errcode = '42501';
  end if;
  if input_function_url is null
     or input_function_url !~ '^https://[a-z]{20}\.supabase\.co/functions/v1/transactional-mail-dispatcher$' then
    raise exception 'SYNTHETIC_SCHEDULER_FUNCTION_URL_REJECTED' using errcode = '22023';
  end if;
  if input_authorization_jwt is null
     or length(input_authorization_jwt) > 2048
     or input_authorization_jwt !~ '^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' then
    raise exception 'SYNTHETIC_SCHEDULER_JWT_REJECTED' using errcode = '22023';
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
  request_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || input_authorization_jwt
  );
  job_command := format(
    'select net.http_post(url := %L, headers := %L::jsonb, body := %L::jsonb, timeout_milliseconds := 30000);',
    input_function_url,
    request_headers::text,
    request_body::text
  );
  perform cron.schedule(job_name, '* * * * *', job_command);
  return scheduler_test_id;
end;
$function$;

revoke execute on function public.schedule_capacity_warning_synthetic_email_test(text, text, timestamptz)
from public, anon, authenticated, service_role;

comment on function public.schedule_capacity_warning_synthetic_email_test(text, text, timestamptz) is
  'Postgres-only one-shot staging scheduler proof with Edge JWT plus a generated, database-verified single-use capability.';

notify pgrst, 'reload schema';
