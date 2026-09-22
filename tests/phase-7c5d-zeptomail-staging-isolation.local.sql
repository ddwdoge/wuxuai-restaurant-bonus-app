begin;

do $test$
declare
  request_value uuid := '75d6d87d-860f-4b64-8cd7-9aa7cc219001';
  correlation_value uuid := '75d6d87d-860f-4b64-8cd7-9aa7cc219002';
  first_id uuid;
  repeated_id uuid;
  reserved_count integer;
  general_customer_before bigint;
  general_customer_after bigint;
  general_capacity_before bigint;
  general_capacity_after bigint;
begin
  select count(*) into general_customer_before
  from public.customer_transactional_email_deliveries;
  select count(*) into general_capacity_before
  from public.capacity_warning_deliveries;

  first_id := public.enqueue_capacity_warning_synthetic_email_test(
    request_value, correlation_value, 'staging', true,
    'office@wuxuaisbi.com', 'notifications@wuxuaibonus.com', 'support@wuxuaibonus.com'
  );
  repeated_id := public.enqueue_capacity_warning_synthetic_email_test(
    request_value, correlation_value, 'staging', true,
    'office@wuxuaisbi.com', 'notifications@wuxuaibonus.com', 'support@wuxuaibonus.com'
  );
  if first_id is distinct from repeated_id then
    raise exception 'idempotent enqueue returned a second record';
  end if;

  begin
    perform public.enqueue_capacity_warning_synthetic_email_test(
      extensions.gen_random_uuid(), extensions.gen_random_uuid(), 'production', true,
      'office@wuxuaisbi.com', 'notifications@wuxuaibonus.com', 'support@wuxuaibonus.com'
    );
    raise exception 'production environment was accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.enqueue_capacity_warning_synthetic_email_test(
      extensions.gen_random_uuid(), extensions.gen_random_uuid(), 'staging', true,
      'someone@example.com', 'notifications@wuxuaibonus.com', 'support@wuxuaibonus.com'
    );
    raise exception 'non-allowlisted recipient was accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.enqueue_capacity_warning_synthetic_email_test(
      null, extensions.gen_random_uuid(), 'staging', true,
      'office@wuxuaisbi.com', 'notifications@wuxuaibonus.com', 'support@wuxuaibonus.com'
    );
    raise exception 'missing request id was accepted';
  exception when invalid_parameter_value then null;
  end;

  select count(*) into reserved_count
  from public.reserve_capacity_warning_synthetic_email_test(request_value, correlation_value);
  if reserved_count <> 1 then raise exception 'first reservation count %', reserved_count; end if;
  select count(*) into reserved_count
  from public.reserve_capacity_warning_synthetic_email_test(request_value, correlation_value);
  if reserved_count <> 0 then raise exception 'duplicate reservation count %', reserved_count; end if;

  if not public.complete_capacity_warning_synthetic_email_test(
    first_id, request_value, correlation_value, true,
    '<local-contract-test@wuxuaibonus.com>', null
  ) then raise exception 'completion failed'; end if;
  if not public.complete_capacity_warning_synthetic_email_test(
    first_id, request_value, correlation_value, true,
    '<local-contract-test@wuxuaibonus.com>', null
  ) then raise exception 'idempotent completion failed'; end if;

  if (select status from public.capacity_warning_synthetic_email_tests where id = first_id) <> 'SENT' then
    raise exception 'synthetic status is not SENT';
  end if;
  if (select count(*) from public.capacity_warning_synthetic_email_audit where synthetic_email_test_id = first_id) <> 3 then
    raise exception 'unexpected synthetic audit count';
  end if;

  select count(*) into general_customer_after
  from public.customer_transactional_email_deliveries;
  select count(*) into general_capacity_after
  from public.capacity_warning_deliveries;
  if general_customer_after <> general_customer_before or general_capacity_after <> general_capacity_before then
    raise exception 'general outbox changed';
  end if;
end;
$test$;

do $roles$
begin
  execute 'set local role authenticated';
  begin
    perform public.enqueue_capacity_warning_synthetic_email_test(
      extensions.gen_random_uuid(), extensions.gen_random_uuid(), 'staging', true,
      'office@wuxuaisbi.com', 'notifications@wuxuaibonus.com', 'support@wuxuaibonus.com'
    );
    raise exception 'authenticated role executed service-only function';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
end;
$roles$;

rollback;
