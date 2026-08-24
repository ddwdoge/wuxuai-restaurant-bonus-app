-- WUXUAI Bonus V1: referral guests keep the canonical welcome gift while
-- invite creation becomes visit-gated, restaurant-scoped and monthly limited.

alter table public.loyalty_settings
  add column if not exists referral_monthly_invite_limit integer not null default 5;

alter table public.loyalty_settings
  drop constraint if exists loyalty_settings_referral_monthly_invite_limit_check,
  add constraint loyalty_settings_referral_monthly_invite_limit_check
    check (referral_monthly_invite_limit between 1 and 100);

alter table public.referrals
  add column if not exists quota_counted boolean not null default false,
  add column if not exists quota_month date;

alter table public.referrals
  drop constraint if exists referrals_quota_month_consistency_check,
  add constraint referrals_quota_month_consistency_check
    check (not quota_counted or quota_month is not null);

create index if not exists referrals_monthly_invite_quota_idx
on public.referrals (restaurant_id, referrer_customer_id, quota_month, created_at)
where quota_counted = true;

create or replace function public.get_customer_referral_invite_status(
  input_restaurant_slug text,
  input_customer_token text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  restaurant_record public.restaurants%rowtype;
  settings_record public.loyalty_settings%rowtype;
  customer_id_value uuid;
  timezone_value text;
  local_month_start date;
  next_month_start date;
  next_reset_at timestamptz;
  used_count integer := 0;
  accepted_count integer := 0;
  qualified_count integer := 0;
  latest_status text;
  outgoing_referral public.referrals%rowtype;
  incoming_referral public.referrals%rowtype;
  boost_record public.customer_bonus_boosts%rowtype;
  grant_record public.referral_boost_grants%rowtype;
  lifecycle_state_value text := 'none';
  beneficiary_role_value text;
  eligible_value boolean := false;
  limit_value integer := 5;
begin
  select r.* into restaurant_record
  from public.restaurants r
  where r.slug = trim(input_restaurant_slug)
    and r.status = 'active';

  if restaurant_record.id is null then
    raise exception using errcode = 'P0001', message = 'REFERRAL_RESTAURANT_INVALID';
  end if;

  customer_id_value := public.resolve_customer_from_public_token(
    restaurant_record.id,
    input_customer_token
  );

  if customer_id_value is null then
    raise exception using errcode = 'P0001', message = 'CUSTOMER_ACCESS_TOKEN_INVALID';
  end if;

  select ls.* into settings_record
  from public.loyalty_settings ls
  where ls.restaurant_id = restaurant_record.id
    and ls.active = true
  limit 1;

  if settings_record.id is not null then
    limit_value := coalesce(settings_record.referral_monthly_invite_limit, 5);
  end if;

  timezone_value := coalesce(nullif(trim(restaurant_record.timezone_name), ''), 'Europe/Vienna');
  local_month_start := date_trunc('month', statement_timestamp() at time zone timezone_value)::date;
  next_month_start := (local_month_start + interval '1 month')::date;
  next_reset_at := next_month_start::timestamp at time zone timezone_value;

  select exists (
    select 1
    from public.points_transactions pt
    where pt.restaurant_id = restaurant_record.id
      and pt.customer_id = customer_id_value
      and pt.type = 'earn'
      and pt.points > 0
  ) into eligible_value;

  select count(*) into used_count
  from public.referrals r
  where r.restaurant_id = restaurant_record.id
    and r.referrer_customer_id = customer_id_value
    and r.quota_counted = true
    and r.quota_month = local_month_start;

  select
    count(*) filter (where r.status in ('pending_registered', 'activated')),
    count(*) filter (where r.status = 'activated')
  into accepted_count, qualified_count
  from public.referrals r
  where r.restaurant_id = restaurant_record.id
    and r.referrer_customer_id = customer_id_value;

  select r.status into latest_status
  from public.referrals r
  where r.restaurant_id = restaurant_record.id
    and r.referrer_customer_id = customer_id_value
  order by r.created_at desc, r.id desc
  limit 1;

  select r.* into outgoing_referral
  from public.referrals r
  where r.restaurant_id = restaurant_record.id
    and r.referrer_customer_id = customer_id_value
    and r.status in ('pending_registered', 'pending')
  order by
    case r.status when 'pending_registered' then 0 else 1 end,
    r.created_at desc,
    r.id desc
  limit 1;

  select r.* into incoming_referral
  from public.referrals r
  where r.restaurant_id = restaurant_record.id
    and r.referred_customer_id = customer_id_value
    and r.status = 'pending_registered'
  order by r.created_at desc, r.id desc
  limit 1;

  select cb.* into boost_record
  from public.customer_bonus_boosts cb
  where cb.restaurant_id = restaurant_record.id
    and cb.customer_id = customer_id_value
    and cb.source = 'referral'
  order by
    case
      when cb.status = 'active'
        and cb.active_from <= statement_timestamp()
        and cb.active_until > statement_timestamp()
      then 0
      else 1
    end,
    cb.active_until desc,
    cb.id desc
  limit 1;

  if boost_record.id is not null then
    select rbg.* into grant_record
    from public.referral_boost_grants rbg
    where rbg.restaurant_id = restaurant_record.id
      and rbg.customer_id = customer_id_value
      and rbg.boost_id = boost_record.id
    order by rbg.granted_at desc, rbg.id desc
    limit 1;

    beneficiary_role_value := grant_record.beneficiary_role;
  end if;

  if boost_record.id is not null
     and boost_record.status = 'active'
     and boost_record.active_from <= statement_timestamp()
     and boost_record.active_until > statement_timestamp() then
    lifecycle_state_value := 'active';
  elsif incoming_referral.id is not null then
    lifecycle_state_value := 'pending_qualification';
    beneficiary_role_value := 'invited_friend';
  elsif outgoing_referral.id is not null and outgoing_referral.status = 'pending_registered' then
    lifecycle_state_value := 'pending_qualification';
    beneficiary_role_value := 'referrer';
  elsif outgoing_referral.id is not null then
    lifecycle_state_value := 'waiting_registration';
    beneficiary_role_value := 'referrer';
  elsif boost_record.id is not null
     and (boost_record.status = 'expired' or boost_record.active_until <= statement_timestamp()) then
    lifecycle_state_value := 'expired';
  end if;

  return jsonb_build_object(
    'eligible', eligible_value,
    'eligibility_reason', case when eligible_value then 'eligible' else 'first_qualifying_visit_required' end,
    'used', used_count,
    'limit', limit_value,
    'remaining', greatest(limit_value - used_count, 0),
    'month_start', local_month_start,
    'next_reset_at', next_reset_at,
    'accepted_count', accepted_count,
    'qualified_count', qualified_count,
    'latest_invitation_status', latest_status,
    'lifecycle_state', lifecycle_state_value,
    'beneficiary_role', beneficiary_role_value,
    'active_from', case when lifecycle_state_value = 'active' then boost_record.active_from else null end,
    'active_until', case
      when lifecycle_state_value in ('active', 'expired') then boost_record.active_until
      else null
    end
  );
end;
$$;

revoke execute on function public.get_customer_referral_invite_status(text, text)
from public;
grant execute on function public.get_customer_referral_invite_status(text, text)
to anon, authenticated;

create or replace function public.create_referral_link(
  input_restaurant_slug text,
  input_customer_token text,
  input_device_id text,
  input_creation_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  restaurant_record public.restaurants%rowtype;
  settings_record public.loyalty_settings%rowtype;
  customer_id_value uuid;
  existing_referral public.referrals%rowtype;
  referral_record public.referrals%rowtype;
  normalized_device_id text;
  normalized_creation_token text;
  timezone_value text;
  local_month_start date;
  used_count integer := 0;
  limit_value integer := 5;
  status_payload jsonb;
begin
  normalized_device_id := nullif(trim(coalesce(input_device_id, '')), '');
  normalized_creation_token := lower(trim(coalesce(input_creation_token, '')));

  if normalized_creation_token !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'REFERRAL_CREATION_TOKEN_INVALID';
  end if;

  select r.* into restaurant_record
  from public.restaurants r
  where r.slug = trim(input_restaurant_slug)
    and r.status = 'active';

  if restaurant_record.id is null then
    raise exception using errcode = 'P0001', message = 'REFERRAL_RESTAURANT_INVALID';
  end if;

  customer_id_value := public.resolve_customer_from_public_token(
    restaurant_record.id,
    input_customer_token
  );

  if customer_id_value is null then
    raise exception using errcode = 'P0001', message = 'CUSTOMER_ACCESS_TOKEN_INVALID';
  end if;

  select ls.* into settings_record
  from public.loyalty_settings ls
  where ls.restaurant_id = restaurant_record.id
    and ls.active = true
  limit 1;

  if settings_record.id is null or not coalesce(settings_record.referral_boost_enabled, true) then
    return jsonb_build_object(
      'success', false,
      'error_code', 'REFERRAL_DISABLED'
    );
  end if;

  limit_value := coalesce(settings_record.referral_monthly_invite_limit, 5);
  timezone_value := coalesce(nullif(trim(restaurant_record.timezone_name), ''), 'Europe/Vienna');
  local_month_start := date_trunc('month', statement_timestamp() at time zone timezone_value)::date;

  perform pg_advisory_xact_lock(hashtextextended(
    restaurant_record.id::text || ':' || customer_id_value::text || ':referral:' || local_month_start::text,
    0
  ));

  select r.* into existing_referral
  from public.referrals r
  where r.referral_token_hash = public.hash_public_token(normalized_creation_token)
  for update;

  if existing_referral.id is not null then
    if existing_referral.restaurant_id <> restaurant_record.id
       or existing_referral.referrer_customer_id <> customer_id_value then
      raise exception using errcode = 'P0001', message = 'REFERRAL_CREATION_TOKEN_INVALID';
    end if;

    status_payload := public.get_customer_referral_invite_status(
      input_restaurant_slug,
      input_customer_token
    );
    return jsonb_build_object(
      'success', true,
      'replayed', true,
      'referral_token', normalized_creation_token,
      'referral_id', existing_referral.id,
      'quota', status_payload
    );
  end if;

  if not exists (
    select 1
    from public.points_transactions pt
    where pt.restaurant_id = restaurant_record.id
      and pt.customer_id = customer_id_value
      and pt.type = 'earn'
      and pt.points > 0
  ) then
    perform public.write_audit_event(
      restaurant_record.id, customer_id_value, 'customer', customer_id_value,
      'REFERRAL_BLOCKED', 'blocked', 'customer_portal', 'customers',
      customer_id_value, null,
      jsonb_build_object('reason', 'FIRST_QUALIFYING_VISIT_REQUIRED')
    );
    return jsonb_build_object(
      'success', false,
      'error_code', 'FIRST_QUALIFYING_VISIT_REQUIRED',
      'quota', public.get_customer_referral_invite_status(input_restaurant_slug, input_customer_token)
    );
  end if;

  select count(*) into used_count
  from public.referrals r
  where r.restaurant_id = restaurant_record.id
    and r.referrer_customer_id = customer_id_value
    and r.quota_counted = true
    and r.quota_month = local_month_start;

  if used_count >= limit_value then
    perform public.write_audit_event(
      restaurant_record.id, customer_id_value, 'customer', customer_id_value,
      'REFERRAL_BLOCKED', 'blocked', 'customer_portal', 'referrals',
      null, null,
      jsonb_build_object(
        'reason', 'REFERRAL_MONTHLY_LIMIT_REACHED',
        'used', used_count,
        'limit', limit_value,
        'quota_month', local_month_start
      )
    );
    return jsonb_build_object(
      'success', false,
      'error_code', 'REFERRAL_MONTHLY_LIMIT_REACHED',
      'quota', public.get_customer_referral_invite_status(input_restaurant_slug, input_customer_token)
    );
  end if;

  insert into public.referrals (
    restaurant_id,
    referrer_customer_id,
    status,
    referral_token_hash,
    quota_counted,
    quota_month
  ) values (
    restaurant_record.id,
    customer_id_value,
    'pending',
    public.hash_public_token(normalized_creation_token),
    true,
    local_month_start
  ) returning * into referral_record;

  perform public.record_customer_device(
    restaurant_record.id,
    customer_id_value,
    normalized_device_id
  );

  perform public.write_audit_event(
    restaurant_record.id, customer_id_value, 'customer', customer_id_value,
    'REFERRAL_CREATED', 'success', 'customer_portal', 'referrals',
    referral_record.id, null,
    jsonb_build_object(
      'quota_month', local_month_start,
      'used_after_creation', used_count + 1,
      'limit', limit_value,
      'idempotent_creation', true
    )
  );

  return jsonb_build_object(
    'success', true,
    'replayed', false,
    'referral_token', normalized_creation_token,
    'referral_id', referral_record.id,
    'quota', public.get_customer_referral_invite_status(input_restaurant_slug, input_customer_token)
  );
end;
$$;

create or replace function public.create_referral_link(
  input_restaurant_slug text,
  input_customer_token text,
  input_device_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return public.create_referral_link(
    input_restaurant_slug,
    input_customer_token,
    input_device_id,
    encode(extensions.gen_random_bytes(32), 'hex')
  );
end;
$$;

create or replace function public.create_referral_link(
  input_restaurant_slug text,
  input_customer_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return public.create_referral_link(
    input_restaurant_slug,
    input_customer_token,
    null
  );
end;
$$;

revoke execute on function public.create_referral_link(text, text, text, text)
from public;
grant execute on function public.create_referral_link(text, text, text, text)
to anon, authenticated;

revoke execute on function public.create_referral_link(text, text, text)
from public;
grant execute on function public.create_referral_link(text, text, text)
to anon, authenticated;

revoke execute on function public.create_referral_link(text, text)
from public;
grant execute on function public.create_referral_link(text, text)
to anon, authenticated;

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
  normalized_phone text;
  normalized_device_id text;
begin
  normalized_phone := regexp_replace(trim(coalesce(input_phone, '')), '\s+', '', 'g');
  normalized_device_id := nullif(trim(coalesce(input_device_id, '')), '');

  select * into restaurant_record
  from public.restaurants
  where slug = trim(input_restaurant_slug)
    and status = 'active';

  if restaurant_record.id is null then
    raise exception 'restaurant not found';
  end if;

  select * into referral_record
  from public.referrals
  where restaurant_id = restaurant_record.id
    and referral_token_hash = public.hash_public_token(input_referral_token)
    and status in ('pending', 'pending_registered')
  limit 1
  for update;

  if referral_record.id is null then
    raise exception 'referral not found';
  end if;

  select * into referrer_record
  from public.customers
  where id = referral_record.referrer_customer_id
    and restaurant_id = restaurant_record.id;

  if regexp_replace(coalesce(referrer_record.phone, ''), '\s+', '', 'g') = normalized_phone then
    raise exception 'self referral is not allowed';
  end if;

  select * into existing_customer_record
  from public.customers
  where restaurant_id = restaurant_record.id
    and phone = normalized_phone
  limit 1;

  if existing_customer_record.id is not null then
    if existing_customer_record.id = referrer_record.id then
      raise exception 'self referral is not allowed';
    end if;

    if exists (
      select 1 from public.referrals r
      where r.restaurant_id = restaurant_record.id
        and r.referrer_customer_id = existing_customer_record.id
        and r.referred_customer_id = referrer_record.id
        and r.status in ('pending_registered', 'activated')
    ) then
      raise exception 'circular referral is not allowed';
    end if;

    if exists (
      select 1 from public.referrals r
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
    update public.customer_rewards cr
    set assignment_metadata = coalesce(cr.assignment_metadata, '{}'::jsonb)
      || jsonb_build_object('registration_source', 'referral_registration')
    where cr.restaurant_id = restaurant_record.id
      and cr.customer_id = customer_id_value
      and cr.reward_id = (starter_payload->>'reward_id')::uuid
      and cr.is_starter_reward = true;
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
  welcome_gift_assigned_value boolean := false;
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

    select exists (
      select 1 from public.customer_rewards cr
      where cr.restaurant_id = restaurant_record.id
        and cr.customer_id = membership_record.customer_id
        and cr.is_starter_reward = true
    ) into welcome_gift_assigned_value;

    return public.open_customer_account_membership(restaurant_record.id)
      || jsonb_build_object(
        'joined', false,
        'referral_status', referral_record.status,
        'welcome_gift_assigned', welcome_gift_assigned_value
      );
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
  customer_id_value := public.resolve_customer_from_public_token(
    restaurant_record.id,
    raw_customer_token
  );
  if customer_id_value is null then
    raise exception using errcode = 'P0001', message = 'CUSTOMER_REGISTRATION_FAILED';
  end if;

  insert into public.customer_account_memberships (
    account_id, restaurant_id, customer_id, linked_at, last_opened_at
  ) values (
    account_id_value, restaurant_record.id, customer_id_value, now(), now()
  );

  perform public.write_audit_event(
    restaurant_record.id, customer_id_value, 'customer', customer_id_value,
    'REFERRAL_REGISTERED', 'success', 'referral', 'referrals',
    referral_record.id, null,
    jsonb_build_object(
      'central_account', true,
      'welcome_gift_assigned', coalesce((registration_result->>'welcome_gift_assigned')::boolean, false)
    )
  );

  return jsonb_build_object(
    'joined', true,
    'restaurant_slug', restaurant_record.slug,
    'customer_token', raw_customer_token,
    'referral_status', 'pending_registered',
    'welcome_gift_assigned', coalesce((registration_result->>'welcome_gift_assigned')::boolean, false)
  );
end;
$$;

revoke execute on function public.join_authenticated_customer_referral(
  text, text, boolean, boolean, text
) from public, anon;
grant execute on function public.join_authenticated_customer_referral(
  text, text, boolean, boolean, text
) to authenticated;

create or replace function public.update_referral_bonus_settings(
  input_restaurant_id uuid,
  input_enabled boolean,
  input_multiplier numeric,
  input_duration_days integer,
  input_monthly_invite_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_role_value text;
  settings_record public.loyalty_settings%rowtype;
  old_settings jsonb;
begin
  select rm.role into actor_role_value
  from public.restaurant_members rm
  where rm.restaurant_id = input_restaurant_id
    and rm.user_id = auth.uid()
    and rm.role in ('owner', 'admin')
  limit 1;

  if actor_role_value is null then
    raise exception 'Keine Berechtigung für diese Einstellung.' using errcode = '42501';
  end if;
  if input_multiplier is distinct from 2::numeric then
    raise exception 'Der Multiplikator muss 2,0 betragen.' using errcode = '22023';
  end if;
  if input_duration_days is null or input_duration_days < 1 or input_duration_days > 365 then
    raise exception 'Die Dauer muss zwischen 1 und 365 ganzen Tagen liegen.' using errcode = '22023';
  end if;
  if input_monthly_invite_limit is null
     or input_monthly_invite_limit < 1
     or input_monthly_invite_limit > 100 then
    raise exception 'Das Monatslimit muss zwischen 1 und 100 liegen.' using errcode = '22023';
  end if;

  select * into settings_record
  from public.loyalty_settings
  where restaurant_id = input_restaurant_id
  for update;

  if settings_record.id is null then
    raise exception 'Bonusprogramm-Einstellungen wurden nicht gefunden.' using errcode = 'P0002';
  end if;

  old_settings := jsonb_build_object(
    'enabled', settings_record.referral_boost_enabled,
    'multiplier', settings_record.referral_boost_multiplier,
    'duration_days', settings_record.referral_boost_duration_days,
    'monthly_invite_limit', settings_record.referral_monthly_invite_limit
  );

  update public.loyalty_settings
  set referral_boost_enabled = coalesce(input_enabled, false),
      referral_boost_multiplier = 2,
      referral_boost_duration_days = input_duration_days,
      referral_monthly_invite_limit = input_monthly_invite_limit
  where id = settings_record.id
  returning * into settings_record;

  perform public.write_audit_event(
    input_restaurant_id, null, 'admin', auth.uid(),
    'REFERRAL_BONUS_SETTINGS_UPDATED', 'success', 'restaurant_portal',
    'loyalty_settings', settings_record.id, null,
    jsonb_build_object(
      'restaurant_id', input_restaurant_id,
      'actor_user_id', auth.uid(),
      'actor_role', actor_role_value,
      'old_value', old_settings,
      'new_value', jsonb_build_object(
        'enabled', settings_record.referral_boost_enabled,
        'multiplier', settings_record.referral_boost_multiplier,
        'duration_days', settings_record.referral_boost_duration_days,
        'monthly_invite_limit', settings_record.referral_monthly_invite_limit
      ),
      'changed_at', now()
    )
  );

  return jsonb_build_object(
    'referral_boost_enabled', settings_record.referral_boost_enabled,
    'referral_boost_multiplier', settings_record.referral_boost_multiplier,
    'referral_boost_duration_days', settings_record.referral_boost_duration_days,
    'referral_monthly_invite_limit', settings_record.referral_monthly_invite_limit
  );
end;
$$;

revoke execute on function public.update_referral_bonus_settings(
  uuid, boolean, numeric, integer, integer
) from public, anon;
grant execute on function public.update_referral_bonus_settings(
  uuid, boolean, numeric, integer, integer
) to authenticated;

comment on function public.create_referral_link(text, text, text, text)
is 'Creates one restaurant-scoped V1 invitation after first qualifying points, with idempotent token replay and restaurant-local monthly quota.';

comment on function public.get_customer_referral_invite_status(text, text)
is 'Returns token-scoped referral eligibility and restaurant-local monthly quota without exposing customer PII.';
