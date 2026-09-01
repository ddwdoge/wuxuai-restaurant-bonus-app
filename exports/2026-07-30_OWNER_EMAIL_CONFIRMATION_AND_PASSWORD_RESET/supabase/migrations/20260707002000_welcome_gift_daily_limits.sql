alter table public.customer_rewards
  drop constraint if exists customer_rewards_status_check;

alter table public.customer_rewards
  add constraint customer_rewards_status_check
  check (status in ('locked', 'active', 'redeemed', 'expired'));

alter table public.customer_rewards
  add column if not exists unlocked_at timestamptz;

create or replace function public.welcome_gift_category_key(
  input_title text,
  input_category text,
  input_key text default null
)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when lower(coalesce(input_key, '') || ' ' || coalesce(input_category, '') || ' ' || coalesce(input_title, '')) like '%kaffee%' then 'kaffee'
    when lower(coalesce(input_key, '') || ' ' || coalesce(input_category, '') || ' ' || coalesce(input_title, '')) like '%getränk%' then 'getraenk'
    when lower(coalesce(input_key, '') || ' ' || coalesce(input_category, '') || ' ' || coalesce(input_title, '')) like '%drink%' then 'getraenk'
    when lower(coalesce(input_key, '') || ' ' || coalesce(input_category, '') || ' ' || coalesce(input_title, '')) like '%dessert%' then 'dessert'
    when lower(coalesce(input_key, '') || ' ' || coalesce(input_category, '') || ' ' || coalesce(input_title, '')) like '%vorspeise%' then 'vorspeise'
    when lower(coalesce(input_key, '') || ' ' || coalesce(input_category, '') || ' ' || coalesce(input_title, '')) like '%menü%' then 'menue'
    when lower(coalesce(input_key, '') || ' ' || coalesce(input_category, '') || ' ' || coalesce(input_title, '')) like '%menu%' then 'menue'
    when lower(coalesce(input_key, '') || ' ' || coalesce(input_category, '') || ' ' || coalesce(input_title, '')) like '%sushi%' then 'sushi'
    when lower(coalesce(input_key, '') || ' ' || coalesce(input_category, '') || ' ' || coalesce(input_title, '')) like '%hauptspeise%' then 'hauptspeise'
    else 'eigene'
  end;
$$;

create or replace function public.welcome_gift_category_weight(input_category_key text)
returns integer
language sql
immutable
set search_path = public
as $$
  select case input_category_key
    when 'kaffee' then 25
    when 'getraenk' then 25
    when 'dessert' then 20
    when 'vorspeise' then 18
    when 'menue' then 5
    when 'sushi' then 3
    when 'hauptspeise' then 2
    else 2
  end;
$$;

create or replace function public.welcome_gift_daily_limit(input_category_key text)
returns integer
language sql
immutable
set search_path = public
as $$
  select case input_category_key
    when 'menue' then 3
    when 'hauptspeise' then 3
    else null
  end;
$$;

create or replace function public.assign_welcome_starter_reward(
  input_restaurant_id uuid,
  input_customer_id uuid,
  input_campaign_id uuid default null,
  input_source text default 'restaurant_qr'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  existing_reward public.rewards%rowtype;
  selected_reward public.rewards%rowtype;
  assignment_id uuid;
  issued_value boolean := false;
  total_weight numeric := 0;
  random_threshold numeric := 0;
begin
  if input_restaurant_id is null or input_customer_id is null then
    raise exception 'restaurant_id and customer_id are required';
  end if;

  if coalesce(input_source, '') <> 'restaurant_qr' then
    return jsonb_build_object('issued', false, 'reward_id', null, 'reward', null);
  end if;

  select r.*
  into existing_reward
  from public.customer_rewards cr
  join public.rewards r on r.id = cr.reward_id
  where cr.restaurant_id = input_restaurant_id
    and cr.customer_id = input_customer_id
    and cr.is_starter_reward = true
    and r.restaurant_id = input_restaurant_id
  order by cr.created_at asc
  limit 1;

  if existing_reward.id is not null then
    return jsonb_build_object(
      'issued', false,
      'reward_id', existing_reward.id,
      'reward', jsonb_build_object(
        'id', existing_reward.id,
        'title', existing_reward.title,
        'category', existing_reward.category,
        'available_products', existing_reward.available_products,
        'image_url', existing_reward.image_url,
        'product_price', existing_reward.product_price,
        'welcome_gift_mode', existing_reward.welcome_gift_mode,
        'fixed_product_name', existing_reward.fixed_product_name
      )
    );
  end if;

  with candidates as (
    select
      r.id,
      public.welcome_gift_category_key(r.title, r.category, r.starter_reward_key) as category_key,
      public.welcome_gift_category_weight(public.welcome_gift_category_key(r.title, r.category, r.starter_reward_key))::numeric as weight
    from public.rewards r
    where r.restaurant_id = input_restaurant_id
      and r.is_starter_reward = true
      and r.active = true
      and (r.expires_at is null or r.expires_at > now())
  ),
  available as (
    select c.*
    from candidates c
    where public.welcome_gift_daily_limit(c.category_key) is null
       or (
        select count(*)
        from public.customer_rewards cr
        join public.rewards used_reward on used_reward.id = cr.reward_id
        where cr.restaurant_id = input_restaurant_id
          and cr.is_starter_reward = true
          and cr.created_at >= current_date
          and cr.created_at < current_date + interval '1 day'
          and public.welcome_gift_category_key(used_reward.title, used_reward.category, used_reward.starter_reward_key) = c.category_key
       ) < public.welcome_gift_daily_limit(c.category_key)
  )
  select coalesce(sum(weight), 0)
  into total_weight
  from available;

  if total_weight <= 0 then
    return jsonb_build_object('issued', false, 'reward_id', null, 'reward', null);
  end if;

  random_threshold := random() * total_weight;

  with candidates as (
    select
      r.id,
      public.welcome_gift_category_key(r.title, r.category, r.starter_reward_key) as category_key,
      public.welcome_gift_category_weight(public.welcome_gift_category_key(r.title, r.category, r.starter_reward_key))::numeric as weight
    from public.rewards r
    where r.restaurant_id = input_restaurant_id
      and r.is_starter_reward = true
      and r.active = true
      and (r.expires_at is null or r.expires_at > now())
  ),
  available as (
    select c.*
    from candidates c
    where public.welcome_gift_daily_limit(c.category_key) is null
       or (
        select count(*)
        from public.customer_rewards cr
        join public.rewards used_reward on used_reward.id = cr.reward_id
        where cr.restaurant_id = input_restaurant_id
          and cr.is_starter_reward = true
          and cr.created_at >= current_date
          and cr.created_at < current_date + interval '1 day'
          and public.welcome_gift_category_key(used_reward.title, used_reward.category, used_reward.starter_reward_key) = c.category_key
       ) < public.welcome_gift_daily_limit(c.category_key)
  ),
  weighted as (
    select
      a.id,
      sum(a.weight) over (order by encode(extensions.gen_random_bytes(16), 'hex'), a.id) as cumulative_weight
    from available a
  )
  select r.*
  into selected_reward
  from weighted w
  join public.rewards r on r.id = w.id
  where w.cumulative_weight >= random_threshold
  order by w.cumulative_weight
  limit 1;

  if selected_reward.id is null then
    return jsonb_build_object('issued', false, 'reward_id', null, 'reward', null);
  end if;

  begin
    insert into public.customer_rewards (
      restaurant_id,
      customer_id,
      reward_id,
      status,
      is_starter_reward,
      assignment_metadata
    )
    values (
      input_restaurant_id,
      input_customer_id,
      selected_reward.id,
      'locked',
      true,
      jsonb_build_object(
        'source', input_source,
        'campaign_id', input_campaign_id,
        'title', selected_reward.title,
        'category', selected_reward.category,
        'available_products', selected_reward.available_products,
        'image_url', selected_reward.image_url,
        'product_price', selected_reward.product_price,
        'welcome_gift_mode', selected_reward.welcome_gift_mode,
        'fixed_product_name', selected_reward.fixed_product_name,
        'assigned_at', now()
      )
    )
    returning id into assignment_id;
    issued_value := true;
  exception
    when unique_violation then
      issued_value := false;
  end;

  if issued_value then
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
      'system',
      null,
      'welcome_starter_reward_assigned',
      'customer_rewards',
      assignment_id,
      jsonb_build_object(
        'customer_id', input_customer_id,
        'reward_id', selected_reward.id,
        'source', input_source,
        'status', 'locked'
      )
    );
  end if;

  return jsonb_build_object(
    'issued', issued_value,
    'reward_id', selected_reward.id,
    'reward', jsonb_build_object(
      'id', selected_reward.id,
      'title', selected_reward.title,
      'category', selected_reward.category,
      'available_products', selected_reward.available_products,
      'image_url', selected_reward.image_url,
      'product_price', selected_reward.product_price,
      'welcome_gift_mode', selected_reward.welcome_gift_mode,
      'fixed_product_name', selected_reward.fixed_product_name
    )
  );
end;
$$;

create or replace function public.collect_bonus_points(
  input_restaurant_slug text,
  input_customer_token text,
  input_amount_tier_key text,
  input_device_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result_payload jsonb;
  restaurant_record public.restaurants%rowtype;
  customer_id_value uuid;
  normalized_device_id text;
  unlocked_count integer := 0;
begin
  normalized_device_id := nullif(trim(coalesce(input_device_id, '')), '');

  select *
  into restaurant_record
  from public.restaurants
  where slug = trim(input_restaurant_slug)
    and status = 'active';

  if restaurant_record.id is null then
    raise exception 'restaurant not found';
  end if;

  customer_id_value := public.resolve_customer_from_public_token(restaurant_record.id, input_customer_token);

  if customer_id_value is null then
    raise exception 'customer token not valid';
  end if;

  result_payload := public.collect_bonus_points(
    input_restaurant_slug,
    input_customer_token,
    input_amount_tier_key
  );

  update public.customer_rewards
  set status = 'active',
      unlocked_at = now()
  where restaurant_id = restaurant_record.id
    and customer_id = customer_id_value
    and is_starter_reward = true
    and status = 'locked';

  get diagnostics unlocked_count = row_count;

  if unlocked_count > 0 then
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
      restaurant_record.id,
      'system',
      customer_id_value,
      'welcome_starter_reward_unlocked',
      'customer_rewards',
      customer_id_value,
      jsonb_build_object('source', 'first_points_collection', 'amount_tier_key', input_amount_tier_key)
    );
  end if;

  perform public.record_customer_device(restaurant_record.id, customer_id_value, normalized_device_id);

  update public.audit_log
  set metadata = metadata || jsonb_build_object('device_id', normalized_device_id)
  where restaurant_id = restaurant_record.id
    and actor_id = customer_id_value
    and action = 'public_bonus_points_collected'
    and created_at > now() - interval '1 minute'
    and normalized_device_id is not null;

  return result_payload || jsonb_build_object('welcome_gift_unlocked', unlocked_count > 0);
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
  boost_record public.customer_bonus_boosts%rowtype;
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

    select *
    into boost_record
    from public.customer_bonus_boosts
    where restaurant_id = restaurant_record.id
      and customer_id = customer_record.id
      and status = 'active'
      and active_from <= now()
      and active_until > now()
    order by multiplier desc, active_until desc
    limit 1;
  end if;

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
        array_to_string(r.available_products, ', ') as product_group,
        r.image_url,
        r.product_price,
        r.welcome_gift_mode,
        r.fixed_product_name,
        false as is_starter_reward,
        null::text as assignment_status
      from public.rewards r
      where r.restaurant_id = restaurant_record.id
        and r.is_starter_reward = false
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
        'reward'::text as source,
        r.id,
        r.title,
        r.description,
        r.reward_type,
        r.required_points,
        r.required_stamps,
        r.expires_at,
        r.category,
        array_to_string(r.available_products, ', ') as product_group,
        r.image_url,
        r.product_price,
        r.welcome_gift_mode,
        r.fixed_product_name,
        true as is_starter_reward,
        cr.status as assignment_status
      from public.customer_rewards cr
      join public.rewards r on r.id = cr.reward_id
      where cr.restaurant_id = restaurant_record.id
        and cr.customer_id = customer_record.id
        and cr.is_starter_reward = true
        and cr.status <> 'redeemed'
        and r.restaurant_id = restaurant_record.id
        and (r.expires_at is null or r.expires_at > now())
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
        'Angebot'::text as product_group,
        null::text as image_url,
        null::numeric as product_price,
        'value_limit'::text as welcome_gift_mode,
        null::text as fixed_product_name,
        false as is_starter_reward,
        null::text as assignment_status
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
          'image_url', offers.image_url,
          'product_price', offers.product_price,
          'welcome_gift_mode', offers.welcome_gift_mode,
          'fixed_product_name', offers.fixed_product_name,
          'is_starter_reward', offers.is_starter_reward,
          'active', true,
          'expires_at', offers.expires_at,
          'status', case
            when offers.is_starter_reward and offers.assignment_status = 'locked' then 'locked'
            when offers.is_starter_reward then 'unlocked'
            when customer_record.points_balance >= offers.required_points
              and customer_record.stamp_balance >= offers.required_stamps
            then 'unlocked'
            else 'locked'
          end,
          'remaining_points', greatest(offers.required_points - customer_record.points_balance, 0),
          'remaining_stamps', greatest(offers.required_stamps - customer_record.stamp_balance, 0)
        )
        order by offers.is_starter_reward desc, offers.required_points, offers.required_stamps, offers.title
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
      'bonus_amount_tiers', settings_record.bonus_amount_tiers,
      'bonus_boost_multiplier', settings_record.bonus_boost_multiplier,
      'smart_upsell_enabled', settings_record.smart_upsell_enabled,
      'smart_upsell_threshold', settings_record.smart_upsell_threshold,
      'referral_boost_enabled', settings_record.referral_boost_enabled,
      'referral_boost_multiplier', settings_record.referral_boost_multiplier,
      'referral_boost_duration_days', settings_record.referral_boost_duration_days,
      'active', settings_record.active
    ),
    'customer', case
      when customer_record.id is null then null
      else jsonb_build_object(
        'name', customer_record.name,
        'customer_code', customer_record.customer_code,
        'points_balance', customer_record.points_balance,
        'stamp_balance', customer_record.stamp_balance,
        'membership_level', customer_record.membership_level,
        'bonus_boost', case
          when boost_record.id is null then null
          else jsonb_build_object(
            'multiplier', boost_record.multiplier,
            'active_from', boost_record.active_from,
            'active_until', boost_record.active_until,
            'remaining_days', greatest(ceil(extract(epoch from (boost_record.active_until - now())) / 86400), 0)
          )
        end
      )
    end,
    'campaigns', '[]'::jsonb,
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
  customer_reward_record public.customer_rewards%rowtype;
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

    select *
    into customer_reward_record
    from public.customer_rewards
    where restaurant_id = input_restaurant_id
      and customer_id = input_customer_id
      and reward_id = input_offer_id
    for update;

    if customer_reward_record.id is not null and customer_reward_record.status = 'redeemed' then
      raise exception 'reward already redeemed';
    end if;

    if customer_reward_record.id is not null and customer_reward_record.is_starter_reward = true then
      if customer_reward_record.status <> 'active' then
        raise exception 'Willkommensgeschenk ist noch nicht freigeschaltet';
      end if;

      if customer_reward_record.unlocked_at is null then
        raise exception 'Willkommensgeschenk ist noch nicht freigeschaltet';
      end if;

      if customer_reward_record.unlocked_at::date >= current_date then
        raise exception 'Willkommensgeschenk kann erst beim naechsten Besuch eingeloest werden';
      end if;

      required_points_value := 0;
      required_stamps_value := 0;
    else
      required_points_value := reward_record.required_points;
      required_stamps_value := reward_record.required_stamps;
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
      'redemption_id', redemption_id,
      'is_starter_reward', coalesce(customer_reward_record.is_starter_reward, false)
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

revoke execute on function public.assign_welcome_starter_reward(uuid, uuid, uuid, text)
from public, anon, authenticated;

revoke execute on function public.welcome_gift_category_key(text, text, text)
from public, anon, authenticated;

revoke execute on function public.welcome_gift_category_weight(text)
from public, anon, authenticated;

revoke execute on function public.welcome_gift_daily_limit(text)
from public, anon, authenticated;

revoke execute on function public.collect_bonus_points(text, text, text, text)
from public;

grant execute on function public.collect_bonus_points(text, text, text, text)
to anon, authenticated;

revoke execute on function public.redeem_reward_with_staff_session(uuid, uuid, text, uuid, text)
from public;

grant execute on function public.redeem_reward_with_staff_session(uuid, uuid, text, uuid, text)
to authenticated;
