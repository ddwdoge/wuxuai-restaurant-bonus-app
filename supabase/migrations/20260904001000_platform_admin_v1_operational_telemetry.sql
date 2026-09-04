-- Minimal global operational telemetry for the V1 Platform Admin.
-- The function is read-only, exposes aggregates only and never treats a
-- missing source or an empty event window as healthy.

create or replace function public.get_platform_operational_telemetry()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  expected_jobs constant text[] := array[
    'wuxuai-v1-birthday-gifts-daily',
    'wuxuai-v1-expire-redemption-codes',
    'wuxuai-v1-complete-points-presentations',
    'wuxuai-v1-expiry-reminders-daily',
    'wuxuai-v1-expire-bonus-boosts',
    'wuxuai-v1-birthday-gift-reminders',
    'wuxuai-v1-complete-gift-presentations'
  ];
  cron_status text := 'unavailable';
  cron_reason text := 'cron_configuration_source_unavailable';
  cron_configured_count integer := 0;
  cron_enabled_count integer := 0;
  cron_failures_24h integer := 0;
  cron_last_run_at timestamptz;
  cron_last_success_at timestamptz;
  cron_last_failure_at timestamptz;
  cron_jobs jsonb := '[]'::jsonb;
  email_status text := 'unavailable';
  email_reason text := 'transactional_email_source_unavailable';
  email_pending_count integer := 0;
  email_processing_count integer := 0;
  email_failed_count integer := 0;
  email_sent_24h_count integer := 0;
  email_last_sent_at timestamptz;
  email_last_failure_at timestamptz;
  email_events_7d integer := 0;
  registration_status text := 'unavailable';
  registration_reason text := 'registration_audit_source_unavailable';
  registration_success_24h integer := 0;
  registration_success_7d integer := 0;
  registration_failures_24h integer := 0;
  registration_failures_7d integer := 0;
  registration_last_success_at timestamptz;
  registration_last_failure_at timestamptz;
begin
  if not public.is_platform_admin() then
    raise exception using errcode = '42501', message = 'PLATFORM_ADMIN_REQUIRED';
  end if;

  if to_regclass('cron.job') is not null then
    select
      count(*)::integer,
      count(*) filter (where job.active)::integer
    into cron_configured_count, cron_enabled_count
    from cron.job job
    where job.jobname = any(expected_jobs);

    if to_regclass('cron.job_run_details') is not null then
      select
        max(run.start_time),
        max(run.end_time) filter (where run.status = 'succeeded'),
        max(run.end_time) filter (where run.status = 'failed'),
        count(*) filter (
          where run.status = 'failed'
            and run.start_time >= statement_timestamp() - interval '24 hours'
        )::integer
      into cron_last_run_at, cron_last_success_at, cron_last_failure_at, cron_failures_24h
      from cron.job job
      left join cron.job_run_details run on run.jobid = job.jobid
      where job.jobname = any(expected_jobs);

      select coalesce(jsonb_agg(jsonb_build_object(
        'name', expected.name,
        'configured', job.jobid is not null,
        'enabled', coalesce(job.active, false),
        'schedule', job.schedule,
        'last_status', latest_run.status,
        'last_run_at', latest_run.start_time
      ) order by expected.ordinality), '[]'::jsonb)
      into cron_jobs
      from unnest(expected_jobs) with ordinality expected(name, ordinality)
      left join cron.job job on job.jobname = expected.name
      left join lateral (
        select run.status, run.start_time
        from cron.job_run_details run
        where run.jobid = job.jobid
        order by run.start_time desc
        limit 1
      ) latest_run on true;

      cron_status := case
        when cron_configured_count <> cardinality(expected_jobs)
          or cron_enabled_count <> cardinality(expected_jobs) then 'degraded'
        when cron_last_failure_at is not null
          and (cron_last_success_at is null or cron_last_failure_at > cron_last_success_at) then 'error'
        when cron_failures_24h > 0 then 'degraded'
        when cron_last_success_at is not null then 'healthy'
        else 'no_recent_events'
      end;
      cron_reason := case
        when cron_configured_count <> cardinality(expected_jobs) then 'expected_jobs_missing'
        when cron_enabled_count <> cardinality(expected_jobs) then 'expected_jobs_disabled'
        when cron_status = 'error' then 'latest_known_run_failed'
        when cron_status = 'degraded' then 'recent_failures_present'
        when cron_status = 'no_recent_events' then 'no_job_run_history'
        else null
      end;
    else
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', expected.name,
        'configured', job.jobid is not null,
        'enabled', coalesce(job.active, false),
        'schedule', job.schedule,
        'last_status', null,
        'last_run_at', null
      ) order by expected.ordinality), '[]'::jsonb)
      into cron_jobs
      from unnest(expected_jobs) with ordinality expected(name, ordinality)
      left join cron.job job on job.jobname = expected.name;
      cron_reason := 'cron_run_history_source_unavailable';
    end if;
  end if;

  if to_regclass('public.customer_transactional_email_deliveries') is not null then
    select
      count(*) filter (where delivery.status = 'PENDING')::integer,
      count(*) filter (where delivery.status = 'PROCESSING')::integer,
      count(*) filter (where delivery.status = 'FAILED')::integer,
      count(*) filter (
        where delivery.status = 'SENT'
          and delivery.sent_at >= statement_timestamp() - interval '24 hours'
      )::integer,
      max(delivery.sent_at) filter (where delivery.status = 'SENT'),
      max(delivery.failed_at) filter (where delivery.status = 'FAILED'),
      count(*) filter (where delivery.created_at >= statement_timestamp() - interval '7 days')::integer
    into email_pending_count, email_processing_count, email_failed_count,
      email_sent_24h_count, email_last_sent_at, email_last_failure_at, email_events_7d
    from public.customer_transactional_email_deliveries delivery;

    email_status := case
      when email_failed_count > 0 then 'error'
      when email_pending_count > 0 or email_processing_count > 0 then 'degraded'
      when email_sent_24h_count > 0 then 'healthy'
      when email_events_7d = 0 then 'no_recent_events'
      else 'no_recent_events'
    end;
    email_reason := case
      when email_status = 'error' then 'failed_deliveries_present'
      when email_status = 'degraded' then 'deliveries_waiting'
      when email_status = 'no_recent_events' then 'no_recent_delivery_events'
      else null
    end;
  end if;

  if to_regclass('public.audit_log') is not null then
    select
      count(*) filter (
        where audit.status = 'success'
          and audit.created_at >= statement_timestamp() - interval '24 hours'
      )::integer,
      count(*) filter (where audit.status = 'success')::integer,
      count(*) filter (
        where audit.status in ('failed', 'blocked')
          and audit.created_at >= statement_timestamp() - interval '24 hours'
      )::integer,
      count(*) filter (where audit.status in ('failed', 'blocked'))::integer,
      max(audit.created_at) filter (where audit.status = 'success'),
      max(audit.created_at) filter (where audit.status in ('failed', 'blocked'))
    into registration_success_24h, registration_success_7d,
      registration_failures_24h, registration_failures_7d,
      registration_last_success_at, registration_last_failure_at
    from public.audit_log audit
    where audit.created_at >= statement_timestamp() - interval '7 days'
      and not audit.is_test_event
      and coalesce(nullif(audit.event_type, ''), audit.action) in (
        'CUSTOMER_REGISTERED',
        'CUSTOMER_REGISTRATION_ATTEMPT',
        'OWNER_TRIAL_STARTED',
        'RESTAURANT_ONBOARDING_COMPLETED'
      );

    registration_status := case
      when registration_failures_24h >= 3 then 'error'
      when registration_failures_24h > 0 or registration_failures_7d > 0 then 'degraded'
      when registration_success_7d > 0 then 'healthy'
      else 'no_recent_events'
    end;
    registration_reason := case
      when registration_status = 'error' then 'repeated_recent_registration_failures'
      when registration_status = 'degraded' then 'registration_failures_present'
      when registration_status = 'no_recent_events' then 'no_recent_registration_events'
      else null
    end;
  end if;

  return jsonb_build_object(
    'contract_version', 'platform_operational_telemetry_v1',
    'generated_at', statement_timestamp(),
    'cron', jsonb_build_object(
      'status', cron_status,
      'reason', cron_reason,
      'expected_job_count', cardinality(expected_jobs),
      'configured_job_count', cron_configured_count,
      'enabled_job_count', cron_enabled_count,
      'last_run_at', cron_last_run_at,
      'last_success_at', cron_last_success_at,
      'last_failure_at', cron_last_failure_at,
      'failures_24h', cron_failures_24h,
      'jobs', cron_jobs
    ),
    'email', jsonb_build_object(
      'status', email_status,
      'reason', email_reason,
      'configuration_status', 'unavailable',
      'configuration_reason', 'edge_function_secrets_not_readable_from_database',
      'pending_count', email_pending_count,
      'processing_count', email_processing_count,
      'failed_count', email_failed_count,
      'sent_24h_count', email_sent_24h_count,
      'last_sent_at', email_last_sent_at,
      'last_failure_at', email_last_failure_at
    ),
    'registration', jsonb_build_object(
      'status', registration_status,
      'reason', registration_reason,
      'success_24h', registration_success_24h,
      'success_7d', registration_success_7d,
      'failures_24h', registration_failures_24h,
      'failures_7d', registration_failures_7d,
      'last_success_at', registration_last_success_at,
      'last_failure_at', registration_last_failure_at
    )
  );
end;
$$;

revoke execute on function public.get_platform_operational_telemetry()
from public, anon, authenticated;
grant execute on function public.get_platform_operational_telemetry()
to authenticated;

comment on function public.get_platform_operational_telemetry() is
  'Read-only V1 Platform Admin telemetry for canonical Cron configuration/run evidence, transactional email queue state and aggregate registration audit evidence.';

notify pgrst, 'reload schema';
