create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  status text not null default 'active' check (status in ('active', 'draft', 'suspended')),
  created_at timestamptz not null default now()
);

alter table public.restaurants
add column if not exists organization_id uuid references public.organizations(id) on delete restrict;

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  restaurant_id uuid not null unique references public.restaurants(id) on delete cascade,
  name text not null,
  slug text not null,
  status text not null default 'active' check (status in ('active', 'draft', 'suspended')),
  created_at timestamptz not null default now(),
  unique (organization_id, slug)
);

alter table public.restaurants
add column if not exists primary_branch_id uuid references public.branches(id) on delete set null;

create table if not exists public.branch_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null unique references public.branches(id) on delete cascade,
  status text not null default 'trialing' check (status in ('trialing', 'active', 'past_due', 'cancelled', 'paused')),
  plan_key text not null default 'pilot',
  current_period_ends_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.organizations enable row level security;
alter table public.branches enable row level security;
alter table public.branch_subscriptions enable row level security;

create or replace function public.ensure_restaurant_branch(input_restaurant_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  restaurant_record public.restaurants%rowtype;
  organization_id_value uuid;
  branch_id_value uuid;
begin
  select *
  into restaurant_record
  from public.restaurants
  where id = input_restaurant_id
  for update;

  if restaurant_record.id is null then
    raise exception 'restaurant not found';
  end if;

  organization_id_value := restaurant_record.organization_id;

  if organization_id_value is null then
    insert into public.organizations (owner_id, name, status)
    values (restaurant_record.owner_id, restaurant_record.name, restaurant_record.status)
    returning id into organization_id_value;

    update public.restaurants
    set organization_id = organization_id_value
    where id = restaurant_record.id;
  end if;

  select id
  into branch_id_value
  from public.branches
  where restaurant_id = restaurant_record.id
  limit 1;

  if branch_id_value is null then
    insert into public.branches (
      organization_id,
      restaurant_id,
      name,
      slug,
      status
    )
    values (
      organization_id_value,
      restaurant_record.id,
      restaurant_record.name,
      restaurant_record.slug,
      restaurant_record.status
    )
    returning id into branch_id_value;
  end if;

  update public.restaurants
  set primary_branch_id = branch_id_value
  where id = restaurant_record.id
    and primary_branch_id is distinct from branch_id_value;

  insert into public.branch_subscriptions (
    organization_id,
    branch_id,
    status,
    plan_key
  )
  values (
    organization_id_value,
    branch_id_value,
    'trialing',
    'pilot'
  )
  on conflict (branch_id) do nothing;

  return branch_id_value;
end;
$$;

create or replace function public.restaurant_organization_id(input_restaurant_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  organization_id_value uuid;
begin
  select organization_id
  into organization_id_value
  from public.restaurants
  where id = input_restaurant_id;

  return organization_id_value;
end;
$$;

create or replace function public.restaurant_primary_branch_id(input_restaurant_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.ensure_restaurant_branch(input_restaurant_id);
end;
$$;

do $$
declare
  restaurant_record record;
begin
  for restaurant_record in
    select id
    from public.restaurants
  loop
    perform public.ensure_restaurant_branch(restaurant_record.id);
  end loop;
end;
$$;

create or replace function public.set_restaurant_organization_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.organization_id is null then
    insert into public.organizations (owner_id, name, status)
    values (new.owner_id, new.name, new.status)
    returning id into new.organization_id;
  end if;

  return new;
end;
$$;

drop trigger if exists set_restaurant_organization_before_insert on public.restaurants;
create trigger set_restaurant_organization_before_insert
before insert on public.restaurants
for each row execute function public.set_restaurant_organization_before_insert();

alter table public.restaurants
alter column organization_id set not null;

create or replace function public.set_branch_scope_from_restaurant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.restaurant_id is null then
    return new;
  end if;

  if new.organization_id is null then
    new.organization_id := public.restaurant_organization_id(new.restaurant_id);
  end if;

  if new.branch_id is null then
    new.branch_id := public.restaurant_primary_branch_id(new.restaurant_id);
  end if;

  return new;
end;
$$;

create or replace function public.add_branch_scope_to_table(input_table_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  execute format(
    'alter table public.%I add column if not exists organization_id uuid references public.organizations(id) on delete restrict',
    input_table_name
  );

  execute format(
    'alter table public.%I add column if not exists branch_id uuid references public.branches(id) on delete restrict',
    input_table_name
  );

  execute format(
    'update public.%I set organization_id = public.restaurant_organization_id(restaurant_id) where organization_id is null',
    input_table_name
  );

  execute format(
    'update public.%I set branch_id = public.restaurant_primary_branch_id(restaurant_id) where branch_id is null',
    input_table_name
  );

  execute format(
    'alter table public.%I alter column organization_id set not null',
    input_table_name
  );

  execute format(
    'alter table public.%I alter column branch_id set not null',
    input_table_name
  );

  execute format(
    'drop trigger if exists set_%s_branch_scope on public.%I',
    input_table_name,
    input_table_name
  );

  execute format(
    'create trigger set_%s_branch_scope before insert or update of restaurant_id, organization_id, branch_id on public.%I for each row execute function public.set_branch_scope_from_restaurant()',
    input_table_name,
    input_table_name
  );
end;
$$;

select public.add_branch_scope_to_table('restaurant_members');
select public.add_branch_scope_to_table('restaurant_branding');
select public.add_branch_scope_to_table('staff_members');
select public.add_branch_scope_to_table('customers');
select public.add_branch_scope_to_table('campaigns');
select public.add_branch_scope_to_table('coupons');
select public.add_branch_scope_to_table('coupon_redemptions');
select public.add_branch_scope_to_table('loyalty_settings');
select public.add_branch_scope_to_table('loyalty_rules');
select public.add_branch_scope_to_table('points_transactions');
select public.add_branch_scope_to_table('stamp_transactions');
select public.add_branch_scope_to_table('rewards');
select public.add_branch_scope_to_table('customer_rewards');
select public.add_branch_scope_to_table('referrals');
select public.add_branch_scope_to_table('audit_log');
select public.add_branch_scope_to_table('campaign_events');
select public.add_branch_scope_to_table('campaign_customer_offers');
select public.add_branch_scope_to_table('staff_sessions');
select public.add_branch_scope_to_table('customer_qr_tokens');
select public.add_branch_scope_to_table('customer_bonus_boosts');
select public.add_branch_scope_to_table('customer_devices');

create index if not exists restaurants_organization_idx
on public.restaurants (organization_id);

create index if not exists branches_organization_status_idx
on public.branches (organization_id, status);

create index if not exists branch_subscriptions_branch_status_idx
on public.branch_subscriptions (branch_id, status);

create index if not exists customers_branch_idx
on public.customers (branch_id, customer_code);

create index if not exists points_transactions_branch_created_idx
on public.points_transactions (branch_id, created_at desc);

create index if not exists rewards_branch_active_idx
on public.rewards (branch_id, active);

create index if not exists campaigns_branch_status_idx
on public.campaigns (branch_id, status);

drop policy if exists "organizations member select" on public.organizations;
drop policy if exists "organizations owner insert" on public.organizations;
drop policy if exists "organizations admin update" on public.organizations;
drop policy if exists "branches member select" on public.branches;
drop policy if exists "branches admin write" on public.branches;
drop policy if exists "branch subscriptions member select" on public.branch_subscriptions;
drop policy if exists "branch subscriptions admin write" on public.branch_subscriptions;

create policy "organizations member select"
on public.organizations for select
using (
  owner_id = auth.uid()
  or exists (
    select 1
    from public.restaurants r
    join public.restaurant_members rm on rm.restaurant_id = r.id
    where r.organization_id = organizations.id
      and rm.user_id = auth.uid()
  )
);

create policy "organizations owner insert"
on public.organizations for insert
with check (owner_id = auth.uid());

create policy "organizations admin update"
on public.organizations for update
using (
  owner_id = auth.uid()
  or exists (
    select 1
    from public.restaurants r
    join public.restaurant_members rm on rm.restaurant_id = r.id
    where r.organization_id = organizations.id
      and rm.user_id = auth.uid()
      and rm.role in ('owner', 'admin', 'manager')
  )
)
with check (
  owner_id = auth.uid()
  or exists (
    select 1
    from public.restaurants r
    join public.restaurant_members rm on rm.restaurant_id = r.id
    where r.organization_id = organizations.id
      and rm.user_id = auth.uid()
      and rm.role in ('owner', 'admin', 'manager')
  )
);

create policy "branches member select"
on public.branches for select
using (public.is_restaurant_member(restaurant_id));

create policy "branches admin write"
on public.branches for all
using (public.is_restaurant_admin(restaurant_id))
with check (public.is_restaurant_admin(restaurant_id));

create policy "branch subscriptions member select"
on public.branch_subscriptions for select
using (
  exists (
    select 1
    from public.branches b
    where b.id = branch_subscriptions.branch_id
      and public.is_restaurant_member(b.restaurant_id)
  )
);

create policy "branch subscriptions admin write"
on public.branch_subscriptions for all
using (
  exists (
    select 1
    from public.branches b
    where b.id = branch_subscriptions.branch_id
      and public.is_restaurant_admin(b.restaurant_id)
  )
)
with check (
  exists (
    select 1
    from public.branches b
    where b.id = branch_subscriptions.branch_id
      and public.is_restaurant_admin(b.restaurant_id)
  )
);

create or replace function public.handle_new_restaurant_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  branch_id_value uuid;
begin
  branch_id_value := public.ensure_restaurant_branch(new.id);

  insert into public.restaurant_members (restaurant_id, organization_id, branch_id, user_id, role)
  values (new.id, new.organization_id, branch_id_value, new.owner_id, 'owner')
  on conflict (restaurant_id, user_id) do nothing;

  insert into public.restaurant_branding (restaurant_id, organization_id, branch_id)
  values (new.id, new.organization_id, branch_id_value)
  on conflict (restaurant_id) do nothing;

  insert into public.loyalty_settings (restaurant_id, organization_id, branch_id, loyalty_mode)
  values (new.id, new.organization_id, branch_id_value, 'menu_points')
  on conflict (restaurant_id) do nothing;

  return new;
end;
$$;

revoke execute on function public.ensure_restaurant_branch(uuid)
from public, anon, authenticated;

revoke execute on function public.restaurant_organization_id(uuid)
from public, anon, authenticated;

revoke execute on function public.restaurant_primary_branch_id(uuid)
from public, anon, authenticated;

revoke execute on function public.set_branch_scope_from_restaurant()
from public, anon, authenticated;

revoke execute on function public.add_branch_scope_to_table(text)
from public, anon, authenticated;

revoke execute on function public.set_restaurant_organization_before_insert()
from public, anon, authenticated;
