-- WUXUAI Bonus V1
-- Security finalization for customer reward redemption RPCs.
--
-- V1 keeps point redemptions PIN-free with final customer confirmation.
-- Legacy 6-digit code + PIN redemption stays unavailable as a public V1 path.

create or replace function public.create_redemption_code(
  input_customer_token text,
  input_reward_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  token_record public.customer_qr_tokens%rowtype;
  customer_record public.customers%rowtype;
  reward_record public.rewards%rowtype;
  customer_reward_record public.customer_rewards%rowtype;
  next_code text;
  code_bytes bytea;
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
    raise exception 'Diese Punkteeinlösung ist nicht mehr verfügbar.';
  end if;

  select *
  into customer_reward_record
  from public.customer_rewards
  where restaurant_id = customer_record.restaurant_id
    and customer_id = customer_record.id
    and reward_id = reward_record.id
  for update;

  if reward_record.is_starter_reward = true then
    if customer_reward_record.id is null
      or customer_reward_record.status = 'redeemed'
      or customer_reward_record.status <> 'active'
      or customer_reward_record.unlocked_at is null then
      raise exception 'Dieses Willkommensgeschenk ist nicht mehr verfügbar.';
    end if;
  else
    if customer_record.points_balance < reward_record.required_points
      or customer_record.stamp_balance < reward_record.required_stamps then
      raise exception 'Du hast noch nicht genug Punkte.';
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
    code_bytes := extensions.gen_random_bytes(4);
    next_code := lpad(
      (
        (
          get_byte(code_bytes, 0)::bigint * 16777216
          + get_byte(code_bytes, 1)::bigint * 65536
          + get_byte(code_bytes, 2)::bigint * 256
          + get_byte(code_bytes, 3)::bigint
        ) % 1000000
      )::text,
      6,
      '0'
    );

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
    'legacy_reward_redemption_code_created',
    'reward_redemption_codes',
    code_record.id,
    jsonb_build_object(
      'customer_id', customer_record.id,
      'reward_id', reward_record.id,
      'public_v1_path', false
    )
  );

  return jsonb_build_object(
    'code', code_record.code,
    'expires_at', code_record.expires_at,
    'reward_id', reward_record.id
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
set search_path = public, extensions
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
      and restaurant_id = customer_record.restaurant_id
      and customer_id = customer_record.id
      and reward_id = reward_record.id
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

revoke execute on function public.create_redemption_code(text, uuid)
from public, anon, authenticated;

revoke execute on function public.redeem_reward_with_pin(text, uuid, text, text)
from public, anon, authenticated;

revoke execute on function public.redeem_customer_reward(text, uuid)
from public, anon, authenticated;

grant execute on function public.redeem_customer_reward(text, uuid)
to anon, authenticated;
