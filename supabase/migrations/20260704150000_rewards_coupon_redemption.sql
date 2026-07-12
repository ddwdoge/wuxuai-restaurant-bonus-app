alter table public.rewards
add column if not exists reward_type text not null default 'reward'
check (reward_type in ('reward', 'coupon'));

alter table public.rewards
add column if not exists expires_at timestamptz;

alter table public.coupons
add column if not exists required_stamps integer not null default 0
check (required_stamps >= 0);

create index if not exists rewards_restaurant_active_idx
on public.rewards (restaurant_id, active);

create index if not exists coupons_restaurant_status_idx
on public.coupons (restaurant_id, status);

create unique index if not exists customer_rewards_customer_reward_unique_idx
on public.customer_rewards (restaurant_id, customer_id, reward_id);

create unique index if not exists coupon_redemptions_customer_coupon_unique_idx
on public.coupon_redemptions (restaurant_id, customer_id, coupon_id);

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
    returning points_balance, stamp_balance into next_points, next_stamps;

    insert into public.customer_rewards (
      restaurant_id,
      customer_id,
      reward_id,
      status,
      redeemed_at
    )
    values (
      input_restaurant_id,
      input_customer_id,
      input_offer_id,
      'redeemed',
      now()
    )
    on conflict (restaurant_id, customer_id, reward_id)
    do update set status = 'redeemed', redeemed_at = now()
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
    returning points_balance, stamp_balance into next_points, next_stamps;

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
    'points_balance', next_points,
    'stamp_balance', next_stamps,
    'redeemed_offer_id', input_offer_id,
    'redemption_id', redemption_id
  );
end;
$$;

grant execute on function public.redeem_reward(uuid, uuid, text, uuid, text)
to authenticated;
