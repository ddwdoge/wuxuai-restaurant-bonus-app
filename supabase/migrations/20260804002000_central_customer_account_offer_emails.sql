-- Central customer account and restaurant-scoped offer email consent for V1.
-- Customer identities remain restaurant-scoped. A central account links a
-- membership only after its existing secret restaurant token was validated.

create table if not exists public.customer_accounts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  disabled_at timestamptz
);

create table if not exists public.customer_account_memberships (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.customer_accounts(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  linked_at timestamptz not null default now(),
  last_opened_at timestamptz,
  unique (account_id, restaurant_id),
  unique (customer_id)
);

create table if not exists public.customer_account_tokens (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.customer_accounts(id) on delete cascade,
  token_hash text not null unique,
  active boolean not null default true,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_account_emails (
  account_id uuid primary key references public.customer_accounts(id) on delete cascade,
  email text not null,
  status text not null default 'PENDING_CONFIRMATION'
    check (status in ('PENDING_CONFIRMATION', 'CONFIRMED', 'SUPPRESSED')),
  requested_at timestamptz not null default now(),
  confirmed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_offer_email_consents (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.customer_accounts(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  email text not null,
  frequency text not null default 'NEVER' check (frequency in ('NEVER', 'WEEKLY', 'MONTHLY')),
  status text not null default 'NOT_GRANTED'
    check (status in ('NOT_GRANTED', 'PENDING_CONFIRMATION', 'ACTIVE', 'PAUSED', 'WITHDRAWN')),
  consent_version text not null,
  source text not null default 'customer_account',
  consented_at timestamptz,
  withdrawn_at timestamptz,
  confirmation_requested_at timestamptz,
  email_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, restaurant_id)
);

create table if not exists public.customer_offer_email_tokens (
  id uuid primary key default gen_random_uuid(),
  consent_id uuid not null references public.customer_offer_email_consents(id) on delete cascade,
  purpose text not null check (purpose in ('CONFIRM', 'UNSUBSCRIBE')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  unique (consent_id, purpose)
);

create table if not exists public.customer_offer_email_token_attempts (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null,
  purpose text not null check (purpose in ('CONFIRM', 'UNSUBSCRIBE')),
  successful boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_offer_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  consent_id uuid not null references public.customer_offer_email_consents(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  account_id uuid not null references public.customer_accounts(id) on delete cascade,
  frequency text not null check (frequency in ('WEEKLY', 'MONTHLY')),
  period_key text not null,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'SENT', 'DELIVERED', 'BOUNCED', 'FAILED', 'SKIPPED')),
  offer_count integer not null default 0 check (offer_count >= 0),
  provider_message_id text,
  sent_at timestamptz,
  delivered_at timestamptz,
  bounced_at timestamptz,
  created_at timestamptz not null default now(),
  unique (consent_id, frequency, period_key)
);

create table if not exists public.customer_offer_email_delivery_settings (
  id boolean primary key default true check (id),
  delivery_enabled boolean not null default false,
  provider_status text not null default 'NOT_CONFIGURED'
    check (provider_status in ('NOT_CONFIGURED', 'STAGING_ONLY', 'ACTIVE', 'PAUSED')),
  updated_at timestamptz not null default now()
);

insert into public.customer_offer_email_delivery_settings (id, delivery_enabled, provider_status)
values (true, false, 'NOT_CONFIGURED')
on conflict (id) do nothing;

create index if not exists customer_account_memberships_account_idx
  on public.customer_account_memberships (account_id, linked_at desc);
create index if not exists customer_account_tokens_active_idx
  on public.customer_account_tokens (token_hash) where active = true;
create index if not exists customer_offer_email_consents_delivery_idx
  on public.customer_offer_email_consents (restaurant_id, frequency, status);
create index if not exists customer_offer_email_attempts_rate_idx
  on public.customer_offer_email_token_attempts (token_hash, purpose, created_at desc);
create index if not exists customer_offer_email_deliveries_restaurant_idx
  on public.customer_offer_email_deliveries (restaurant_id, created_at desc);

alter table public.customer_accounts enable row level security;
alter table public.customer_account_memberships enable row level security;
alter table public.customer_account_tokens enable row level security;
alter table public.customer_account_emails enable row level security;
alter table public.customer_offer_email_consents enable row level security;
alter table public.customer_offer_email_tokens enable row level security;
alter table public.customer_offer_email_token_attempts enable row level security;
alter table public.customer_offer_email_deliveries enable row level security;
alter table public.customer_offer_email_delivery_settings enable row level security;

revoke all on public.customer_accounts from anon, authenticated;
revoke all on public.customer_account_memberships from anon, authenticated;
revoke all on public.customer_account_tokens from anon, authenticated;
revoke all on public.customer_account_emails from anon, authenticated;
revoke all on public.customer_offer_email_consents from anon, authenticated;
revoke all on public.customer_offer_email_tokens from anon, authenticated;
revoke all on public.customer_offer_email_token_attempts from anon, authenticated;
revoke all on public.customer_offer_email_deliveries from anon, authenticated;
revoke all on public.customer_offer_email_delivery_settings from anon, authenticated;

create or replace function public.normalize_customer_offer_email(input_email text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when lower(trim(coalesce(input_email, ''))) ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
      then lower(trim(input_email))
    else null
  end;
$$;

create or replace function public.resolve_customer_account_token(input_account_token text)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select token.account_id
  from public.customer_account_tokens token
  join public.customer_accounts account on account.id = token.account_id
  where token.token_hash = public.hash_public_token(input_account_token)
    and token.active = true
    and token.revoked_at is null
    and (token.expires_at is null or token.expires_at > now())
    and account.disabled_at is null
  order by token.created_at desc
  limit 1;
$$;

create or replace function public.bootstrap_customer_account(
  input_restaurant_slug text,
  input_customer_token text,
  input_account_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  restaurant_record public.restaurants%rowtype;
  customer_record public.customers%rowtype;
  account_id_value uuid;
  existing_account_id uuid;
  restaurant_link_customer_id uuid;
  raw_account_token text;
  created_account boolean := false;
begin
  select * into restaurant_record
  from public.restaurants
  where slug = trim(input_restaurant_slug)
    and status = 'active';
  if restaurant_record.id is null then
    raise exception using errcode = 'P0001', message = 'CUSTOMER_ACCOUNT_CONTEXT_INVALID';
  end if;

  select customer.* into customer_record
  from public.customer_qr_tokens token
  join public.customers customer
    on customer.id = token.customer_id
   and customer.restaurant_id = token.restaurant_id
  where token.restaurant_id = restaurant_record.id
    and token.token_hash = public.hash_public_token(input_customer_token)
    and token.active = true
    and (token.expires_at is null or token.expires_at > now())
    and customer.membership_status = 'active'
  order by token.created_at desc
  limit 1;
  if customer_record.id is null then
    raise exception using errcode = 'P0001', message = 'CUSTOMER_ACCESS_TOKEN_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('customer-account:' || customer_record.id::text, 0));
  select membership.account_id into existing_account_id
  from public.customer_account_memberships membership
  where membership.customer_id = customer_record.id;

  if nullif(trim(coalesce(input_account_token, '')), '') is not null then
    account_id_value := public.resolve_customer_account_token(input_account_token);
    if account_id_value is null then
      raise exception using errcode = 'P0001', message = 'CUSTOMER_ACCOUNT_TOKEN_INVALID';
    end if;
    if existing_account_id is not null and existing_account_id <> account_id_value then
      raise exception using errcode = 'P0001', message = 'CUSTOMER_MEMBERSHIP_ALREADY_LINKED';
    end if;
    select membership.customer_id into restaurant_link_customer_id
    from public.customer_account_memberships membership
    where membership.account_id = account_id_value
      and membership.restaurant_id = restaurant_record.id;
    if restaurant_link_customer_id is not null and restaurant_link_customer_id <> customer_record.id then
      raise exception using errcode = 'P0001', message = 'CUSTOMER_ACCOUNT_RESTAURANT_CONFLICT';
    end if;
  elsif existing_account_id is not null then
    return jsonb_build_object(
      'linked', false,
      'account_token', null,
      'recovery_required', true
    );
  else
    insert into public.customer_accounts default values returning id into account_id_value;
    raw_account_token := encode(extensions.gen_random_bytes(32), 'hex');
    insert into public.customer_account_tokens (account_id, token_hash)
    values (account_id_value, public.hash_public_token(raw_account_token));
    created_account := true;
  end if;

  insert into public.customer_account_memberships (account_id, restaurant_id, customer_id, last_opened_at)
  values (account_id_value, restaurant_record.id, customer_record.id, now())
  on conflict (account_id, restaurant_id) do update
    set customer_id = excluded.customer_id,
        last_opened_at = now();
  update public.customer_accounts set last_seen_at = now() where id = account_id_value;

  perform public.write_audit_event(
    restaurant_record.id, customer_record.id, 'customer', customer_record.id,
    case when created_account then 'CUSTOMER_ACCOUNT_CREATED' else 'CUSTOMER_MEMBERSHIP_LINKED' end,
    'success', 'customer_portal', 'customer_account_memberships', customer_record.id,
    null, jsonb_build_object('central_account', true)
  );

  return jsonb_build_object(
    'linked', true,
    'account_token', raw_account_token,
    'recovery_required', false
  );
end;
$$;

create or replace function public.get_customer_account(input_account_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  account_id_value uuid := public.resolve_customer_account_token(input_account_token);
  profile_record record;
begin
  if account_id_value is null then
    raise exception using errcode = 'P0001', message = 'CUSTOMER_ACCOUNT_TOKEN_INVALID';
  end if;
  update public.customer_accounts set last_seen_at = now() where id = account_id_value;

  select customer.name, customer.phone, customer.birthday_day, customer.birthday_month
  into profile_record
  from public.customer_account_memberships membership
  join public.customers customer on customer.id = membership.customer_id
  where membership.account_id = account_id_value
  order by membership.linked_at, membership.id
  limit 1;

  return jsonb_build_object(
    'profile', jsonb_build_object(
      'first_name', coalesce(profile_record.name, 'Gast'),
      'phone_masked', public.mask_customer_phone(profile_record.phone),
      'birthday_masked', case
        when profile_record.birthday_day is null or profile_record.birthday_month is null then null
        else lpad(profile_record.birthday_day::text, 2, '0') || '.' || lpad(profile_record.birthday_month::text, 2, '0') || '.****'
      end,
      'email', (select email.email from public.customer_account_emails email where email.account_id = account_id_value),
      'email_status', coalesce((select email.status from public.customer_account_emails email where email.account_id = account_id_value), 'NOT_PROVIDED')
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
      join public.customers customer
        on customer.id = membership.customer_id
       and customer.restaurant_id = membership.restaurant_id
      join public.restaurants restaurant on restaurant.id = membership.restaurant_id
      left join public.restaurant_branding branding on branding.restaurant_id = restaurant.id
      left join lateral (
        select branch.* from public.branches branch
        where branch.restaurant_id = restaurant.id and branch.status = 'active'
        order by (branch.id = restaurant.primary_branch_id) desc, branch.created_at
        limit 1
      ) branch on true
      left join lateral (
        select count(*)::integer visits_count, max(transaction.created_at) last_visit_at
        from public.points_transactions transaction
        where transaction.restaurant_id = restaurant.id
          and transaction.customer_id = customer.id
          and transaction.type = 'earn'
          and transaction.points > 0
      ) visit on true
      left join lateral (
        select
          (select coalesce(jsonb_agg(jsonb_build_object(
            'id', available.id,
            'title', available.title,
            'required_points', available.required_points,
            'image_url', available.image_url,
            'expires_at', available.expires_at
          ) order by available.required_points, available.title), '[]'::jsonb)
          from public.rewards available
          where available.restaurant_id = restaurant.id
            and available.active = true
            and not available.is_starter_reward
            and available.required_points <= customer.points_balance
            and (available.expires_at is null or available.expires_at > now())) available_rewards,
          (select jsonb_build_object(
            'id', next_reward.id,
            'title', next_reward.title,
            'required_points', next_reward.required_points,
            'missing_points', greatest(next_reward.required_points - customer.points_balance, 0),
            'image_url', next_reward.image_url,
            'expires_at', next_reward.expires_at
          )
          from public.rewards next_reward
          where next_reward.restaurant_id = restaurant.id
            and next_reward.active = true
            and not next_reward.is_starter_reward
            and next_reward.required_points > customer.points_balance
            and (next_reward.expires_at is null or next_reward.expires_at > now())
          order by next_reward.required_points, next_reward.title, next_reward.id
          limit 1) next_reward
      ) reward on true
      left join lateral (
        select count(*)::integer active_gifts
        from public.customer_rewards customer_reward
        where customer_reward.restaurant_id = restaurant.id
          and customer_reward.customer_id = customer.id
          and customer_reward.status = 'active'
      ) gift on true
      left join lateral (
        select count(*)::integer new_offer_count
        from public.restaurant_offers restaurant_offer
        where restaurant_offer.restaurant_id = restaurant.id
          and restaurant_offer.status = 'PUBLISHED'
          and restaurant_offer.is_active = true
          and restaurant_offer.valid_from <= now()
          and restaurant_offer.valid_to > now()
          and restaurant_offer.published_at >= now() - interval '14 days'
      ) offer on true
      left join public.customer_offer_email_consents consent
        on consent.account_id = account_id_value
       and consent.restaurant_id = restaurant.id
      where membership.account_id = account_id_value
    ), '[]'::jsonb),
    'offers', coalesce((
      select jsonb_agg(to_jsonb(offer_row) order by offer_row.published_at desc nulls last, offer_row.valid_from desc)
      from (
        select offer.id, offer.restaurant_id, offer.branch_id,
          restaurant.name restaurant_name, restaurant.slug restaurant_slug,
          offer.offer_type, offer.title, offer.short_description, offer.description,
          offer.image_url, offer.current_price, offer.previous_price, offer.currency,
          offer.valid_from, offer.valid_to, offer.weekdays, offer.time_from, offer.time_to,
          offer.button_label, offer.status, offer.is_active, offer.published_at,
          offer.created_at, offer.updated_at, offer.archived_at
        from public.customer_account_memberships membership
        join public.restaurants restaurant on restaurant.id = membership.restaurant_id
        join public.restaurant_offers offer on offer.restaurant_id = membership.restaurant_id
        where membership.account_id = account_id_value
          and offer.status = 'PUBLISHED'
          and offer.is_active = true
          and offer.valid_from <= now()
          and offer.valid_to > now()
        order by offer.published_at desc nulls last, offer.valid_from desc
        limit 100
      ) offer_row
    ), '[]'::jsonb),
    'email_delivery', (
      select jsonb_build_object(
        'available', setting.delivery_enabled and setting.provider_status in ('STAGING_ONLY', 'ACTIVE'),
        'provider_status', setting.provider_status
      )
      from public.customer_offer_email_delivery_settings setting
      where setting.id = true
    )
  );
end;
$$;

create or replace function public.open_customer_account_membership(
  input_account_token text,
  input_restaurant_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  account_id_value uuid := public.resolve_customer_account_token(input_account_token);
  membership_record public.customer_account_memberships%rowtype;
  restaurant_slug text;
  membership_status_value text;
  raw_customer_token text;
begin
  if account_id_value is null then
    raise exception using errcode = 'P0001', message = 'CUSTOMER_ACCOUNT_TOKEN_INVALID';
  end if;
  select membership, restaurant.slug, customer.membership_status
  into membership_record, restaurant_slug, membership_status_value
  from public.customer_account_memberships membership
  join public.restaurants restaurant on restaurant.id = membership.restaurant_id
  join public.customers customer on customer.id = membership.customer_id
  where membership.account_id = account_id_value
    and membership.restaurant_id = input_restaurant_id
  for update of membership;
  if membership_record.id is null then
    raise exception using errcode = 'P0001', message = 'CUSTOMER_MEMBERSHIP_NOT_FOUND';
  end if;
  if membership_status_value is distinct from 'active' then
    raise exception using errcode = 'P0001', message = 'CUSTOMER_MEMBERSHIP_INACTIVE';
  end if;

  raw_customer_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.customer_qr_tokens (restaurant_id, customer_id, token_hash, active)
  values (membership_record.restaurant_id, membership_record.customer_id,
    public.hash_public_token(raw_customer_token), true);
  update public.customer_account_memberships
  set last_opened_at = now()
  where id = membership_record.id;

  perform public.write_audit_event(
    membership_record.restaurant_id, membership_record.customer_id, 'customer', membership_record.customer_id,
    'CUSTOMER_MEMBERSHIP_OPENED', 'success', 'customer_account', 'customers', membership_record.customer_id,
    null, jsonb_build_object('central_account', true)
  );
  return jsonb_build_object('restaurant_slug', restaurant_slug, 'customer_token', raw_customer_token);
end;
$$;

create or replace function public.request_customer_offer_email_confirmation(
  input_account_token text,
  input_restaurant_id uuid,
  input_email text,
  input_frequency text,
  input_confirmation_token text,
  input_unsubscribe_token text,
  input_consent_version text,
  input_source text default 'customer_account'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  account_id_value uuid := public.resolve_customer_account_token(input_account_token);
  membership_record public.customer_account_memberships%rowtype;
  normalized_email text := public.normalize_customer_offer_email(input_email);
  consent_id_value uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'CUSTOMER_EMAIL_SERVICE_REQUIRED';
  end if;
  if account_id_value is null then raise exception 'CUSTOMER_ACCOUNT_TOKEN_INVALID'; end if;
  if normalized_email is null then raise exception 'CUSTOMER_EMAIL_INVALID'; end if;
  if upper(input_frequency) not in ('WEEKLY', 'MONTHLY') then raise exception 'CUSTOMER_EMAIL_FREQUENCY_INVALID'; end if;
  if length(input_confirmation_token) < 32 or length(input_unsubscribe_token) < 32 then
    raise exception 'CUSTOMER_EMAIL_TOKEN_INVALID';
  end if;
  select * into membership_record
  from public.customer_account_memberships membership
  where membership.account_id = account_id_value
    and membership.restaurant_id = input_restaurant_id;
  if membership_record.id is null then raise exception 'CUSTOMER_MEMBERSHIP_NOT_FOUND'; end if;

  insert into public.customer_account_emails (account_id, email, status, requested_at, updated_at)
  values (account_id_value, normalized_email, 'PENDING_CONFIRMATION', now(), now())
  on conflict (account_id) do update
    set email = excluded.email,
        status = 'PENDING_CONFIRMATION',
        requested_at = now(),
        confirmed_at = null,
        updated_at = now();

  insert into public.customer_offer_email_consents (
    account_id, restaurant_id, customer_id, email, frequency, status,
    consent_version, source, confirmation_requested_at, updated_at
  ) values (
    account_id_value, input_restaurant_id, membership_record.customer_id, normalized_email,
    upper(input_frequency), 'PENDING_CONFIRMATION', input_consent_version,
    left(coalesce(nullif(trim(input_source), ''), 'customer_account'), 80), now(), now()
  )
  on conflict (account_id, restaurant_id) do update
    set customer_id = excluded.customer_id,
        email = excluded.email,
        frequency = excluded.frequency,
        status = 'PENDING_CONFIRMATION',
        consent_version = excluded.consent_version,
        source = excluded.source,
        consented_at = null,
        withdrawn_at = null,
        confirmation_requested_at = now(),
        email_confirmed_at = null,
        updated_at = now()
  returning id into consent_id_value;

  delete from public.customer_offer_email_tokens where consent_id = consent_id_value;
  insert into public.customer_offer_email_tokens (consent_id, purpose, token_hash, expires_at)
  values
    (consent_id_value, 'CONFIRM', public.hash_public_token(input_confirmation_token), now() + interval '24 hours'),
    (consent_id_value, 'UNSUBSCRIBE', public.hash_public_token(input_unsubscribe_token), now() + interval '400 days');

  perform public.write_audit_event(
    input_restaurant_id, membership_record.customer_id, 'customer', membership_record.customer_id,
    'OFFER_EMAIL_CONSENT_REQUESTED', 'pending', 'customer_account',
    'customer_offer_email_consents', consent_id_value, null,
    jsonb_build_object('frequency', upper(input_frequency), 'consent_version', input_consent_version)
  );
  return consent_id_value;
end;
$$;

create or replace function public.confirm_customer_offer_email(input_confirmation_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  token_hash_value text := public.hash_public_token(input_confirmation_token);
  token_record public.customer_offer_email_tokens%rowtype;
  consent_record public.customer_offer_email_consents%rowtype;
begin
  if (select count(*) from public.customer_offer_email_token_attempts attempt
      where attempt.token_hash = token_hash_value and attempt.purpose = 'CONFIRM'
        and attempt.created_at > now() - interval '15 minutes') >= 10 then
    raise exception using errcode = 'P0001', message = 'CUSTOMER_EMAIL_TOO_MANY_ATTEMPTS';
  end if;
  select * into token_record
  from public.customer_offer_email_tokens token
  where token.token_hash = token_hash_value and token.purpose = 'CONFIRM'
  for update;
  if token_record.id is null or token_record.used_at is not null or token_record.expires_at <= now() then
    insert into public.customer_offer_email_token_attempts (token_hash, purpose, successful)
    values (token_hash_value, 'CONFIRM', false);
    return jsonb_build_object('confirmed', false, 'error_code', 'CUSTOMER_EMAIL_CONFIRMATION_INVALID');
  end if;
  select * into consent_record from public.customer_offer_email_consents
  where id = token_record.consent_id for update;
  update public.customer_offer_email_tokens set used_at = now() where id = token_record.id;
  update public.customer_offer_email_consents
  set status = 'ACTIVE', consented_at = now(), email_confirmed_at = now(),
      withdrawn_at = null, updated_at = now()
  where id = consent_record.id;
  update public.customer_account_emails
  set status = 'CONFIRMED', confirmed_at = now(), updated_at = now()
  where account_id = consent_record.account_id and email = consent_record.email;
  insert into public.customer_offer_email_token_attempts (token_hash, purpose, successful)
  values (token_hash_value, 'CONFIRM', true);
  perform public.write_audit_event(
    consent_record.restaurant_id, consent_record.customer_id, 'customer', consent_record.customer_id,
    'OFFER_EMAIL_CONSENT_CONFIRMED', 'success', 'offer_email_confirmation',
    'customer_offer_email_consents', consent_record.id, null,
    jsonb_build_object('frequency', consent_record.frequency, 'consent_version', consent_record.consent_version)
  );
  return jsonb_build_object('confirmed', true);
end;
$$;

create or replace function public.withdraw_customer_offer_email(input_unsubscribe_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  token_hash_value text := public.hash_public_token(input_unsubscribe_token);
  token_record public.customer_offer_email_tokens%rowtype;
  consent_record public.customer_offer_email_consents%rowtype;
begin
  if (select count(*) from public.customer_offer_email_token_attempts attempt
      where attempt.token_hash = token_hash_value and attempt.purpose = 'UNSUBSCRIBE'
        and attempt.created_at > now() - interval '15 minutes') >= 10 then
    raise exception using errcode = 'P0001', message = 'CUSTOMER_EMAIL_TOO_MANY_ATTEMPTS';
  end if;
  select * into token_record
  from public.customer_offer_email_tokens token
  where token.token_hash = token_hash_value and token.purpose = 'UNSUBSCRIBE'
  for update;
  if token_record.id is null or token_record.used_at is not null or token_record.expires_at <= now() then
    insert into public.customer_offer_email_token_attempts (token_hash, purpose, successful)
    values (token_hash_value, 'UNSUBSCRIBE', false);
    return jsonb_build_object('withdrawn', false, 'error_code', 'CUSTOMER_EMAIL_UNSUBSCRIBE_INVALID');
  end if;
  select * into consent_record from public.customer_offer_email_consents
  where id = token_record.consent_id for update;
  update public.customer_offer_email_tokens set used_at = now() where id = token_record.id;
  update public.customer_offer_email_consents
  set status = 'WITHDRAWN', frequency = 'NEVER', withdrawn_at = now(), updated_at = now()
  where id = consent_record.id;
  insert into public.customer_offer_email_token_attempts (token_hash, purpose, successful)
  values (token_hash_value, 'UNSUBSCRIBE', true);
  perform public.write_audit_event(
    consent_record.restaurant_id, consent_record.customer_id, 'customer', consent_record.customer_id,
    'OFFER_EMAIL_CONSENT_WITHDRAWN', 'success', 'offer_email_unsubscribe',
    'customer_offer_email_consents', consent_record.id, null, '{}'::jsonb
  );
  return jsonb_build_object('withdrawn', true);
end;
$$;

create or replace function public.pause_all_customer_offer_emails(
  input_account_token text,
  input_paused boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  account_id_value uuid := public.resolve_customer_account_token(input_account_token);
  changed_count integer;
begin
  if account_id_value is null then
    raise exception using errcode = 'P0001', message = 'CUSTOMER_ACCOUNT_TOKEN_INVALID';
  end if;
  if input_paused then
    update public.customer_offer_email_consents
    set status = 'PAUSED', updated_at = now()
    where account_id = account_id_value and status = 'ACTIVE';
  else
    update public.customer_offer_email_consents
    set status = 'ACTIVE', updated_at = now()
    where account_id = account_id_value and status = 'PAUSED' and email_confirmed_at is not null;
  end if;
  get diagnostics changed_count = row_count;
  return jsonb_build_object('updated', changed_count);
end;
$$;

create or replace function public.list_due_customer_offer_email_consents(
  input_frequency text,
  input_limit integer default 250
)
returns table (
  consent_id uuid,
  restaurant_id uuid,
  account_id uuid,
  customer_id uuid,
  email text,
  frequency text,
  period_key text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_frequency text := upper(trim(coalesce(input_frequency, '')));
  local_now timestamp := now() at time zone 'Europe/Vienna';
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'CUSTOMER_EMAIL_SERVICE_REQUIRED';
  end if;
  if normalized_frequency not in ('WEEKLY', 'MONTHLY') then
    raise exception using errcode = '22023', message = 'CUSTOMER_EMAIL_FREQUENCY_INVALID';
  end if;
  if not coalesce((select setting.delivery_enabled
      and setting.provider_status in ('STAGING_ONLY', 'ACTIVE')
    from public.customer_offer_email_delivery_settings setting where setting.id = true), false) then
    return;
  end if;

  return query
  select consent.id, consent.restaurant_id, consent.account_id, consent.customer_id,
    consent.email, consent.frequency,
    case when normalized_frequency = 'WEEKLY'
      then to_char(date_trunc('week', local_now), 'IYYY-"W"IW')
      else to_char(local_now, 'YYYY-MM')
    end
  from public.customer_offer_email_consents consent
  join public.customer_account_memberships membership
    on membership.account_id = consent.account_id
   and membership.restaurant_id = consent.restaurant_id
   and membership.customer_id = consent.customer_id
  join public.customers customer
    on customer.id = consent.customer_id
   and customer.restaurant_id = consent.restaurant_id
  join public.restaurants restaurant on restaurant.id = consent.restaurant_id
  where consent.status = 'ACTIVE'
    and consent.email_confirmed_at is not null
    and consent.frequency = normalized_frequency
    and customer.membership_status = 'active'
    and restaurant.status = 'active'
    and exists (
      select 1 from public.restaurant_offers offer
      where offer.restaurant_id = consent.restaurant_id
        and offer.status = 'PUBLISHED'
        and offer.is_active = true
        and offer.valid_from <= now()
        and offer.valid_to > now()
    )
    and not exists (
      select 1 from public.customer_offer_email_deliveries delivery
      where delivery.consent_id = consent.id
        and delivery.frequency = normalized_frequency
        and delivery.period_key = case when normalized_frequency = 'WEEKLY'
          then to_char(date_trunc('week', local_now), 'IYYY-"W"IW')
          else to_char(local_now, 'YYYY-MM')
        end
    )
  order by consent.id
  limit greatest(1, least(coalesce(input_limit, 250), 250));
end;
$$;

create or replace function public.reserve_customer_offer_email_delivery(
  input_consent_id uuid,
  input_frequency text,
  input_period_key text,
  input_unsubscribe_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  consent_record public.customer_offer_email_consents%rowtype;
  delivery_id_value uuid;
  offer_count_value integer;
  normalized_frequency text := upper(trim(coalesce(input_frequency, '')));
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'CUSTOMER_EMAIL_SERVICE_REQUIRED';
  end if;
  if normalized_frequency not in ('WEEKLY', 'MONTHLY')
     or (normalized_frequency = 'WEEKLY' and input_period_key !~ '^[0-9]{4}-W[0-9]{2}$')
     or (normalized_frequency = 'MONTHLY' and input_period_key !~ '^[0-9]{4}-[0-9]{2}$') then
    raise exception using errcode = '22023', message = 'CUSTOMER_EMAIL_PERIOD_INVALID';
  end if;
  if length(coalesce(input_unsubscribe_token, '')) < 32 then
    raise exception using errcode = '22023', message = 'CUSTOMER_EMAIL_TOKEN_INVALID';
  end if;
  if not coalesce((select setting.delivery_enabled
      and setting.provider_status in ('STAGING_ONLY', 'ACTIVE')
    from public.customer_offer_email_delivery_settings setting where setting.id = true), false) then
    return jsonb_build_object('reserved', false, 'reason', 'DELIVERY_DISABLED');
  end if;

  select * into consent_record
  from public.customer_offer_email_consents consent
  where consent.id = input_consent_id
  for update;
  if consent_record.id is null
     or consent_record.status <> 'ACTIVE'
     or consent_record.email_confirmed_at is null
     or consent_record.frequency <> normalized_frequency then
    return jsonb_build_object('reserved', false, 'reason', 'CONSENT_NOT_ACTIVE');
  end if;

  select count(*)::integer into offer_count_value
  from public.restaurant_offers offer
  where offer.restaurant_id = consent_record.restaurant_id
    and offer.status = 'PUBLISHED'
    and offer.is_active = true
    and offer.valid_from <= now()
    and offer.valid_to > now();
  if offer_count_value = 0 then
    return jsonb_build_object('reserved', false, 'reason', 'NO_ACTIVE_OFFERS');
  end if;

  insert into public.customer_offer_email_deliveries (
    consent_id, restaurant_id, account_id, frequency, period_key, offer_count
  ) values (
    consent_record.id, consent_record.restaurant_id, consent_record.account_id,
    normalized_frequency, input_period_key, offer_count_value
  )
  on conflict (consent_id, frequency, period_key) do nothing
  returning id into delivery_id_value;
  if delivery_id_value is null then
    return jsonb_build_object('reserved', false, 'reason', 'ALREADY_RESERVED');
  end if;

  delete from public.customer_offer_email_tokens
  where consent_id = consent_record.id and purpose = 'UNSUBSCRIBE';
  insert into public.customer_offer_email_tokens (consent_id, purpose, token_hash, expires_at)
  values (consent_record.id, 'UNSUBSCRIBE', public.hash_public_token(input_unsubscribe_token), now() + interval '400 days');

  return jsonb_build_object(
    'reserved', true,
    'delivery_id', delivery_id_value,
    'restaurant_id', consent_record.restaurant_id,
    'email', consent_record.email,
    'offer_count', offer_count_value
  );
end;
$$;

create or replace function public.complete_customer_offer_email_delivery(
  input_delivery_id uuid,
  input_status text,
  input_provider_message_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_status text := upper(trim(coalesce(input_status, '')));
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'CUSTOMER_EMAIL_SERVICE_REQUIRED';
  end if;
  if normalized_status not in ('SENT', 'DELIVERED', 'BOUNCED', 'FAILED', 'SKIPPED') then
    raise exception using errcode = '22023', message = 'CUSTOMER_EMAIL_DELIVERY_STATUS_INVALID';
  end if;
  update public.customer_offer_email_deliveries
  set status = normalized_status,
      provider_message_id = left(nullif(trim(input_provider_message_id), ''), 240),
      sent_at = case when normalized_status in ('SENT', 'DELIVERED') then coalesce(sent_at, now()) else sent_at end,
      delivered_at = case when normalized_status = 'DELIVERED' then coalesce(delivered_at, now()) else delivered_at end,
      bounced_at = case when normalized_status = 'BOUNCED' then coalesce(bounced_at, now()) else bounced_at end
  where id = input_delivery_id;
  return found;
end;
$$;

create or replace function public.get_restaurant_offer_email_summary(input_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_restaurant_admin(input_restaurant_id) then
    raise exception using errcode = '42501', message = 'OFFER_EMAIL_ACCESS_DENIED';
  end if;
  return jsonb_build_object(
    'available', coalesce((select delivery_enabled and provider_status in ('STAGING_ONLY', 'ACTIVE')
      from public.customer_offer_email_delivery_settings where id = true), false),
    'provider_status', coalesce((select provider_status
      from public.customer_offer_email_delivery_settings where id = true), 'NOT_CONFIGURED'),
    'confirmed_recipients', (select count(*) from public.customer_offer_email_consents consent
      where consent.restaurant_id = input_restaurant_id and consent.status = 'ACTIVE'),
    'weekly_recipients', (select count(*) from public.customer_offer_email_consents consent
      where consent.restaurant_id = input_restaurant_id and consent.status = 'ACTIVE' and consent.frequency = 'WEEKLY'),
    'monthly_recipients', (select count(*) from public.customer_offer_email_consents consent
      where consent.restaurant_id = input_restaurant_id and consent.status = 'ACTIVE' and consent.frequency = 'MONTHLY'),
    'sent', (select count(*) from public.customer_offer_email_deliveries delivery
      where delivery.restaurant_id = input_restaurant_id and delivery.status in ('SENT', 'DELIVERED')),
    'delivered', (select count(*) from public.customer_offer_email_deliveries delivery
      where delivery.restaurant_id = input_restaurant_id and delivery.status = 'DELIVERED'),
    'bounces', (select count(*) from public.customer_offer_email_deliveries delivery
      where delivery.restaurant_id = input_restaurant_id and delivery.status = 'BOUNCED'),
    'withdrawn', (select count(*) from public.customer_offer_email_consents consent
      where consent.restaurant_id = input_restaurant_id and consent.status = 'WITHDRAWN'),
    'last_sent_at', (select max(delivery.sent_at) from public.customer_offer_email_deliveries delivery
      where delivery.restaurant_id = input_restaurant_id),
    'next_weekly_period', to_char(date_trunc('week', now() at time zone 'Europe/Vienna') + interval '1 week', 'IYYY-"W"IW'),
    'next_monthly_period', to_char(date_trunc('month', now() at time zone 'Europe/Vienna') + interval '1 month', 'YYYY-MM')
  );
end;
$$;

revoke all on function public.normalize_customer_offer_email(text) from public, anon, authenticated;
revoke all on function public.resolve_customer_account_token(text) from public, anon, authenticated;
revoke all on function public.bootstrap_customer_account(text, text, text) from public, anon, authenticated;
revoke all on function public.get_customer_account(text) from public, anon, authenticated;
revoke all on function public.open_customer_account_membership(text, uuid) from public, anon, authenticated;
revoke all on function public.request_customer_offer_email_confirmation(text, uuid, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.request_customer_offer_email_confirmation(text, uuid, text, text, text, text, text, text) to service_role;
revoke all on function public.confirm_customer_offer_email(text) from public;
grant execute on function public.confirm_customer_offer_email(text) to anon, authenticated;
revoke all on function public.withdraw_customer_offer_email(text) from public;
grant execute on function public.withdraw_customer_offer_email(text) to anon, authenticated;
revoke all on function public.pause_all_customer_offer_emails(text, boolean) from public, anon, authenticated;
revoke all on function public.list_due_customer_offer_email_consents(text, integer) from public, anon, authenticated;
grant execute on function public.list_due_customer_offer_email_consents(text, integer) to service_role;
revoke all on function public.reserve_customer_offer_email_delivery(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.reserve_customer_offer_email_delivery(uuid, text, text, text) to service_role;
revoke all on function public.complete_customer_offer_email_delivery(uuid, text, text) from public, anon, authenticated;
grant execute on function public.complete_customer_offer_email_delivery(uuid, text, text) to service_role;
revoke all on function public.get_restaurant_offer_email_summary(uuid) from public, anon;
grant execute on function public.get_restaurant_offer_email_summary(uuid) to authenticated;

comment on table public.customer_accounts is
  'Server-controlled central customer access. It does not replace restaurant-scoped customer identities.';
comment on function public.bootstrap_customer_account(text, text, text) is
  'Creates or links a central account only after validating the current restaurant-scoped secret token.';
comment on table public.customer_offer_email_delivery_settings is
  'Offer email delivery remains disabled until an approved bulk/DOI provider is configured.';

notify pgrst, 'reload schema';
