-- Complete the existing staff_members model with individual Supabase Auth
-- identities. Legacy PIN rows remain intact until explicitly invited.

alter table public.staff_members
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists email text,
  add column if not exists account_status text not null default 'legacy',
  add column if not exists invited_at timestamptz,
  add column if not exists accepted_at timestamptz,
  add column if not exists last_invited_at timestamptz,
  add column if not exists invite_count integer not null default 0,
  add column if not exists suspended_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.staff_members
  drop constraint if exists staff_members_account_status_check,
  add constraint staff_members_account_status_check
    check (account_status in ('legacy', 'invited', 'active', 'suspended', 'archived')),
  drop constraint if exists staff_members_email_format_check,
  add constraint staff_members_email_format_check
    check (email is null or (
      email = lower(btrim(email))
      and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )),
  drop constraint if exists staff_members_invite_count_check,
  add constraint staff_members_invite_count_check check (invite_count >= 0);

create unique index if not exists staff_members_restaurant_email_uidx
  on public.staff_members (restaurant_id, lower(btrim(email)))
  where email is not null;
create unique index if not exists staff_members_restaurant_auth_user_uidx
  on public.staff_members (restaurant_id, auth_user_id)
  where auth_user_id is not null;
create index if not exists staff_members_auth_active_idx
  on public.staff_members (auth_user_id, restaurant_id)
  where auth_user_id is not null and active = true and account_status = 'active';

alter table public.restaurant_members
  drop constraint if exists restaurant_members_role_check;
alter table public.restaurant_members
  add constraint restaurant_members_role_check
  check (role in ('owner', 'admin', 'manager', 'staff', 'supervisor'));

create or replace function public.is_restaurant_member(input_restaurant_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = input_restaurant_id
      and rm.user_id = auth.uid()
      and (
        rm.role in ('owner', 'admin', 'manager')
        or (
          rm.role in ('staff', 'supervisor')
          and exists (
            select 1 from public.staff_members sm
            where sm.restaurant_id = rm.restaurant_id
              and sm.auth_user_id = rm.user_id
              and sm.active = true
              and sm.account_status = 'active'
              and sm.archived_at is null
          )
        )
      )
  );
$$;

create or replace function public.can_manage_restaurant_staff(input_restaurant_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from public.restaurant_members rm
    where rm.restaurant_id = input_restaurant_id
      and rm.user_id = auth.uid()
      and rm.role in ('owner', 'admin')
  );
$$;

revoke execute on function public.can_manage_restaurant_staff(uuid) from public, anon;
grant execute on function public.can_manage_restaurant_staff(uuid) to authenticated;

drop policy if exists "staff admin manage" on public.staff_members;
drop policy if exists "staff admin select" on public.staff_members;
create policy "staff admin select"
on public.staff_members for select
using (public.can_manage_restaurant_staff(restaurant_id));

drop policy if exists "restaurant members admin write" on public.restaurant_members;
drop policy if exists "restaurant members admin non staff write" on public.restaurant_members;
create policy "restaurant members admin non staff write"
on public.restaurant_members for all
using (public.is_restaurant_admin(restaurant_id) and role in ('owner', 'admin', 'manager'))
with check (public.is_restaurant_admin(restaurant_id) and role in ('owner', 'admin', 'manager'));

create or replace function public.get_owner_staff_members(input_restaurant_id uuid)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select case
    when not public.can_manage_restaurant_staff(input_restaurant_id) then
      jsonb_build_object('success', false, 'error_code', 'NOT_AUTHORIZED')
    else jsonb_build_object(
      'success', true,
      'staff', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', sm.id, 'name', sm.name, 'email', sm.email,
          'status', sm.account_status, 'role', sm.role,
          'invited_at', sm.invited_at, 'accepted_at', sm.accepted_at,
          'last_invited_at', sm.last_invited_at,
          'last_login_at', au.last_sign_in_at,
          'last_activity_at', greatest(au.last_sign_in_at, activity.last_points_action_at),
          'points_actions_count', coalesce(activity.points_actions_count, 0),
          'last_points_action_at', activity.last_points_action_at,
          'created_at', sm.created_at
        ) order by
          case sm.account_status when 'invited' then 1 when 'active' then 2 when 'suspended' then 3 else 4 end,
          lower(sm.name), sm.created_at)
        from public.staff_members sm
        left join auth.users au on au.id = sm.auth_user_id
        left join lateral (
          select count(*)::integer as points_actions_count,
            max(pt.created_at) as last_points_action_at
          from public.points_transactions pt
          where pt.restaurant_id = sm.restaurant_id
            and pt.staff_user_id = sm.auth_user_id
            and pt.type = 'earn'
        ) activity on true
        where sm.restaurant_id = input_restaurant_id and sm.email is not null
      ), '[]'::jsonb)
    )
  end;
$$;

create or replace function public.create_restaurant_staff_invitation(
  input_restaurant_id uuid,
  input_name text,
  input_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  normalized_name text := btrim(coalesce(input_name, ''));
  normalized_email text := lower(btrim(coalesce(input_email, '')));
  staff_record public.staff_members%rowtype;
begin
  if not public.can_manage_restaurant_staff(input_restaurant_id) then
    raise exception using errcode = '42501', message = 'STAFF_MANAGEMENT_NOT_AUTHORIZED';
  end if;
  if char_length(normalized_name) < 2 or char_length(normalized_name) > 120 then
    raise exception using errcode = '22023', message = 'STAFF_NAME_INVALID';
  end if;
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception using errcode = '22023', message = 'STAFF_EMAIL_INVALID';
  end if;

  select * into staff_record
  from public.staff_members
  where restaurant_id = input_restaurant_id
    and lower(btrim(email)) = normalized_email
  for update;

  if found then
    if staff_record.account_status = 'archived' then
      raise exception using errcode = '23505', message = 'STAFF_MEMBERSHIP_ARCHIVED';
    end if;
    raise exception using errcode = '23505', message = 'STAFF_EMAIL_ALREADY_EXISTS';
  end if;

  insert into public.staff_members (
    restaurant_id, name, pin_hash, role, active, auth_user_id, email,
    account_status, invited_at, last_invited_at, invite_count
  ) values (
    input_restaurant_id,
    normalized_name,
    extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')),
    'staff',
    false,
    null,
    normalized_email,
    'invited',
    now(),
    now(),
    1
  ) returning * into staff_record;

  return jsonb_build_object(
    'success', true,
    'staff_member_id', staff_record.id,
    'email', staff_record.email,
    'status', staff_record.account_status
  );
end;
$$;

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
  already_bound := staff_record.auth_user_id = input_auth_user_id;

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

create or replace function public.accept_my_restaurant_staff_invitation(
  input_staff_member_id uuid
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
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'STAFF_INVITE_NOT_AUTHENTICATED';
  end if;
  select * into staff_record from public.staff_members
  where id = input_staff_member_id
    and auth_user_id = auth.uid()
    and account_status = 'invited'
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'STAFF_INVITATION_NOT_FOUND';
  end if;
  select * into auth_record from auth.users where id = auth.uid();
  if not found or auth_record.email_confirmed_at is null
    or lower(btrim(auth_record.email)) is distinct from staff_record.email then
    raise exception using errcode = '42501', message = 'STAFF_AUTH_IDENTITY_NOT_VERIFIED';
  end if;
  select role into existing_role from public.restaurant_members
  where restaurant_id = staff_record.restaurant_id and user_id = auth.uid();
  if existing_role in ('owner', 'admin', 'manager') then
    raise exception using errcode = '42501', message = 'STAFF_ROLE_CONFLICT';
  end if;

  update public.staff_members
  set account_status = 'active', active = true,
      accepted_at = coalesce(accepted_at, now()), updated_at = now()
  where id = staff_record.id;
  insert into public.restaurant_members (restaurant_id, user_id, role)
  values (staff_record.restaurant_id, auth.uid(), 'staff')
  on conflict (restaurant_id, user_id) do update set role = excluded.role;
  insert into public.audit_log (
    restaurant_id, actor_type, actor_id, action, target_table, target_id, metadata
  ) values (
    staff_record.restaurant_id, 'staff', auth.uid(), 'STAFF_ACTIVATED',
    'staff_members', staff_record.id, jsonb_build_object('source', 'staff_invitation_acceptance')
  );
  return jsonb_build_object('success', true, 'restaurant_id', staff_record.restaurant_id);
end;
$$;

create or replace function public.get_restaurant_staff_invitation_for_resend(
  input_restaurant_id uuid,
  input_staff_member_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  staff_record public.staff_members%rowtype;
begin
  if not public.can_manage_restaurant_staff(input_restaurant_id) then
    raise exception using errcode = '42501', message = 'STAFF_MANAGEMENT_NOT_AUTHORIZED';
  end if;
  select * into staff_record from public.staff_members
  where id = input_staff_member_id and restaurant_id = input_restaurant_id
  for update;
  if not found or staff_record.account_status <> 'invited' or staff_record.email is null then
    raise exception using errcode = 'P0002', message = 'STAFF_INVITATION_NOT_FOUND';
  end if;
  if staff_record.last_invited_at > now() - interval '60 seconds' then
    raise exception using errcode = 'P0001', message = 'STAFF_INVITE_RATE_LIMITED';
  end if;
  return jsonb_build_object(
    'success', true,
    'email', staff_record.email,
    'auth_user_id', staff_record.auth_user_id
  );
end;
$$;

create or replace function public.mark_restaurant_staff_invitation_resent(
  input_restaurant_id uuid,
  input_staff_member_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  updated_record public.staff_members%rowtype;
begin
  if not public.can_manage_restaurant_staff(input_restaurant_id) then
    raise exception using errcode = '42501', message = 'STAFF_MANAGEMENT_NOT_AUTHORIZED';
  end if;
  update public.staff_members
  set last_invited_at = now(), invite_count = invite_count + 1, updated_at = now()
  where id = input_staff_member_id
    and restaurant_id = input_restaurant_id
    and account_status = 'invited'
  returning * into updated_record;
  if not found then
    raise exception using errcode = 'P0002', message = 'STAFF_INVITATION_NOT_FOUND';
  end if;

  insert into public.audit_log (
    restaurant_id, actor_type, actor_id, action, target_table, target_id, metadata
  ) values (
    input_restaurant_id, 'admin', auth.uid(), 'STAFF_INVITE_RESENT',
    'staff_members', updated_record.id,
    jsonb_build_object('invite_count', updated_record.invite_count)
  );
  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.set_restaurant_staff_membership_status(
  input_restaurant_id uuid,
  input_staff_member_id uuid,
  input_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  staff_record public.staff_members%rowtype;
  auth_record auth.users%rowtype;
  previous_status text;
  next_status text;
  audit_action text;
begin
  if not public.can_manage_restaurant_staff(input_restaurant_id) then
    raise exception using errcode = '42501', message = 'STAFF_MANAGEMENT_NOT_AUTHORIZED';
  end if;
  if input_action not in ('suspend', 'reactivate', 'archive') then
    raise exception using errcode = '22023', message = 'STAFF_ACTION_INVALID';
  end if;

  select * into staff_record from public.staff_members
  where id = input_staff_member_id and restaurant_id = input_restaurant_id
  for update;
  if not found or staff_record.email is null then
    raise exception using errcode = 'P0002', message = 'STAFF_MEMBERSHIP_NOT_FOUND';
  end if;
  previous_status := staff_record.account_status;

  if input_action = 'suspend' then
    if previous_status <> 'active' then
      raise exception using errcode = 'P0001', message = 'STAFF_SUSPEND_STATE_INVALID';
    end if;
    next_status := 'suspended';
    audit_action := 'STAFF_SUSPENDED';
  elsif input_action = 'reactivate' then
    if previous_status <> 'suspended' or staff_record.auth_user_id is null then
      raise exception using errcode = 'P0001', message = 'STAFF_REACTIVATE_STATE_INVALID';
    end if;
    select * into auth_record from auth.users where id = staff_record.auth_user_id;
    if not found or auth_record.email_confirmed_at is null
      or (auth_record.banned_until is not null and auth_record.banned_until > now()) then
      raise exception using errcode = '42501', message = 'STAFF_AUTH_IDENTITY_NOT_ACTIVE';
    end if;
    next_status := 'active';
    audit_action := 'STAFF_REACTIVATED';
  else
    if previous_status = 'archived' then
      return jsonb_build_object('success', true, 'status', 'archived');
    end if;
    next_status := 'archived';
    audit_action := 'STAFF_MEMBERSHIP_REMOVED';
  end if;

  update public.staff_members
  set account_status = next_status,
      active = (next_status = 'active'),
      suspended_at = case when next_status = 'suspended' then now() when next_status = 'active' then null else suspended_at end,
      archived_at = case when next_status = 'archived' then now() else archived_at end,
      updated_at = now()
  where id = staff_record.id;

  if next_status = 'archived' then
    delete from public.restaurant_members
    where restaurant_id = input_restaurant_id
      and user_id = staff_record.auth_user_id
      and role in ('staff', 'supervisor');
  elsif next_status = 'active' then
    insert into public.restaurant_members (restaurant_id, user_id, role)
    values (input_restaurant_id, staff_record.auth_user_id, 'staff')
    on conflict (restaurant_id, user_id) do update set role = excluded.role;
  end if;

  insert into public.audit_log (
    restaurant_id, actor_type, actor_id, action, target_table, target_id, metadata
  ) values (
    input_restaurant_id, 'admin', auth.uid(), audit_action,
    'staff_members', staff_record.id,
    jsonb_build_object('previous_status', previous_status, 'next_status', next_status)
  );
  return jsonb_build_object('success', true, 'status', next_status);
end;
$$;

revoke execute on function public.get_owner_staff_members(uuid) from public, anon;
revoke execute on function public.create_restaurant_staff_invitation(uuid, text, text) from public, anon;
revoke execute on function public.bind_restaurant_staff_auth_identity(uuid, uuid, uuid) from public, anon;
revoke execute on function public.accept_my_restaurant_staff_invitation(uuid) from public, anon;
revoke execute on function public.get_restaurant_staff_invitation_for_resend(uuid, uuid) from public, anon;
revoke execute on function public.mark_restaurant_staff_invitation_resent(uuid, uuid) from public, anon;
revoke execute on function public.set_restaurant_staff_membership_status(uuid, uuid, text) from public, anon;

grant execute on function public.get_owner_staff_members(uuid) to authenticated;
grant execute on function public.create_restaurant_staff_invitation(uuid, text, text) to authenticated;
grant execute on function public.bind_restaurant_staff_auth_identity(uuid, uuid, uuid) to authenticated;
grant execute on function public.accept_my_restaurant_staff_invitation(uuid) to authenticated;
grant execute on function public.get_restaurant_staff_invitation_for_resend(uuid, uuid) to authenticated;
grant execute on function public.mark_restaurant_staff_invitation_resent(uuid, uuid) to authenticated;
grant execute on function public.set_restaurant_staff_membership_status(uuid, uuid, text) to authenticated;

comment on function public.create_restaurant_staff_invitation(uuid, text, text)
  is 'Owner/admin-only creation of a pending tenant-bound staff invitation.';
comment on function public.bind_restaurant_staff_auth_identity(uuid, uuid, uuid)
  is 'Owner/admin-only binding of an exact staff-only Auth email identity to a pending membership.';
comment on function public.set_restaurant_staff_membership_status(uuid, uuid, text)
  is 'Owner/admin-only suspend, reactivate or archive transition with audit logging.';

notify pgrst, 'reload schema';
