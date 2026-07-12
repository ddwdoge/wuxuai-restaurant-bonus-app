create or replace function public.apply_loyalty_staff_action(
  input_restaurant_id uuid,
  input_customer_id uuid,
  input_staff_pin text,
  input_loyalty_mode text,
  input_points integer default 0,
  input_stamps integer default 0,
  input_reason text default '',
  input_rule_id uuid default null,
  input_bill_amount numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_record public.staff_members%rowtype;
  settings_record public.loyalty_settings%rowtype;
  customer_record public.customers%rowtype;
  transaction_id uuid;
  audit_id uuid;
  next_points integer;
  next_stamps integer;
begin
  if not public.is_restaurant_admin(input_restaurant_id) then
    raise exception 'not allowed';
  end if;

  if input_restaurant_id is null or input_customer_id is null then
    raise exception 'restaurant_id and customer_id are required';
  end if;

  if coalesce(input_staff_pin, '') = '' then
    raise exception 'staff pin is required';
  end if;

  select *
  into settings_record
  from public.loyalty_settings
  where restaurant_id = input_restaurant_id
    and active = true;

  if settings_record.id is null then
    raise exception 'loyalty settings not found';
  end if;

  if settings_record.loyalty_mode <> input_loyalty_mode then
    raise exception 'loyalty mode mismatch';
  end if;

  select *
  into staff_record
  from public.staff_members
  where restaurant_id = input_restaurant_id
    and active = true
    and pin_hash = extensions.crypt(input_staff_pin, pin_hash)
  limit 1;

  if staff_record.id is null then
    raise exception 'invalid staff pin';
  end if;

  select *
  into customer_record
  from public.customers
  where id = input_customer_id
    and restaurant_id = input_restaurant_id;

  if customer_record.id is null then
    raise exception 'customer not found for restaurant';
  end if;

  if input_loyalty_mode in ('amount_based', 'menu_points') then
    if coalesce(input_points, 0) <= 0 or coalesce(input_stamps, 0) <> 0 then
      raise exception 'points action requires positive points and zero stamps';
    end if;

    insert into public.points_transactions (
      restaurant_id,
      customer_id,
      staff_member_id,
      type,
      points,
      reason
    )
    values (
      input_restaurant_id,
      input_customer_id,
      staff_record.id,
      'earn',
      input_points,
      coalesce(input_reason, '')
    )
    returning id into transaction_id;

    update public.customers
    set points_balance = points_balance + input_points
    where id = input_customer_id
      and restaurant_id = input_restaurant_id
    returning points_balance, stamp_balance into next_points, next_stamps;
  elsif input_loyalty_mode = 'stamp_based' then
    if coalesce(input_stamps, 0) <= 0 or coalesce(input_points, 0) <> 0 then
      raise exception 'stamp action requires positive stamps and zero points';
    end if;

    insert into public.stamp_transactions (
      restaurant_id,
      customer_id,
      staff_member_id,
      stamps,
      reason
    )
    values (
      input_restaurant_id,
      input_customer_id,
      staff_record.id,
      input_stamps,
      coalesce(input_reason, '')
    )
    returning id into transaction_id;

    update public.customers
    set stamp_balance = stamp_balance + input_stamps
    where id = input_customer_id
      and restaurant_id = input_restaurant_id
    returning points_balance, stamp_balance into next_points, next_stamps;
  else
    raise exception 'unsupported loyalty mode';
  end if;

  insert into public.audit_log (
    restaurant_id,
    actor_type,
    actor_id,
    action,
    target_table,
    target_id,
    metadata
  )
  values (
    input_restaurant_id,
    'staff',
    staff_record.id,
    'staff_loyalty_credit',
    'customers',
    input_customer_id,
    jsonb_build_object(
      'loyalty_mode', input_loyalty_mode,
      'points', input_points,
      'stamps', input_stamps,
      'reason', coalesce(input_reason, ''),
      'rule_id', input_rule_id,
      'bill_amount', input_bill_amount,
      'transaction_id', transaction_id
    )
  )
  returning id into audit_id;

  return jsonb_build_object(
    'points_added', input_points,
    'stamps_added', input_stamps,
    'points_balance', next_points,
    'stamp_balance', next_stamps,
    'transaction_id', transaction_id,
    'audit_id', audit_id
  );
end;
$$;

grant execute on function public.apply_loyalty_staff_action(uuid, uuid, text, text, integer, integer, text, uuid, numeric)
to authenticated;
