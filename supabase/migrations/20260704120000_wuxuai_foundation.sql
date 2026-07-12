create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);

create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text not null unique,
  status text not null default 'active' check (status in ('active', 'draft', 'suspended')),
  created_at timestamptz not null default now()
);

create table public.restaurant_members (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'manager')),
  created_at timestamptz not null default now(),
  unique (restaurant_id, user_id)
);

create table public.restaurant_branding (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null unique references public.restaurants(id) on delete cascade,
  logo_url text,
  primary_color text not null default '#0f766e',
  secondary_color text not null default '#f4a261',
  button_color text not null default '#0f766e',
  font_family text not null default 'Inter',
  created_at timestamptz not null default now()
);

create table public.staff_members (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  pin_hash text not null,
  role text not null default 'staff' check (role in ('staff', 'supervisor')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  name text not null,
  phone text,
  email text,
  birthday date,
  customer_code text not null,
  points_balance integer not null default 0 check (points_balance >= 0),
  stamp_balance integer not null default 0 check (stamp_balance >= 0),
  membership_level text not null default 'standard',
  created_at timestamptz not null default now(),
  unique (restaurant_id, customer_code)
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  title text not null,
  description text not null default '',
  status text not null default 'draft' check (status in ('active', 'draft', 'expired')),
  start_date date,
  end_date date,
  created_at timestamptz not null default now()
);

create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  title text not null,
  description text not null default '',
  reward_type text not null default 'points',
  required_points integer not null default 0 check (required_points >= 0),
  status text not null default 'active' check (status in ('active', 'draft', 'expired')),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  coupon_id uuid not null references public.coupons(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  staff_member_id uuid references public.staff_members(id) on delete set null,
  redeemed_at timestamptz not null default now()
);

create table public.loyalty_settings (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null unique references public.restaurants(id) on delete cascade,
  loyalty_mode text not null check (loyalty_mode in ('amount_based', 'stamp_based', 'menu_points')),
  amount_per_point numeric(12, 2) not null default 1 check (amount_per_point > 0),
  stamps_required integer not null default 10 check (stamps_required > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.loyalty_rules (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  title text not null,
  points integer not null default 0 check (points >= 0),
  stamps integer not null default 0 check (stamps >= 0),
  min_amount numeric(12, 2) not null default 0 check (min_amount >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.points_transactions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  staff_member_id uuid references public.staff_members(id) on delete set null,
  type text not null check (type in ('earn', 'redeem', 'adjust')),
  points integer not null,
  reason text not null default '',
  created_at timestamptz not null default now()
);

create table public.stamp_transactions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  staff_member_id uuid references public.staff_members(id) on delete set null,
  stamps integer not null check (stamps > 0),
  reason text not null default '',
  created_at timestamptz not null default now()
);

create table public.rewards (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  title text not null,
  description text not null default '',
  required_points integer not null default 0 check (required_points >= 0),
  required_stamps integer not null default 0 check (required_stamps >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.customer_rewards (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  reward_id uuid not null references public.rewards(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'redeemed', 'expired')),
  created_at timestamptz not null default now(),
  redeemed_at timestamptz
);

create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  referrer_customer_id uuid not null references public.customers(id) on delete cascade,
  referred_customer_id uuid references public.customers(id) on delete set null,
  status text not null default 'pending',
  reward_points integer not null default 0 check (reward_points >= 0),
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  actor_type text not null check (actor_type in ('admin', 'staff', 'customer', 'system')),
  actor_id uuid,
  action text not null,
  target_table text,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.is_restaurant_member(input_restaurant_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = input_restaurant_id
      and rm.user_id = auth.uid()
  );
$$;

create or replace function public.is_restaurant_admin(input_restaurant_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = input_restaurant_id
      and rm.user_id = auth.uid()
      and rm.role in ('owner', 'admin', 'manager')
  );
$$;

create or replace function public.validate_staff_pin(input_restaurant_id uuid, input_pin text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.staff_members sm
    where sm.restaurant_id = input_restaurant_id
      and sm.active = true
      and sm.pin_hash = extensions.crypt(input_pin, sm.pin_hash)
  );
$$;

create or replace function public.handle_new_restaurant_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.restaurant_members (restaurant_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (restaurant_id, user_id) do nothing;

  insert into public.restaurant_branding (restaurant_id)
  values (new.id)
  on conflict (restaurant_id) do nothing;

  insert into public.loyalty_settings (restaurant_id, loyalty_mode)
  values (new.id, 'menu_points')
  on conflict (restaurant_id) do nothing;

  return new;
end;
$$;

create trigger on_restaurant_created
after insert on public.restaurants
for each row execute function public.handle_new_restaurant_member();

alter table public.profiles enable row level security;
alter table public.restaurants enable row level security;
alter table public.restaurant_members enable row level security;
alter table public.restaurant_branding enable row level security;
alter table public.staff_members enable row level security;
alter table public.customers enable row level security;
alter table public.campaigns enable row level security;
alter table public.coupons enable row level security;
alter table public.coupon_redemptions enable row level security;
alter table public.loyalty_settings enable row level security;
alter table public.loyalty_rules enable row level security;
alter table public.points_transactions enable row level security;
alter table public.stamp_transactions enable row level security;
alter table public.rewards enable row level security;
alter table public.customer_rewards enable row level security;
alter table public.referrals enable row level security;
alter table public.audit_log enable row level security;

create policy "profiles own access"
on public.profiles for all
using (id = auth.uid())
with check (id = auth.uid());

create policy "restaurants member select"
on public.restaurants for select
using (public.is_restaurant_member(id) or owner_id = auth.uid());

create policy "restaurants owner insert"
on public.restaurants for insert
with check (owner_id = auth.uid());

create policy "restaurants admin update"
on public.restaurants for update
using (public.is_restaurant_admin(id))
with check (public.is_restaurant_admin(id));

create policy "restaurant members select"
on public.restaurant_members for select
using (public.is_restaurant_member(restaurant_id));

create policy "restaurant members admin write"
on public.restaurant_members for all
using (public.is_restaurant_admin(restaurant_id))
with check (public.is_restaurant_admin(restaurant_id));

create policy "branding member select"
on public.restaurant_branding for select
using (public.is_restaurant_member(restaurant_id));

create policy "branding admin write"
on public.restaurant_branding for all
using (public.is_restaurant_admin(restaurant_id))
with check (public.is_restaurant_admin(restaurant_id));

create policy "staff admin manage"
on public.staff_members for all
using (public.is_restaurant_admin(restaurant_id))
with check (public.is_restaurant_admin(restaurant_id));

create policy "customers admin manage"
on public.customers for all
using (public.is_restaurant_admin(restaurant_id))
with check (public.is_restaurant_admin(restaurant_id));

create policy "customers own select"
on public.customers for select
using (auth_user_id = auth.uid());

create policy "campaigns tenant select"
on public.campaigns for select
using (public.is_restaurant_member(restaurant_id) or status = 'active');

create policy "campaigns admin write"
on public.campaigns for all
using (public.is_restaurant_admin(restaurant_id))
with check (public.is_restaurant_admin(restaurant_id));

create policy "coupons tenant select"
on public.coupons for select
using (public.is_restaurant_member(restaurant_id) or status = 'active');

create policy "coupons admin write"
on public.coupons for all
using (public.is_restaurant_admin(restaurant_id))
with check (public.is_restaurant_admin(restaurant_id));

create policy "coupon redemptions admin select"
on public.coupon_redemptions for select
using (public.is_restaurant_member(restaurant_id));

create policy "coupon redemptions admin insert"
on public.coupon_redemptions for insert
with check (public.is_restaurant_admin(restaurant_id));

create policy "loyalty settings member select"
on public.loyalty_settings for select
using (public.is_restaurant_member(restaurant_id));

create policy "loyalty settings admin write"
on public.loyalty_settings for all
using (public.is_restaurant_admin(restaurant_id))
with check (public.is_restaurant_admin(restaurant_id));

create policy "loyalty rules member select"
on public.loyalty_rules for select
using (public.is_restaurant_member(restaurant_id));

create policy "loyalty rules admin write"
on public.loyalty_rules for all
using (public.is_restaurant_admin(restaurant_id))
with check (public.is_restaurant_admin(restaurant_id));

create policy "points transactions member select"
on public.points_transactions for select
using (public.is_restaurant_member(restaurant_id));

create policy "points transactions admin insert"
on public.points_transactions for insert
with check (public.is_restaurant_admin(restaurant_id));

create policy "stamp transactions member select"
on public.stamp_transactions for select
using (public.is_restaurant_member(restaurant_id));

create policy "stamp transactions admin insert"
on public.stamp_transactions for insert
with check (public.is_restaurant_admin(restaurant_id));

create policy "rewards tenant select"
on public.rewards for select
using (public.is_restaurant_member(restaurant_id) or active = true);

create policy "rewards admin write"
on public.rewards for all
using (public.is_restaurant_admin(restaurant_id))
with check (public.is_restaurant_admin(restaurant_id));

create policy "customer rewards own select"
on public.customer_rewards for select
using (
  public.is_restaurant_member(restaurant_id)
  or exists (
    select 1 from public.customers c
    where c.id = customer_id
      and c.auth_user_id = auth.uid()
  )
);

create policy "customer rewards admin write"
on public.customer_rewards for all
using (public.is_restaurant_admin(restaurant_id))
with check (public.is_restaurant_admin(restaurant_id));

create policy "referrals own or admin select"
on public.referrals for select
using (
  public.is_restaurant_member(restaurant_id)
  or exists (
    select 1 from public.customers c
    where c.id in (referrer_customer_id, referred_customer_id)
      and c.auth_user_id = auth.uid()
  )
);

create policy "referrals admin write"
on public.referrals for all
using (public.is_restaurant_admin(restaurant_id))
with check (public.is_restaurant_admin(restaurant_id));

create policy "audit log member select"
on public.audit_log for select
using (public.is_restaurant_member(restaurant_id));

create policy "audit log admin insert"
on public.audit_log for insert
with check (public.is_restaurant_admin(restaurant_id));

create index restaurants_slug_idx on public.restaurants (slug);
create index restaurant_members_user_idx on public.restaurant_members (user_id);
create index customers_restaurant_code_idx on public.customers (restaurant_id, customer_code);
create index audit_log_restaurant_created_idx on public.audit_log (restaurant_id, created_at desc);
