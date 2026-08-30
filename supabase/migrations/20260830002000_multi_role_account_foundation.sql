-- One confirmed Supabase Auth identity may own independent customer, operator,
-- staff and platform relationships. Tenant membership remains authoritative.

create or replace function public.activate_authenticated_customer_account(
  input_first_name text,
  input_phone text,
  input_birthday date default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  user_record auth.users%rowtype;
  account_record public.customer_accounts%rowtype;
  first_name_value text := btrim(coalesce(input_first_name, ''));
  phone_value text := public.normalize_customer_phone(input_phone);
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'CUSTOMER_AUTH_REQUIRED';
  end if;

  select * into user_record from auth.users where id = auth.uid();
  if not found or user_record.email_confirmed_at is null then
    raise exception using errcode = '42501', message = 'CUSTOMER_EMAIL_CONFIRMATION_REQUIRED';
  end if;
  if first_name_value = '' or char_length(first_name_value) > 80 then
    raise exception using errcode = '22023', message = 'CUSTOMER_PROFILE_INCOMPLETE';
  end if;
  if phone_value is null then
    raise exception using errcode = '22023', message = 'CUSTOMER_PROFILE_PHONE_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('customer-account:' || auth.uid()::text, 0));

  select * into account_record
  from public.customer_accounts
  where auth_user_id = auth.uid() and disabled_at is null
  for update;

  if found then
    update public.customer_accounts
    set email = lower(user_record.email),
        email_confirmed_at = user_record.email_confirmed_at,
        first_name = coalesce(nullif(first_name, ''), first_name_value),
        phone = coalesce(phone, phone_value),
        normalized_phone = coalesce(normalized_phone, phone_value),
        birthday = coalesce(birthday, input_birthday),
        last_seen_at = now()
    where id = account_record.id
    returning * into account_record;
  else
    insert into public.customer_accounts (
      auth_user_id, email, email_confirmed_at, first_name, phone,
      normalized_phone, birthday
    ) values (
      auth.uid(), lower(user_record.email), user_record.email_confirmed_at,
      first_name_value, phone_value, phone_value, input_birthday
    ) returning * into account_record;
  end if;

  insert into public.customer_account_emails (
    account_id, email, status, confirmed_at, updated_at
  ) values (
    account_record.id, lower(user_record.email), 'CONFIRMED',
    user_record.email_confirmed_at, now()
  ) on conflict (account_id) do update
    set email = excluded.email,
        status = 'CONFIRMED',
        confirmed_at = excluded.confirmed_at,
        updated_at = now();

  return account_record.id;
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'CUSTOMER_ACCOUNT_ALREADY_EXISTS';
end;
$$;

revoke all on function public.activate_authenticated_customer_account(text, text, date)
from public, anon, authenticated;
grant execute on function public.activate_authenticated_customer_account(text, text, date)
to authenticated;

comment on function public.activate_authenticated_customer_account(text, text, date) is
  'Idempotently adds the customer profile to the current confirmed Auth identity without changing other roles.';

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
  already_bound boolean;
begin
  if not public.can_manage_restaurant_staff(input_restaurant_id) then
    raise exception using errcode = '42501', message = 'STAFF_MANAGEMENT_NOT_AUTHORIZED';
  end if;

  select * into staff_record from public.staff_members
  where id = input_staff_member_id and restaurant_id = input_restaurant_id
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

  select role into existing_role from public.restaurant_members
  where restaurant_id = input_restaurant_id and user_id = input_auth_user_id;
  if existing_role in ('owner', 'admin', 'manager') then
    raise exception using errcode = '42501', message = 'STAFF_ROLE_CONFLICT';
  end if;

  update public.staff_members
  set auth_user_id = input_auth_user_id,
      account_status = 'invited',
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
      jsonb_build_object('status', 'invited', 'role', 'staff')
    );
  end if;

  return jsonb_build_object('success', true, 'status', 'invited');
end;
$$;

revoke all on function public.bind_restaurant_staff_auth_identity(uuid, uuid, uuid)
from public, anon, authenticated;
grant execute on function public.bind_restaurant_staff_auth_identity(uuid, uuid, uuid)
to authenticated;

notify pgrst, 'reload schema';
