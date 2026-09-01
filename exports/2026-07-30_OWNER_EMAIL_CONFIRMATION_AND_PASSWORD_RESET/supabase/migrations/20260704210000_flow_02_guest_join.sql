create or replace function public.register_restaurant_customer(
  input_restaurant_slug text,
  input_first_name text,
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
  raw_customer_token text;
  token_id uuid;
begin
  normalized_name := trim(coalesce(input_first_name, ''));
  normalized_phone := regexp_replace(trim(coalesce(input_phone, '')), '\s+', '', 'g');

  if length(normalized_name) < 2 or length(normalized_name) > 80 then
    raise exception 'first name is required';
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
    and status = 'active'
    and (start_date is null or start_date <= current_date)
    and (end_date is null or end_date >= current_date)
  order by created_at desc
  limit 1;

  perform pg_advisory_xact_lock(hashtextextended(restaurant_record.id::text || ':' || normalized_phone, 0));

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
      jsonb_build_object('source', 'restaurant_qr')
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

  if campaign_record.id is not null then
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
            'offer_id', offer_id_value,
            'source', 'restaurant_qr'
          )
        );
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'restaurant', jsonb_build_object(
      'name', restaurant_record.name,
      'slug', restaurant_record.slug,
      'status', restaurant_record.status
    ),
    'campaign', case
      when campaign_record.id is null then null
      else jsonb_build_object(
        'title', campaign_record.title,
        'slug', campaign_record.slug,
        'description', campaign_record.description,
        'status', campaign_record.status
      )
    end,
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
$$;

revoke execute on function public.register_restaurant_customer(text, text, text, date)
from public;

grant execute on function public.register_restaurant_customer(text, text, text, date)
to anon, authenticated;
