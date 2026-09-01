-- Keep the six-argument referral registration contract executable after 06000.
-- The previous local variable shared the customers.normalized_phone name on
-- upgraded schemas, which made the lookup ambiguous for PL/pgSQL.

create or replace function public.register_referral_customer(
  input_restaurant_slug text,
  input_referral_token text,
  input_first_name text,
  input_phone text,
  input_birthday date,
  input_device_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result_payload jsonb;
  starter_payload jsonb;
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

  select restaurant.* into restaurant_record
  from public.restaurants restaurant
  where restaurant.slug = trim(input_restaurant_slug)
    and restaurant.status = 'active';

  if restaurant_record.id is null then
    raise exception 'restaurant not found';
  end if;

  select referral.* into referral_record
  from public.referrals referral
  where referral.restaurant_id = restaurant_record.id
    and referral.referral_token_hash = public.hash_public_token(input_referral_token)
    and referral.status in ('pending', 'pending_registered')
  limit 1
  for update;

  if referral_record.id is null then
    raise exception 'referral not found';
  end if;

  select customer.* into referrer_record
  from public.customers customer
  where customer.id = referral_record.referrer_customer_id
    and customer.restaurant_id = restaurant_record.id;

  if regexp_replace(coalesce(referrer_record.phone, ''), '\s+', '', 'g') = normalized_phone_value then
    raise exception 'self referral is not allowed';
  end if;

  select customer.* into existing_customer_record
  from public.customers customer
  where customer.restaurant_id = restaurant_record.id
    and customer.phone = normalized_phone_value
  limit 1;

  if existing_customer_record.id is not null then
    if existing_customer_record.id = referrer_record.id then
      raise exception 'self referral is not allowed';
    end if;

    if exists (
      select 1 from public.referrals referral
      where referral.restaurant_id = restaurant_record.id
        and referral.referrer_customer_id = existing_customer_record.id
        and referral.referred_customer_id = referrer_record.id
        and referral.status in ('pending_registered', 'activated')
    ) then
      raise exception 'circular referral is not allowed';
    end if;

    if exists (
      select 1 from public.referrals referral
      where referral.restaurant_id = restaurant_record.id
        and referral.id <> referral_record.id
        and referral.referrer_customer_id = referrer_record.id
        and referral.referred_customer_id = existing_customer_record.id
        and referral.status in ('pending_registered', 'activated')
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
  customer_id_value := public.resolve_customer_from_public_token(
    restaurant_record.id,
    customer_token
  );

  perform public.record_customer_device(
    restaurant_record.id,
    customer_id_value,
    normalized_device_id
  );

  starter_payload := public.assign_welcome_starter_reward(
    restaurant_record.id,
    customer_id_value,
    null,
    'restaurant_qr'
  );

  if starter_payload->>'reward_id' is not null then
    update public.customer_rewards customer_reward
    set assignment_metadata = coalesce(customer_reward.assignment_metadata, '{}'::jsonb)
      || jsonb_build_object('registration_source', 'referral_registration')
    where customer_reward.restaurant_id = restaurant_record.id
      and customer_reward.customer_id = customer_id_value
      and customer_reward.reward_id = (starter_payload->>'reward_id')::uuid
      and customer_reward.is_starter_reward = true;
  end if;

  return result_payload || jsonb_build_object(
    'starter_offer_source', case when starter_payload->>'reward_id' is null then null else 'reward' end,
    'starter_offer_id', starter_payload->>'reward_id',
    'starter_issued', coalesce((starter_payload->>'issued')::boolean, false),
    'welcome_gift_assigned', starter_payload->>'reward_id' is not null,
    'welcome_reward', starter_payload->'reward'
  );
end;
$$;

revoke execute on function public.register_referral_customer(
  text, text, text, text, date, text
) from public;
grant execute on function public.register_referral_customer(
  text, text, text, text, date, text
) to anon, authenticated;

comment on function public.register_referral_customer(text, text, text, text, date, text) is
  'Referral registration with unambiguous restaurant-scoped phone lookup and canonical welcome gift assignment.';

notify pgrst, 'reload schema';
