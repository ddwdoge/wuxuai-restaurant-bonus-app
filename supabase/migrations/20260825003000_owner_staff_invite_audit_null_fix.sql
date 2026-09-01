-- Preserve the existing owner/staff authorization contract while ensuring the
-- first auth identity binding emits its dedicated invitation audit event.
create or replace function public.bind_restaurant_staff_auth_identity(
  input_restaurant_id uuid,
  input_staff_member_id uuid,
  input_auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  staff_record public.staff_members%rowtype;
  auth_record auth.users%rowtype;
  existing_role text;
  next_status text;
  already_bound boolean;
begin
  if not public.can_manage_restaurant_staff(input_restaurant_id) then
    raise exception using errcode = '42501', message = 'STAFF_MANAGEMENT_NOT_AUTHORIZED';
  end if;

  select * into staff_record
  from public.staff_members
  where id = input_staff_member_id
    and restaurant_id = input_restaurant_id
  for update;
  if not found or staff_record.account_status = 'archived' then
    raise exception using errcode = 'P0002', message = 'STAFF_MEMBERSHIP_NOT_FOUND';
  end if;
  if staff_record.auth_user_id is not null and staff_record.auth_user_id <> input_auth_user_id then
    raise exception using errcode = '42501', message = 'STAFF_AUTH_IDENTITY_MISMATCH';
  end if;
  already_bound := staff_record.auth_user_id is not distinct from input_auth_user_id;

  select * into auth_record from auth.users where id = input_auth_user_id;
  if not found or lower(btrim(auth_record.email)) is distinct from staff_record.email then
    raise exception using errcode = '42501', message = 'STAFF_AUTH_IDENTITY_MISMATCH';
  end if;

  if exists (select 1 from public.restaurants r where r.owner_id = input_auth_user_id)
    or exists (
      select 1 from public.restaurant_members rm
      where rm.user_id = input_auth_user_id and rm.role in ('owner', 'admin', 'manager')
    )
    or exists (
      select 1 from public.platform_admins pa
      where pa.user_id = input_auth_user_id and pa.active = true
    )
    or exists (
      select 1 from public.customer_accounts ca
      where ca.auth_user_id = input_auth_user_id and ca.disabled_at is null
    )
    then
    raise exception using errcode = '42501', message = 'STAFF_AUTH_IDENTITY_ROLE_CONFLICT';
  end if;

  select role into existing_role
  from public.restaurant_members
  where restaurant_id = input_restaurant_id and user_id = input_auth_user_id;
  if existing_role in ('owner', 'admin', 'manager') then
    raise exception using errcode = '42501', message = 'STAFF_ROLE_CONFLICT';
  end if;

  next_status := 'invited';
  update public.staff_members
  set auth_user_id = input_auth_user_id,
      account_status = next_status,
      active = false,
      updated_at = now()
  where id = staff_record.id
  returning * into staff_record;

  if not already_bound then
    insert into public.audit_log (
      restaurant_id, actor_type, actor_id, action, target_table, target_id, metadata
    ) values (
      input_restaurant_id, 'admin', auth.uid(), 'STAFF_INVITED',
      'staff_members', staff_record.id,
      jsonb_build_object('status', next_status, 'role', 'staff')
    );
  end if;

  return jsonb_build_object('success', true, 'status', next_status);
end;
$$;

revoke all on function public.bind_restaurant_staff_auth_identity(uuid, uuid, uuid) from public, anon;
grant execute on function public.bind_restaurant_staff_auth_identity(uuid, uuid, uuid) to authenticated;
