alter table public.loyalty_settings
add column if not exists redemption_return_rate numeric(5, 4) not null default 0.05
  check (redemption_return_rate in (0.03, 0.05, 0.08, 0.10));

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
      'redemption_return_rate', settings_record.redemption_return_rate,
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
