drop policy if exists "campaigns tenant select" on public.campaigns;
drop policy if exists "coupons tenant select" on public.coupons;
drop policy if exists "rewards tenant select" on public.rewards;

create policy "campaigns member select"
on public.campaigns for select
using (public.is_restaurant_member(restaurant_id));

create policy "coupons member select"
on public.coupons for select
using (public.is_restaurant_member(restaurant_id));

create policy "rewards member select"
on public.rewards for select
using (public.is_restaurant_member(restaurant_id));

create or replace function public.get_public_campaign(
  input_restaurant_slug text,
  input_campaign_slug text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  restaurant_record public.restaurants%rowtype;
  branding_record public.restaurant_branding%rowtype;
  campaign_record public.campaigns%rowtype;
  reward_payload jsonb := null;
  coupon_payload jsonb := null;
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

  select *
  into branding_record
  from public.restaurant_branding
  where restaurant_id = restaurant_record.id;

  if campaign_record.starter_offer_source = 'reward' and campaign_record.starter_reward_id is not null then
    select jsonb_build_object(
      'title', r.title,
      'description', r.description,
      'reward_type', r.reward_type,
      'required_points', r.required_points,
      'required_stamps', r.required_stamps,
      'expires_at', r.expires_at
    )
    into reward_payload
    from public.rewards r
    where r.id = campaign_record.starter_reward_id
      and r.restaurant_id = restaurant_record.id
      and r.active = true
      and (r.expires_at is null or r.expires_at > now());
  elsif campaign_record.starter_offer_source = 'coupon' and campaign_record.starter_coupon_id is not null then
    select jsonb_build_object(
      'title', c.title,
      'description', c.description,
      'reward_type', c.reward_type,
      'required_points', c.required_points,
      'required_stamps', c.required_stamps,
      'expires_at', c.expires_at
    )
    into coupon_payload
    from public.coupons c
    where c.id = campaign_record.starter_coupon_id
      and c.restaurant_id = restaurant_record.id
      and c.status = 'active'
      and (c.expires_at is null or c.expires_at > now());
  end if;

  insert into public.campaign_events (restaurant_id, campaign_id, event_type)
  values (restaurant_record.id, campaign_record.id, 'scan');

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
    'public_campaign_scan',
    'campaigns',
    campaign_record.id,
    jsonb_build_object('campaign_slug', campaign_record.slug)
  );

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
    'campaign', jsonb_build_object(
      'title', campaign_record.title,
      'slug', campaign_record.slug,
      'description', campaign_record.description,
      'status', campaign_record.status,
      'start_date', campaign_record.start_date,
      'end_date', campaign_record.end_date
    ),
    'reward', reward_payload,
    'coupon', coupon_payload
  );
end;
$$;

create or replace function public.get_public_customer_portal(
  input_restaurant_slug text,
  input_customer_code text default null
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

  if nullif(trim(coalesce(input_customer_code, '')), '') is not null then
    select *
    into customer_record
    from public.customers
    where restaurant_id = restaurant_record.id
      and customer_code = trim(input_customer_code);

    if customer_record.id is null then
      raise exception 'customer not found';
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
        r.expires_at
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
        c.expires_at
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

grant execute on function public.get_public_customer_portal(text, text)
to anon, authenticated;

create or replace function public.register_campaign_customer(
  input_restaurant_slug text,
  input_campaign_slug text,
  input_name text,
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
  campaign_record public.campaigns%rowtype;
  customer_record public.customers%rowtype;
  normalized_name text;
  normalized_phone text;
  next_code text;
  offer_source_value text;
  offer_id_value uuid;
  starter_issued boolean := false;
  inserted_count integer := 0;
begin
  normalized_name := trim(coalesce(input_name, ''));
  normalized_phone := regexp_replace(trim(coalesce(input_phone, '')), '\s+', '', 'g');

  if length(normalized_name) < 2 or length(normalized_name) > 120 then
    raise exception 'name is required';
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
      values (
        restaurant_record.id,
        customer_record.id,
        offer_id_value,
        'active'
      )
      on conflict (restaurant_id, customer_id, reward_id) do nothing;
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
      'customer_code', customer_record.customer_code
    ),
    'starter_offer_source', offer_source_value,
    'starter_offer_id', offer_id_value,
    'starter_issued', starter_issued
  );
end;
$$;

create or replace function public.apply_loyalty_staff_action(
  input_restaurant_id uuid,
  input_customer_id uuid,
  input_staff_pin text,
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
  staff_record public.staff_members%rowtype;
  settings_record public.loyalty_settings%rowtype;
  customer_record public.customers%rowtype;
  rule_record public.loyalty_rules%rowtype;
  transaction_id uuid;
  audit_id uuid;
  next_points integer;
  next_stamps integer;
  awarded_points integer := 0;
  awarded_stamps integer := 0;
  action_reason text;
begin
  if not public.is_restaurant_admin(input_restaurant_id) then
    raise exception 'not allowed';
  end if;

  if input_restaurant_id is null or input_customer_id is null then
    raise exception 'restaurant_id and customer_id are required';
  end if;

  if coalesce(input_staff_pin, '') = '' then
    raise exception 'staff pin is required';
  end if;

  select *
  into settings_record
  from public.loyalty_settings
  where restaurant_id = input_restaurant_id
    and active = true;

  if settings_record.id is null then
    raise exception 'loyalty settings not found';
  end if;

  if settings_record.loyalty_mode <> input_loyalty_mode then
    raise exception 'loyalty mode mismatch';
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

  if input_loyalty_mode = 'amount_based' then
    if coalesce(input_bill_amount, 0) <= 0 then
      raise exception 'bill amount is required';
    end if;

    awarded_points := floor(input_bill_amount / settings_record.amount_per_point)::integer;
    awarded_stamps := 0;
    action_reason := 'Rechnungsbetrag ' || input_bill_amount::text;

    if awarded_points <= 0 then
      raise exception 'bill amount does not earn points';
    end if;
  elsif input_loyalty_mode = 'menu_points' then
    if input_rule_id is null then
      raise exception 'loyalty rule is required';
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
      raise exception 'loyalty rule not found';
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
        raise exception 'loyalty rule not found';
      end if;

      awarded_stamps := rule_record.stamps;
      action_reason := rule_record.title;
    else
      awarded_stamps := 1;
      action_reason := '1 Stempel';
    end if;

    awarded_points := 0;
  else
    raise exception 'unsupported loyalty mode';
  end if;

  if awarded_points < 0 or awarded_stamps < 0 or awarded_points > 100000 or awarded_stamps > 100 then
    raise exception 'loyalty amount out of range';
  end if;

  if exists (
    select 1
    from public.audit_log a
    where a.restaurant_id = input_restaurant_id
      and a.actor_type = 'staff'
      and a.actor_id = staff_record.id
      and a.action = 'staff_loyalty_credit'
      and a.target_id = input_customer_id
      and a.created_at > now() - interval '30 seconds'
      and a.metadata->>'loyalty_mode' = input_loyalty_mode
      and coalesce((a.metadata->>'points')::integer, 0) = awarded_points
      and coalesce((a.metadata->>'stamps')::integer, 0) = awarded_stamps
  ) then
    raise exception 'duplicate staff action blocked';
  end if;

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
      staff_record.id,
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
  elsif awarded_stamps > 0 then
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
      staff_record.id,
      awarded_stamps,
      action_reason
    )
    returning id into transaction_id;

    update public.customers
    set stamp_balance = stamp_balance + awarded_stamps
    where id = input_customer_id
      and restaurant_id = input_restaurant_id
    returning points_balance, stamp_balance into next_points, next_stamps;
  else
    raise exception 'nothing to award';
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
    staff_record.id,
    'staff_loyalty_credit',
    'customers',
    input_customer_id,
    jsonb_build_object(
      'loyalty_mode', input_loyalty_mode,
      'points', awarded_points,
      'stamps', awarded_stamps,
      'reason', action_reason,
      'client_points', input_points,
      'client_stamps', input_stamps,
      'rule_id', input_rule_id,
      'bill_amount', input_bill_amount,
      'transaction_id', transaction_id
    )
  )
  returning id into audit_id;

  return jsonb_build_object(
    'staff_member_id', staff_record.id,
    'staff_member_name', staff_record.name,
    'points_added', awarded_points,
    'stamps_added', awarded_stamps,
    'points_balance', next_points,
    'stamp_balance', next_stamps,
    'transaction_id', transaction_id,
    'audit_id', audit_id
  );
end;
$$;

create or replace function public.redeem_reward(
  input_restaurant_id uuid,
  input_customer_id uuid,
  input_offer_source text,
  input_offer_id uuid,
  input_staff_pin text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
    on conflict (restaurant_id, customer_id, reward_id)
    do update set status = 'redeemed', staff_member_id = staff_record.id, redeemed_at = now()
      where public.customer_rewards.status <> 'redeemed'
    returning id into redemption_id;

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
$$;
