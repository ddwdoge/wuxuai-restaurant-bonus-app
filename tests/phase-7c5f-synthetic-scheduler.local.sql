begin;

do $test$
declare
  customer_before bigint;
  capacity_before bigint;
  scheduler_id uuid;
  scheduler_record public.capacity_warning_synthetic_scheduler_tests%rowtype;
  scheduler_token text;
  job_command text;
  reserved_count integer;
begin
  select count(*) into customer_before from public.customer_transactional_email_deliveries;
  select count(*) into capacity_before from public.capacity_warning_deliveries;

  scheduler_id := public.schedule_capacity_warning_synthetic_email_test(
    'https://bwhvfjuwixgwduoeqaya.supabase.co/functions/v1/transactional-mail-dispatcher',
    statement_timestamp() + interval '1 minute'
  );

  select * into scheduler_record
  from public.capacity_warning_synthetic_scheduler_tests
  where id = scheduler_id;

  if scheduler_record.status <> 'SCHEDULED' or scheduler_record.attempt_count <> 0 then
    raise exception 'SCHEDULER_TEST_NOT_SCHEDULED';
  end if;
  if (select count(*) from cron.job where jobname = scheduler_record.cron_job_name) <> 1 then
    raise exception 'SCHEDULER_CRON_JOB_MISSING';
  end if;

  select command into job_command from cron.job where jobname = scheduler_record.cron_job_name;
  scheduler_token := (regexp_match(job_command, '"scheduler_token": "([0-9a-f]{64})"'))[1];
  if scheduler_token is null then
    raise exception 'SCHEDULER_TOKEN_NOT_EMBEDDED';
  end if;

  update public.capacity_warning_synthetic_scheduler_tests
  set scheduled_for = statement_timestamp() - interval '1 second',
      expires_at = statement_timestamp() + interval '10 minutes'
  where id = scheduler_id;

  if not public.authorize_capacity_warning_synthetic_scheduler_test(
    scheduler_record.request_id,
    scheduler_record.correlation_id,
    scheduler_token
  ) then
    raise exception 'SCHEDULER_AUTHORIZATION_FAILED';
  end if;
  if public.authorize_capacity_warning_synthetic_scheduler_test(
    scheduler_record.request_id,
    scheduler_record.correlation_id,
    scheduler_token
  ) then
    raise exception 'SCHEDULER_TOKEN_REUSED';
  end if;
  if exists (select 1 from cron.job where jobname = scheduler_record.cron_job_name) then
    raise exception 'SCHEDULER_CRON_JOB_NOT_REMOVED';
  end if;

  select count(*) into reserved_count
  from public.reserve_capacity_warning_synthetic_email_test(
    scheduler_record.request_id,
    scheduler_record.correlation_id
  );
  if reserved_count <> 1 then
    raise exception 'SYNTHETIC_ROW_NOT_RESERVED';
  end if;
  if not public.complete_capacity_warning_synthetic_email_test(
    scheduler_record.synthetic_email_test_id,
    scheduler_record.request_id,
    scheduler_record.correlation_id,
    true,
    '<local-scheduler-contract-test@wuxuaibonus.com>',
    null
  ) then
    raise exception 'SYNTHETIC_ROW_NOT_COMPLETED';
  end if;

  if (select status from public.capacity_warning_synthetic_scheduler_tests where id = scheduler_id) <> 'SENT' then
    raise exception 'SCHEDULER_STATUS_NOT_SYNCHRONIZED';
  end if;
  if (select count(*) from public.capacity_warning_synthetic_scheduler_audit where scheduler_test_id = scheduler_id) <> 3 then
    raise exception 'SCHEDULER_AUDIT_COUNT_INVALID';
  end if;
  if (select count(*) from public.customer_transactional_email_deliveries) <> customer_before
     or (select count(*) from public.capacity_warning_deliveries) <> capacity_before then
    raise exception 'GENERAL_OUTBOX_CHANGED';
  end if;
end;
$test$;

rollback;
