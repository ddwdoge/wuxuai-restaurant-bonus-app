create or replace function public.register_restaurant_customer(
  input_restaurant_slug text,
  input_first_name text,
  input_phone text,
  input_birthday date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  restaurant_record public.restaurants%rowtype;
  customer_record public.customers%rowtype;
  normalized_name text;
  normalized_phone text;
  next_code text;
  raw_customer_token text;
  token_id uuid;
begin
  normalized_name := trim(coalesce(input_first_name, ''));
  normalized_phone := regexp_replace(trim(coalesce(input_phone, '')), '\s+', '', 'g');

  if length(normalized_name) < 2 or length(normalized_name) > 80 then
    raise exception 'Vorname ist erforderlich';
  end if;

  if length(normalized_phone) < 5 or length(normalized_phone) > 32 then
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
    'campaign', null,
    'starter_offer_source', case when starter_payload->>'reward_id' is null then null else 'reward' end,
    'starter_offer_id', starter_payload->>'reward_id',
    'starter_issued', coalesce((starter_payload->>'issued')::boolean, false),
    'welcome_reward', starter_payload->'reward'
  );
end;
$$;

revoke execute on function public.register_restaurant_customer(text, text, text, date)
from public;

grant execute on function public.register_restaurant_customer(text, text, text, date)
to anon, authenticated;

revoke execute on function public.register_restaurant_customer(text, text, text, date, text)
from public;

grant execute on function public.register_restaurant_customer(text, text, text, date, text)
to anon, authenticated;
