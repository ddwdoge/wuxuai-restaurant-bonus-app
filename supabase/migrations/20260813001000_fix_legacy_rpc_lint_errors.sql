-- Forward-only repair for seven legacy RPC lint errors.
-- No signatures, grants, tenant rules or active V1 product flows are changed.
-- Normal point rewards intentionally remain repeatable; therefore no broad
-- unique constraint is added to customer_rewards.

CREATE OR REPLACE FUNCTION public.redeem_reward(input_restaurant_id uuid, input_customer_id uuid, input_offer_source text, input_offer_id uuid, input_staff_pin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  staff_record public.staff_members%rowtype;
  customer_record public.customers%rowtype;
  reward_record public.rewards%rowtype;
  coupon_record public.coupons%rowtype;
  required_points_value integer := 0;
  required_stamps_value integer := 0;
  redemption_id uuid;
  next_points integer;
  next_stamps integer;
begin
  if not public.is_restaurant_admin(input_restaurant_id) then
    raise exception 'not allowed';
  end if;

  if coalesce(input_staff_pin, '') = '' then
    raise exception 'staff pin is required';
  end if;

  select *
  into staff_record
  from public.staff_members
  where restaurant_id = input_restaurant_id
    and active = true
    and pin_hash = extensions.crypt(input_staff_pin, pin_hash)
  limit 1;

  if staff_record.id is null then
    raise exception 'invalid staff pin';
  end if;

  select *
  into customer_record
  from public.customers
  where id = input_customer_id
    and restaurant_id = input_restaurant_id
  for update;

  if customer_record.id is null then
    raise exception 'customer not found for restaurant';
  end if;

  if exists (
    select 1
    from public.audit_log a
    where a.restaurant_id = input_restaurant_id
      and a.actor_type = 'staff'
      and a.actor_id = staff_record.id
      and a.action = 'staff_reward_redeemed'
      and a.target_id = input_offer_id
      and a.created_at > now() - interval '30 seconds'
      and a.metadata->>'customer_id' = input_customer_id::text
      and a.metadata->>'offer_source' = input_offer_source
  ) then
    raise exception 'duplicate reward redemption blocked';
  end if;

  if input_offer_source = 'reward' then
    select *
    into reward_record
    from public.rewards
    where id = input_offer_id
      and restaurant_id = input_restaurant_id
      and active = true
      and (expires_at is null or expires_at > now());

    if reward_record.id is null then
      raise exception 'reward not active';
    end if;

    if exists (
      select 1
      from public.customer_rewards
      where restaurant_id = input_restaurant_id
        and customer_id = input_customer_id
        and reward_id = input_offer_id
        and status = 'redeemed'
    ) then
      raise exception 'reward already redeemed';
    end if;

    required_points_value := reward_record.required_points;
    required_stamps_value := reward_record.required_stamps;

    update public.customers
    set
      points_balance = points_balance - required_points_value,
      stamp_balance = stamp_balance - required_stamps_value
    where id = input_customer_id
      and restaurant_id = input_restaurant_id
      and points_balance >= required_points_value
      and stamp_balance >= required_stamps_value
    returning points_balance, stamp_balance into next_points, next_stamps;

    if next_points is null then
      raise exception 'customer does not have enough balance';
    end if;

    update public.customer_rewards as existing_redemption
    set
      status = 'redeemed',
      staff_member_id = staff_record.id,
      redeemed_at = now()
    where existing_redemption.id = (
      select candidate.id
      from public.customer_rewards as candidate
      where candidate.restaurant_id = input_restaurant_id
        and candidate.customer_id = input_customer_id
        and candidate.reward_id = input_offer_id
        and candidate.status <> 'redeemed'
      order by candidate.is_starter_reward desc, candidate.created_at asc, candidate.id asc
      limit 1
      for update
    )
    returning existing_redemption.id into redemption_id;

    if redemption_id is null then
      insert into public.customer_rewards (
        restaurant_id,
        customer_id,
        reward_id,
        staff_member_id,
        status,
        redeemed_at
      )
      values (
        input_restaurant_id,
        input_customer_id,
        input_offer_id,
        staff_record.id,
        'redeemed',
        now()
      )
      returning id into redemption_id;
    end if;

    if redemption_id is null then
      raise exception 'reward already redeemed';
    end if;
  elsif input_offer_source = 'coupon' then
    select *
    into coupon_record
    from public.coupons
    where id = input_offer_id
      and restaurant_id = input_restaurant_id
      and status = 'active'
      and (expires_at is null or expires_at > now());

    if coupon_record.id is null then
      raise exception 'coupon not active';
    end if;

    if exists (
      select 1
      from public.coupon_redemptions
      where restaurant_id = input_restaurant_id
        and customer_id = input_customer_id
        and coupon_id = input_offer_id
    ) then
      raise exception 'coupon already redeemed';
    end if;

    required_points_value := coupon_record.required_points;
    required_stamps_value := coupon_record.required_stamps;

    update public.customers
    set
      points_balance = points_balance - required_points_value,
      stamp_balance = stamp_balance - required_stamps_value
    where id = input_customer_id
      and restaurant_id = input_restaurant_id
      and points_balance >= required_points_value
      and stamp_balance >= required_stamps_value
    returning points_balance, stamp_balance into next_points, next_stamps;

    if next_points is null then
      raise exception 'customer does not have enough balance';
    end if;

    insert into public.coupon_redemptions (
      restaurant_id,
      coupon_id,
      customer_id,
      staff_member_id
    )
    values (
      input_restaurant_id,
      input_offer_id,
      input_customer_id,
      staff_record.id
    )
    returning id into redemption_id;
  else
    raise exception 'unsupported offer source';
  end if;

  update public.campaign_customer_offers
  set status = 'redeemed', redeemed_at = now()
  where restaurant_id = input_restaurant_id
    and customer_id = input_customer_id
    and offer_source = input_offer_source
    and offer_id = input_offer_id
    and status <> 'redeemed';

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
    staff_record.id,
    'staff_reward_redeemed',
    case when input_offer_source = 'coupon' then 'coupons' else 'rewards' end,
    input_offer_id,
    jsonb_build_object(
      'customer_id', input_customer_id,
      'offer_source', input_offer_source,
      'required_points', required_points_value,
      'required_stamps', required_stamps_value,
      'redemption_id', redemption_id
    )
  );

  return jsonb_build_object(
    'staff_member_id', staff_record.id,
    'staff_member_name', staff_record.name,
    'points_balance', next_points,
    'stamp_balance', next_stamps,
    'redeemed_offer_id', input_offer_id,
    'redemption_id', redemption_id
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.redeem_reward_with_pin(input_customer_token text, input_reward_id uuid, input_code text, input_pin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  update public.customer_rewards as existing_redemption
  set
    status = 'redeemed',
    staff_member_id = staff_record.id,
    redeemed_at = now()
  where existing_redemption.id = (
    select candidate.id
    from public.customer_rewards as candidate
    where candidate.restaurant_id = customer_record.restaurant_id
      and candidate.customer_id = customer_record.id
      and candidate.reward_id = reward_record.id
      and candidate.status <> 'redeemed'
    order by candidate.is_starter_reward desc, candidate.created_at asc, candidate.id asc
    limit 1
    for update
  )
  returning existing_redemption.id into redemption_id;

  if redemption_id is null then
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
    returning id into redemption_id;
  end if;

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
$function$;

CREATE OR REPLACE FUNCTION public.redeem_reward_with_staff_session(input_restaurant_id uuid, input_customer_id uuid, input_offer_source text, input_offer_id uuid, input_staff_session_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  staff_record public.staff_members%rowtype;
  customer_record public.customers%rowtype;
  reward_record public.rewards%rowtype;
  coupon_record public.coupons%rowtype;
  customer_reward_record public.customer_rewards%rowtype;
  required_points_value integer := 0;
  required_stamps_value integer := 0;
  redemption_id uuid;
  next_points integer;
  next_stamps integer;
begin
  if not public.is_restaurant_admin(input_restaurant_id) then
    raise exception 'not allowed';
  end if;

  staff_record := public.get_staff_from_session(input_restaurant_id, input_staff_session_token);

  select *
  into customer_record
  from public.customers
  where id = input_customer_id
    and restaurant_id = input_restaurant_id
  for update;

  if customer_record.id is null then
    raise exception 'customer not found for restaurant';
  end if;

  if input_offer_source = 'reward' then
    select *
    into reward_record
    from public.rewards
    where id = input_offer_id
      and restaurant_id = input_restaurant_id
      and active = true
      and (expires_at is null or expires_at > now());

    if reward_record.id is null then
      raise exception 'reward not active';
    end if;

    select *
    into customer_reward_record
    from public.customer_rewards
    where restaurant_id = input_restaurant_id
      and customer_id = input_customer_id
      and reward_id = input_offer_id
    for update;

    if customer_reward_record.id is not null and customer_reward_record.status = 'redeemed' then
      raise exception 'reward already redeemed';
    end if;

    if customer_reward_record.id is not null and customer_reward_record.is_starter_reward = true then
      if customer_reward_record.status <> 'active' then
        raise exception 'Willkommensgeschenk ist noch nicht freigeschaltet';
      end if;

      if customer_reward_record.unlocked_at is null then
        raise exception 'Willkommensgeschenk ist noch nicht freigeschaltet';
      end if;

      if customer_reward_record.unlocked_at::date >= current_date then
        raise exception 'Willkommensgeschenk kann erst beim naechsten Besuch eingeloest werden';
      end if;

      required_points_value := 0;
      required_stamps_value := 0;
    else
      required_points_value := reward_record.required_points;
      required_stamps_value := reward_record.required_stamps;
    end if;

    update public.customers
    set
      points_balance = points_balance - required_points_value,
      stamp_balance = stamp_balance - required_stamps_value
    where id = input_customer_id
      and restaurant_id = input_restaurant_id
      and points_balance >= required_points_value
      and stamp_balance >= required_stamps_value
    returning points_balance, stamp_balance into next_points, next_stamps;

    if next_points is null then
      raise exception 'customer does not have enough balance';
    end if;

    update public.customer_rewards as existing_redemption
    set
      status = 'redeemed',
      staff_member_id = staff_record.id,
      redeemed_at = now()
    where existing_redemption.id = (
      select candidate.id
      from public.customer_rewards as candidate
      where candidate.restaurant_id = input_restaurant_id
        and candidate.customer_id = input_customer_id
        and candidate.reward_id = input_offer_id
        and candidate.status <> 'redeemed'
      order by candidate.is_starter_reward desc, candidate.created_at asc, candidate.id asc
      limit 1
      for update
    )
    returning existing_redemption.id into redemption_id;

    if redemption_id is null then
      insert into public.customer_rewards (
        restaurant_id,
        customer_id,
        reward_id,
        staff_member_id,
        status,
        redeemed_at
      )
      values (
        input_restaurant_id,
        input_customer_id,
        input_offer_id,
        staff_record.id,
        'redeemed',
        now()
      )
      returning id into redemption_id;
    end if;

    if redemption_id is null then
      raise exception 'reward already redeemed';
    end if;
  elsif input_offer_source = 'coupon' then
    select *
    into coupon_record
    from public.coupons
    where id = input_offer_id
      and restaurant_id = input_restaurant_id
      and status = 'active'
      and (expires_at is null or expires_at > now());

    if coupon_record.id is null then
      raise exception 'coupon not active';
    end if;

    required_points_value := coupon_record.required_points;
    required_stamps_value := coupon_record.required_stamps;

    update public.customers
    set
      points_balance = points_balance - required_points_value,
      stamp_balance = stamp_balance - required_stamps_value
    where id = input_customer_id
      and restaurant_id = input_restaurant_id
      and points_balance >= required_points_value
      and stamp_balance >= required_stamps_value
    returning points_balance, stamp_balance into next_points, next_stamps;

    if next_points is null then
      raise exception 'customer does not have enough balance';
    end if;

    insert into public.coupon_redemptions (
      restaurant_id,
      coupon_id,
      customer_id,
      staff_member_id
    )
    values (
      input_restaurant_id,
      input_offer_id,
      input_customer_id,
      staff_record.id
    )
    returning id into redemption_id;
  else
    raise exception 'unsupported offer source';
  end if;

  update public.campaign_customer_offers
  set status = 'redeemed', redeemed_at = now()
  where restaurant_id = input_restaurant_id
    and customer_id = input_customer_id
    and offer_source = input_offer_source
    and offer_id = input_offer_id
    and status <> 'redeemed';

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
    staff_record.id,
    'staff_reward_redeemed',
    case when input_offer_source = 'coupon' then 'coupons' else 'rewards' end,
    input_offer_id,
    jsonb_build_object(
      'customer_id', input_customer_id,
      'offer_source', input_offer_source,
      'required_points', required_points_value,
      'required_stamps', required_stamps_value,
      'redemption_id', redemption_id,
      'is_starter_reward', coalesce(customer_reward_record.is_starter_reward, false)
    )
  );

  return jsonb_build_object(
    'staff_member_id', staff_record.id,
    'staff_member_name', staff_record.name,
    'points_balance', next_points,
    'stamp_balance', next_stamps,
    'redeemed_offer_id', input_offer_id,
    'redemption_id', redemption_id
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.register_campaign_customer(input_restaurant_slug text, input_campaign_slug text, input_name text, input_phone text, input_birthday date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  restaurant_record public.restaurants%rowtype;
  campaign_record public.campaigns%rowtype;
  customer_record public.customers%rowtype;
  normalized_name text;
  normalized_phone_value text;
  next_code text;
  offer_source_value text;
  offer_id_value uuid;
  starter_issued boolean := false;
  inserted_count integer := 0;
  raw_customer_token text;
  token_id uuid;
begin
  normalized_name := trim(coalesce(input_name, ''));
  normalized_phone_value := regexp_replace(trim(coalesce(input_phone, '')), '\s+', '', 'g');

  if length(normalized_name) < 2 or length(normalized_name) > 120 then
    raise exception 'name is required';
  end if;

  if length(normalized_phone_value) < 5 or length(normalized_phone_value) > 32 then
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
  into campaign_record
  from public.campaigns
  where restaurant_id = restaurant_record.id
    and slug = trim(input_campaign_slug)
    and status = 'active'
    and (start_date is null or start_date <= current_date)
    and (end_date is null or end_date >= current_date);

  if campaign_record.id is null then
    raise exception 'campaign not active';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(restaurant_record.id::text || ':' || normalized_phone_value, 0));

  select *
  into customer_record
  from public.customers as existing_customer
  where existing_customer.restaurant_id = restaurant_record.id
    and existing_customer.phone = normalized_phone_value
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
      normalized_phone_value,
      input_birthday,
      next_code
    )
    returning * into customer_record;

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
      'public_customer_registered',
      'customers',
      customer_record.id,
      jsonb_build_object('campaign_slug', campaign_record.slug)
    );
  end if;

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
  )
  returning id into token_id;

  offer_source_value := campaign_record.starter_offer_source;
  offer_id_value := case
    when offer_source_value = 'reward' then campaign_record.starter_reward_id
    when offer_source_value = 'coupon' then campaign_record.starter_coupon_id
    else null
  end;

  insert into public.campaign_events (restaurant_id, campaign_id, customer_id, event_type)
  values (restaurant_record.id, campaign_record.id, customer_record.id, 'registration');

  if offer_source_value is not null and offer_id_value is not null then
    insert into public.campaign_customer_offers (
      restaurant_id,
      campaign_id,
      customer_id,
      offer_source,
      offer_id
    )
    values (
      restaurant_record.id,
      campaign_record.id,
      customer_record.id,
      offer_source_value,
      offer_id_value
    )
    on conflict do nothing;

    get diagnostics inserted_count = row_count;
    starter_issued := inserted_count > 0;

    if offer_source_value = 'reward' then
      insert into public.customer_rewards (
        restaurant_id,
        customer_id,
        reward_id,
        status
      )
      select
        restaurant_record.id,
        customer_record.id,
        offer_id_value,
        'active'
      where not exists (
        select 1
        from public.customer_rewards as existing_offer
        where existing_offer.restaurant_id = restaurant_record.id
          and existing_offer.customer_id = customer_record.id
          and existing_offer.reward_id = offer_id_value
      );
    end if;

    if starter_issued then
      insert into public.campaign_events (
        restaurant_id,
        campaign_id,
        customer_id,
        event_type,
        metadata
      )
      values (
        restaurant_record.id,
        campaign_record.id,
        customer_record.id,
        'starter_reward',
        jsonb_build_object('offer_source', offer_source_value, 'offer_id', offer_id_value)
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
        'public_starter_offer_issued',
        'campaign_customer_offers',
        customer_record.id,
        jsonb_build_object(
          'campaign_id', campaign_record.id,
          'offer_source', offer_source_value,
          'offer_id', offer_id_value
        )
      );
    end if;
  end if;

  return jsonb_build_object(
    'restaurant', jsonb_build_object(
      'name', restaurant_record.name,
      'slug', restaurant_record.slug,
      'status', restaurant_record.status
    ),
    'campaign', jsonb_build_object(
      'title', campaign_record.title,
      'slug', campaign_record.slug,
      'description', campaign_record.description,
      'status', campaign_record.status
    ),
    'customer', jsonb_build_object(
      'name', customer_record.name,
      'customer_code', customer_record.customer_code,
      'customer_qr_token', raw_customer_token
    ),
    'starter_offer_source', offer_source_value,
    'starter_offer_id', offer_id_value,
    'starter_issued', starter_issued
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.register_referral_customer(input_restaurant_slug text, input_referral_token text, input_first_name text, input_phone text, input_birthday date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  restaurant_record public.restaurants%rowtype;
  referral_record public.referrals%rowtype;
  referrer_record public.customers%rowtype;
  customer_record public.customers%rowtype;
  normalized_name text;
  normalized_phone_value text;
  next_code text;
  raw_customer_token text;
begin
  normalized_name := trim(coalesce(input_first_name, ''));
  normalized_phone_value := regexp_replace(trim(coalesce(input_phone, '')), '\s+', '', 'g');

  if length(normalized_name) < 2 or length(normalized_name) > 80 then
    raise exception 'first name is required';
  end if;

  if length(normalized_phone_value) < 5 or length(normalized_phone_value) > 32 then
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

  if regexp_replace(coalesce(referrer_record.phone, ''), '\s+', '', 'g') = normalized_phone_value then
    raise exception 'self referral is not allowed';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(restaurant_record.id::text || ':' || normalized_phone_value, 0));

  select *
  into customer_record
  from public.customers as existing_customer
  where existing_customer.restaurant_id = restaurant_record.id
    and existing_customer.phone = normalized_phone_value
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
      normalized_phone_value,
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
$function$;

CREATE OR REPLACE FUNCTION public.register_referral_customer(input_restaurant_slug text, input_referral_token text, input_first_name text, input_phone text, input_birthday date, input_device_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  result_payload jsonb;
  restaurant_record public.restaurants%rowtype;
  referral_record public.referrals%rowtype;
  referrer_record public.customers%rowtype;
  existing_customer_record public.customers%rowtype;
  customer_id_value uuid;
  customer_token text;
  normalized_phone_value text;
  normalized_device_id text;
begin
  normalized_phone_value := regexp_replace(trim(coalesce(input_phone, '')), '\s+', '', 'g');
  normalized_device_id := nullif(trim(coalesce(input_device_id, '')), '');

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

  select *
  into referrer_record
  from public.customers
  where id = referral_record.referrer_customer_id
    and restaurant_id = restaurant_record.id;

  if regexp_replace(coalesce(referrer_record.phone, ''), '\s+', '', 'g') = normalized_phone_value then
    raise exception 'self referral is not allowed';
  end if;

  select *
  into existing_customer_record
  from public.customers as existing_customer
  where existing_customer.restaurant_id = restaurant_record.id
    and existing_customer.phone = normalized_phone_value
  limit 1;

  if existing_customer_record.id is not null then
    if existing_customer_record.id = referrer_record.id then
      raise exception 'self referral is not allowed';
    end if;

    if exists (
      select 1
      from public.referrals r
      where r.restaurant_id = restaurant_record.id
        and r.referrer_customer_id = existing_customer_record.id
        and r.referred_customer_id = referrer_record.id
        and r.status in ('pending_registered', 'activated')
    ) then
      raise exception 'circular referral is not allowed';
    end if;

    if exists (
      select 1
      from public.referrals r
      where r.restaurant_id = restaurant_record.id
        and r.id <> referral_record.id
        and r.referrer_customer_id = referrer_record.id
        and r.referred_customer_id = existing_customer_record.id
        and r.status in ('pending_registered', 'activated')
    ) then
      raise exception 'duplicate referral is not allowed';
    end if;
  end if;

  result_payload := public.register_referral_customer(
    input_restaurant_slug,
    input_referral_token,
    input_first_name,
    input_phone,
    input_birthday
  );

  customer_token := result_payload #>> '{customer,customer_qr_token}';
  customer_id_value := public.resolve_customer_from_public_token(restaurant_record.id, customer_token);

  perform public.record_customer_device(restaurant_record.id, customer_id_value, normalized_device_id);

  update public.audit_log
  set metadata = metadata || jsonb_build_object('device_id', normalized_device_id)
  where restaurant_id = restaurant_record.id
    and target_id = referral_record.id
    and action = 'public_referral_registered'
    and normalized_device_id is not null;

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
    customer_id_value,
    'public_customer_device_seen',
    'customer_devices',
    customer_id_value,
    jsonb_build_object('device_id', normalized_device_id, 'source', 'referral_registration', 'referral_id', referral_record.id)
  );

  return result_payload;
end;
$function$;

CREATE OR REPLACE FUNCTION public.register_restaurant_customer(input_restaurant_slug text, input_first_name text, input_phone text, input_birthday date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  restaurant_record public.restaurants%rowtype;
  customer_record public.customers%rowtype;
  normalized_name text;
  normalized_phone_value text;
  next_code text;
  raw_customer_token text;
  token_id uuid;
begin
  normalized_name := trim(coalesce(input_first_name, ''));
  normalized_phone_value := regexp_replace(trim(coalesce(input_phone, '')), '\s+', '', 'g');

  if length(normalized_name) < 2 or length(normalized_name) > 80 then
    raise exception 'Vorname ist erforderlich';
  end if;

  if length(normalized_phone_value) < 5 or length(normalized_phone_value) > 32 then
    raise exception 'Telefonnummer ist erforderlich';
  end if;

  select *
  into restaurant_record
  from public.restaurants
  where slug = trim(input_restaurant_slug)
    and status = 'active';

  if restaurant_record.id is null then
    raise exception 'Restaurant wurde nicht gefunden';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(restaurant_record.id::text || ':' || normalized_phone_value, 0));

  select *
  into customer_record
  from public.customers as existing_customer
  where existing_customer.restaurant_id = restaurant_record.id
    and existing_customer.phone = normalized_phone_value
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
      normalized_phone_value,
      input_birthday,
      next_code
    )
    returning * into customer_record;

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
      'public_customer_registered',
      'customers',
      customer_record.id,
      jsonb_build_object('source', 'restaurant_qr_v1')
    );
  end if;

  raw_customer_token := encode(gen_random_bytes(32), 'hex');

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
  )
  returning id into token_id;

  return jsonb_build_object(
    'restaurant', jsonb_build_object(
      'name', restaurant_record.name,
      'slug', restaurant_record.slug,
      'status', restaurant_record.status
    ),
    'campaign', null,
    'customer', jsonb_build_object(
      'name', customer_record.name,
      'customer_code', customer_record.customer_code,
      'customer_qr_token', raw_customer_token
    ),
    'starter_offer_source', null,
    'starter_offer_id', null,
    'starter_issued', false
  );
end;
$function$;

-- Keep implementation helpers behind the current legal/public contracts.
revoke execute on function public.redeem_reward(uuid, uuid, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.redeem_reward_with_pin(text, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.redeem_reward_with_staff_session(uuid, uuid, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.register_campaign_customer(text, text, text, text, date) from public, anon, authenticated;
revoke execute on function public.register_referral_customer(text, text, text, text, date) from public, anon, authenticated;
revoke execute on function public.register_referral_customer(text, text, text, text, date, text) from public, anon, authenticated;
revoke execute on function public.register_restaurant_customer(text, text, text, date) from public, anon, authenticated;

notify pgrst, 'reload schema';
