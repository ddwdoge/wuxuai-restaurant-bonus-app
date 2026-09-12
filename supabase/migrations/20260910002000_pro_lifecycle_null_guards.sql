-- Forward-only correction of Phase 1 NULL guards and trial start validation.
-- Existing data, function signatures, grants and RLS remain unchanged.
do $migration$
declare
  target regprocedure;
  definition text;
  old_guard text;
  new_guard text;
  change_record record;
begin
  for change_record in
    select * from (values
      ('public.set_platform_restaurant_plan_override(uuid,text,timestamptz,text,text,uuid)',
       'or role_value not in', 'or role_value is null or role_value not in'),
      ('public.set_platform_restaurant_plan_override(uuid,text,timestamptz,text,text,uuid)',
       'if input_confirmation <> ''CONFIRMED'' then',
       'if input_confirmation is distinct from ''CONFIRMED'' then'),
      ('public.resolve_subscription_plan_lifecycle_internal(text,text,text,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz)',
       'if payment_value = ''not_required'' and input_trial_ends_at > input_at then',
       'if payment_value = ''not_required'' and input_trial_ends_at > input_at and coalesce(input_trial_started_at, input_subscription_created_at) <= input_at then')
    ) as changes(signature, old_value, new_value)
  loop
    target := change_record.signature::regprocedure;
    definition := pg_get_functiondef(target);
    old_guard := change_record.old_value;
    new_guard := change_record.new_value;
    if strpos(definition, new_guard) > 0 then
      continue;
    end if;
    if strpos(definition, old_guard) = 0 then
      raise exception 'Unexpected PRO Phase 1 function definition: %', target;
    end if;
    execute replace(definition, old_guard, new_guard);
  end loop;
end;
$migration$;

notify pgrst, 'reload schema';
