create table if not exists public.daily_pin_attempts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete restrict,
  branch_id uuid references public.branches(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete cascade,
  customer_token_hash text,
  valid_date date not null,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  last_failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists daily_pin_attempts_restaurant_branch_customer_date_idx
on public.daily_pin_attempts (restaurant_id, branch_id, customer_id, valid_date)
nulls not distinct;

create index if not exists daily_pin_attempts_lock_idx
on public.daily_pin_attempts (restaurant_id, branch_id, customer_id, locked_until);

drop trigger if exists set_daily_pin_attempts_branch_scope on public.daily_pin_attempts;
create trigger set_daily_pin_attempts_branch_scope
before insert or update of restaurant_id, organization_id, branch_id
on public.daily_pin_attempts
for each row execute function public.set_branch_scope_from_restaurant();

alter table public.daily_pin_attempts enable row level security;

drop policy if exists daily_pin_attempts_member_select on public.daily_pin_attempts;
create policy daily_pin_attempts_member_select
on public.daily_pin_attempts for select
using (public.is_restaurant_member(restaurant_id));

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
  today_points_collections integer := 0;
  next_reward jsonb;
  points_transaction_id uuid;
  referral_record public.referrals%rowtype;
  referrer_boost_id uuid;
  referred_boost_id uuid;
  normalized_device_id text;
  daily_pin_record public.restaurant_daily_pins%rowtype;
  attempt_record public.daily_pin_attempts%rowtype;
  unlocked_count integer := 0;
  branch_id_value uuid;
  token_hash_value text;
  local_valid_date date := timezone('Europe/Vienna', now())::date;
  local_day_start timestamptz := (timezone('Europe/Vienna', now())::date::timestamp at time zone 'Europe/Vienna');
  local_next_day_start timestamptz := (((timezone('Europe/Vienna', now())::date + 1)::timestamp) at time zone 'Europe/Vienna');
begin
  normalized_device_id := nullif(trim(coalesce(input_device_id, '')), '');
  token_hash_value := public.hash_public_token(input_customer_token);

  select *
  into restaurant_record
  from public.restaurants
  where slug = trim(input_restaurant_slug)
    and status = 'active';

  if restaurant_record.id is null then
    raise exception 'restaurant not found';
  end if;

  branch_id_value := coalesce(restaurant_record.primary_branch_id, public.restaurant_primary_branch_id(restaurant_record.id));
  daily_pin_record := public.ensure_today_restaurant_pin(restaurant_record.id, branch_id_value);

  select c.*
  into customer_record
  from public.customer_qr_tokens cqt
  join public.customers c on c.id = cqt.customer_id
  where cqt.restaurant_id = restaurant_record.id
    and cqt.token_hash = token_hash_value
    and cqt.active = true
    and (cqt.expires_at is null or cqt.expires_at > now())
    and c.restaurant_id = restaurant_record.id
  limit 1
  for update of c;

  if customer_record.id is null then
    raise exception 'customer token not valid';
  end if;

  select *
  into attempt_record
  from public.daily_pin_attempts
  where restaurant_id = restaurant_record.id
    and branch_id = branch_id_value
    and customer_id = customer_record.id
    and valid_date = local_valid_date
  for update;

  if attempt_record.id is not null
    and attempt_record.locked_until is not null
    and attempt_record.locked_until > now() then
    raise exception 'Zu viele falsche Versuche. Bitte wende dich an das Restaurant.';
  end if;

  if daily_pin_record.valid_until <= now() then
    raise exception 'Die Tages-PIN ist nicht mehr gültig.';
  end if;

  if daily_pin_record.pin_code <> trim(coalesce(input_daily_pin, '')) then
    insert into public.daily_pin_attempts (
      restaurant_id,
      organization_id,
      branch_id,
      customer_id,
      customer_token_hash,
      valid_date,
      failed_attempts,
      locked_until,
      last_failed_at,
      updated_at
    )
    values (
      restaurant_record.id,
      restaurant_record.organization_id,
      branch_id_value,
      customer_record.id,
      token_hash_value,
      local_valid_date,
      1,
      null,
      now(),
      now()
    )
    on conflict (restaurant_id, branch_id, customer_id, valid_date)
    do update set
      failed_attempts = public.daily_pin_attempts.failed_attempts + 1,
      locked_until = case
        when public.daily_pin_attempts.failed_attempts + 1 >= 5 then local_next_day_start
        else public.daily_pin_attempts.locked_until
      end,
      last_failed_at = now(),
      updated_at = now(),
      customer_token_hash = excluded.customer_token_hash
    returning * into attempt_record;

    insert into public.audit_log (
      restaurant_id,
      organization_id,
      branch_id,
      actor_type,
      actor_id,
      action,
      target_table,
      target_id,
      metadata
    )
    values (
      restaurant_record.id,
      restaurant_record.organization_id,
      branch_id_value,
      'customer',
      customer_record.id,
      'daily_pin_failed',
      'daily_pin_attempts',
      attempt_record.id,
      jsonb_build_object(
        'customer_id', customer_record.id,
        'restaurant_id', restaurant_record.id,
        'branch_id', branch_id_value,
        'valid_date', local_valid_date,
        'failed_attempts', attempt_record.failed_attempts
      )
    );

    if attempt_record.failed_attempts >= 5 then
      insert into public.audit_log (
        restaurant_id,
        organization_id,
        branch_id,
        actor_type,
        actor_id,
        action,
        target_table,
        target_id,
        metadata
      )
      values (
        restaurant_record.id,
        restaurant_record.organization_id,
        branch_id_value,
        'system',
        customer_record.id,
        'daily_pin_locked',
        'daily_pin_attempts',
        attempt_record.id,
        jsonb_build_object(
          'customer_id', customer_record.id,
          'restaurant_id', restaurant_record.id,
          'branch_id', branch_id_value,
          'valid_date', local_valid_date,
          'failed_attempts', attempt_record.failed_attempts,
          'locked_until', attempt_record.locked_until
        )
      );

      raise exception 'Zu viele falsche Versuche. Bitte wende dich an das Restaurant.';
    end if;

    raise exception 'Die Tages-PIN ist nicht korrekt.';
  end if;

  select count(*)
  into today_points_collections
  from public.points_transactions
  where restaurant_id = restaurant_record.id
    and branch_id = branch_id_value
    and customer_id = customer_record.id
    and type = 'earn'
    and points > 0
    and created_at >= local_day_start
    and created_at < local_next_day_start;

  if today_points_collections >= 2 then
    insert into public.audit_log (
      restaurant_id,
      organization_id,
      branch_id,
      actor_type,
      actor_id,
      action,
      target_table,
      target_id,
      metadata
    )
    values (
      restaurant_record.id,
      restaurant_record.organization_id,
      branch_id_value,
      'customer',
      customer_record.id,
      'points_daily_limit_blocked',
      'points_transactions',
      customer_record.id,
      jsonb_build_object(
        'customer_id', customer_record.id,
        'restaurant_id', restaurant_record.id,
        'branch_id', branch_id_value,
        'valid_date', local_valid_date,
        'successful_collections_today', today_points_collections,
        'source', 'bonus_qr'
      )
    );

    raise exception 'Du hast heute bereits Punkte gesammelt.';
  end if;

  select *
  into settings_record
  from public.loyalty_settings
  where restaurant_id = restaurant_record.id
    and active = true;

  if settings_record.id is null then
    raise exception 'bonus program not active';
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
    and branch_id = branch_id_value
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
    organization_id,
    branch_id,
    customer_id,
    staff_member_id,
    type,
    points,
    reason
  )
  values (
    restaurant_record.id,
    restaurant_record.organization_id,
    branch_id_value,
    customer_record.id,
    null,
    'earn',
    final_points,
    'bonus_qr'
  )
  returning id into points_transaction_id;

  update public.daily_pin_attempts
  set failed_attempts = 0,
      locked_until = null,
      updated_at = now()
  where restaurant_id = restaurant_record.id
    and branch_id = branch_id_value
    and customer_id = customer_record.id
    and valid_date = local_valid_date
    and locked_until is null;

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
      'device_id', normalized_device_id,
      'daily_collection_count_before', today_points_collections
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

create or replace function public.apply_staff_daily_pin_loyalty_action(
  input_restaurant_id uuid,
  input_customer_id uuid,
  input_daily_pin text,
  input_loyalty_mode text,
  input_points integer default 0,
  input_stamps integer default 0,
  input_reason text default '',
  input_rule_id uuid default null,
  input_bill_amount numeric default null
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
  rule_record public.loyalty_rules%rowtype;
  daily_pin_record public.restaurant_daily_pins%rowtype;
  attempt_record public.daily_pin_attempts%rowtype;
  transaction_id uuid;
  audit_id uuid;
  next_points integer;
  next_stamps integer;
  awarded_points integer := 0;
  awarded_stamps integer := 0;
  action_reason text;
  previous_points_transactions integer := 0;
  today_points_collections integer := 0;
  referral_record public.referrals%rowtype;
  referrer_boost_id uuid;
  referred_boost_id uuid;
  unlocked_count integer := 0;
  branch_id_value uuid;
  local_valid_date date := timezone('Europe/Vienna', now())::date;
  local_day_start timestamptz := (timezone('Europe/Vienna', now())::date::timestamp at time zone 'Europe/Vienna');
  local_next_day_start timestamptz := (((timezone('Europe/Vienna', now())::date + 1)::timestamp) at time zone 'Europe/Vienna');
begin
  if not public.is_restaurant_member(input_restaurant_id) then
    raise exception 'Nicht berechtigt.';
  end if;

  select *
  into restaurant_record
  from public.restaurants
  where id = input_restaurant_id
    and status = 'active';

  if restaurant_record.id is null then
    raise exception 'Restaurant wurde nicht gefunden.';
  end if;

  branch_id_value := coalesce(restaurant_record.primary_branch_id, public.restaurant_primary_branch_id(restaurant_record.id));

  select *
  into customer_record
  from public.customers
  where id = input_customer_id
    and restaurant_id = input_restaurant_id
  for update;

  if customer_record.id is null then
    raise exception 'Gast wurde nicht gefunden.';
  end if;

  if nullif(trim(coalesce(input_daily_pin, '')), '') is null then
    raise exception 'Bitte gib die Tages-PIN ein.';
  end if;

  daily_pin_record := public.ensure_today_restaurant_pin(restaurant_record.id, branch_id_value);

  select *
  into attempt_record
  from public.daily_pin_attempts
  where restaurant_id = restaurant_record.id
    and branch_id = branch_id_value
    and customer_id = customer_record.id
    and valid_date = local_valid_date
  for update;

  if attempt_record.id is not null
    and attempt_record.locked_until is not null
    and attempt_record.locked_until > now() then
    raise exception 'Zu viele falsche Versuche. Bitte wende dich an das Restaurant.';
  end if;

  if daily_pin_record.valid_until <= now() then
    raise exception 'Die Tages-PIN ist nicht mehr gültig.';
  end if;

  if daily_pin_record.pin_code <> trim(coalesce(input_daily_pin, '')) then
    insert into public.daily_pin_attempts (
      restaurant_id,
      organization_id,
      branch_id,
      customer_id,
      customer_token_hash,
      valid_date,
      failed_attempts,
      locked_until,
      last_failed_at,
      updated_at
    )
    values (
      restaurant_record.id,
      restaurant_record.organization_id,
      branch_id_value,
      customer_record.id,
      null,
      local_valid_date,
      1,
      null,
      now(),
      now()
    )
    on conflict (restaurant_id, branch_id, customer_id, valid_date)
    do update set
      failed_attempts = public.daily_pin_attempts.failed_attempts + 1,
      locked_until = case
        when public.daily_pin_attempts.failed_attempts + 1 >= 5 then local_next_day_start
        else public.daily_pin_attempts.locked_until
      end,
      last_failed_at = now(),
      updated_at = now()
    returning * into attempt_record;

    insert into public.audit_log (
      restaurant_id,
      organization_id,
      branch_id,
      actor_type,
      actor_id,
      action,
      target_table,
      target_id,
      metadata
    )
    values (
      restaurant_record.id,
      restaurant_record.organization_id,
      branch_id_value,
      'staff',
      null,
      'daily_pin_failed',
      'daily_pin_attempts',
      attempt_record.id,
      jsonb_build_object(
        'customer_id', customer_record.id,
        'restaurant_id', restaurant_record.id,
        'branch_id', branch_id_value,
        'valid_date', local_valid_date,
        'failed_attempts', attempt_record.failed_attempts,
        'source', 'staff_portal'
      )
    );

    if attempt_record.failed_attempts >= 5 then
      insert into public.audit_log (
        restaurant_id,
        organization_id,
        branch_id,
        actor_type,
        actor_id,
        action,
        target_table,
        target_id,
        metadata
      )
      values (
        restaurant_record.id,
        restaurant_record.organization_id,
        branch_id_value,
        'system',
        null,
        'daily_pin_locked',
        'daily_pin_attempts',
        attempt_record.id,
        jsonb_build_object(
          'customer_id', customer_record.id,
          'restaurant_id', restaurant_record.id,
          'branch_id', branch_id_value,
          'valid_date', local_valid_date,
          'failed_attempts', attempt_record.failed_attempts,
          'locked_until', attempt_record.locked_until,
          'source', 'staff_portal'
        )
      );

      raise exception 'Zu viele falsche Versuche. Bitte wende dich an das Restaurant.';
    end if;

    raise exception 'Die Tages-PIN ist nicht korrekt.';
  end if;

  select *
  into settings_record
  from public.loyalty_settings
  where restaurant_id = input_restaurant_id
    and active = true;

  if settings_record.id is null then
    raise exception 'Bonusprogramm wurde nicht gefunden.';
  end if;

  if settings_record.loyalty_mode <> input_loyalty_mode then
    raise exception 'Bonusmodus passt nicht.';
  end if;

  if input_loyalty_mode = 'amount_based' then
    if coalesce(input_bill_amount, 0) <= 0 then
      raise exception 'Rechnungsbetrag fehlt.';
    end if;
    awarded_points := floor(input_bill_amount / settings_record.amount_per_point)::integer;
    awarded_stamps := 0;
    action_reason := 'Rechnungsbetrag ' || input_bill_amount::text;
  elsif input_loyalty_mode = 'menu_points' then
    if input_rule_id is null then
      raise exception 'Bonusregel fehlt.';
    end if;

    select *
    into rule_record
    from public.loyalty_rules
    where id = input_rule_id
      and restaurant_id = input_restaurant_id
      and active = true
      and points > 0
      and stamps = 0;

    if rule_record.id is null then
      raise exception 'Bonusregel wurde nicht gefunden.';
    end if;

    awarded_points := rule_record.points;
    awarded_stamps := 0;
    action_reason := rule_record.title;
  elsif input_loyalty_mode = 'stamp_based' then
    if input_rule_id is not null then
      select *
      into rule_record
      from public.loyalty_rules
      where id = input_rule_id
        and restaurant_id = input_restaurant_id
        and active = true
        and stamps > 0
        and points = 0;

      if rule_record.id is null then
        raise exception 'Stempelregel wurde nicht gefunden.';
      end if;

      awarded_stamps := rule_record.stamps;
      action_reason := rule_record.title;
    else
      awarded_stamps := 1;
      action_reason := '1 Stempel';
    end if;
    awarded_points := 0;
  else
    raise exception 'Bonusmodus wird nicht unterstützt.';
  end if;

  if awarded_points <= 0 and awarded_stamps <= 0 then
    raise exception 'Es gibt nichts zu buchen.';
  end if;

  if awarded_points > 100000 or awarded_stamps > 100 then
    raise exception 'Buchung ist zu hoch.';
  end if;

  if awarded_points > 0 then
    select count(*)
    into today_points_collections
    from public.points_transactions
    where restaurant_id = input_restaurant_id
      and branch_id = branch_id_value
      and customer_id = input_customer_id
      and type = 'earn'
      and points > 0
      and created_at >= local_day_start
      and created_at < local_next_day_start;

    if today_points_collections >= 2 then
      insert into public.audit_log (
        restaurant_id,
        organization_id,
        branch_id,
        actor_type,
        actor_id,
        action,
        target_table,
        target_id,
        metadata
      )
      values (
        input_restaurant_id,
        restaurant_record.organization_id,
        branch_id_value,
        'staff',
        null,
        'points_daily_limit_blocked',
        'points_transactions',
        input_customer_id,
        jsonb_build_object(
          'customer_id', input_customer_id,
          'restaurant_id', input_restaurant_id,
          'branch_id', branch_id_value,
          'valid_date', local_valid_date,
          'successful_collections_today', today_points_collections,
          'source', 'staff_portal'
        )
      );

      raise exception 'Du hast heute bereits Punkte gesammelt.';
    end if;
  end if;

  if exists (
    select 1
    from public.audit_log a
    where a.restaurant_id = input_restaurant_id
      and a.actor_type = 'staff'
      and a.action = 'staff_loyalty_credit'
      and a.target_id = input_customer_id
      and a.created_at > now() - interval '30 seconds'
      and coalesce(a.metadata->>'source', '') = 'staff_portal'
      and coalesce((a.metadata->>'points')::integer, 0) = awarded_points
      and coalesce((a.metadata->>'stamps')::integer, 0) = awarded_stamps
  ) then
    raise exception 'Diese Buchung wurde gerade schon erfasst.';
  end if;

  select count(*)
  into previous_points_transactions
  from public.points_transactions
  where restaurant_id = input_restaurant_id
    and customer_id = input_customer_id
    and type = 'earn';

  if awarded_points > 0 then
    insert into public.points_transactions (
      restaurant_id,
      organization_id,
      branch_id,
      customer_id,
      staff_member_id,
      type,
      points,
      reason
    )
    values (
      input_restaurant_id,
      restaurant_record.organization_id,
      branch_id_value,
      input_customer_id,
      null,
      'earn',
      awarded_points,
      action_reason
    )
    returning id into transaction_id;

    update public.customers
    set points_balance = points_balance + awarded_points
    where id = input_customer_id
      and restaurant_id = input_restaurant_id
    returning points_balance, stamp_balance into next_points, next_stamps;

    update public.daily_pin_attempts
    set failed_attempts = 0,
        locked_until = null,
        updated_at = now()
    where restaurant_id = input_restaurant_id
      and branch_id = branch_id_value
      and customer_id = input_customer_id
      and valid_date = local_valid_date
      and locked_until is null;

    if previous_points_transactions = 0 and coalesce(settings_record.referral_boost_enabled, true) then
      select *
      into referral_record
      from public.referrals
      where restaurant_id = input_restaurant_id
        and referred_customer_id = input_customer_id
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
            input_restaurant_id,
            referral_record.referrer_customer_id,
            referral_record.id,
            settings_record.referral_boost_multiplier,
            settings_record.referral_boost_duration_days
          );

          referred_boost_id := public.upsert_referral_boost(
            input_restaurant_id,
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
            input_restaurant_id,
            'system',
            null,
            'referral_bonus_boost_activated',
            'referrals',
            referral_record.id,
            jsonb_build_object(
              'source', 'staff_portal_first_points_collection',
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
    where restaurant_id = input_restaurant_id
      and customer_id = input_customer_id
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
        input_restaurant_id,
        'system',
        input_customer_id,
        'welcome_starter_reward_unlocked',
        'customer_rewards',
        input_customer_id,
        jsonb_build_object('source', 'staff_portal_first_points_collection')
      );
    end if;
  else
    insert into public.stamp_transactions (
      restaurant_id,
      organization_id,
      branch_id,
      customer_id,
      staff_member_id,
      stamps,
      reason
    )
    values (
      input_restaurant_id,
      restaurant_record.organization_id,
      branch_id_value,
      input_customer_id,
      null,
      awarded_stamps,
      action_reason
    )
    returning id into transaction_id;

    update public.customers
    set stamp_balance = stamp_balance + awarded_stamps
    where id = input_customer_id
      and restaurant_id = input_restaurant_id
    returning points_balance, stamp_balance into next_points, next_stamps;
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
    null,
    'staff_loyalty_credit',
    'customers',
    input_customer_id,
    jsonb_build_object(
      'source', 'staff_portal',
      'confirmed_by_daily_pin', true,
      'daily_pin_id', daily_pin_record.id,
      'customer_id', input_customer_id,
      'loyalty_mode', input_loyalty_mode,
      'points', awarded_points,
      'stamps', awarded_stamps,
      'amount', input_bill_amount,
      'bill_amount', input_bill_amount,
      'reason', action_reason,
      'client_points', input_points,
      'client_stamps', input_stamps,
      'rule_id', input_rule_id,
      'transaction_id', transaction_id,
      'welcome_gift_unlocked', unlocked_count > 0,
      'daily_collection_count_before', today_points_collections
    )
  )
  returning id into audit_id;

  return jsonb_build_object(
    'points_added', awarded_points,
    'stamps_added', awarded_stamps,
    'points_balance', next_points,
    'stamp_balance', next_stamps,
    'transaction_id', transaction_id,
    'audit_id', audit_id,
    'welcome_gift_unlocked', unlocked_count > 0
  );
end;
$$;

revoke execute on function public.collect_bonus_points(text, text, text)
from public, anon, authenticated;

grant execute on function public.collect_bonus_points(text, text, text)
to anon, authenticated;

revoke execute on function public.collect_bonus_points(text, text, text, text, text)
from public, anon, authenticated;

grant execute on function public.collect_bonus_points(text, text, text, text, text)
to anon, authenticated;

revoke execute on function public.apply_staff_daily_pin_loyalty_action(uuid, uuid, text, text, integer, integer, text, uuid, numeric)
from public, anon, authenticated;

grant execute on function public.apply_staff_daily_pin_loyalty_action(uuid, uuid, text, text, integer, integer, text, uuid, numeric)
to authenticated;

notify pgrst, 'reload schema';
