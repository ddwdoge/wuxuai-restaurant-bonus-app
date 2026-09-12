-- LOCAL ONLY: substitutes identity helpers inside a rolled-back transaction.
\set ON_ERROR_STOP on
begin;
create or replace function auth.uid() returns uuid language sql stable
as $$ select '00000000-0000-4000-8000-000000000001'::uuid $$;
create or replace function public.current_platform_role() returns text language sql stable
as $$ select nullif(current_setting('test.platform_role', true), '') $$;
do $$
declare
  role_value text;
  confirmation_value text;
  at_value timestamptz := '2026-09-10 12:00:00+00';
  result jsonb;
begin
  foreach role_value in array array['', 'owner', 'staff', 'customer'] loop
    perform set_config('test.platform_role', role_value, true);
    begin
      perform public.set_platform_restaurant_plan_override(null, 'PRO', at_value + interval '10 years',
        'Isolated negative regression', 'CONFIRMED', '00000000-0000-4000-8000-000000000002');
      raise exception 'Unauthorized role passed';
    exception when insufficient_privilege then null;
    end;
  end loop;
  perform set_config('test.platform_role', 'platform_admin', true);
  foreach confirmation_value in array array[null::text, '', 'confirmed', ' CONFIRMED'] loop
    begin
      perform public.set_platform_restaurant_plan_override(null, 'PRO', at_value + interval '10 years',
        'Isolated negative regression', confirmation_value, '00000000-0000-4000-8000-000000000002');
      raise exception 'Missing confirmation passed';
    exception when raise_exception then
      if sqlerrm <> 'Bestätigung fehlt.' then raise; end if;
    end;
  end loop;
  result := public.resolve_subscription_plan_lifecycle_internal('PRO', 'trialing', 'not_required',
    at_value + interval '1 day', at_value + interval '2 days', null, null, at_value, at_value);
  assert (result->>'eligible')::boolean = false, 'Future trial must not activate';
  result := public.resolve_subscription_plan_lifecycle_internal('PRO', 'trialing', 'not_required',
    null, at_value + interval '2 days', null, null, null, at_value);
  assert (result->>'eligible')::boolean = false, 'Unknown trial start must fail closed';
  result := public.resolve_subscription_plan_lifecycle_internal('PRO', 'trialing', 'not_required',
    at_value, at_value + interval '2 days', null, null, at_value, at_value);
  assert (result->>'eligible')::boolean = true, 'Trial activates at start';
end $$;
rollback;
select 'NULL_GUARD_SQL_11_CASES_PASS' as result;
