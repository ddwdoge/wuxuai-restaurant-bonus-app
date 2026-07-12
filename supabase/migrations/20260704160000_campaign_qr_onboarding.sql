alter table public.campaigns
add column if not exists slug text;

update public.campaigns
set slug = lower(regexp_replace(title, '[^a-zA-Z0-9]+', '-', 'g'))
where slug is null;

alter table public.campaigns
alter column slug set not null;

alter table public.campaigns
add column if not exists starter_offer_source text
check (starter_offer_source in ('reward', 'coupon'));

alter table public.campaigns
add column if not exists starter_reward_id uuid references public.rewards(id) on delete set null;

alter table public.campaigns
add column if not exists starter_coupon_id uuid references public.coupons(id) on delete set null;

create unique index if not exists campaigns_restaurant_slug_unique_idx
on public.campaigns (restaurant_id, slug);

update public.coupons
set reward_type = 'coupon'
where reward_type not in ('reward', 'coupon');

alter table public.coupons
alter column reward_type set default 'coupon';

create table if not exists public.campaign_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  event_type text not null check (event_type in ('scan', 'registration', 'starter_reward')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.campaign_customer_offers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  offer_source text not null check (offer_source in ('reward', 'coupon')),
  offer_id uuid not null,
  status text not null default 'issued' check (status in ('issued', 'redeemed')),
  created_at timestamptz not null default now(),
  redeemed_at timestamptz,
  unique (restaurant_id, campaign_id, customer_id, offer_source, offer_id)
);

alter table public.campaign_events enable row level security;
alter table public.campaign_customer_offers enable row level security;

create policy "campaign events admin select"
on public.campaign_events for select
using (public.is_restaurant_member(restaurant_id));

create policy "campaign events admin insert"
on public.campaign_events for insert
with check (public.is_restaurant_admin(restaurant_id));

create policy "campaign customer offers admin select"
on public.campaign_customer_offers for select
using (public.is_restaurant_member(restaurant_id));

create policy "campaign customer offers admin write"
on public.campaign_customer_offers for all
using (public.is_restaurant_admin(restaurant_id))
with check (public.is_restaurant_admin(restaurant_id));

create index if not exists campaign_events_restaurant_created_idx
on public.campaign_events (restaurant_id, created_at desc);

create index if not exists campaign_customer_offers_customer_idx
on public.campaign_customer_offers (restaurant_id, customer_id);

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
  where slug = input_restaurant_slug
    and status = 'active';

  if restaurant_record.id is null then
    raise exception 'restaurant not found';
  end if;

  select *
  into campaign_record
  from public.campaigns
  where restaurant_id = restaurant_record.id
    and slug = input_campaign_slug
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
    select to_jsonb(r)
    into reward_payload
    from public.rewards r
    where r.id = campaign_record.starter_reward_id
      and r.restaurant_id = restaurant_record.id
      and r.active = true;
  elsif campaign_record.starter_offer_source = 'coupon' and campaign_record.starter_coupon_id is not null then
    select to_jsonb(c)
    into coupon_payload
    from public.coupons c
    where c.id = campaign_record.starter_coupon_id
      and c.restaurant_id = restaurant_record.id
      and c.status = 'active';
  end if;

  insert into public.campaign_events (restaurant_id, campaign_id, event_type)
  values (restaurant_record.id, campaign_record.id, 'scan');

  return jsonb_build_object(
    'restaurant', to_jsonb(restaurant_record),
    'branding', to_jsonb(branding_record),
    'campaign', to_jsonb(campaign_record),
    'reward', reward_payload,
    'coupon', coupon_payload
  );
end;
$$;

grant execute on function public.get_public_campaign(text, text)
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
  next_code text;
  offer_source_value text;
  offer_id_value uuid;
  starter_issued boolean := false;
  inserted_count integer := 0;
begin
  if length(trim(coalesce(input_name, ''))) < 2 then
    raise exception 'name is required';
  end if;

  if length(trim(coalesce(input_phone, ''))) < 3 then
    raise exception 'phone is required';
  end if;

  select *
  into restaurant_record
  from public.restaurants
  where slug = input_restaurant_slug
    and status = 'active';

  if restaurant_record.id is null then
    raise exception 'restaurant not found';
  end if;

  select *
  into campaign_record
  from public.campaigns
  where restaurant_id = restaurant_record.id
    and slug = input_campaign_slug
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
    and phone = trim(input_phone)
  limit 1;

  if customer_record.id is null then
    next_code := upper(substr(restaurant_record.slug, 1, 3)) || '-' || upper(substr(md5(random()::text), 1, 8));

    insert into public.customers (
      restaurant_id,
      name,
      phone,
      birthday,
      customer_code
    )
    values (
      restaurant_record.id,
      trim(input_name),
      trim(input_phone),
      input_birthday,
      next_code
    )
    returning * into customer_record;
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
    end if;
  end if;

  return jsonb_build_object(
    'restaurant', to_jsonb(restaurant_record),
    'campaign', to_jsonb(campaign_record),
    'customer', to_jsonb(customer_record),
    'starter_offer_source', offer_source_value,
    'starter_offer_id', offer_id_value,
    'starter_issued', starter_issued
  );
end;
$$;

grant execute on function public.register_campaign_customer(text, text, text, text, date)
to anon, authenticated;
