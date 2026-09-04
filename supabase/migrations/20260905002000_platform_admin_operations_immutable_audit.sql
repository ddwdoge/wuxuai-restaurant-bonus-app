-- Platform Admin Operations V1.1: audit entries are append-only.

create or replace function public.protect_platform_admin_operations_audit()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Platform-Operations-Audit ist unveränderbar.' using errcode = '42501';
end;
$$;

drop trigger if exists protect_platform_admin_operations_audit on public.platform_admin_operations;
create trigger protect_platform_admin_operations_audit
before update or delete on public.platform_admin_operations
for each row execute function public.protect_platform_admin_operations_audit();

create or replace function public.record_platform_auth_support_operation(
  input_restaurant_id uuid,
  input_action text,
  input_entity_id uuid,
  input_reason text,
  input_support_reference text,
  input_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare operation_id_value uuid;
begin
  if not public.platform_operation_role_can_write(input_action) then raise exception 'Nicht berechtigt.' using errcode='42501'; end if;
  if input_action not in ('owner_confirmation_resend','owner_password_recovery','staff_invitation_resend') then raise exception 'Aktion ist nicht freigegeben.'; end if;
  if length(trim(coalesce(input_reason,''))) < 10 then raise exception 'Begründung fehlt.'; end if;

  select id into operation_id_value
  from public.platform_admin_operations
  where platform_admin_user_id = auth.uid()
    and action_type = input_action
    and tenant_id = input_restaurant_id
    and idempotency_key = input_idempotency_key;
  if operation_id_value is not null then return operation_id_value; end if;

  insert into public.platform_admin_operations (
    platform_admin_user_id, platform_admin_role, action_type, entity_type, entity_id, tenant_id,
    severity, reason, support_reference, after_state, result, idempotency_key
  ) values (
    auth.uid(), public.current_platform_role(), input_action,
    case when input_action like 'owner_%' then 'owner' else 'staff' end,
    input_entity_id, input_restaurant_id, 'SENSITIVE', trim(input_reason),
    nullif(trim(coalesce(input_support_reference,'')),''), jsonb_build_object('delivery_requested', true),
    'SUCCESS', input_idempotency_key
  ) returning id into operation_id_value;
  return operation_id_value;
end;
$$;

revoke execute on function public.record_platform_auth_support_operation(uuid,text,uuid,text,text,uuid) from public, anon;
grant execute on function public.record_platform_auth_support_operation(uuid,text,uuid,text,text,uuid) to authenticated;
