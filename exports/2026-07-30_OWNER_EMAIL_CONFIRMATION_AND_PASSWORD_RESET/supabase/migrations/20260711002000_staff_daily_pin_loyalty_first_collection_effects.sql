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
  transaction_id uuid;
  audit_id uuid;
  next_points integer;
  next_stamps integer;
  awarded_points integer := 0;
  awarded_stamps integer := 0;
  action_reason text;
  previous_points_transactions integer := 0;
  referral_record public.referrals%rowtype;
  referrer_boost_id uuid;
  referred_boost_id uuid;
  unlocked_count integer := 0;
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

  if nullif(trim(coalesce(input_daily_pin, '')), '') is null then
    raise exception 'Bitte gib die Tages-PIN ein.';
  end if;

  daily_pin_record := public.ensure_today_restaurant_pin(
    restaurant_record.id,
    coalesce(restaurant_record.primary_branch_id, public.restaurant_primary_branch_id(restaurant_record.id))
  );

  if daily_pin_record.valid_until <= now() then
    raise exception 'Die Tages-PIN ist nicht mehr gültig.';
  end if;

  if daily_pin_record.pin_code <> trim(coalesce(input_daily_pin, '')) then
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

  select *
  into customer_record
  from public.customers
  where id = input_customer_id
    and restaurant_id = input_restaurant_id
  for update;

  if customer_record.id is null then
    raise exception 'Gast wurde nicht gefunden.';
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
      customer_id,
      staff_member_id,
      type,
      points,
      reason
    )
    values (
      input_restaurant_id,
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
      customer_id,
      staff_member_id,
      stamps,
      reason
    )
    values (
      input_restaurant_id,
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
      'welcome_gift_unlocked', unlocked_count > 0
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

revoke execute on function public.apply_staff_daily_pin_loyalty_action(uuid, uuid, text, text, integer, integer, text, uuid, numeric)
from public, anon, authenticated;

grant execute on function public.apply_staff_daily_pin_loyalty_action(uuid, uuid, text, text, integer, integer, text, uuid, numeric)
to authenticated;

notify pgrst, 'reload schema';
