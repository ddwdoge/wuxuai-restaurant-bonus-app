-- WUXUAI Bonus V1
-- Live-Go hardening:
-- 1. Rate-limit public customer reward redemption attempts.
-- 2. Make owner trial completion idempotent for slow auth session propagation.

create table if not exists public.customer_reward_redemption_attempts (
  id uuid primary key default gen_random_uuid(),
  customer_token_hash text not null,
  reward_id uuid,
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  success boolean not null default false,
  reason text,
  created_at timestamptz not null default now()
);

alter table public.customer_reward_redemption_attempts enable row level security;

drop policy if exists "customer reward redemption attempts admin select"
on public.customer_reward_redemption_attempts;

create policy "customer reward redemption attempts admin select"
on public.customer_reward_redemption_attempts for select
using (
  restaurant_id is not null
  and public.is_restaurant_member(restaurant_id)
);

create index if not exists customer_reward_redemption_attempts_token_created_idx
on public.customer_reward_redemption_attempts (customer_token_hash, created_at desc);

create index if not exists customer_reward_redemption_attempts_restaurant_created_idx
on public.customer_reward_redemption_attempts (restaurant_id, created_at desc)
where restaurant_id is not null;

create or replace function public.redeem_customer_reward(
  input_customer_token text,
  input_reward_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  token_hash_value text := public.hash_public_token(input_customer_token);
  token_record public.customer_qr_tokens%rowtype;
  token_match_count integer := 0;
  recent_attempt_count integer := 0;
  customer_record public.customers%rowtype;
  reward_record public.rewards%rowtype;
  reward_exists_record public.rewards%rowtype;
  customer_reward_record public.customer_rewards%rowtype;
  customer_branch_id uuid;
  attempt_restaurant_id uuid;
  required_points_value integer := 0;
  required_stamps_value integer := 0;
  next_points integer;
  next_stamps integer;
  redemption_id uuid;
begin
  select count(*)
  into recent_attempt_count
  from public.customer_reward_redemption_attempts
  where customer_token_hash = token_hash_value
    and created_at >= now() - interval '10 minutes';

  if recent_attempt_count >= 5 then
    insert into public.customer_reward_redemption_attempts (
      customer_token_hash,
      reward_id,
      success,
      reason
    )
    values (
      token_hash_value,
      input_reward_id,
      false,
      'rate_limited'
    );

    return jsonb_build_object(
      'success', false,
      'reason', 'rate_limited',
      'message', 'Zu viele Einlöseversuche. Bitte warte kurz und versuche es erneut.'
    );
  end if;

  select count(*)
  into token_match_count
  from public.customer_qr_tokens
  where token_hash = token_hash_value
    and active = true
    and (expires_at is null or expires_at > now());

  if token_match_count <> 1 then
    insert into public.customer_reward_redemption_attempts (
      customer_token_hash,
      reward_id,
      success,
      reason
    )
    values (
      token_hash_value,
      input_reward_id,
      false,
      'invalid_token'
    );

    return jsonb_build_object(
      'success', false,
      'reason', 'invalid_token',
      'message', 'Diese Punkteeinlösung ist nicht mehr verfügbar.'
    );
  end if;

  select *
  into token_record
  from public.customer_qr_tokens
  where token_hash = token_hash_value
    and active = true
    and (expires_at is null or expires_at > now());

  select *
  into customer_record
  from public.customers
  where id = token_record.customer_id
    and restaurant_id = token_record.restaurant_id
    and branch_id is not distinct from token_record.branch_id
  for update;

  if customer_record.id is null then
    insert into public.customer_reward_redemption_attempts (
      customer_token_hash,
      reward_id,
      restaurant_id,
      success,
      reason
    )
    values (
      token_hash_value,
      input_reward_id,
      token_record.restaurant_id,
      false,
      'invalid_token'
    );

    return jsonb_build_object(
      'success', false,
      'reason', 'invalid_token',
      'message', 'Diese Punkteeinlösung ist nicht mehr verfügbar.'
    );
  end if;

  customer_branch_id := coalesce(customer_record.branch_id, public.restaurant_primary_branch_id(customer_record.restaurant_id));
  attempt_restaurant_id := customer_record.restaurant_id;

  select *
  into reward_exists_record
  from public.rewards
  where id = input_reward_id;

  if reward_exists_record.id is null
    or reward_exists_record.restaurant_id <> customer_record.restaurant_id
    or reward_exists_record.branch_id is distinct from customer_branch_id then
    insert into public.customer_reward_redemption_attempts (
      customer_token_hash,
      reward_id,
      restaurant_id,
      success,
      reason
    )
    values (
      token_hash_value,
      input_reward_id,
      attempt_restaurant_id,
      false,
      'foreign_reward'
    );

    return jsonb_build_object(
      'success', false,
      'reason', 'foreign_reward',
      'message', 'Diese Punkteeinlösung ist nicht mehr verfügbar.'
    );
  end if;

  if reward_exists_record.active <> true
    or (reward_exists_record.expires_at is not null and reward_exists_record.expires_at <= now()) then
    insert into public.customer_reward_redemption_attempts (
      customer_token_hash,
      reward_id,
      restaurant_id,
      success,
      reason
    )
    values (
      token_hash_value,
      input_reward_id,
      attempt_restaurant_id,
      false,
      'expired'
    );

    return jsonb_build_object(
      'success', false,
      'reason', 'expired',
      'message', 'Diese Punkteeinlösung ist nicht mehr verfügbar.'
    );
  end if;

  reward_record := reward_exists_record;

  if reward_record.is_starter_reward = true then
    select *
    into customer_reward_record
    from public.customer_rewards
    where restaurant_id = customer_record.restaurant_id
      and branch_id is not distinct from customer_branch_id
      and customer_id = customer_record.id
      and reward_id = reward_record.id
      and is_starter_reward = true
    for update;

    if customer_reward_record.id is null then
      insert into public.customer_reward_redemption_attempts (
        customer_token_hash,
        reward_id,
        restaurant_id,
        success,
        reason
      )
      values (
        token_hash_value,
        reward_record.id,
        attempt_restaurant_id,
        false,
        'locked'
      );

      return jsonb_build_object(
        'success', false,
        'reason', 'locked',
        'message', 'Dieses Willkommensgeschenk ist nicht mehr verfügbar.'
      );
    end if;

    if customer_reward_record.status = 'redeemed' then
      insert into public.customer_reward_redemption_attempts (
        customer_token_hash,
        reward_id,
        restaurant_id,
        success,
        reason
      )
      values (
        token_hash_value,
        reward_record.id,
        attempt_restaurant_id,
        false,
        'redeemed'
      );

      return jsonb_build_object(
        'success', false,
        'reason', 'redeemed',
        'message', 'Dieses Willkommensgeschenk wurde bereits eingelöst.'
      );
    end if;

    if customer_reward_record.status <> 'active'
      or customer_reward_record.unlocked_at is null then
      insert into public.customer_reward_redemption_attempts (
        customer_token_hash,
        reward_id,
        restaurant_id,
        success,
        reason
      )
      values (
        token_hash_value,
        reward_record.id,
        attempt_restaurant_id,
        false,
        'locked'
      );

      return jsonb_build_object(
        'success', false,
        'reason', 'locked',
        'message', 'Dieses Willkommensgeschenk ist nicht mehr verfügbar.'
      );
    end if;

    update public.customer_rewards
    set status = 'redeemed',
        staff_member_id = null,
        redeemed_at = now()
    where id = customer_reward_record.id
      and restaurant_id = customer_record.restaurant_id
      and branch_id is not distinct from customer_branch_id
      and customer_id = customer_record.id
      and reward_id = reward_record.id
      and status <> 'redeemed'
    returning id into redemption_id;

    if redemption_id is null then
      insert into public.customer_reward_redemption_attempts (
        customer_token_hash,
        reward_id,
        restaurant_id,
        success,
        reason
      )
      values (
        token_hash_value,
        reward_record.id,
        attempt_restaurant_id,
        false,
        'redeemed'
      );

      return jsonb_build_object(
        'success', false,
        'reason', 'redeemed',
        'message', 'Dieses Willkommensgeschenk wurde bereits eingelöst.'
      );
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
        'branch_id', customer_branch_id,
        'reward_id', reward_record.id,
        'is_starter_reward', true,
        'public_rpc', true
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
      and branch_id is not distinct from customer_branch_id
      and points_balance >= required_points_value
      and stamp_balance >= required_stamps_value
    returning points_balance, stamp_balance into next_points, next_stamps;

    if next_points is null then
      insert into public.customer_reward_redemption_attempts (
        customer_token_hash,
        reward_id,
        restaurant_id,
        success,
        reason
      )
      values (
        token_hash_value,
        reward_record.id,
        attempt_restaurant_id,
        false,
        'locked'
      );

      return jsonb_build_object(
        'success', false,
        'reason', 'locked',
        'message', 'Du hast noch nicht genug Punkte.'
      );
    end if;

    insert into public.reward_redemption_events (
      restaurant_id,
      branch_id,
      customer_id,
      reward_id,
      points_spent,
      stamps_spent,
      metadata
    )
    values (
      customer_record.restaurant_id,
      customer_branch_id,
      customer_record.id,
      reward_record.id,
      required_points_value,
      required_stamps_value,
      jsonb_build_object(
        'customer_balance_before', customer_record.points_balance,
        'customer_balance_after', next_points,
        'branch_id', customer_branch_id,
        'public_rpc', true
      )
    )
    returning id into redemption_id;

    if required_points_value > 0 then
      insert into public.points_transactions (
        restaurant_id,
        branch_id,
        customer_id,
        staff_member_id,
        type,
        points,
        reason
      )
      values (
        customer_record.restaurant_id,
        customer_branch_id,
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
        'branch_id', customer_branch_id,
        'redemption_event_id', redemption_id,
        'required_points', required_points_value,
        'required_stamps', required_stamps_value,
        'points_balance', next_points,
        'stamps_balance', next_stamps,
        'is_starter_reward', false,
        'public_rpc', true
      )
    );
  end if;

  update public.reward_redemption_codes
  set status = 'expired'
  where restaurant_id = customer_record.restaurant_id
    and customer_id = customer_record.id
    and reward_id = reward_record.id
    and status = 'active';

  insert into public.customer_reward_redemption_attempts (
    customer_token_hash,
    reward_id,
    restaurant_id,
    success,
    reason
  )
  values (
    token_hash_value,
    reward_record.id,
    attempt_restaurant_id,
    true,
    'success'
  );

  return jsonb_build_object(
    'success', true,
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
from public;

-- Public Customer Portal RPC.
-- anon is intentional because customers are identified by customer_token.
-- Security is enforced inside the function via customer_token, rate limit and reward ownership.
grant execute on function public.redeem_customer_reward(text, uuid)
to anon, authenticated;

revoke execute on function public.create_redemption_code(text, uuid)
from public, anon, authenticated;

revoke execute on function public.redeem_reward_with_pin(text, uuid, text, text)
from public, anon, authenticated;

create or replace function public.start_restaurant_owner_trial(
  input_owner_name text,
  input_restaurant_name text,
  input_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  user_id_value uuid := auth.uid();
  cleaned_owner_name text := nullif(trim(input_owner_name), '');
  cleaned_restaurant_name text := nullif(trim(input_restaurant_name), '');
  cleaned_phone text := nullif(trim(input_phone), '');
  slug_base text;
  slug_value text;
  restaurant_record public.restaurants%rowtype;
  branch_id_value uuid;
  subscription_record public.branch_subscriptions%rowtype;
  trial_started_at_value timestamptz := now();
  trial_ends_at_value timestamptz := now() + interval '30 days';
begin
  if user_id_value is null then
    raise exception 'not authenticated';
  end if;

  if cleaned_owner_name is null then
    raise exception 'owner name required';
  end if;

  if cleaned_restaurant_name is null then
    raise exception 'restaurant name required';
  end if;

  insert into public.profiles (id, full_name)
  values (user_id_value, cleaned_owner_name)
  on conflict (id) do update
  set full_name = excluded.full_name;

  select *
  into restaurant_record
  from public.restaurants
  where owner_id = user_id_value
  order by created_at asc
  limit 1;

  if restaurant_record.id is null then
    slug_base := lower(regexp_replace(cleaned_restaurant_name, '[^a-zA-Z0-9]+', '-', 'g'));
    slug_base := regexp_replace(slug_base, '(^-|-$)', '', 'g');

    if slug_base = '' then
      slug_base := 'restaurant';
    end if;

    slug_value := slug_base;

    while exists (select 1 from public.restaurants where slug = slug_value) loop
      slug_value := slug_base || '-' || substr(replace(extensions.gen_random_uuid()::text, '-', ''), 1, 6);
    end loop;

    insert into public.restaurants (
      owner_id,
      name,
      slug,
      status,
      restaurant_type,
      language,
      owner_phone,
      onboarding_status,
      onboarding_checklist
    )
    values (
      user_id_value,
      cleaned_restaurant_name,
      slug_value,
      'active',
      'restaurant',
      'de',
      cleaned_phone,
      'draft',
      '{}'::jsonb
    )
    returning * into restaurant_record;
  else
    update public.restaurants
    set name = coalesce(nullif(name, ''), cleaned_restaurant_name),
        owner_phone = coalesce(owner_phone, cleaned_phone),
        status = case when status = 'suspended' then status else 'active' end
    where id = restaurant_record.id
    returning * into restaurant_record;
  end if;

  branch_id_value := coalesce(restaurant_record.primary_branch_id, public.ensure_restaurant_branch(restaurant_record.id));

  insert into public.restaurant_members (
    restaurant_id,
    organization_id,
    branch_id,
    user_id,
    role
  )
  values (
    restaurant_record.id,
    restaurant_record.organization_id,
    branch_id_value,
    user_id_value,
    'owner'
  )
  on conflict (restaurant_id, user_id) do update
  set organization_id = excluded.organization_id,
      branch_id = excluded.branch_id,
      role = 'owner';

  insert into public.branch_subscriptions (
    organization_id,
    branch_id,
    status,
    plan_key,
    subscription_status,
    trial_started_at,
    trial_ends_at,
    current_period_ends_at
  )
  values (
    restaurant_record.organization_id,
    branch_id_value,
    'trialing',
    'pilot',
    'trialing',
    trial_started_at_value,
    trial_ends_at_value,
    trial_ends_at_value
  )
  on conflict (branch_id) do update
  set organization_id = excluded.organization_id,
      status = coalesce(branch_subscriptions.status, excluded.status),
      subscription_status = coalesce(branch_subscriptions.subscription_status, excluded.subscription_status),
      trial_started_at = coalesce(branch_subscriptions.trial_started_at, excluded.trial_started_at),
      trial_ends_at = coalesce(branch_subscriptions.trial_ends_at, excluded.trial_ends_at),
      current_period_ends_at = coalesce(branch_subscriptions.current_period_ends_at, excluded.current_period_ends_at)
  returning * into subscription_record;

  if subscription_record.id is null then
    raise exception 'branch subscription could not be created';
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
    'admin',
    user_id_value,
    'owner_trial_started',
    'restaurants',
    restaurant_record.id,
    jsonb_build_object(
      'owner_name', cleaned_owner_name,
      'trial_started_at', subscription_record.trial_started_at,
      'trial_ends_at', subscription_record.trial_ends_at,
      'subscription_status', subscription_record.subscription_status,
      'idempotent', true
    )
  );

  return jsonb_build_object(
    'restaurant', jsonb_build_object(
      'id', restaurant_record.id,
      'name', restaurant_record.name,
      'slug', restaurant_record.slug,
      'organization_id', restaurant_record.organization_id,
      'branch_id', branch_id_value
    ),
    'subscription', jsonb_build_object(
      'status', subscription_record.subscription_status,
      'trial_started_at', subscription_record.trial_started_at,
      'trial_ends_at', subscription_record.trial_ends_at
    )
  );
end;
$$;

revoke execute on function public.start_restaurant_owner_trial(text, text, text)
from public, anon;

grant execute on function public.start_restaurant_owner_trial(text, text, text)
to authenticated;
