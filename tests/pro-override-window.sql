-- LOCAL ONLY: synthetic fixture schema; identity stubs are rolled back.
-- Never execute this script against Staging or Production.
\set ON_ERROR_STOP on
begin;
create temporary table phase1c_checks (label text primary key);
create function pg_temp.check_case(ok boolean, label text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAILED: %', label; end if;
  insert into phase1c_checks values (label);
end;
$$;
create function pg_temp.expect_error(statement text, expected_state text, label text) returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if sqlstate <> expected_state then raise; end if;
    perform pg_temp.check_case(true, label);
    return;
  end;
  raise exception 'Expected blocked request: %', label;
end;
$$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.actor', true), '')::uuid;
$$;
create or replace function public.current_platform_role() returns text language sql stable as $$
  select nullif(current_setting('test.role', true), '');
$$;

do $test$
declare
  actor uuid := '10000000-0000-4000-8000-000000000001';
  tenant uuid := '10000000-0000-4000-8000-000000000002';
  branch uuid := '10000000-0000-4000-8000-000000000003';
  subscription uuid := '10000000-0000-4000-8000-000000000004';
  other_tenant uuid := '10000000-0000-4000-8000-000000000012';
  other_branch uuid := '10000000-0000-4000-8000-000000000013';
  future_key uuid := '10000000-0000-4000-8000-000000000021';
  immediate_key uuid := '10000000-0000-4000-8000-000000000022';
  end_key uuid := '10000000-0000-4000-8000-000000000023';
  later_key uuid := '10000000-0000-4000-8000-000000000024';
  expiry timestamptz := now() + interval '2 days';
  future_start timestamptz := now() + interval '1 day';
  response_value jsonb;
  replay jsonb;
  initial_subscription jsonb;
  initial_features jsonb;
  future_id uuid;
  current_id uuid;
  role_name text;
  statement text;
begin
  insert into auth.users(id) values (actor);
  insert into public.restaurants(id) values (tenant), (other_tenant);
  insert into public.branches(id, restaurant_id) values (branch, tenant), (other_branch, other_tenant);
  update public.restaurants set primary_branch_id = branch where id = tenant;
  update public.restaurants set primary_branch_id = other_branch where id = other_tenant;
  insert into public.branch_subscriptions(id, branch_id, plan_key, trial_started_at, trial_ends_at)
    values (subscription, branch, 'BASIC', now() - interval '1 day', now() + interval '1 month');
  insert into public.branch_subscriptions(branch_id, plan_key, trial_started_at, trial_ends_at)
    values (other_branch, 'BASIC', now() - interval '1 day', now() + interval '1 month');
  select to_jsonb(s) into initial_subscription from public.branch_subscriptions s where id = subscription;
  perform set_config('test.actor', actor::text, true);
  perform set_config('test.role', 'platform_admin', true);
  perform pg_temp.check_case(public.resolve_restaurant_entitlements_internal(tenant)->>'plan_key' = 'BASIC', 'basic baseline');

  statement := format('select public.set_platform_restaurant_plan_override(%L,''PRO'',%L,''Phase 1C isolated test'',''CONFIRMED'',%L,null)', tenant, expiry, immediate_key);
  foreach role_name in array array['', 'owner', 'staff', 'customer', 'viewer', 'support'] loop
    perform set_config('test.role', role_name, true);
    perform pg_temp.expect_error(statement, '42501', 'activate role blocked: ' || role_name);
    perform pg_temp.expect_error(format('select public.end_platform_restaurant_plan_override(%L,%L,''Phase 1C isolated end'',''CONFIRMED'',%L)', tenant, immediate_key, end_key), '42501', 'end role blocked: ' || role_name);
  end loop;
  perform set_config('test.role', 'platform_admin', true);
  perform set_config('test.actor', '', true);
  perform pg_temp.expect_error(statement, '42501', 'missing actor blocked');
  perform set_config('test.actor', actor::text, true);
  perform pg_temp.expect_error(replace(statement, '''PRO''', '''PREMIUM'''), 'P0001', 'premium blocked');
  perform pg_temp.expect_error(replace(statement, '''PRO''', '''BASIC'''), '22023', 'activation is PRO only');
  perform pg_temp.expect_error(replace(statement, '''CONFIRMED''', 'null'), '22023', 'null confirmation blocked');
  perform pg_temp.expect_error(replace(statement, '''Phase 1C isolated test''', '''short'''), '22023', 'short reason blocked');
  perform pg_temp.expect_error(format('select public.set_platform_restaurant_plan_override(%L,''PRO'',null,''Phase 1C isolated test'',''CONFIRMED'',%L,null)', tenant, immediate_key), '22023', 'missing expiry blocked');
  perform pg_temp.expect_error(format('select public.set_platform_restaurant_plan_override(%L,''PRO'',''infinity'',''Phase 1C isolated test'',''CONFIRMED'',%L,null)', tenant, immediate_key), '22023', 'infinite expiry blocked');
  perform pg_temp.expect_error(format('select public.set_platform_restaurant_plan_override(%L,''PRO'',%L,''Phase 1C isolated test'',''CONFIRMED'',%L,%L)', tenant, expiry, immediate_key, expiry), '22023', 'start equal expiry blocked');
  perform pg_temp.expect_error(format('select public.set_platform_restaurant_plan_override(%L,''PRO'',%L,''Phase 1C isolated test'',''CONFIRMED'',%L,%L)', tenant, expiry, immediate_key, now() - interval '1 day'), '22023', 'past start blocked');

  response_value := public.set_platform_restaurant_plan_override(tenant, 'PRO', expiry, 'Phase 1C future test', 'CONFIRMED', future_key, future_start);
  future_id := (response_value#>>'{entitlements,override,id}')::uuid;
  perform pg_temp.check_case(response_value#>>'{entitlements,plan_key}' = 'BASIC' and response_value#>>'{entitlements,override,status}' = 'NOT_STARTED', 'future not active');
  perform pg_temp.check_case((response_value#>>'{entitlements,override,effective_from}')::timestamptz = future_start, 'chosen start preserved');
  response_value := public.set_platform_restaurant_plan_override(tenant, 'PRO', expiry, 'Phase 1C isolated test', 'CONFIRMED', immediate_key, null);
  current_id := (response_value#>>'{entitlements,override,id}')::uuid;
  perform pg_temp.check_case(response_value#>>'{entitlements,plan_key}' = 'PRO' and response_value#>>'{entitlements,entitlement_source}' = 'PLATFORM_ADMIN_OVERRIDE', 'immediate PRO active');
  perform pg_temp.check_case(response_value#>>'{entitlements,effective,offer_limit_unlimited}' = 'true'
    and response_value#>>'{entitlements,effective,offer_notifications}' = 'true'
    and response_value#>>'{entitlements,effective,reward_notifications}' = 'true', 'one-click catalog PRO');
  replay := public.set_platform_restaurant_plan_override(tenant, 'PRO', expiry, 'Phase 1C isolated test', 'CONFIRMED', immediate_key, null);
  perform pg_temp.check_case(replay->>'idempotent' = 'true' and replay->>'operation_id' = response_value->>'operation_id', 'activation replay one operation');
  perform pg_temp.expect_error(replace(statement, '''Phase 1C isolated test''', '''Different test reason'''), '22023', 'activation key payload collision blocked');
  perform pg_temp.expect_error(format('select public.end_platform_restaurant_plan_override(%L,%L,''Phase 1C isolated end'',''CONFIRMED'',%L)', tenant, future_id, end_key), '40001', 'stale end cannot clear replacement');
  perform pg_temp.expect_error(format('select public.end_platform_restaurant_plan_override(%L,%L,''Phase 1C isolated end'',''CONFIRMED'',%L)', other_tenant, current_id, end_key), '40001', 'foreign override target blocked');
  perform pg_temp.check_case(exists(select 1 from public.platform_admin_operations where id = (response_value->>'operation_id')::uuid
    and platform_admin_user_id = actor and entity_id = current_id and tenant_id = tenant and reason = 'Phase 1C isolated test'
    and before_state->>'plan_key' = 'BASIC' and after_state->>'plan_key' = 'PRO'), 'activation audit complete');

  response_value := public.end_platform_restaurant_plan_override(tenant, current_id, 'Phase 1C isolated end', 'CONFIRMED', end_key);
  perform pg_temp.check_case(response_value#>>'{entitlements,plan_key}' = 'BASIC' and response_value#>>'{entitlements,override,id}' is null, 'targeted end restores BASIC');
  replay := public.end_platform_restaurant_plan_override(tenant, current_id, 'Phase 1C isolated end', 'CONFIRMED', end_key);
  perform pg_temp.check_case(replay->>'idempotent' = 'true' and replay->>'operation_id' = response_value->>'operation_id', 'end replay one operation');
  perform pg_temp.check_case((select count(*) from public.platform_admin_operations where tenant_id = tenant) = 3, 'exactly three actions audited');
  perform pg_temp.check_case((select to_jsonb(s) from public.branch_subscriptions s where id = subscription) = initial_subscription, 'subscription untouched');

  -- Local fixture only: an independent support exception must retain its window.
  update public.branch_entitlement_overrides set offer_limit = 3, offer_limit_unlimited = false,
    reward_notifications = false, effective_from = now() - interval '1 day', expires_at = now() + interval '5 days'
    where subscription_id = subscription;
  select to_jsonb(o) - array['plan_override_id','plan_override_key','plan_effective_from','plan_effective_until']
    into initial_features from public.branch_entitlement_overrides o where subscription_id = subscription;
  response_value := public.set_platform_restaurant_plan_override(tenant, 'PRO', expiry, 'Phase 1C support test', 'CONFIRMED', later_key, null);
  current_id := (response_value#>>'{entitlements,override,id}')::uuid;
  perform public.end_platform_restaurant_plan_override(tenant, current_id, 'Phase 1C support cleanup', 'CONFIRMED', extensions.gen_random_uuid());
  perform pg_temp.check_case((select to_jsonb(o) - array['plan_override_id','plan_override_key','plan_effective_from','plan_effective_until']
    from public.branch_entitlement_overrides o where subscription_id = subscription) = initial_features, 'support values window provenance preserved');
  replay := public.set_platform_restaurant_plan_override(tenant, 'PRO', expiry, 'Phase 1C support test', 'CONFIRMED', later_key, null);
  perform pg_temp.check_case(replay->>'idempotent' = 'true' and replay#>>'{entitlements,plan_key}' = 'BASIC', 'activation replay after end never reactivates');

  update public.branch_entitlement_overrides set plan_override_key = 'PRO', plan_override_id = null,
    plan_effective_from = null, plan_effective_until = null where subscription_id = subscription;
  response_value := public.resolve_restaurant_entitlements_internal(tenant);
  perform pg_temp.check_case(response_value->>'plan_key' = 'BASIC' and response_value->>'override_status' = 'INVALID_WINDOW', 'incomplete legacy grant fails closed');
  update public.branch_entitlement_overrides set plan_override_id = extensions.gen_random_uuid(),
    plan_effective_from = now() - interval '2 days', plan_effective_until = now() - interval '1 day'
    where subscription_id = subscription;
  response_value := public.resolve_restaurant_entitlements_internal(tenant);
  perform pg_temp.check_case(response_value->>'plan_key' = 'BASIC' and response_value->>'override_status' = 'EXPIRED', 'expired grant falls back automatically');
  update public.branch_subscriptions set plan_key = 'PRO', subscription_status = 'active', payment_status = 'paid', current_period_end = expiry where id = subscription;
  response_value := public.set_platform_restaurant_plan_override(tenant, 'PRO', expiry, 'Phase 1C paid plan test', 'CONFIRMED', extensions.gen_random_uuid(), null);
  response_value := public.end_platform_restaurant_plan_override(tenant, (response_value#>>'{entitlements,override,id}')::uuid, 'Phase 1C paid plan end', 'CONFIRMED', extensions.gen_random_uuid());
  perform pg_temp.check_case(response_value#>>'{entitlements,plan_key}' = 'PRO' and response_value#>>'{entitlements,entitlement_source}' = 'PAID_PLAN', 'ending preserves underlying paid PRO');

  perform pg_temp.check_case(not has_function_privilege('authenticated', 'public.update_platform_restaurant_entitlements(uuid,text,text,integer,boolean,boolean,text,text,uuid)', 'EXECUTE'), 'old direct bypass revoked');
  perform pg_temp.check_case(not has_function_privilege('authenticated', 'public.set_platform_restaurant_plan_override(uuid,text,timestamptz,text,text,uuid)', 'EXECUTE'), 'old six-argument RPC revoked');
  perform pg_temp.check_case(not has_function_privilege('anon', 'public.set_platform_restaurant_plan_override(uuid,text,timestamptz,text,text,uuid,timestamptz)', 'EXECUTE'), 'anon activation grant blocked');
  perform pg_temp.check_case(not has_function_privilege('anon', 'public.end_platform_restaurant_plan_override(uuid,uuid,text,text,uuid)', 'EXECUTE'), 'anon termination grant blocked');
  perform pg_temp.check_case(not has_table_privilege('authenticated', 'public.branch_entitlement_overrides', 'INSERT,UPDATE,DELETE'), 'browser DML blocked');
end;
$test$;
select count(*) as passed_sql_cases from phase1c_checks;
rollback;
