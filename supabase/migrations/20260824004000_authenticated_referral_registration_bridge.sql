-- Bridge the existing V1 referral engine to the central authenticated customer
-- account. Qualification and boost grants remain owned by the existing points
-- transaction flow.

create or replace function public.get_public_referral(
  input_restaurant_slug text,
  input_referral_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  restaurant_record public.restaurants%rowtype;
  branding_record public.restaurant_branding%rowtype;
  settings_record public.loyalty_settings%rowtype;
  referral_record public.referrals%rowtype;
begin
  select * into restaurant_record
  from public.restaurants
  where slug = trim(input_restaurant_slug) and status = 'active';

  if restaurant_record.id is null then
    raise exception using errcode = 'P0001', message = 'REFERRAL_INVALID';
  end if;

  select r.* into referral_record
  from public.referrals r
  where r.restaurant_id = restaurant_record.id
    and r.referral_token_hash = public.hash_public_token(input_referral_token)
    and r.status in ('pending', 'pending_registered')
    and (r.expires_at is null or r.expires_at > now())
  limit 1;

  if referral_record.id is null then
    raise exception using errcode = 'P0001', message = 'REFERRAL_INVALID';
  end if;

  select * into branding_record
  from public.restaurant_branding
  where restaurant_id = restaurant_record.id;

  select * into settings_record
  from public.loyalty_settings
  where restaurant_id = restaurant_record.id and active = true;

  if settings_record.id is null or not coalesce(settings_record.referral_boost_enabled, true) then
    raise exception using errcode = 'P0001', message = 'REFERRAL_INVALID';
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
    -- V1 has no explicit public-name consent. Preserve the response shape and
    -- use the approved neutral fallback until such consent exists.
    'referrer', jsonb_build_object('first_name', null),
    'settings', jsonb_build_object(
      'referral_boost_enabled', true,
      'referral_boost_multiplier', 2,
      'referral_boost_duration_days', settings_record.referral_boost_duration_days
    )
  );
end;
$$;

revoke execute on function public.get_public_referral(text, text) from public;
grant execute on function public.get_public_referral(text, text) to anon, authenticated;

create or replace function public.join_authenticated_customer_referral(
  input_restaurant_slug text,
  input_referral_token text,
  input_terms_accepted boolean,
  input_privacy_acknowledged boolean,
  input_device_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  account_id_value uuid := public.ensure_authenticated_customer_account();
  account_record public.customer_accounts%rowtype;
  restaurant_record public.restaurants%rowtype;
  referral_record public.referrals%rowtype;
  membership_record public.customer_account_memberships%rowtype;
  registration_result jsonb;
  customer_id_value uuid;
  raw_customer_token text;
begin
  if not input_terms_accepted or not input_privacy_acknowledged then
    raise exception using errcode = 'P0001', message = 'CUSTOMER_LEGAL_ACCEPTANCE_REQUIRED';
  end if;

  select * into account_record
  from public.customer_accounts
  where id = account_id_value and disabled_at is null;

  select * into restaurant_record
  from public.restaurants
  where slug = trim(input_restaurant_slug) and status = 'active';

  if restaurant_record.id is null then
    raise exception using errcode = 'P0001', message = 'REFERRAL_INVALID';
  end if;
  if not public.restaurant_legal_bundle_is_current(restaurant_record.id, current_date) then
    raise exception using errcode = 'P0001', message = 'CUSTOMER_LEGAL_NOT_READY';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(account_id_value::text || ':' || restaurant_record.id::text, 0)
  );

  select r.* into referral_record
  from public.referrals r
  where r.restaurant_id = restaurant_record.id
    and r.referral_token_hash = public.hash_public_token(input_referral_token)
    and r.status in ('pending', 'pending_registered')
    and (r.expires_at is null or r.expires_at > now())
  limit 1
  for update;

  if referral_record.id is null then
    raise exception using errcode = 'P0001', message = 'REFERRAL_INVALID';
  end if;

  select m.* into membership_record
  from public.customer_account_memberships m
  where m.account_id = account_id_value
    and m.restaurant_id = restaurant_record.id
  for update;

  if membership_record.id is not null then
    if referral_record.referred_customer_id is distinct from membership_record.customer_id then
      raise exception using errcode = 'P0001', message = 'REFERRAL_CUSTOMER_NOT_NEW';
    end if;

    return public.open_customer_account_membership(restaurant_record.id)
      || jsonb_build_object('joined', false, 'referral_status', referral_record.status);
  end if;

  registration_result := public.register_referral_customer_legal(
    restaurant_record.slug,
    input_referral_token,
    account_record.first_name,
    account_record.phone,
    account_record.birthday,
    input_device_id,
    true,
    true,
    false,
    false,
    false,
    account_record.birthday is not null
  );

  if not coalesce((registration_result->>'success')::boolean, false) then
    raise exception using errcode = 'P0001',
      message = coalesce(registration_result->>'error_code', 'CUSTOMER_ACCOUNT_RECOVERY_REQUIRED');
  end if;

  raw_customer_token := registration_result #>> '{customer,customer_qr_token}';
  customer_id_value := public.resolve_customer_from_public_token(restaurant_record.id, raw_customer_token);
  if customer_id_value is null then
    raise exception using errcode = 'P0001', message = 'CUSTOMER_REGISTRATION_FAILED';
  end if;

  insert into public.customer_account_memberships (
    account_id, restaurant_id, customer_id, linked_at, last_opened_at
  ) values (
    account_id_value, restaurant_record.id, customer_id_value, now(), now()
  );

  perform public.write_audit_event(
    restaurant_record.id,
    customer_id_value,
    'customer',
    customer_id_value,
    'REFERRAL_REGISTERED',
    'success',
    'referral',
    'referrals',
    referral_record.id,
    null,
    jsonb_build_object('central_account', true)
  );

  return jsonb_build_object(
    'joined', true,
    'restaurant_slug', restaurant_record.slug,
    'customer_token', raw_customer_token,
    'referral_status', 'pending_registered'
  );
end;
$$;

revoke execute on function public.join_authenticated_customer_referral(
  text, text, boolean, boolean, text
) from public, anon;

grant execute on function public.join_authenticated_customer_referral(
  text, text, boolean, boolean, text
) to authenticated;

comment on function public.join_authenticated_customer_referral(
  text, text, boolean, boolean, text
) is 'Atomically binds a validated V1 referral to the authenticated central customer account; qualification remains first-valid-points only.';
