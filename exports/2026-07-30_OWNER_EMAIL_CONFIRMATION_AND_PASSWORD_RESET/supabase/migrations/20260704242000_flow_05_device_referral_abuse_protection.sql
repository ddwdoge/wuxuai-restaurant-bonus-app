create table if not exists public.customer_devices (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  device_id text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (restaurant_id, customer_id, device_id)
);

alter table public.customer_devices enable row level security;

drop policy if exists "customer devices member select" on public.customer_devices;
drop policy if exists "customer devices admin write" on public.customer_devices;

create policy "customer devices member select"
on public.customer_devices for select
using (public.is_restaurant_member(restaurant_id));

create policy "customer devices admin write"
on public.customer_devices for all
using (public.is_restaurant_admin(restaurant_id))
with check (public.is_restaurant_admin(restaurant_id));

create index if not exists customer_devices_device_idx
on public.customer_devices (restaurant_id, device_id, last_seen_at desc);

create unique index if not exists customers_restaurant_phone_unique_idx
on public.customers (restaurant_id, phone)
where phone is not null;

create or replace function public.record_customer_device(
  input_restaurant_id uuid,
  input_customer_id uuid,
  input_device_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_device_id text;
begin
  normalized_device_id := trim(coalesce(input_device_id, ''));

  if length(normalized_device_id) < 8 or length(normalized_device_id) > 128 then
    return;
  end if;

  insert into public.customer_devices (
    restaurant_id,
    customer_id,
    device_id,
    first_seen_at,
    last_seen_at
  )
  values (
    input_restaurant_id,
    input_customer_id,
    normalized_device_id,
    now(),
    now()
  )
  on conflict (restaurant_id, customer_id, device_id)
  do update set last_seen_at = excluded.last_seen_at;
end;
$$;

create or replace function public.resolve_customer_from_public_token(
  input_restaurant_id uuid,
  input_customer_token text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_customer_id uuid;
begin
  select c.id
  into resolved_customer_id
  from public.customer_qr_tokens cqt
  join public.customers c on c.id = cqt.customer_id
  where cqt.restaurant_id = input_restaurant_id
    and cqt.token_hash = public.hash_public_token(input_customer_token)
    and cqt.active = true
    and (cqt.expires_at is null or cqt.expires_at > now())
    and c.restaurant_id = input_restaurant_id
  limit 1;

  return resolved_customer_id;
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

  return result_payload;
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
  restaurant_record public.restaurants%rowtype;
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

  customer_token := result_payload #>> '{customer,customer_qr_token}';
  customer_id_value := public.resolve_customer_from_public_token(restaurant_record.id, customer_token);

  perform public.record_customer_device(restaurant_record.id, customer_id_value, normalized_device_id);

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

  return result_payload;
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
set search_path = public
as $$
declare
  result_payload jsonb;
  restaurant_record public.restaurants%rowtype;
  customer_id_value uuid;
  referral_id_value uuid;
  normalized_device_id text;
begin
  normalized_device_id := nullif(trim(coalesce(input_device_id, '')), '');

  result_payload := public.create_referral_link(input_restaurant_slug, input_customer_token);

  select *
  into restaurant_record
  from public.restaurants
  where slug = trim(input_restaurant_slug);

  customer_id_value := public.resolve_customer_from_public_token(restaurant_record.id, input_customer_token);
  referral_id_value := (result_payload->>'referral_id')::uuid;

  perform public.record_customer_device(restaurant_record.id, customer_id_value, normalized_device_id);

  update public.audit_log
  set metadata = metadata || jsonb_build_object('device_id', normalized_device_id)
  where restaurant_id = restaurant_record.id
    and target_id = referral_id_value
    and action = 'public_referral_link_created'
    and normalized_device_id is not null;

  return result_payload;
end;
$$;

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
set search_path = public
as $$
declare
  result_payload jsonb;
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

  if regexp_replace(coalesce(referrer_record.phone, ''), '\s+', '', 'g') = normalized_phone then
    raise exception 'self referral is not allowed';
  end if;

  select *
  into existing_customer_record
  from public.customers
  where restaurant_id = restaurant_record.id
    and phone = normalized_phone
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
$$;

create or replace function public.collect_bonus_points(
  input_restaurant_slug text,
  input_customer_token text,
  input_amount_tier_key text,
  input_device_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result_payload jsonb;
  restaurant_record public.restaurants%rowtype;
  customer_id_value uuid;
  normalized_device_id text;
begin
  normalized_device_id := nullif(trim(coalesce(input_device_id, '')), '');

  select *
  into restaurant_record
  from public.restaurants
  where slug = trim(input_restaurant_slug)
    and status = 'active';

  if restaurant_record.id is null then
    raise exception 'restaurant not found';
  end if;

  customer_id_value := public.resolve_customer_from_public_token(restaurant_record.id, input_customer_token);

  if customer_id_value is null then
    raise exception 'customer token not valid';
  end if;

  result_payload := public.collect_bonus_points(
    input_restaurant_slug,
    input_customer_token,
    input_amount_tier_key
  );

  perform public.record_customer_device(restaurant_record.id, customer_id_value, normalized_device_id);

  update public.audit_log
  set metadata = metadata || jsonb_build_object('device_id', normalized_device_id)
  where restaurant_id = restaurant_record.id
    and actor_id = customer_id_value
    and action = 'public_bonus_points_collected'
    and created_at > now() - interval '1 minute'
    and normalized_device_id is not null;

  return result_payload;
end;
$$;

create or replace function public.get_referral_abuse_warnings(input_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  multi_account_devices integer := 0;
  multi_referral_devices integer := 0;
  fast_referrers integer := 0;
begin
  if not public.is_restaurant_member(input_restaurant_id) then
    raise exception 'not allowed';
  end if;

  select count(*)
  into multi_account_devices
  from (
    select device_id
    from public.customer_devices
    where restaurant_id = input_restaurant_id
    group by device_id
    having count(distinct customer_id) > 1
  ) flagged_devices;

  select count(*)
  into multi_referral_devices
  from (
    select metadata->>'device_id' as device_id
    from public.audit_log
    where restaurant_id = input_restaurant_id
      and action = 'public_referral_link_created'
      and metadata ? 'device_id'
    group by metadata->>'device_id'
    having count(distinct target_id) > 1
  ) flagged_referral_devices;

  select count(*)
  into fast_referrers
  from (
    select actor_id
    from public.audit_log
    where restaurant_id = input_restaurant_id
      and action = 'public_referral_link_created'
      and created_at > now() - interval '1 hour'
    group by actor_id
    having count(*) >= 3
  ) flagged_referrers;

  return jsonb_build_object(
    'devices_with_multiple_accounts', multi_account_devices,
    'devices_with_multiple_referrals', multi_referral_devices,
    'many_referrals_short_time', fast_referrers
  );
end;
$$;

revoke execute on function public.record_customer_device(uuid, uuid, text)
from public, anon, authenticated;

revoke execute on function public.resolve_customer_from_public_token(uuid, text)
from public, anon, authenticated;

revoke execute on function public.register_restaurant_customer(text, text, text, date, text)
from public;

grant execute on function public.register_restaurant_customer(text, text, text, date, text)
to anon, authenticated;

revoke execute on function public.register_campaign_customer(text, text, text, text, date, text)
from public;

grant execute on function public.register_campaign_customer(text, text, text, text, date, text)
to anon, authenticated;

revoke execute on function public.create_referral_link(text, text, text)
from public;

grant execute on function public.create_referral_link(text, text, text)
to anon, authenticated;

revoke execute on function public.register_referral_customer(text, text, text, text, date, text)
from public;

grant execute on function public.register_referral_customer(text, text, text, text, date, text)
to anon, authenticated;

revoke execute on function public.collect_bonus_points(text, text, text, text)
from public;

grant execute on function public.collect_bonus_points(text, text, text, text)
to anon, authenticated;

revoke execute on function public.get_referral_abuse_warnings(uuid)
from public;

grant execute on function public.get_referral_abuse_warnings(uuid)
to authenticated;
