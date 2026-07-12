create or replace function public.resolve_customer_qr_token(
  input_restaurant_id uuid,
  input_customer_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  customer_record public.customers%rowtype;
begin
  if not public.is_restaurant_admin(input_restaurant_id) then
    raise exception 'not allowed';
  end if;

  if nullif(trim(coalesce(input_customer_token, '')), '') is null then
    raise exception 'customer token is required';
  end if;

  select c.*
  into customer_record
  from public.customer_qr_tokens cqt
  join public.customers c on c.id = cqt.customer_id
  where cqt.restaurant_id = input_restaurant_id
    and cqt.token_hash = public.hash_public_token(input_customer_token)
    and cqt.active = true
    and (cqt.expires_at is null or cqt.expires_at > now())
    and c.restaurant_id = input_restaurant_id
  limit 1;

  if customer_record.id is null then
    raise exception 'customer token not valid';
  end if;

  return jsonb_build_object(
    'id', customer_record.id,
    'restaurant_id', customer_record.restaurant_id,
    'name', customer_record.name,
    'phone', customer_record.phone,
    'email', customer_record.email,
    'birthday', customer_record.birthday,
    'customer_code', customer_record.customer_code,
    'points_balance', customer_record.points_balance,
    'stamp_balance', customer_record.stamp_balance,
    'membership_level', customer_record.membership_level,
    'created_at', customer_record.created_at
  );
end;
$$;

create or replace function public.get_public_customer_portal(
  input_restaurant_slug text,
  input_customer_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  restaurant_record public.restaurants%rowtype;
  branding_record public.restaurant_branding%rowtype;
  settings_record public.loyalty_settings%rowtype;
  customer_record public.customers%rowtype;
  campaigns_payload jsonb := '[]'::jsonb;
  offers_payload jsonb := '[]'::jsonb;
begin
  select *
  into restaurant_record
  from public.restaurants
  where slug = trim(input_restaurant_slug)
    and status = 'active';

  if restaurant_record.id is null then
    raise exception 'restaurant not found';
  end if;

  select *
  into branding_record
  from public.restaurant_branding
  where restaurant_id = restaurant_record.id;

  select *
  into settings_record
  from public.loyalty_settings
  where restaurant_id = restaurant_record.id
    and active = true;

  if settings_record.id is null then
    raise exception 'loyalty settings not found';
  end if;

  if nullif(trim(coalesce(input_customer_token, '')), '') is not null then
    select c.*
    into customer_record
    from public.customer_qr_tokens cqt
    join public.customers c on c.id = cqt.customer_id
    where cqt.restaurant_id = restaurant_record.id
      and cqt.token_hash = public.hash_public_token(input_customer_token)
      and cqt.active = true
      and (cqt.expires_at is null or cqt.expires_at > now())
      and c.restaurant_id = restaurant_record.id
    limit 1;

    if customer_record.id is null then
      raise exception 'customer token not valid';
    end if;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'title', c.title,
        'slug', c.slug,
        'description', c.description,
        'status', c.status,
        'start_date', c.start_date,
        'end_date', c.end_date
      )
      order by c.created_at desc
    ),
    '[]'::jsonb
  )
  into campaigns_payload
  from public.campaigns c
  where c.restaurant_id = restaurant_record.id
    and c.status = 'active'
    and (c.start_date is null or c.start_date <= current_date)
    and (c.end_date is null or c.end_date >= current_date);

  if customer_record.id is not null then
    with offers as (
      select
        'reward'::text as source,
        r.id,
        r.title,
        r.description,
        r.reward_type,
        r.required_points,
        r.required_stamps,
        r.expires_at,
        r.category,
        array_to_string(r.available_products, ', ') as product_group
      from public.rewards r
      where r.restaurant_id = restaurant_record.id
        and r.active = true
        and (r.expires_at is null or r.expires_at > now())
        and not exists (
          select 1
          from public.customer_rewards cr
          where cr.restaurant_id = restaurant_record.id
            and cr.customer_id = customer_record.id
            and cr.reward_id = r.id
            and cr.status = 'redeemed'
        )
      union all
      select
        'coupon'::text as source,
        c.id,
        c.title,
        c.description,
        c.reward_type,
        c.required_points,
        c.required_stamps,
        c.expires_at,
        null::text as category,
        'Angebot'::text as product_group
      from public.coupons c
      where c.restaurant_id = restaurant_record.id
        and c.status = 'active'
        and (c.expires_at is null or c.expires_at > now())
        and not exists (
          select 1
          from public.coupon_redemptions cr
          where cr.restaurant_id = restaurant_record.id
            and cr.customer_id = customer_record.id
            and cr.coupon_id = c.id
        )
    )
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', offers.id,
          'source', offers.source,
          'title', offers.title,
          'description', offers.description,
          'reward_type', offers.reward_type,
          'required_points', offers.required_points,
          'required_stamps', offers.required_stamps,
          'category', offers.category,
          'product_group', offers.product_group,
          'active', true,
          'expires_at', offers.expires_at,
          'status', case
            when customer_record.points_balance >= offers.required_points
              and customer_record.stamp_balance >= offers.required_stamps
            then 'unlocked'
            else 'locked'
          end,
          'remaining_points', greatest(offers.required_points - customer_record.points_balance, 0),
          'remaining_stamps', greatest(offers.required_stamps - customer_record.stamp_balance, 0)
        )
        order by offers.required_points, offers.required_stamps, offers.title
      ),
      '[]'::jsonb
    )
    into offers_payload
    from offers;
  end if;

  return jsonb_build_object(
    'restaurant', jsonb_build_object(
      'name', restaurant_record.name,
      'slug', restaurant_record.slug,
      'status', restaurant_record.status
    ),
    'branding', jsonb_build_object(
      'logo_url', branding_record.logo_url,
      'primary_color', branding_record.primary_color,
      'secondary_color', branding_record.secondary_color,
      'button_color', branding_record.button_color,
      'font_family', branding_record.font_family
    ),
    'settings', jsonb_build_object(
      'loyalty_mode', settings_record.loyalty_mode,
      'amount_per_point', settings_record.amount_per_point,
      'stamps_required', settings_record.stamps_required,
      'active', settings_record.active
    ),
    'customer', case
      when customer_record.id is null then null
      else jsonb_build_object(
        'name', customer_record.name,
        'customer_code', customer_record.customer_code,
        'points_balance', customer_record.points_balance,
        'stamp_balance', customer_record.stamp_balance,
        'membership_level', customer_record.membership_level
      )
    end,
    'campaigns', campaigns_payload,
    'offers', offers_payload
  );
end;
$$;

create or replace function public.redeem_reward_with_staff_session(
  input_restaurant_id uuid,
  input_customer_id uuid,
  input_offer_source text,
  input_offer_id uuid,
  input_staff_session_token text
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

  staff_record := public.get_staff_from_session(input_restaurant_id, input_staff_session_token);

  select *
  into customer_record
  from public.customers
  where id = input_customer_id
    and restaurant_id = input_restaurant_id
  for update;

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
      where public.customer_rewards.status <> 'redeemed'
    returning id into redemption_id;

    if redemption_id is null then
      raise exception 'reward already redeemed';
    end if;
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

  update public.campaign_customer_offers
  set status = 'redeemed', redeemed_at = now()
  where restaurant_id = input_restaurant_id
    and customer_id = input_customer_id
    and offer_source = input_offer_source
    and offer_id = input_offer_id
    and status <> 'redeemed';

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

revoke execute on function public.resolve_customer_qr_token(uuid, text)
from public;

grant execute on function public.resolve_customer_qr_token(uuid, text)
to authenticated;
