-- Critical actions use the typed entity-name confirmation. Sensitive actions
-- continue to require the fixed CONFIRMED marker.

do $migration$
declare
  function_definition text;
  old_guard constant text := $guard$if severity_value <> 'NORMAL' and input_confirmation <> 'CONFIRMED' then$guard$;
  new_guard constant text := $guard$if severity_value = 'SENSITIVE' and input_confirmation <> 'CONFIRMED' then$guard$;
begin
  select pg_get_functiondef(
    'public.execute_platform_admin_operation(uuid,text,uuid,text,text,text,uuid,jsonb)'::regprocedure
  ) into function_definition;

  if position(old_guard in function_definition) = 0 then
    raise exception 'Expected Platform Admin confirmation guard was not found.';
  end if;

  function_definition := replace(function_definition, old_guard, new_guard);
  if position(old_guard in function_definition) > 0 then
    raise exception 'Platform Admin confirmation guard replacement was incomplete.';
  end if;

  execute function_definition;
end;
$migration$;

notify pgrst, 'reload schema';
