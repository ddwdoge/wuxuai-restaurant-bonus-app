-- Public partner locations remain opt-in and expose only finder-safe fields.
alter table public.branches
  add column if not exists address text,
  add column if not exists postal_code text,
  add column if not exists city text,
  add column if not exists country text not null default 'AT',
  add column if not exists latitude numeric(9, 6),
  add column if not exists longitude numeric(9, 6),
  add column if not exists is_discoverable boolean not null default false,
  add column if not exists public_short_description text,
  add column if not exists public_cover_image_url text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'branches_latitude_valid'
      and conrelid = 'public.branches'::regclass
  ) then
    alter table public.branches
      add constraint branches_latitude_valid
      check (latitude is null or latitude between -90 and 90);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'branches_longitude_valid'
      and conrelid = 'public.branches'::regclass
  ) then
    alter table public.branches
      add constraint branches_longitude_valid
      check (longitude is null or longitude between -180 and 180);
  end if;
end $$;

create index if not exists branches_public_finder_idx
on public.branches (city, postal_code, name)
where is_discoverable = true and status = 'active';

create or replace function public.get_public_partner_restaurants()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'restaurant_id', r.id,
        'branch_id', b.id,
        'name', b.name,
        'slug', r.slug,
        'address', b.address,
        'postal_code', b.postal_code,
        'city', b.city,
        'country', b.country,
        'latitude', b.latitude,
        'longitude', b.longitude,
        'logo_url', rb.logo_url,
        'cover_image_url', b.public_cover_image_url,
        'short_description', b.public_short_description,
        'opening_hours', r.opening_hours,
        'welcome_reward_available', coalesce(reward_stats.welcome_reward_available, false),
        'active_reward_count', coalesce(reward_stats.active_reward_count, 0)
      )
      order by b.city, b.name
    ),
    '[]'::jsonb
  )
  from public.branches b
  join public.restaurants r
    on r.id = b.restaurant_id
  left join public.restaurant_branding rb
    on rb.restaurant_id = r.id
  left join lateral (
    select
      count(*)::integer as active_reward_count,
      bool_or(rw.is_starter_reward) as welcome_reward_available
    from public.rewards rw
    where rw.restaurant_id = r.id
      and rw.branch_id = b.id
      and rw.active = true
      and (rw.expires_at is null or rw.expires_at > now())
  ) reward_stats on true
  where r.status = 'active'
    and b.status = 'active'
    and b.is_discoverable = true
    and b.latitude between -90 and 90
    and b.longitude between -180 and 180;
$$;

create or replace function public.get_customer_partner_membership(
  input_restaurant_slug text,
  input_customer_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  restaurant_record public.restaurants%rowtype;
  customer_record public.customers%rowtype;
  visits_count integer := 0;
  last_visit_at timestamptz;
  next_reward jsonb := null;
  available_rewards jsonb := '[]'::jsonb;
begin
  select r.* into restaurant_record
  from public.restaurants r
  join public.branches b on b.restaurant_id = r.id
  where r.slug = trim(input_restaurant_slug)
    and r.status = 'active'
    and b.status = 'active'
    and b.is_discoverable = true
  limit 1;

  if restaurant_record.id is null then
    return jsonb_build_object('registered', false);
  end if;

  select c.* into customer_record
  from public.customer_qr_tokens cqt
  join public.customers c
    on c.id = cqt.customer_id
   and c.restaurant_id = cqt.restaurant_id
  where cqt.restaurant_id = restaurant_record.id
    and cqt.token_hash = public.hash_public_token(input_customer_token)
    and cqt.active = true
    and (cqt.expires_at is null or cqt.expires_at > now())
  limit 1;

  if customer_record.id is null then
    return jsonb_build_object('registered', false);
  end if;

  select count(*)::integer, max(pt.created_at)
  into visits_count, last_visit_at
  from public.points_transactions pt
  where pt.restaurant_id = restaurant_record.id
    and pt.customer_id = customer_record.id
    and pt.type = 'earn';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', rw.id,
        'title', rw.title,
        'required_points', rw.required_points,
        'image_url', rw.image_url,
        'expires_at', rw.expires_at
      )
      order by rw.required_points, rw.title
    ),
    '[]'::jsonb
  )
  into available_rewards
  from public.rewards rw
  where rw.restaurant_id = restaurant_record.id
    and rw.active = true
    and not rw.is_starter_reward
    and rw.required_points <= customer_record.points_balance
    and (rw.expires_at is null or rw.expires_at > now());

  select jsonb_build_object(
    'id', rw.id,
    'title', rw.title,
    'required_points', rw.required_points,
    'missing_points', greatest(rw.required_points - customer_record.points_balance, 0),
    'image_url', rw.image_url,
    'expires_at', rw.expires_at
  )
  into next_reward
  from public.rewards rw
  where rw.restaurant_id = restaurant_record.id
    and rw.active = true
    and not rw.is_starter_reward
    and rw.required_points > customer_record.points_balance
    and (rw.expires_at is null or rw.expires_at > now())
  order by rw.required_points, rw.title
  limit 1;

  return jsonb_build_object(
    'registered', true,
    'points_balance', customer_record.points_balance,
    'visits_count', visits_count,
    'last_visit_at', last_visit_at,
    'available_rewards', available_rewards,
    'next_reward', next_reward
  );
end;
$$;

revoke all on function public.get_public_partner_restaurants() from public;
revoke all on function public.get_customer_partner_membership(text, text) from public;

grant execute on function public.get_public_partner_restaurants() to anon, authenticated;
grant execute on function public.get_customer_partner_membership(text, text) to anon, authenticated;

comment on function public.get_public_partner_restaurants() is
  'Returns only active, explicitly discoverable WUXUAI partner locations.';

comment on function public.get_customer_partner_membership(text, text) is
  'Returns restaurant-scoped membership data after validating the customer token.';
