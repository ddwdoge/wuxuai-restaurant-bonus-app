create table if not exists public.reward_redemption_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  reward_id uuid not null references public.rewards(id) on delete cascade,
  points_spent integer not null default 0 check (points_spent >= 0),
  stamps_spent integer not null default 0 check (stamps_spent >= 0),
  redeemed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

select public.add_branch_scope_to_table('reward_redemption_events');

alter table public.reward_redemption_events enable row level security;

drop policy if exists reward_redemption_events_admin_select on public.reward_redemption_events;
create policy reward_redemption_events_admin_select
on public.reward_redemption_events for select
using (public.is_restaurant_member(restaurant_id));

create index if not exists reward_redemption_events_restaurant_created_idx
on public.reward_redemption_events (restaurant_id, redeemed_at desc);

create index if not exists reward_redemption_events_customer_reward_idx
on public.reward_redemption_events (restaurant_id, customer_id, reward_id, redeemed_at desc);

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

create or replace function public.redeem_customer_reward(
  input_customer_token text,
  input_reward_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  token_record public.customer_qr_tokens%rowtype;
  customer_record public.customers%rowtype;
  reward_record public.rewards%rowtype;
  customer_reward_record public.customer_rewards%rowtype;
  required_points_value integer := 0;
  required_stamps_value integer := 0;
  next_points integer;
  next_stamps integer;
  redemption_id uuid;
begin
  select *
  into token_record
  from public.customer_qr_tokens
  where token_hash = public.hash_public_token(input_customer_token)
    and active = true
    and (expires_at is null or expires_at > now())
  limit 1;

  if token_record.id is null then
    raise exception 'customer token not valid';
  end if;

  select *
  into customer_record
  from public.customers
  where id = token_record.customer_id
    and restaurant_id = token_record.restaurant_id
  for update;

  if customer_record.id is null then
    raise exception 'customer token not valid';
  end if;

  select *
  into reward_record
  from public.rewards
  where id = input_reward_id
    and restaurant_id = customer_record.restaurant_id
    and active = true
    and (expires_at is null or expires_at > now());

  if reward_record.id is null then
    raise exception 'Diese Punkteeinlösung ist nicht mehr verfügbar.';
  end if;

  if reward_record.is_starter_reward = true then
    select *
    into customer_reward_record
    from public.customer_rewards
    where restaurant_id = customer_record.restaurant_id
      and customer_id = customer_record.id
      and reward_id = reward_record.id
      and is_starter_reward = true
    for update;

    if customer_reward_record.id is null
      or customer_reward_record.status = 'redeemed'
      or customer_reward_record.status <> 'active'
      or customer_reward_record.unlocked_at is null then
      raise exception 'Dieses Willkommensgeschenk ist nicht mehr verfügbar.';
    end if;

    update public.customer_rewards
    set status = 'redeemed',
        staff_member_id = null,
        redeemed_at = now()
    where id = customer_reward_record.id
      and status <> 'redeemed'
    returning id into redemption_id;

    if redemption_id is null then
      raise exception 'Dieses Willkommensgeschenk wurde bereits eingelöst.';
    end if;

    next_points := customer_record.points_balance;
    next_stamps := customer_record.stamp_balance;

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
      customer_record.restaurant_id,
      'customer',
      customer_record.id,
      'customer_welcome_gift_redeemed',
      'customer_rewards',
      redemption_id,
      jsonb_build_object(
        'customer_id', customer_record.id,
        'reward_id', reward_record.id,
        'is_starter_reward', true
      )
    );
  else
    required_points_value := reward_record.required_points;
    required_stamps_value := reward_record.required_stamps;

    update public.customers
    set points_balance = points_balance - required_points_value,
        stamp_balance = stamp_balance - required_stamps_value
    where id = customer_record.id
      and restaurant_id = customer_record.restaurant_id
      and points_balance >= required_points_value
      and stamp_balance >= required_stamps_value
    returning points_balance, stamp_balance into next_points, next_stamps;

    if next_points is null then
      raise exception 'Du hast noch nicht genug Punkte.';
    end if;

    insert into public.reward_redemption_events (
      restaurant_id,
      customer_id,
      reward_id,
      points_spent,
      stamps_spent,
      metadata
    )
    values (
      customer_record.restaurant_id,
      customer_record.id,
      reward_record.id,
      required_points_value,
      required_stamps_value,
      jsonb_build_object(
        'customer_balance_before', customer_record.points_balance,
        'customer_balance_after', next_points
      )
    )
    returning id into redemption_id;

    if required_points_value > 0 then
      insert into public.points_transactions (
        restaurant_id,
        customer_id,
        staff_member_id,
        type,
        points,
        reason
      )
      values (
        customer_record.restaurant_id,
        customer_record.id,
        null,
        'redeem',
        -required_points_value,
        'Punkteeinlösung'
      );
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
      customer_record.restaurant_id,
      'customer',
      customer_record.id,
      'customer_point_redemption_used',
      'rewards',
      reward_record.id,
      jsonb_build_object(
        'customer_id', customer_record.id,
        'redemption_event_id', redemption_id,
        'required_points', required_points_value,
        'required_stamps', required_stamps_value,
        'points_balance', next_points,
        'stamps_balance', next_stamps,
        'is_starter_reward', false
      )
    );
  end if;

  update public.reward_redemption_codes
  set status = 'expired'
  where restaurant_id = customer_record.restaurant_id
    and customer_id = customer_record.id
    and reward_id = reward_record.id
    and status = 'active';

  return jsonb_build_object(
    'points_balance', next_points,
    'stamp_balance', next_stamps,
    'redeemed_offer_id', reward_record.id,
    'redemption_id', redemption_id,
    'is_starter_reward', reward_record.is_starter_reward,
    'points_spent', required_points_value,
    'stamps_spent', required_stamps_value
  );
end;
$$;

revoke execute on function public.redeem_customer_reward(text, uuid)
from public, anon, authenticated;

grant execute on function public.redeem_customer_reward(text, uuid)
to anon, authenticated;
