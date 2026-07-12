create table if not exists public.reward_redemption_codes (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  reward_id uuid not null references public.rewards(id) on delete cascade,
  customer_reward_id uuid references public.customer_rewards(id) on delete cascade,
  code text not null check (code ~ '^[0-9]{6}$'),
  status text not null default 'active' check (status in ('active', 'used', 'expired')),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists reward_redemption_codes_restaurant_active_code_idx
on public.reward_redemption_codes (restaurant_id, code)
where status = 'active';

create index if not exists reward_redemption_codes_lookup_idx
on public.reward_redemption_codes (restaurant_id, customer_id, reward_id, status, expires_at desc);

create unique index if not exists reward_redemption_codes_customer_reward_active_idx
on public.reward_redemption_codes (customer_reward_id)
where status = 'active' and customer_reward_id is not null;

with ranked_welcome_rewards as (
  select
    id,
    row_number() over (partition by restaurant_id order by created_at desc, id desc) as rank
  from public.rewards
  where is_starter_reward = true
    and active = true
)
update public.rewards
set active = false
where id in (
  select id
  from ranked_welcome_rewards
  where rank > 1
);

create unique index if not exists rewards_one_active_welcome_gift_per_restaurant_idx
on public.rewards (restaurant_id)
where is_starter_reward = true and active = true;

alter table public.reward_redemption_codes enable row level security;

drop policy if exists "reward redemption codes admin select" on public.reward_redemption_codes;
create policy "reward redemption codes admin select"
on public.reward_redemption_codes for select
using (public.is_restaurant_member(restaurant_id));

create or replace function public.expire_reward_redemption_codes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  expired_count integer := 0;
begin
  update public.reward_redemption_codes
  set status = 'expired'
  where status = 'active'
    and expires_at <= now();

  get diagnostics expired_count = row_count;
  return expired_count;
end;
$$;

create or replace function public.create_redemption_code(
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
  next_code text;
  code_record public.reward_redemption_codes%rowtype;
  attempts integer := 0;
begin
  perform public.expire_reward_redemption_codes();

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
    and restaurant_id = token_record.restaurant_id;

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
    raise exception 'Diese Belohnung ist nicht mehr verfügbar.';
  end if;

  select *
  into customer_reward_record
  from public.customer_rewards
  where restaurant_id = customer_record.restaurant_id
    and customer_id = customer_record.id
    and reward_id = reward_record.id
  for update;

  if customer_reward_record.id is not null then
    if customer_reward_record.status = 'redeemed' then
      raise exception 'Diese Belohnung ist nicht mehr verfügbar.';
    end if;

    if customer_reward_record.is_starter_reward = true then
      if customer_reward_record.status <> 'active' or customer_reward_record.unlocked_at is null then
        raise exception 'Diese Belohnung ist nicht mehr verfügbar.';
      end if;
    end if;
  end if;

  if customer_reward_record.id is null then
    if customer_record.points_balance < reward_record.required_points
      or customer_record.stamp_balance < reward_record.required_stamps then
      raise exception 'Diese Belohnung ist nicht mehr verfügbar.';
    end if;
  end if;

  update public.reward_redemption_codes
  set status = 'expired'
  where restaurant_id = customer_record.restaurant_id
    and customer_id = customer_record.id
    and reward_id = reward_record.id
    and status = 'active';

  loop
    attempts := attempts + 1;
    next_code := lpad(floor(random() * 1000000)::integer::text, 6, '0');

    begin
      insert into public.reward_redemption_codes (
        restaurant_id,
        customer_id,
        reward_id,
        customer_reward_id,
        code,
        expires_at
      )
      values (
        customer_record.restaurant_id,
        customer_record.id,
        reward_record.id,
        customer_reward_record.id,
        next_code,
        now() + interval '60 seconds'
      )
      returning * into code_record;

      exit;
    exception
      when unique_violation then
        if attempts >= 5 then
          raise exception 'Einlösecode konnte nicht erzeugt werden.';
        end if;
    end;
  end loop;

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
    'customer_reward_redemption_code_created',
    'reward_redemption_codes',
    code_record.id,
    jsonb_build_object('reward_id', reward_record.id, 'expires_at', code_record.expires_at)
  );

  return jsonb_build_object(
    'code', code_record.code,
    'expires_at', code_record.expires_at,
    'reward_id', reward_record.id
  );
end;
$$;

create or replace function public.redeem_reward_with_pin(
  input_customer_token text,
  input_reward_id uuid,
  input_code text,
  input_pin text
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
  code_record public.reward_redemption_codes%rowtype;
  customer_reward_record public.customer_rewards%rowtype;
  staff_record public.staff_members%rowtype;
  required_points_value integer := 0;
  required_stamps_value integer := 0;
  next_points integer;
  next_stamps integer;
  redemption_id uuid;
begin
  perform public.expire_reward_redemption_codes();

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
    raise exception 'Diese Belohnung ist nicht mehr verfügbar.';
  end if;

  select *
  into code_record
  from public.reward_redemption_codes
  where restaurant_id = customer_record.restaurant_id
    and customer_id = customer_record.id
    and reward_id = reward_record.id
    and code = trim(input_code)
  order by created_at desc
  limit 1
  for update;

  if code_record.id is null then
    raise exception 'Code abgelaufen. Bitte neuen Code erzeugen.';
  end if;

  if code_record.status = 'used' then
    raise exception 'Code wurde bereits verwendet.';
  end if;

  if code_record.status <> 'active' or code_record.expires_at <= now() then
    update public.reward_redemption_codes
    set status = 'expired'
    where id = code_record.id
      and status = 'active';
    raise exception 'Code abgelaufen. Bitte neuen Code erzeugen.';
  end if;

  select *
  into staff_record
  from public.staff_members
  where restaurant_id = customer_record.restaurant_id
    and active = true
    and pin_hash = extensions.crypt(input_pin, pin_hash)
  order by created_at asc
  limit 1;

  if staff_record.id is null then
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
      'customer_reward_redemption_pin_failed',
      'reward_redemption_codes',
      code_record.id,
      jsonb_build_object('reward_id', reward_record.id)
    );
    raise exception 'PIN ist falsch.';
  end if;

  select *
  into customer_reward_record
  from public.customer_rewards
  where restaurant_id = customer_record.restaurant_id
    and customer_id = customer_record.id
    and reward_id = reward_record.id
  for update;

  if customer_reward_record.id is not null and customer_reward_record.status = 'redeemed' then
    raise exception 'Diese Belohnung ist nicht mehr verfügbar.';
  end if;

  if customer_reward_record.id is not null and customer_reward_record.is_starter_reward = true then
    if customer_reward_record.status <> 'active' or customer_reward_record.unlocked_at is null then
      raise exception 'Diese Belohnung ist nicht mehr verfügbar.';
    end if;

    required_points_value := 0;
    required_stamps_value := 0;
  else
    required_points_value := reward_record.required_points;
    required_stamps_value := reward_record.required_stamps;
  end if;

  update public.customers
  set points_balance = points_balance - required_points_value,
      stamp_balance = stamp_balance - required_stamps_value
  where id = customer_record.id
    and restaurant_id = customer_record.restaurant_id
    and points_balance >= required_points_value
    and stamp_balance >= required_stamps_value
  returning points_balance, stamp_balance into next_points, next_stamps;

  if next_points is null then
    raise exception 'Diese Belohnung ist nicht mehr verfügbar.';
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
    customer_record.restaurant_id,
    customer_record.id,
    reward_record.id,
    staff_record.id,
    'redeemed',
    now()
  )
  on conflict (restaurant_id, customer_id, reward_id)
  do update set status = 'redeemed', staff_member_id = staff_record.id, redeemed_at = now()
    where public.customer_rewards.status <> 'redeemed'
  returning id into redemption_id;

  if redemption_id is null then
    raise exception 'Code wurde bereits verwendet.';
  end if;

  update public.reward_redemption_codes
  set status = 'used',
      used_at = now()
  where id = code_record.id
    and status = 'active'
  returning * into code_record;

  if code_record.id is null then
    raise exception 'Code wurde bereits verwendet.';
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
    'staff',
    staff_record.id,
    'customer_reward_redeemed_with_pin',
    'rewards',
    reward_record.id,
    jsonb_build_object(
      'customer_id', customer_record.id,
      'customer_reward_id', redemption_id,
      'redemption_code_id', code_record.id,
      'required_points', required_points_value,
      'required_stamps', required_stamps_value
    )
  );

  return jsonb_build_object(
    'points_balance', next_points,
    'stamp_balance', next_stamps,
    'redeemed_offer_id', reward_record.id,
    'redemption_id', redemption_id
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
      from (
        select *
        from public.customer_rewards
        where restaurant_id = restaurant_record.id
          and customer_id = customer_record.id
          and is_starter_reward = true
          and status <> 'redeemed'
        order by created_at desc
        limit 1
      ) cr
      join public.rewards r on r.id = cr.reward_id
      where r.restaurant_id = restaurant_record.id
        and r.active = true
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

revoke execute on function public.expire_reward_redemption_codes()
from public, anon, authenticated;

revoke execute on function public.create_redemption_code(text, uuid)
from public;

grant execute on function public.create_redemption_code(text, uuid)
to anon, authenticated;

revoke execute on function public.redeem_reward_with_pin(text, uuid, text, text)
from public;

grant execute on function public.redeem_reward_with_pin(text, uuid, text, text)
to anon, authenticated;

revoke execute on function public.get_public_customer_portal(text, text)
from public;

grant execute on function public.get_public_customer_portal(text, text)
to anon, authenticated;
