alter table public.loyalty_settings
add column if not exists bonus_amount_tiers jsonb not null default '[
  {"key":"20","label":"bis 20 €","amount":20},
  {"key":"30","label":"bis 30 €","amount":30},
  {"key":"40","label":"bis 40 €","amount":40},
  {"key":"50","label":"bis 50 €","amount":50},
  {"key":"75","label":"bis 75 €","amount":75},
  {"key":"100","label":"bis 100 €","amount":100},
  {"key":"100_plus","label":"über 100 €","amount":120}
]'::jsonb,
add column if not exists bonus_boost_multiplier numeric(8, 2) not null default 1
  check (bonus_boost_multiplier >= 1);

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
      'bonus_amount_tiers', settings_record.bonus_amount_tiers,
      'bonus_boost_multiplier', settings_record.bonus_boost_multiplier,
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

create or replace function public.collect_bonus_points(
  input_restaurant_slug text,
  input_customer_token text,
  input_amount_tier_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  restaurant_record public.restaurants%rowtype;
  customer_record public.customers%rowtype;
  settings_record public.loyalty_settings%rowtype;
  tier_record jsonb;
  tier_label text;
  tier_amount numeric;
  bonus_multiplier numeric;
  calculated_points integer;
  next_points integer;
  recent_count integer := 0;
  next_reward jsonb;
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
  into settings_record
  from public.loyalty_settings
  where restaurant_id = restaurant_record.id
    and active = true;

  if settings_record.id is null then
    raise exception 'bonus program not active';
  end if;

  select c.*
  into customer_record
  from public.customer_qr_tokens cqt
  join public.customers c on c.id = cqt.customer_id
  where cqt.restaurant_id = restaurant_record.id
    and cqt.token_hash = public.hash_public_token(input_customer_token)
    and cqt.active = true
    and (cqt.expires_at is null or cqt.expires_at > now())
    and c.restaurant_id = restaurant_record.id
  limit 1
  for update of c;

  if customer_record.id is null then
    raise exception 'customer token not valid';
  end if;

  select tier
  into tier_record
  from jsonb_array_elements(settings_record.bonus_amount_tiers) as tier
  where tier->>'key' = input_amount_tier_key
  limit 1;

  if tier_record is null then
    raise exception 'amount tier not valid';
  end if;

  tier_label := tier_record->>'label';
  tier_amount := coalesce((tier_record->>'amount')::numeric, 0);
  bonus_multiplier := greatest(coalesce(settings_record.bonus_boost_multiplier, 1), 1);
  calculated_points := greatest(floor((tier_amount / settings_record.amount_per_point) * bonus_multiplier)::integer, 0);

  if calculated_points <= 0 then
    raise exception 'points could not be calculated';
  end if;

  select count(*)
  into recent_count
  from public.points_transactions
  where restaurant_id = restaurant_record.id
    and customer_id = customer_record.id
    and type = 'earn'
    and reason = 'bonus_qr'
    and created_at > now() - interval '5 minutes';

  if recent_count > 0 then
    raise exception 'points already collected recently';
  end if;

  update public.customers
  set points_balance = points_balance + calculated_points
  where id = customer_record.id
    and restaurant_id = restaurant_record.id
  returning points_balance into next_points;

  insert into public.points_transactions (
    restaurant_id,
    customer_id,
    staff_member_id,
    type,
    points,
    reason
  )
  values (
    restaurant_record.id,
    customer_record.id,
    null,
    'earn',
    calculated_points,
    'bonus_qr'
  );

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
    'customer',
    customer_record.id,
    'public_bonus_points_collected',
    'points_transactions',
    customer_record.id,
    jsonb_build_object(
      'amount_tier_key', input_amount_tier_key,
      'amount_tier_label', tier_label,
      'tier_amount', tier_amount,
      'calculated_points', calculated_points,
      'bonus_multiplier', bonus_multiplier
    )
  );

  with candidates as (
    select title, required_points
    from public.rewards
    where restaurant_id = restaurant_record.id
      and active = true
      and required_points > next_points
      and (expires_at is null or expires_at > now())
    union all
    select title, required_points
    from public.coupons
    where restaurant_id = restaurant_record.id
      and status = 'active'
      and required_points > next_points
      and (expires_at is null or expires_at > now())
  )
  select jsonb_build_object(
    'title', title,
    'required_points', required_points,
    'remaining_points', greatest(required_points - next_points, 0)
  )
  into next_reward
  from candidates
  order by required_points asc
  limit 1;

  return jsonb_build_object(
    'points_added', calculated_points,
    'points_balance', next_points,
    'amount_tier_key', input_amount_tier_key,
    'amount_tier_label', tier_label,
    'bonus_multiplier', bonus_multiplier,
    'next_reward', next_reward
  );
end;
$$;

revoke execute on function public.collect_bonus_points(text, text, text)
from public;

grant execute on function public.collect_bonus_points(text, text, text)
to anon, authenticated;
