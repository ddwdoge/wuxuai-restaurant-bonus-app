-- Central Supabase Auth customer login with restaurant-scoped memberships.
-- This migration builds on 20260804002000 and does not create a parallel
-- customer identity table. Restaurant customer rows remain the points ledger
-- and reward source of truth.

alter table public.customer_accounts
  add column if not exists auth_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists email text,
  add column if not exists first_name text,
  add column if not exists phone text,
  add column if not exists normalized_phone text,
  add column if not exists birthday date,
  add column if not exists email_confirmed_at timestamptz;

create unique index if not exists customer_accounts_auth_user_unique_idx
  on public.customer_accounts (auth_user_id) where auth_user_id is not null;
create unique index if not exists customer_accounts_phone_unique_idx
  on public.customer_accounts (normalized_phone) where normalized_phone is not null and disabled_at is null;

alter table public.customer_accounts drop constraint if exists customer_accounts_first_name_valid;
alter table public.customer_accounts add constraint customer_accounts_first_name_valid
  check (first_name is null or (char_length(trim(first_name)) between 1 and 80));

revoke execute on function public.bootstrap_customer_account(text, text, text) from public, anon, authenticated;
revoke execute on function public.get_customer_account(text) from public, anon, authenticated;
revoke execute on function public.open_customer_account_membership(text, uuid) from public, anon, authenticated;
revoke execute on function public.pause_all_customer_offer_emails(text, boolean) from public, anon, authenticated;

create or replace function public.ensure_authenticated_customer_account()
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  user_record auth.users%rowtype;
  account_id_value uuid;
  first_name_value text;
  phone_value text;
  birthday_value date;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'CUSTOMER_AUTH_REQUIRED';
  end if;

  select * into user_record from auth.users where id = auth.uid();
  if user_record.id is null or user_record.email_confirmed_at is null then
    raise exception using errcode = '42501', message = 'CUSTOMER_EMAIL_CONFIRMATION_REQUIRED';
  end if;

  select id into account_id_value
  from public.customer_accounts
  where auth_user_id = user_record.id and disabled_at is null;
  if account_id_value is not null then
    update public.customer_accounts
    set last_seen_at = now(), email = lower(user_record.email), email_confirmed_at = user_record.email_confirmed_at
    where id = account_id_value;
    return account_id_value;
  end if;

  first_name_value := trim(coalesce(user_record.raw_user_meta_data->>'customer_first_name', ''));
  phone_value := public.normalize_customer_phone(user_record.raw_user_meta_data->>'customer_phone');
  begin
    birthday_value := nullif(user_record.raw_user_meta_data->>'customer_birthday', '')::date;
  exception when others then
    birthday_value := null;
  end;

  if first_name_value = '' or char_length(first_name_value) > 80 then
    raise exception using errcode = 'P0001', message = 'CUSTOMER_PROFILE_INCOMPLETE';
  end if;
  if phone_value is null then
    raise exception using errcode = 'P0001', message = 'CUSTOMER_PROFILE_PHONE_INVALID';
  end if;

  insert into public.customer_accounts (
    auth_user_id, email, first_name, phone, normalized_phone, birthday, email_confirmed_at
  ) values (
    user_record.id, lower(user_record.email), first_name_value, phone_value, phone_value,
    birthday_value, user_record.email_confirmed_at
  )
  returning id into account_id_value;

  insert into public.customer_account_emails (account_id, email, status, confirmed_at, updated_at)
  values (account_id_value, lower(user_record.email), 'CONFIRMED', user_record.email_confirmed_at, now())
  on conflict (account_id) do update
    set email = excluded.email, status = 'CONFIRMED', confirmed_at = excluded.confirmed_at, updated_at = now();

  return account_id_value;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'CUSTOMER_ACCOUNT_ALREADY_EXISTS';
end;
$$;

create or replace function public.get_customer_account()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  account_id_value uuid := public.ensure_authenticated_customer_account();
  account_record public.customer_accounts%rowtype;
begin
  select * into account_record from public.customer_accounts where id = account_id_value;
  return jsonb_build_object(
    'profile', jsonb_build_object(
      'first_name', account_record.first_name,
      'phone_masked', public.mask_customer_phone(account_record.phone),
      'birthday_masked', case when account_record.birthday is null then null
        else to_char(account_record.birthday, 'DD.MM.') || '****' end,
      'email', account_record.email,
      'email_status', case when account_record.email_confirmed_at is null then 'PENDING_CONFIRMATION' else 'CONFIRMED' end
    ),
    'memberships', coalesce((
      select jsonb_agg(jsonb_build_object(
        'restaurant_id', restaurant.id,
        'branch_id', branch.id,
        'name', coalesce(branch.name, restaurant.name),
        'slug', restaurant.slug,
        'logo_url', branding.logo_url,
        'address', branch.address,
        'postal_code', branch.postal_code,
        'city', branch.city,
        'country', branch.country,
        'opening_hours', restaurant.opening_hours,
        'special_days', restaurant.special_days,
        'holidays', restaurant.holidays,
        'membership_status', customer.membership_status,
        'points_balance', customer.points_balance,
        'visits_count', coalesce(visit.visits_count, 0),
        'last_visit_at', visit.last_visit_at,
        'available_rewards', coalesce(reward.available_rewards, '[]'::jsonb),
        'next_reward', reward.next_reward,
        'active_gifts', coalesce(gift.active_gifts, 0),
        'new_offer_count', coalesce(offer.new_offer_count, 0),
        'email_preference', coalesce(consent.frequency, 'NEVER'),
        'email_consent_status', coalesce(consent.status, 'NOT_GRANTED')
      ) order by visit.last_visit_at desc nulls last, membership.linked_at desc, restaurant.name)
      from public.customer_account_memberships membership
      join public.customers customer on customer.id = membership.customer_id
        and customer.restaurant_id = membership.restaurant_id
      join public.restaurants restaurant on restaurant.id = membership.restaurant_id
      left join public.restaurant_branding branding on branding.restaurant_id = restaurant.id
      left join lateral (
        select b.* from public.branches b where b.restaurant_id = restaurant.id and b.status = 'active'
        order by (b.id = restaurant.primary_branch_id) desc, b.created_at limit 1
      ) branch on true
      left join lateral (
        select count(*)::integer visits_count, max(t.created_at) last_visit_at
        from public.points_transactions t where t.restaurant_id = restaurant.id
          and t.customer_id = customer.id and t.type = 'earn' and t.points > 0
      ) visit on true
      left join lateral (
        select
          (select coalesce(jsonb_agg(jsonb_build_object(
            'id', r.id, 'title', r.title, 'required_points', r.required_points,
            'image_url', r.image_url, 'expires_at', r.expires_at
          ) order by r.required_points, r.title), '[]'::jsonb)
          from public.rewards r where r.restaurant_id = restaurant.id and r.active = true
            and not r.is_starter_reward and r.required_points <= customer.points_balance
            and (r.expires_at is null or r.expires_at > now())) available_rewards,
          (select jsonb_build_object(
            'id', r.id, 'title', r.title, 'required_points', r.required_points,
            'missing_points', greatest(r.required_points - customer.points_balance, 0),
            'image_url', r.image_url, 'expires_at', r.expires_at
          ) from public.rewards r where r.restaurant_id = restaurant.id and r.active = true
            and not r.is_starter_reward and r.required_points > customer.points_balance
            and (r.expires_at is null or r.expires_at > now())
          order by r.required_points, r.title, r.id limit 1) next_reward
      ) reward on true
      left join lateral (
        select count(*)::integer active_gifts from public.customer_rewards cr
        where cr.restaurant_id = restaurant.id and cr.customer_id = customer.id and cr.status = 'active'
      ) gift on true
      left join lateral (
        select count(*)::integer new_offer_count from public.restaurant_offers ro
        where ro.restaurant_id = restaurant.id and ro.status = 'PUBLISHED' and ro.is_active = true
          and ro.valid_from <= now() and ro.valid_to > now() and ro.published_at >= now() - interval '14 days'
      ) offer on true
      left join public.customer_offer_email_consents consent on consent.account_id = account_id_value
        and consent.restaurant_id = restaurant.id
      where membership.account_id = account_id_value
    ), '[]'::jsonb),
    'offers', '[]'::jsonb,
    'email_delivery', coalesce((select jsonb_build_object(
      'available', setting.delivery_enabled and setting.provider_status in ('STAGING_ONLY', 'ACTIVE'),
      'provider_status', setting.provider_status
    ) from public.customer_offer_email_delivery_settings setting where setting.id = true),
      jsonb_build_object('available', false, 'provider_status', 'NOT_CONFIGURED'))
  );
end;
$$;

create or replace function public.get_customer_restaurant_context(input_restaurant_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  account_id_value uuid := public.ensure_authenticated_customer_account();
  restaurant_record public.restaurants%rowtype;
  membership_record public.customer_account_memberships%rowtype;
begin
  select * into restaurant_record from public.restaurants
  where slug = trim(input_restaurant_slug) and status = 'active';
  if restaurant_record.id is null then
    raise exception using errcode = 'P0001', message = 'CUSTOMER_ACCOUNT_CONTEXT_INVALID';
  end if;
  select * into membership_record from public.customer_account_memberships
  where account_id = account_id_value and restaurant_id = restaurant_record.id;
  return jsonb_build_object(
    'restaurant_id', restaurant_record.id,
    'restaurant_name', restaurant_record.name,
    'restaurant_slug', restaurant_record.slug,
    'membership_exists', membership_record.id is not null,
    'legal_ready', public.restaurant_legal_bundle_is_current(restaurant_record.id, current_date)
  );
end;
$$;

create or replace function public.open_customer_account_membership(input_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  account_id_value uuid := public.ensure_authenticated_customer_account();
  membership_record record;
  raw_customer_token text;
begin
  select membership.id,
         membership.restaurant_id,
         membership.customer_id,
         restaurant.slug as restaurant_slug,
         customer.membership_status
  into membership_record
  from public.customer_account_memberships membership
  join public.restaurants restaurant on restaurant.id = membership.restaurant_id
  join public.customers customer on customer.id = membership.customer_id
  where membership.account_id = account_id_value and membership.restaurant_id = input_restaurant_id
  for update of membership;
  if membership_record.id is null then
    raise exception using errcode = 'P0001', message = 'CUSTOMER_MEMBERSHIP_NOT_FOUND';
  end if;
  if membership_record.membership_status is distinct from 'active' then
    raise exception using errcode = 'P0001', message = 'CUSTOMER_MEMBERSHIP_INACTIVE';
  end if;
  raw_customer_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.customer_qr_tokens (restaurant_id, customer_id, token_hash, active)
  values (membership_record.restaurant_id, membership_record.customer_id,
    public.hash_public_token(raw_customer_token), true);
  update public.customer_account_memberships set last_opened_at = now() where id = membership_record.id;
  perform public.write_audit_event(
    membership_record.restaurant_id, membership_record.customer_id, 'customer', membership_record.customer_id,
    'CUSTOMER_MEMBERSHIP_OPENED', 'success', 'customer_account', 'customers', membership_record.customer_id,
    null, jsonb_build_object('central_account', true)
  );
  return jsonb_build_object(
    'restaurant_slug', membership_record.restaurant_slug,
    'customer_token', raw_customer_token
  );
end;
$$;

create or replace function public.join_customer_account_restaurant(
  input_restaurant_slug text,
  input_terms_accepted boolean,
  input_privacy_acknowledged boolean,
  input_device_id text default null,
  input_existing_customer_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  account_id_value uuid := public.ensure_authenticated_customer_account();
  account_record public.customer_accounts%rowtype;
  restaurant_record public.restaurants%rowtype;
  membership_record public.customer_account_memberships%rowtype;
  linked_account_id uuid;
  customer_id_value uuid;
  registration_result jsonb;
  raw_customer_token text;
begin
  if not input_terms_accepted or not input_privacy_acknowledged then
    raise exception using errcode = 'P0001', message = 'CUSTOMER_LEGAL_ACCEPTANCE_REQUIRED';
  end if;
  select * into account_record from public.customer_accounts where id = account_id_value;
  select * into restaurant_record from public.restaurants
  where slug = trim(input_restaurant_slug) and status = 'active';
  if restaurant_record.id is null then raise exception using errcode = 'P0001', message = 'CUSTOMER_ACCOUNT_CONTEXT_INVALID'; end if;
  if not public.restaurant_legal_bundle_is_current(restaurant_record.id, current_date) then
    raise exception using errcode = 'P0001', message = 'CUSTOMER_LEGAL_NOT_READY';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(account_id_value::text || ':' || restaurant_record.id::text, 0));
  select * into membership_record from public.customer_account_memberships
  where account_id = account_id_value and restaurant_id = restaurant_record.id;
  if membership_record.id is not null then
    return public.open_customer_account_membership(restaurant_record.id) || jsonb_build_object('joined', false);
  end if;

  if nullif(trim(coalesce(input_existing_customer_token, '')), '') is not null then
    customer_id_value := public.resolve_customer_from_public_token(restaurant_record.id, input_existing_customer_token);
    if customer_id_value is null then
      raise exception using errcode = 'P0001', message = 'CUSTOMER_ACCESS_TOKEN_INVALID';
    end if;
    select account_id into linked_account_id from public.customer_account_memberships where customer_id = customer_id_value;
    if linked_account_id is not null and linked_account_id <> account_id_value then
      raise exception using errcode = 'P0001', message = 'CUSTOMER_MEMBERSHIP_ALREADY_LINKED';
    end if;
    insert into public.customer_account_memberships (account_id, restaurant_id, customer_id, last_opened_at)
    values (account_id_value, restaurant_record.id, customer_id_value, now())
    on conflict (account_id, restaurant_id) do nothing;
  else
    registration_result := public.register_restaurant_customer_legal(
      restaurant_record.slug, account_record.first_name, account_record.phone, account_record.birthday,
      input_device_id, true, true, false, false, false, account_record.birthday is not null
    );
    if not coalesce((registration_result->>'success')::boolean, false) then
      raise exception using errcode = 'P0001', message = coalesce(registration_result->>'error_code', 'CUSTOMER_ACCOUNT_RECOVERY_REQUIRED');
    end if;
    raw_customer_token := registration_result #>> '{customer,customer_qr_token}';
    customer_id_value := public.resolve_customer_from_public_token(restaurant_record.id, raw_customer_token);
    if customer_id_value is null then raise exception using errcode = 'P0001', message = 'CUSTOMER_REGISTRATION_FAILED'; end if;
    insert into public.customer_account_memberships (account_id, restaurant_id, customer_id, last_opened_at)
    values (account_id_value, restaurant_record.id, customer_id_value, now());
  end if;

  perform public.write_audit_event(
    restaurant_record.id, customer_id_value, 'customer', customer_id_value,
    'CUSTOMER_JOINED_RESTAURANT', 'success', 'customer_account', 'customer_account_memberships', customer_id_value,
    null, jsonb_build_object('central_account', true)
  );
  if raw_customer_token is null then
    return public.open_customer_account_membership(restaurant_record.id) || jsonb_build_object('joined', true);
  end if;
  return jsonb_build_object('joined', true, 'restaurant_slug', restaurant_record.slug, 'customer_token', raw_customer_token);
end;
$$;

create or replace function public.pause_all_customer_offer_emails(input_paused boolean)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  account_id_value uuid := public.ensure_authenticated_customer_account();
  updated_count integer;
begin
  update public.customer_offer_email_consents
  set status = case when input_paused then 'PAUSED' else 'ACTIVE' end, updated_at = now()
  where account_id = account_id_value
    and status = case when input_paused then 'ACTIVE' else 'PAUSED' end;
  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

revoke execute on function public.ensure_authenticated_customer_account() from public, anon;
revoke execute on function public.get_customer_account() from public, anon;
revoke execute on function public.get_customer_restaurant_context(text) from public, anon;
revoke execute on function public.open_customer_account_membership(uuid) from public, anon;
revoke execute on function public.join_customer_account_restaurant(text, boolean, boolean, text, text) from public, anon;
revoke execute on function public.pause_all_customer_offer_emails(boolean) from public, anon;

grant execute on function public.ensure_authenticated_customer_account() to authenticated;
grant execute on function public.get_customer_account() to authenticated;
grant execute on function public.get_customer_restaurant_context(text) to authenticated;
grant execute on function public.open_customer_account_membership(uuid) to authenticated;
grant execute on function public.join_customer_account_restaurant(text, boolean, boolean, text, text) to authenticated;
grant execute on function public.pause_all_customer_offer_emails(boolean) to authenticated;

comment on function public.join_customer_account_restaurant(text, boolean, boolean, text, text) is
  'Authenticated, explicit and idempotent restaurant membership join. Existing customer rows require a valid restaurant token; phone alone never links an account.';
