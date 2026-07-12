alter table public.loyalty_settings
alter column bonus_amount_tiers set default '[
  {"key":"0_10","label":"0–10 €","min":0,"max":10,"amount":0},
  {"key":"10_20","label":"10–20 €","min":10,"max":20,"amount":10},
  {"key":"20_30","label":"20–30 €","min":20,"max":30,"amount":20},
  {"key":"30_40","label":"30–40 €","min":30,"max":40,"amount":30},
  {"key":"40_50","label":"40–50 €","min":40,"max":50,"amount":40},
  {"key":"50_75","label":"50–75 €","min":50,"max":75,"amount":50},
  {"key":"75_100","label":"75–100 €","min":75,"max":100,"amount":75},
  {"key":"100_plus","label":"100+ €","min":100,"max":null,"amount":100}
]'::jsonb;

update public.loyalty_settings
set bonus_amount_tiers = (
  select coalesce(
    jsonb_agg(
      tier || jsonb_build_object(
        'amount',
        greatest(coalesce((tier->>'min')::numeric, 0), 0)
      )
      order by ordinality
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(bonus_amount_tiers) with ordinality as tiers(tier, ordinality)
)
where jsonb_typeof(bonus_amount_tiers) = 'array';

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
  tier_amount := greatest(
    coalesce((tier_record->>'min')::numeric, (tier_record->>'amount')::numeric, 0),
    0
  );

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

revoke execute on function public.collect_bonus_points(text, text, text)
from public;

grant execute on function public.collect_bonus_points(text, text, text)
to anon, authenticated;
