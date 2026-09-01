alter table public.customer_rewards
add column if not exists staff_member_id uuid references public.staff_members(id) on delete set null;

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

  if exists (
    select 1
    from public.audit_log a
    where a.restaurant_id = input_restaurant_id
      and a.actor_type = 'staff'
      and a.actor_id = staff_record.id
      and a.action = 'staff_loyalty_credit'
      and a.target_id = input_customer_id
      and a.created_at > now() - interval '30 seconds'
      and a.metadata->>'loyalty_mode' = input_loyalty_mode
      and coalesce(a.metadata->>'reason', '') = coalesce(input_reason, '')
      and coalesce((a.metadata->>'points')::integer, 0) = coalesce(input_points, 0)
      and coalesce((a.metadata->>'stamps')::integer, 0) = coalesce(input_stamps, 0)
  ) then
    raise exception 'duplicate staff action blocked';
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
    'staff_member_id', staff_record.id,
    'staff_member_name', staff_record.name,
    'points_added', input_points,
    'stamps_added', input_stamps,
    'points_balance', next_points,
    'stamp_balance', next_stamps,
    'transaction_id', transaction_id,
    'audit_id', audit_id
  );
end;
$$;

create or replace function public.redeem_reward(
  input_restaurant_id uuid,
  input_customer_id uuid,
  input_offer_source text,
  input_offer_id uuid,
  input_staff_pin text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_record public.staff_members%rowtype;
  customer_record public.customers%rowtype;
  reward_record public.rewards%rowtype;
  coupon_record public.coupons%rowtype;
  required_points_value integer := 0;
  required_stamps_value integer := 0;
  redemption_id uuid;
  next_points integer;
  next_stamps integer;
begin
  if not public.is_restaurant_admin(input_restaurant_id) then
    raise exception 'not allowed';
  end if;

  if coalesce(input_staff_pin, '') = '' then
    raise exception 'staff pin is required';
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

  if exists (
    select 1
    from public.audit_log a
    where a.restaurant_id = input_restaurant_id
      and a.actor_type = 'staff'
      and a.actor_id = staff_record.id
      and a.action = 'staff_reward_redeemed'
      and a.target_id = input_offer_id
      and a.created_at > now() - interval '30 seconds'
      and a.metadata->>'customer_id' = input_customer_id::text
      and a.metadata->>'offer_source' = input_offer_source
  ) then
    raise exception 'duplicate reward redemption blocked';
  end if;

  if input_offer_source = 'reward' then
    select *
    into reward_record
    from public.rewards
    where id = input_offer_id
      and restaurant_id = input_restaurant_id
      and active = true
      and (expires_at is null or expires_at > now());

    if reward_record.id is null then
      raise exception 'reward not active';
    end if;

    if exists (
      select 1
      from public.customer_rewards
      where restaurant_id = input_restaurant_id
        and customer_id = input_customer_id
        and reward_id = input_offer_id
        and status = 'redeemed'
    ) then
      raise exception 'reward already redeemed';
    end if;

    required_points_value := reward_record.required_points;
    required_stamps_value := reward_record.required_stamps;

    if customer_record.points_balance < required_points_value
      or customer_record.stamp_balance < required_stamps_value then
      raise exception 'customer does not have enough balance';
    end if;

    update public.customers
    set
      points_balance = points_balance - required_points_value,
      stamp_balance = stamp_balance - required_stamps_value
    where id = input_customer_id
      and restaurant_id = input_restaurant_id
      and points_balance >= required_points_value
      and stamp_balance >= required_stamps_value
    returning points_balance, stamp_balance into next_points, next_stamps;

    if next_points is null then
      raise exception 'customer does not have enough balance';
    end if;

    insert into public.customer_rewards (
      restaurant_id,
      customer_id,
      reward_id,
      staff_member_id,
      status,
      redeemed_at
    )
    values (
      input_restaurant_id,
      input_customer_id,
      input_offer_id,
      staff_record.id,
      'redeemed',
      now()
    )
    on conflict (restaurant_id, customer_id, reward_id)
    do update set status = 'redeemed', staff_member_id = staff_record.id, redeemed_at = now()
    returning id into redemption_id;
  elsif input_offer_source = 'coupon' then
    select *
    into coupon_record
    from public.coupons
    where id = input_offer_id
      and restaurant_id = input_restaurant_id
      and status = 'active'
      and (expires_at is null or expires_at > now());

    if coupon_record.id is null then
      raise exception 'coupon not active';
    end if;

    if exists (
      select 1
      from public.coupon_redemptions
      where restaurant_id = input_restaurant_id
        and customer_id = input_customer_id
        and coupon_id = input_offer_id
    ) then
      raise exception 'coupon already redeemed';
    end if;

    required_points_value := coupon_record.required_points;
    required_stamps_value := coupon_record.required_stamps;

    if customer_record.points_balance < required_points_value
      or customer_record.stamp_balance < required_stamps_value then
      raise exception 'customer does not have enough balance';
    end if;

    update public.customers
    set
      points_balance = points_balance - required_points_value,
      stamp_balance = stamp_balance - required_stamps_value
    where id = input_customer_id
      and restaurant_id = input_restaurant_id
      and points_balance >= required_points_value
      and stamp_balance >= required_stamps_value
    returning points_balance, stamp_balance into next_points, next_stamps;

    if next_points is null then
      raise exception 'customer does not have enough balance';
    end if;

    insert into public.coupon_redemptions (
      restaurant_id,
      coupon_id,
      customer_id,
      staff_member_id
    )
    values (
      input_restaurant_id,
      input_offer_id,
      input_customer_id,
      staff_record.id
    )
    returning id into redemption_id;
  else
    raise exception 'unsupported offer source';
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
    'staff_reward_redeemed',
    case when input_offer_source = 'coupon' then 'coupons' else 'rewards' end,
    input_offer_id,
    jsonb_build_object(
      'customer_id', input_customer_id,
      'offer_source', input_offer_source,
      'required_points', required_points_value,
      'required_stamps', required_stamps_value,
      'redemption_id', redemption_id
    )
  );

  return jsonb_build_object(
    'staff_member_id', staff_record.id,
    'staff_member_name', staff_record.name,
    'points_balance', next_points,
    'stamp_balance', next_stamps,
    'redeemed_offer_id', input_offer_id,
    'redemption_id', redemption_id
  );
end;
$$;

create or replace function public.get_staff_daily_activity(input_restaurant_id uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  with staff as (
    select id, name
    from public.staff_members
    where restaurant_id = input_restaurant_id
  ),
  points as (
    select staff_member_id, sum(points)::integer as points_issued
    from public.points_transactions
    where restaurant_id = input_restaurant_id
      and type = 'earn'
      and created_at >= current_date
    group by staff_member_id
  ),
  stamps as (
    select staff_member_id, sum(stamps)::integer as stamps_issued
    from public.stamp_transactions
    where restaurant_id = input_restaurant_id
      and created_at >= current_date
    group by staff_member_id
  ),
  redemptions as (
    select actor_id as staff_member_id, count(*)::integer as rewards_redeemed
    from public.audit_log
    where restaurant_id = input_restaurant_id
      and action = 'staff_reward_redeemed'
      and created_at >= current_date
    group by actor_id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'staff_member_id', staff.id,
        'staff_name', staff.name,
        'points_issued', coalesce(points.points_issued, 0),
        'stamps_issued', coalesce(stamps.stamps_issued, 0),
        'rewards_redeemed', coalesce(redemptions.rewards_redeemed, 0)
      )
      order by staff.name
    ),
    '[]'::jsonb
  )
  from staff
  left join points on points.staff_member_id = staff.id
  left join stamps on stamps.staff_member_id = staff.id
  left join redemptions on redemptions.staff_member_id = staff.id
  where public.is_restaurant_member(input_restaurant_id);
$$;

grant execute on function public.get_staff_daily_activity(uuid)
to authenticated;
