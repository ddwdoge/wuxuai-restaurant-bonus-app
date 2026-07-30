create table if not exists public.restaurant_daily_pins (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade,
  pin_code text not null check (pin_code ~ '^[0-9]{4}$'),
  valid_date date not null,
  valid_from timestamptz not null default now(),
  valid_until timestamptz not null,
  created_at timestamptz not null default now()
);

create unique index if not exists restaurant_daily_pins_restaurant_branch_date_idx
on public.restaurant_daily_pins (
  restaurant_id,
  coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
  valid_date
);

create index if not exists restaurant_daily_pins_valid_idx
on public.restaurant_daily_pins (restaurant_id, branch_id, valid_date, valid_until);

alter table public.restaurant_daily_pins enable row level security;

drop policy if exists "restaurant daily pins member select" on public.restaurant_daily_pins;
create policy "restaurant daily pins member select"
on public.restaurant_daily_pins for select
using (public.is_restaurant_member(restaurant_id));

create or replace function public.generate_daily_pin_code()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  random_bytes bytea;
  random_value integer;
begin
  random_bytes := gen_random_bytes(2);
  random_value := (get_byte(random_bytes, 0) * 256 + get_byte(random_bytes, 1)) % 10000;
  return lpad(random_value::text, 4, '0');
end;
$$;

create or replace function public.ensure_today_restaurant_pin(
  input_restaurant_id uuid,
  input_branch_id uuid default null
)
returns public.restaurant_daily_pins
language plpgsql
security definer
set search_path = public
as $$
declare
  restaurant_record public.restaurants%rowtype;
  branch_id_value uuid;
  pin_record public.restaurant_daily_pins%rowtype;
  next_pin text;
  attempts integer := 0;
begin
  select *
  into restaurant_record
  from public.restaurants
  where id = input_restaurant_id
    and status = 'active';

  if restaurant_record.id is null then
    raise exception 'Restaurant wurde nicht gefunden';
  end if;

  branch_id_value := coalesce(input_branch_id, restaurant_record.primary_branch_id, public.restaurant_primary_branch_id(restaurant_record.id));

  select *
  into pin_record
  from public.restaurant_daily_pins
  where restaurant_id = restaurant_record.id
    and branch_id is not distinct from branch_id_value
    and valid_date = current_date
  limit 1;

  if pin_record.id is not null then
    return pin_record;
  end if;

  loop
    attempts := attempts + 1;
    next_pin := public.generate_daily_pin_code();

    begin
      insert into public.restaurant_daily_pins (
        restaurant_id,
        branch_id,
        pin_code,
        valid_date,
        valid_from,
        valid_until
      )
      values (
        restaurant_record.id,
        branch_id_value,
        next_pin,
        current_date,
        current_date::timestamptz,
        (current_date + interval '1 day' - interval '1 second')::timestamptz
      )
      returning * into pin_record;

      return pin_record;
    exception
      when unique_violation then
        select *
        into pin_record
        from public.restaurant_daily_pins
        where restaurant_id = restaurant_record.id
          and branch_id is not distinct from branch_id_value
          and valid_date = current_date
        limit 1;

        if pin_record.id is not null then
          return pin_record;
        end if;

        if attempts >= 8 then
          raise exception 'Tages-PIN konnte nicht erstellt werden.';
        end if;
    end;
  end loop;
end;
$$;

create or replace function public.get_today_restaurant_pin(input_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pin_record public.restaurant_daily_pins%rowtype;
begin
  if not public.is_restaurant_member(input_restaurant_id) then
    raise exception 'Nicht berechtigt.';
  end if;

  pin_record := public.ensure_today_restaurant_pin(input_restaurant_id, null);

  return jsonb_build_object(
    'pin_code', pin_record.pin_code,
    'valid_until', pin_record.valid_until
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
begin
  raise exception 'Die Tages-PIN ist nicht korrekt.';
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
begin
  raise exception 'Die Tages-PIN ist nicht korrekt.';
end;
$$;

create or replace function public.collect_bonus_points(
  input_restaurant_slug text,
  input_customer_token text,
  input_amount_tier_key text,
  input_daily_pin text,
  input_device_id text default null
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
  normalized_device_id text;
  daily_pin_record public.restaurant_daily_pins%rowtype;
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

  daily_pin_record := public.ensure_today_restaurant_pin(restaurant_record.id, restaurant_record.primary_branch_id);

  if daily_pin_record.valid_until <= now() then
    raise exception 'Die Tages-PIN ist nicht mehr gültig.';
  end if;

  if daily_pin_record.pin_code <> trim(coalesce(input_daily_pin, '')) then
    raise exception 'Die Tages-PIN ist nicht korrekt.';
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
  tier_amount := greatest(
    coalesce((tier_record->>'min')::numeric, (tier_record->>'amount')::numeric, 0),
    0
  );

  base_points := greatest(round(tier_amount / settings_record.amount_per_point)::integer, 0);

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
  final_points := greatest(round(base_points * smart_multiplier)::integer, 0);

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

  update public.customer_rewards
  set status = 'active',
      unlocked_at = now()
  where restaurant_id = restaurant_record.id
    and customer_id = customer_record.id
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
      customer_record.id,
      'welcome_starter_reward_unlocked',
      'customer_rewards',
      customer_record.id,
      jsonb_build_object('source', 'first_points_collection', 'amount_tier_key', input_amount_tier_key)
    );
  end if;

  perform public.record_customer_device(restaurant_record.id, customer_record.id, normalized_device_id);

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
      'boost_id', active_boost.id,
      'daily_pin_id', daily_pin_record.id,
      'device_id', normalized_device_id
    )
  );

  with candidates as (
    select title, required_points
    from public.rewards
    where restaurant_id = restaurant_record.id
      and active = true
      and required_points > next_points
      and is_starter_reward = false
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
    'welcome_gift_unlocked', unlocked_count > 0,
    'next_reward', next_reward
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
    raise exception 'Diese Belohnung ist nicht mehr verfügbar.';
  end if;

  select *
  into customer_reward_record
  from public.customer_rewards
  where restaurant_id = customer_record.restaurant_id
    and customer_id = customer_record.id
    and reward_id = reward_record.id
  for update;

  if customer_reward_record.id is not null and customer_reward_record.status = 'redeemed' then
    raise exception 'Diese Belohnung wurde bereits eingelöst.';
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
    null,
    'redeemed',
    now()
  )
  on conflict (restaurant_id, customer_id, reward_id)
  do update set status = 'redeemed', staff_member_id = null, redeemed_at = now()
    where public.customer_rewards.status <> 'redeemed'
  returning id into redemption_id;

  if redemption_id is null then
    raise exception 'Diese Belohnung wurde bereits eingelöst.';
  end if;

  update public.reward_redemption_codes
  set status = 'expired'
  where restaurant_id = customer_record.restaurant_id
    and customer_id = customer_record.id
    and reward_id = reward_record.id
    and status = 'active';

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
    'customer_reward_redeemed',
    'rewards',
    reward_record.id,
    jsonb_build_object(
      'customer_id', customer_record.id,
      'customer_reward_id', redemption_id,
      'required_points', required_points_value,
      'required_stamps', required_stamps_value,
      'is_starter_reward', coalesce(customer_reward_record.is_starter_reward, false)
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

revoke execute on function public.generate_daily_pin_code()
from public, anon, authenticated;

revoke execute on function public.ensure_today_restaurant_pin(uuid, uuid)
from public, anon, authenticated;

revoke execute on function public.get_today_restaurant_pin(uuid)
from public, anon;

grant execute on function public.get_today_restaurant_pin(uuid)
to authenticated;

revoke execute on function public.collect_bonus_points(text, text, text)
from public, anon, authenticated;

grant execute on function public.collect_bonus_points(text, text, text)
to anon, authenticated;

revoke execute on function public.collect_bonus_points(text, text, text, text)
from public, anon, authenticated;

grant execute on function public.collect_bonus_points(text, text, text, text)
to anon, authenticated;

revoke execute on function public.collect_bonus_points(text, text, text, text, text)
from public;

grant execute on function public.collect_bonus_points(text, text, text, text, text)
to anon, authenticated;

revoke execute on function public.create_redemption_code(text, uuid)
from public, anon, authenticated;

revoke execute on function public.redeem_reward_with_pin(text, uuid, text, text)
from public, anon, authenticated;

revoke execute on function public.redeem_customer_reward(text, uuid)
from public;

grant execute on function public.redeem_customer_reward(text, uuid)
to anon, authenticated;
