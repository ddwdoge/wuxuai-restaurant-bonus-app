-- Allow legitimate restaurant operators to use their own operational Staff
-- Portal without creating or impersonating a Staff identity.

create or replace function public.get_my_staff_restaurant_access(input_restaurant_slug text)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select case
    when auth.uid() is null then
      jsonb_build_object('success', false, 'error_code', 'AUTH_REQUIRED')
    else coalesce((
      select jsonb_strip_nulls(jsonb_build_object(
        'success', true,
        'restaurant_id', r.id,
        'restaurant_name', r.name,
        'restaurant_slug', r.slug,
        'access_mode', case
          when rm.role in ('owner', 'admin', 'manager') then 'operator'
          else 'staff'
        end,
        'restaurant_role', rm.role,
        'staff_role', case
          when rm.role in ('staff', 'supervisor') then rm.role
          else null
        end
      ))
      from public.restaurants r
      join public.restaurant_members rm
        on rm.restaurant_id = r.id
       and rm.user_id = auth.uid()
       and (
         rm.role in ('owner', 'admin', 'manager')
         or (
           rm.role in ('staff', 'supervisor')
           and exists (
             select 1
             from public.staff_members sm
             where sm.restaurant_id = r.id
               and sm.auth_user_id = auth.uid()
               and sm.active = true
               and sm.account_status = 'active'
               and sm.archived_at is null
           )
         )
       )
      where r.slug = lower(btrim(input_restaurant_slug))
        and r.status = 'active'
        and char_length(btrim(input_restaurant_slug)) between 1 and 160
      limit 1
    ), jsonb_build_object('success', false, 'error_code', 'STAFF_ACCESS_DENIED'))
  end;
$$;

revoke all on function public.get_my_staff_restaurant_access(text)
from public, anon, authenticated;
grant execute on function public.get_my_staff_restaurant_access(text)
to authenticated;

comment on function public.get_my_staff_restaurant_access(text) is
  'Resolves exact operational Staff Portal access for active Staff or an authoritative operator relationship at one active restaurant.';

-- Existing operational RPCs record auth.uid() correctly, but some legacy calls
-- label every Staff Portal action as Staff. Normalize only authenticated owner,
-- admin or manager actions for the same restaurant; all other audit contracts
-- remain unchanged.
create or replace function public.write_audit_event(
  input_restaurant_id uuid,
  input_customer_id uuid,
  input_actor_type text,
  input_actor_id uuid,
  input_event_type text,
  input_status text,
  input_source text,
  input_entity_type text,
  input_entity_id uuid,
  input_request_id uuid,
  input_metadata jsonb default '{}'::jsonb,
  input_error_code text default null,
  input_error_message text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  restaurant_record public.restaurants%rowtype;
  actor_type_value text := input_actor_type;
  actor_restaurant_role text;
  metadata_value jsonb := coalesce(input_metadata, '{}'::jsonb);
  audit_id uuid;
begin
  select * into restaurant_record
  from public.restaurants r
  where r.id = input_restaurant_id;
  if restaurant_record.id is null then return null; end if;

  if input_actor_type = 'staff'
    and input_actor_id is not null
    and input_actor_id = auth.uid() then
    select rm.role into actor_restaurant_role
    from public.restaurant_members rm
    where rm.restaurant_id = input_restaurant_id
      and rm.user_id = input_actor_id
      and rm.role in ('owner', 'admin', 'manager')
    limit 1;

    if actor_restaurant_role is not null then
      actor_type_value := 'admin';
      metadata_value := metadata_value || jsonb_build_object(
        'actor_restaurant_role', actor_restaurant_role,
        'operational_access_mode', 'operator'
      );
    end if;
  end if;

  insert into public.audit_log (
    restaurant_id, organization_id, branch_id, customer_id, actor_type, actor_id,
    action, event_type, status, source, target_table, target_id, entity_type,
    entity_id, request_id, metadata, error_code, error_message
  ) values (
    restaurant_record.id, restaurant_record.organization_id,
    restaurant_record.primary_branch_id, input_customer_id, actor_type_value,
    input_actor_id, lower(input_event_type), input_event_type, input_status,
    input_source, input_entity_type, input_entity_id, input_entity_type,
    input_entity_id, input_request_id, metadata_value, input_error_code,
    input_error_message
  ) returning id into audit_id;

  return audit_id;
end;
$$;

revoke execute on function public.write_audit_event(
  uuid, uuid, text, uuid, text, text, text, text, uuid, uuid, jsonb, text, text
) from public, anon, authenticated;

notify pgrst, 'reload schema';
