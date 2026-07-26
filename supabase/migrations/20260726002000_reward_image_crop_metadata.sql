-- Normalized crop metadata keeps the original image while rendering one stable 16:9 frame.
alter table public.rewards
  add column if not exists image_zoom numeric(5, 3) not null default 1,
  add column if not exists image_position_x numeric(6, 5) not null default 0.5,
  add column if not exists image_position_y numeric(6, 5) not null default 0.5,
  add column if not exists image_aspect_ratio text not null default '16:9',
  add column if not exists image_crop_version smallint not null default 1;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'rewards_image_zoom_valid' and conrelid = 'public.rewards'::regclass) then
    alter table public.rewards add constraint rewards_image_zoom_valid check (image_zoom between 0.1 and 4);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'rewards_image_position_x_valid' and conrelid = 'public.rewards'::regclass) then
    alter table public.rewards add constraint rewards_image_position_x_valid check (image_position_x between 0 and 1);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'rewards_image_position_y_valid' and conrelid = 'public.rewards'::regclass) then
    alter table public.rewards add constraint rewards_image_position_y_valid check (image_position_y between 0 and 1);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'rewards_image_aspect_ratio_valid' and conrelid = 'public.rewards'::regclass) then
    alter table public.rewards add constraint rewards_image_aspect_ratio_valid check (image_aspect_ratio = '16:9');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'rewards_image_crop_version_valid' and conrelid = 'public.rewards'::regclass) then
    alter table public.rewards add constraint rewards_image_crop_version_valid check (image_crop_version >= 1);
  end if;
end $$;

comment on column public.rewards.image_zoom is 'Responsive image zoom, normalized to 0.1..4.';
comment on column public.rewards.image_position_x is 'Horizontal crop focal point, normalized to 0..1.';
comment on column public.rewards.image_position_y is 'Vertical crop focal point, normalized to 0..1.';

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
        r.image_zoom,
        r.image_position_x,
        r.image_position_y,
        r.image_aspect_ratio,
        r.image_crop_version,
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
        r.image_zoom,
        r.image_position_x,
        r.image_position_y,
        r.image_aspect_ratio,
        r.image_crop_version,
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
        1::numeric as image_zoom,
        0.5::numeric as image_position_x,
        0.5::numeric as image_position_y,
        '16:9'::text as image_aspect_ratio,
        1::smallint as image_crop_version,
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
          'image_zoom', offers.image_zoom,
          'image_position_x', offers.image_position_x,
          'image_position_y', offers.image_position_y,
          'image_aspect_ratio', offers.image_aspect_ratio,
          'image_crop_version', offers.image_crop_version,
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

revoke execute on function public.get_public_customer_portal(text, text) from public;
grant execute on function public.get_public_customer_portal(text, text) to anon, authenticated;
