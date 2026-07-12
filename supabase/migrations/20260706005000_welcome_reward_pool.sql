alter table public.rewards
add column if not exists is_starter_reward boolean not null default false,
add column if not exists starter_reward_key text,
add column if not exists starter_reward_order integer not null default 0;

alter table public.customer_rewards
add column if not exists is_starter_reward boolean not null default false,
add column if not exists assignment_metadata jsonb not null default '{}'::jsonb;

create index if not exists rewards_starter_pool_idx
on public.rewards (restaurant_id, active, starter_reward_order)
where is_starter_reward = true;

create unique index if not exists customer_rewards_one_starter_reward_idx
on public.customer_rewards (restaurant_id, customer_id)
where is_starter_reward = true;

drop policy if exists "restaurant media admin insert" on storage.objects;
drop policy if exists "restaurant media admin update" on storage.objects;
drop policy if exists "restaurant media admin delete" on storage.objects;

create policy "restaurant media admin insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'restaurant-media'
  and auth.uid() is not null
  and (storage.foldername(storage.objects.name))[1] is not null
  and (storage.foldername(storage.objects.name))[2] in ('branding', 'offers', 'rewards', 'starter-rewards')
  and exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id::text = (storage.foldername(storage.objects.name))[1]
      and rm.user_id = auth.uid()
      and rm.role in ('owner', 'admin', 'manager')
  )
);

create policy "restaurant media admin update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'restaurant-media'
  and auth.uid() is not null
  and exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id::text = (storage.foldername(storage.objects.name))[1]
      and rm.user_id = auth.uid()
      and rm.role in ('owner', 'admin', 'manager')
  )
)
with check (
  bucket_id = 'restaurant-media'
  and auth.uid() is not null
  and (storage.foldername(storage.objects.name))[2] in ('branding', 'offers', 'rewards', 'starter-rewards')
  and exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id::text = (storage.foldername(storage.objects.name))[1]
      and rm.user_id = auth.uid()
      and rm.role in ('owner', 'admin', 'manager')
  )
);

create policy "restaurant media admin delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'restaurant-media'
  and auth.uid() is not null
  and exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id::text = (storage.foldername(storage.objects.name))[1]
      and rm.user_id = auth.uid()
      and rm.role in ('owner', 'admin', 'manager')
  )
);

create or replace function public.assign_welcome_starter_reward(
  input_restaurant_id uuid,
  input_customer_id uuid,
  input_campaign_id uuid default null,
  input_source text default 'restaurant_qr'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  existing_reward public.rewards%rowtype;
  selected_reward public.rewards%rowtype;
  assignment_id uuid;
  issued_value boolean := false;
begin
  if input_restaurant_id is null or input_customer_id is null then
    raise exception 'restaurant_id and customer_id are required';
  end if;

  select r.*
  into existing_reward
  from public.customer_rewards cr
  join public.rewards r on r.id = cr.reward_id
  where cr.restaurant_id = input_restaurant_id
    and cr.customer_id = input_customer_id
    and cr.is_starter_reward = true
    and r.restaurant_id = input_restaurant_id
  order by cr.created_at asc
  limit 1;

  if existing_reward.id is not null then
    return jsonb_build_object(
      'issued', false,
      'reward_id', existing_reward.id,
      'reward', jsonb_build_object(
        'id', existing_reward.id,
        'title', existing_reward.title,
        'category', existing_reward.category,
        'available_products', existing_reward.available_products,
        'image_url', existing_reward.image_url
      )
    );
  end if;

  select *
  into selected_reward
  from public.rewards
  where restaurant_id = input_restaurant_id
    and is_starter_reward = true
    and active = true
    and (expires_at is null or expires_at > now())
  order by encode(extensions.gen_random_bytes(16), 'hex')
  limit 1;

  if selected_reward.id is null then
    return jsonb_build_object('issued', false, 'reward_id', null, 'reward', null);
  end if;

  begin
    insert into public.customer_rewards (
      restaurant_id,
      customer_id,
      reward_id,
      status,
      is_starter_reward,
      assignment_metadata
    )
    values (
      input_restaurant_id,
      input_customer_id,
      selected_reward.id,
      'active',
      true,
      jsonb_build_object(
        'source', input_source,
        'campaign_id', input_campaign_id,
        'title', selected_reward.title,
        'category', selected_reward.category,
        'available_products', selected_reward.available_products,
        'image_url', selected_reward.image_url,
        'assigned_at', now()
      )
    )
    returning id into assignment_id;
    issued_value := true;
  exception
    when unique_violation then
      issued_value := false;
  end;

  if issued_value then
    if input_campaign_id is not null then
      insert into public.campaign_events (
        restaurant_id,
        campaign_id,
        customer_id,
        event_type,
        metadata
      )
      values (
        input_restaurant_id,
        input_campaign_id,
        input_customer_id,
        'starter_reward',
        jsonb_build_object('offer_source', 'reward', 'offer_id', selected_reward.id, 'source', input_source)
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
      input_restaurant_id,
      'system',
      null,
      'welcome_starter_reward_assigned',
      'customer_rewards',
      assignment_id,
      jsonb_build_object(
        'customer_id', input_customer_id,
        'reward_id', selected_reward.id,
        'source', input_source,
        'campaign_id', input_campaign_id
      )
    );
  end if;

  return jsonb_build_object(
    'issued', issued_value,
    'reward_id', selected_reward.id,
    'reward', jsonb_build_object(
      'id', selected_reward.id,
      'title', selected_reward.title,
      'category', selected_reward.category,
      'available_products', selected_reward.available_products,
      'image_url', selected_reward.image_url
    )
  );
end;
$$;

create or replace function public.register_restaurant_customer(
  input_restaurant_slug text,
  input_first_name text,
  input_phone text,
  input_birthday date,
  input_device_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result_payload jsonb;
  starter_payload jsonb;
  restaurant_record public.restaurants%rowtype;
  customer_id_value uuid;
  customer_token text;
  normalized_device_id text;
begin
  normalized_device_id := nullif(trim(coalesce(input_device_id, '')), '');

  result_payload := public.register_restaurant_customer(
    input_restaurant_slug,
    input_first_name,
    input_phone,
    input_birthday
  );

  select *
  into restaurant_record
  from public.restaurants
  where slug = trim(input_restaurant_slug);

  customer_token := result_payload #>> '{customer,customer_qr_token}';
  customer_id_value := public.resolve_customer_from_public_token(restaurant_record.id, customer_token);

  perform public.record_customer_device(restaurant_record.id, customer_id_value, normalized_device_id);

  starter_payload := public.assign_welcome_starter_reward(
    restaurant_record.id,
    customer_id_value,
    null,
    'restaurant_qr'
  );

  update public.audit_log
  set metadata = metadata || jsonb_build_object('device_id', normalized_device_id)
  where restaurant_id = restaurant_record.id
    and actor_id = customer_id_value
    and action = 'public_customer_registered'
    and created_at > now() - interval '1 minute'
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
    jsonb_build_object('device_id', normalized_device_id, 'source', 'restaurant_registration')
  );

  return result_payload || jsonb_build_object(
    'starter_offer_source', case when starter_payload->>'reward_id' is null then null else 'reward' end,
    'starter_offer_id', starter_payload->>'reward_id',
    'starter_issued', coalesce((starter_payload->>'issued')::boolean, false),
    'welcome_reward', starter_payload->'reward'
  );
end;
$$;

create or replace function public.register_campaign_customer(
  input_restaurant_slug text,
  input_campaign_slug text,
  input_name text,
  input_phone text,
  input_birthday date,
  input_device_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result_payload jsonb;
  starter_payload jsonb;
  restaurant_record public.restaurants%rowtype;
  campaign_record public.campaigns%rowtype;
  customer_id_value uuid;
  customer_token text;
  normalized_device_id text;
begin
  normalized_device_id := nullif(trim(coalesce(input_device_id, '')), '');

  result_payload := public.register_campaign_customer(
    input_restaurant_slug,
    input_campaign_slug,
    input_name,
    input_phone,
    input_birthday
  );

  select *
  into restaurant_record
  from public.restaurants
  where slug = trim(input_restaurant_slug);

  select *
  into campaign_record
  from public.campaigns
  where restaurant_id = restaurant_record.id
    and slug = trim(input_campaign_slug);

  customer_token := result_payload #>> '{customer,customer_qr_token}';
  customer_id_value := public.resolve_customer_from_public_token(restaurant_record.id, customer_token);

  perform public.record_customer_device(restaurant_record.id, customer_id_value, normalized_device_id);

  starter_payload := public.assign_welcome_starter_reward(
    restaurant_record.id,
    customer_id_value,
    campaign_record.id,
    'campaign_registration'
  );

  update public.audit_log
  set metadata = metadata || jsonb_build_object('device_id', normalized_device_id)
  where restaurant_id = restaurant_record.id
    and actor_id = customer_id_value
    and action = 'public_customer_registered'
    and created_at > now() - interval '1 minute'
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
    jsonb_build_object('device_id', normalized_device_id, 'source', 'campaign_registration', 'campaign_slug', input_campaign_slug)
  );

  return result_payload || jsonb_build_object(
    'starter_offer_source', case when starter_payload->>'reward_id' is null then null else 'reward' end,
    'starter_offer_id', starter_payload->>'reward_id',
    'starter_issued', coalesce((starter_payload->>'issued')::boolean, false),
    'welcome_reward', starter_payload->'reward'
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
        array_to_string(r.available_products, ', ') as product_group,
        r.image_url,
        r.is_starter_reward
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
        true as is_starter_reward
      from public.customer_rewards cr
      join public.rewards r on r.id = cr.reward_id
      where cr.restaurant_id = restaurant_record.id
        and cr.customer_id = customer_record.id
        and cr.is_starter_reward = true
        and cr.status <> 'redeemed'
        and r.restaurant_id = restaurant_record.id
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
        false as is_starter_reward
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
          'is_starter_reward', offers.is_starter_reward,
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
    'campaigns', campaigns_payload,
    'offers', offers_payload
  );
end;
$$;

revoke execute on function public.assign_welcome_starter_reward(uuid, uuid, uuid, text)
from public, anon, authenticated;

revoke execute on function public.register_restaurant_customer(text, text, text, date, text)
from public;

grant execute on function public.register_restaurant_customer(text, text, text, date, text)
to anon, authenticated;

revoke execute on function public.register_campaign_customer(text, text, text, text, date, text)
from public;

grant execute on function public.register_campaign_customer(text, text, text, text, date, text)
to anon, authenticated;
