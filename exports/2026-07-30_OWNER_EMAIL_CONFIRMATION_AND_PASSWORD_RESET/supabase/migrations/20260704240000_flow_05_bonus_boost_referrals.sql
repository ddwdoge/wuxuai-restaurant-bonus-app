alter table public.loyalty_settings
add column if not exists referral_boost_enabled boolean not null default true,
add column if not exists referral_boost_multiplier numeric(8, 2) not null default 2
  check (referral_boost_multiplier in (1.25, 1.5, 2, 3)),
add column if not exists referral_boost_duration_days integer not null default 30
  check (referral_boost_duration_days in (14, 30, 60));

alter table public.referrals
add column if not exists referral_token_hash text unique,
add column if not exists activated_at timestamptz,
add column if not exists expires_at timestamptz,
add column if not exists cancelled_at timestamptz;

create table if not exists public.customer_bonus_boosts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  multiplier numeric(8, 2) not null check (multiplier >= 1),
  active_from timestamptz not null default now(),
  active_until timestamptz not null,
  source text not null default 'referral',
  referral_id uuid references public.referrals(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'expired', 'cancelled')),
  created_at timestamptz not null default now()
);

alter table public.customer_bonus_boosts enable row level security;

drop policy if exists "customer bonus boosts admin select" on public.customer_bonus_boosts;
drop policy if exists "customer bonus boosts admin write" on public.customer_bonus_boosts;

create policy "customer bonus boosts admin select"
on public.customer_bonus_boosts for select
using (public.is_restaurant_member(restaurant_id));

create policy "customer bonus boosts admin write"
on public.customer_bonus_boosts for all
using (public.is_restaurant_admin(restaurant_id))
with check (public.is_restaurant_admin(restaurant_id));

create index if not exists customer_bonus_boosts_active_idx
on public.customer_bonus_boosts (restaurant_id, customer_id, status, active_until desc);

create index if not exists referrals_token_hash_idx
on public.referrals (referral_token_hash)
where referral_token_hash is not null;

create index if not exists referrals_referred_status_idx
on public.referrals (restaurant_id, referred_customer_id, status);

create or replace function public.upsert_referral_boost(
  input_restaurant_id uuid,
  input_customer_id uuid,
  input_referral_id uuid,
  input_multiplier numeric,
  input_duration_days integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  boost_record public.customer_bonus_boosts%rowtype;
  boost_id uuid;
  extension_base timestamptz;
begin
  select *
  into boost_record
  from public.customer_bonus_boosts
  where restaurant_id = input_restaurant_id
    and customer_id = input_customer_id
    and source = 'referral'
    and status = 'active'
    and active_until > now()
  order by active_until desc
  limit 1
  for update;

  if boost_record.id is null then
    insert into public.customer_bonus_boosts (
      restaurant_id,
      customer_id,
      multiplier,
      active_from,
      active_until,
      source,
      referral_id,
      status
    )
    values (
      input_restaurant_id,
      input_customer_id,
      input_multiplier,
      now(),
      now() + make_interval(days => input_duration_days),
      'referral',
      input_referral_id,
      'active'
    )
    returning id into boost_id;
  else
    extension_base := greatest(boost_record.active_until, now());

    update public.customer_bonus_boosts
    set
      active_until = extension_base + make_interval(days => input_duration_days),
      multiplier = boost_record.multiplier,
      referral_id = input_referral_id
    where id = boost_record.id
    returning id into boost_id;
  end if;

  return boost_id;
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
    'campaigns', campaigns_payload,
    'offers', offers_payload
  );
end;
$$;

create or replace function public.create_referral_link(
  input_restaurant_slug text,
  input_customer_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  restaurant_record public.restaurants%rowtype;
  settings_record public.loyalty_settings%rowtype;
  customer_record public.customers%rowtype;
  raw_referral_token text;
  referral_record public.referrals%rowtype;
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

  if settings_record.id is null or not coalesce(settings_record.referral_boost_enabled, true) then
    raise exception 'bonus boost not active';
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
  limit 1;

  if customer_record.id is null then
    raise exception 'customer token not valid';
  end if;

  raw_referral_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.referrals (
    restaurant_id,
    referrer_customer_id,
    status,
    referral_token_hash
  )
  values (
    restaurant_record.id,
    customer_record.id,
    'pending',
    public.hash_public_token(raw_referral_token)
  )
  returning * into referral_record;

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
    'public_referral_link_created',
    'referrals',
    referral_record.id,
    jsonb_build_object('source', 'customer_portal')
  );

  return jsonb_build_object(
    'referral_token', raw_referral_token,
    'referral_id', referral_record.id
  );
end;
$$;

create or replace function public.get_public_referral(
  input_restaurant_slug text,
  input_referral_token text
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
  referral_record public.referrals%rowtype;
  referrer_record public.customers%rowtype;
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
  into referral_record
  from public.referrals
  where restaurant_id = restaurant_record.id
    and referral_token_hash = public.hash_public_token(input_referral_token)
    and status in ('pending', 'pending_registered')
  limit 1;

  if referral_record.id is null then
    raise exception 'referral not found';
  end if;

  select *
  into referrer_record
  from public.customers
  where id = referral_record.referrer_customer_id
    and restaurant_id = restaurant_record.id;

  select *
  into branding_record
  from public.restaurant_branding
  where restaurant_id = restaurant_record.id;

  select *
  into settings_record
  from public.loyalty_settings
  where restaurant_id = restaurant_record.id
    and active = true;

  if settings_record.id is null or not coalesce(settings_record.referral_boost_enabled, true) then
    raise exception 'bonus boost not active';
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
    'referrer', jsonb_build_object(
      'first_name', split_part(referrer_record.name, ' ', 1)
    ),
    'settings', jsonb_build_object(
      'referral_boost_enabled', coalesce(settings_record.referral_boost_enabled, true),
      'referral_boost_multiplier', coalesce(settings_record.referral_boost_multiplier, 2),
      'referral_boost_duration_days', coalesce(settings_record.referral_boost_duration_days, 30)
    )
  );
end;
$$;

create or replace function public.register_referral_customer(
  input_restaurant_slug text,
  input_referral_token text,
  input_first_name text,
  input_phone text,
  input_birthday date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  restaurant_record public.restaurants%rowtype;
  referral_record public.referrals%rowtype;
  referrer_record public.customers%rowtype;
  customer_record public.customers%rowtype;
  normalized_name text;
  normalized_phone text;
  next_code text;
  raw_customer_token text;
begin
  normalized_name := trim(coalesce(input_first_name, ''));
  normalized_phone := regexp_replace(trim(coalesce(input_phone, '')), '\s+', '', 'g');

  if length(normalized_name) < 2 or length(normalized_name) > 80 then
    raise exception 'first name is required';
  end if;

  if length(normalized_phone) < 5 or length(normalized_phone) > 32 then
    raise exception 'phone is required';
  end if;

  select *
  into restaurant_record
  from public.restaurants
  where slug = trim(input_restaurant_slug)
    and status = 'active';

  if restaurant_record.id is null then
    raise exception 'restaurant not found';
  end if;

  select *
  into referral_record
  from public.referrals
  where restaurant_id = restaurant_record.id
    and referral_token_hash = public.hash_public_token(input_referral_token)
    and status in ('pending', 'pending_registered')
  limit 1
  for update;

  if referral_record.id is null then
    raise exception 'referral not found';
  end if;

  if not exists (
    select 1
    from public.loyalty_settings ls
    where ls.restaurant_id = restaurant_record.id
      and ls.active = true
      and coalesce(ls.referral_boost_enabled, true)
  ) then
    raise exception 'bonus boost not active';
  end if;

  select *
  into referrer_record
  from public.customers
  where id = referral_record.referrer_customer_id
    and restaurant_id = restaurant_record.id
  for update;

  if referrer_record.id is null then
    raise exception 'referrer not found';
  end if;

  if regexp_replace(coalesce(referrer_record.phone, ''), '\s+', '', 'g') = normalized_phone then
    raise exception 'self referral is not allowed';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(restaurant_record.id::text || ':' || normalized_phone, 0));

  select *
  into customer_record
  from public.customers
  where restaurant_id = restaurant_record.id
    and phone = normalized_phone
  limit 1
  for update;

  if customer_record.id is null then
    next_code := upper(substr(restaurant_record.slug, 1, 3)) || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 8));

    insert into public.customers (
      restaurant_id,
      name,
      phone,
      birthday,
      customer_code
    )
    values (
      restaurant_record.id,
      normalized_name,
      normalized_phone,
      input_birthday,
      next_code
    )
    returning * into customer_record;
  end if;

  if customer_record.id = referrer_record.id then
    raise exception 'self referral is not allowed';
  end if;

  if referral_record.referred_customer_id is not null and referral_record.referred_customer_id <> customer_record.id then
    raise exception 'referral already used';
  end if;

  update public.referrals
  set
    referred_customer_id = customer_record.id,
    status = 'pending_registered'
  where id = referral_record.id
    and status in ('pending', 'pending_registered');

  raw_customer_token := encode(extensions.gen_random_bytes(32), 'hex');

  update public.customer_qr_tokens
  set active = false, rotated_at = now()
  where restaurant_id = restaurant_record.id
    and customer_id = customer_record.id
    and active = true;

  insert into public.customer_qr_tokens (
    restaurant_id,
    customer_id,
    token_hash,
    active
  )
  values (
    restaurant_record.id,
    customer_record.id,
    public.hash_public_token(raw_customer_token),
    true
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
    'public_referral_registered',
    'referrals',
    referral_record.id,
    jsonb_build_object('referrer_customer_id', referrer_record.id)
  );

  return jsonb_build_object(
    'restaurant', jsonb_build_object(
      'name', restaurant_record.name,
      'slug', restaurant_record.slug,
      'status', restaurant_record.status
    ),
    'customer', jsonb_build_object(
      'name', customer_record.name,
      'customer_code', customer_record.customer_code,
      'customer_qr_token', raw_customer_token
    ),
    'referral_status', 'pending_registered'
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
  smart_multiplier numeric := 1;
  active_boost public.customer_bonus_boosts%rowtype;
  base_points integer;
  final_points integer;
  next_points integer;
  recent_count integer := 0;
  previous_points_transactions integer := 0;
  next_reward jsonb;
  points_transaction_id uuid;
  referral_record public.referrals%rowtype;
  referrer_boost_id uuid;
  referred_boost_id uuid;
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

  base_points := greatest(floor(tier_amount / settings_record.amount_per_point)::integer, 0);

  select *
  into active_boost
  from public.customer_bonus_boosts
  where restaurant_id = restaurant_record.id
    and customer_id = customer_record.id
    and status = 'active'
    and active_from <= now()
    and active_until > now()
  order by multiplier desc, active_until desc
  limit 1;

  smart_multiplier := coalesce(active_boost.multiplier, 1);
  final_points := greatest(floor(base_points * smart_multiplier)::integer, 0);

  if final_points <= 0 then
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

  select count(*)
  into previous_points_transactions
  from public.points_transactions
  where restaurant_id = restaurant_record.id
    and customer_id = customer_record.id
    and type = 'earn';

  update public.customers
  set points_balance = points_balance + final_points
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
    final_points,
    'bonus_qr'
  )
  returning id into points_transaction_id;

  if previous_points_transactions = 0 and coalesce(settings_record.referral_boost_enabled, true) then
    select *
    into referral_record
    from public.referrals
    where restaurant_id = restaurant_record.id
      and referred_customer_id = customer_record.id
      and status = 'pending_registered'
    order by created_at asc
    limit 1
    for update;

    if referral_record.id is not null then
      update public.referrals
      set status = 'activated', activated_at = now()
      where id = referral_record.id
        and status = 'pending_registered'
      returning * into referral_record;

      if referral_record.id is not null then
        referrer_boost_id := public.upsert_referral_boost(
          restaurant_record.id,
          referral_record.referrer_customer_id,
          referral_record.id,
          settings_record.referral_boost_multiplier,
          settings_record.referral_boost_duration_days
        );

        referred_boost_id := public.upsert_referral_boost(
          restaurant_record.id,
          referral_record.referred_customer_id,
          referral_record.id,
          settings_record.referral_boost_multiplier,
          settings_record.referral_boost_duration_days
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
          'system',
          null,
          'referral_bonus_boost_activated',
          'referrals',
          referral_record.id,
          jsonb_build_object(
            'referrer_customer_id', referral_record.referrer_customer_id,
            'referred_customer_id', referral_record.referred_customer_id,
            'multiplier', settings_record.referral_boost_multiplier,
            'duration_days', settings_record.referral_boost_duration_days,
            'referrer_boost_id', referrer_boost_id,
            'referred_boost_id', referred_boost_id
          )
        );
      end if;
    end if;
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
    restaurant_record.id,
    'customer',
    customer_record.id,
    'public_bonus_points_collected',
    'points_transactions',
    points_transaction_id,
    jsonb_build_object(
      'amount_tier_key', input_amount_tier_key,
      'amount_tier_label', tier_label,
      'tier_amount', tier_amount,
      'base_points', base_points,
      'multiplier', smart_multiplier,
      'final_points', final_points,
      'boost_id', active_boost.id
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
    'points_added', final_points,
    'base_points', base_points,
    'points_balance', next_points,
    'amount_tier_key', input_amount_tier_key,
    'amount_tier_label', tier_label,
    'bonus_multiplier', smart_multiplier,
    'boost_id', active_boost.id,
    'next_reward', next_reward
  );
end;
$$;

revoke execute on function public.upsert_referral_boost(uuid, uuid, uuid, numeric, integer)
from public, anon, authenticated;

revoke execute on function public.create_referral_link(text, text)
from public;

grant execute on function public.create_referral_link(text, text)
to anon, authenticated;

revoke execute on function public.get_public_referral(text, text)
from public;

grant execute on function public.get_public_referral(text, text)
to anon, authenticated;

revoke execute on function public.register_referral_customer(text, text, text, text, date)
from public;

grant execute on function public.register_referral_customer(text, text, text, text, date)
to anon, authenticated;

create or replace function public.get_bonus_boost_kpis(input_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  boosted_guests integer := 0;
  returned_guests integer := 0;
begin
  if not public.is_restaurant_member(input_restaurant_id) then
    raise exception 'not allowed';
  end if;

  select count(distinct customer_id)
  into boosted_guests
  from public.customer_bonus_boosts
  where restaurant_id = input_restaurant_id
    and status = 'active'
    and active_from <= now()
    and active_until > now();

  select count(distinct actor_id)
  into returned_guests
  from public.audit_log
  where restaurant_id = input_restaurant_id
    and actor_type = 'customer'
    and action = 'public_bonus_points_collected'
    and created_at >= current_date
    and nullif(metadata->>'boost_id', '') is not null
    and coalesce((metadata->>'multiplier')::numeric, 1) > 1;

  return jsonb_build_object(
    'guests_currently_boosted', boosted_guests,
    'guests_returned_because_of_boost', returned_guests
  );
end;
$$;

revoke execute on function public.get_bonus_boost_kpis(uuid)
from public;

grant execute on function public.get_bonus_boost_kpis(uuid)
to authenticated;
