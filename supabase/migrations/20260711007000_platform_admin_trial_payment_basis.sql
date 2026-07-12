create table if not exists public.platform_admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role text not null check (role in ('platform_owner', 'platform_admin', 'support', 'billing_admin', 'security_admin', 'viewer')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

drop policy if exists platform_admins_own_select on public.platform_admins;
create policy platform_admins_own_select
on public.platform_admins for select
using (user_id = auth.uid());

alter table public.branch_subscriptions
add column if not exists payment_status text not null default 'not_required',
add column if not exists stripe_customer_id text,
add column if not exists stripe_subscription_id text,
add column if not exists current_period_end timestamptz,
add column if not exists paused_at timestamptz,
add column if not exists locked_at timestamptz,
add column if not exists lock_reason text;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'branch_subscriptions_status_check'
      and conrelid = 'public.branch_subscriptions'::regclass
  ) then
    alter table public.branch_subscriptions
    drop constraint branch_subscriptions_status_check;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conname = 'branch_subscriptions_subscription_status_check'
      and conrelid = 'public.branch_subscriptions'::regclass
  ) then
    alter table public.branch_subscriptions
    drop constraint branch_subscriptions_subscription_status_check;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'branch_subscriptions_status_check'
      and conrelid = 'public.branch_subscriptions'::regclass
  ) then
    alter table public.branch_subscriptions
    add constraint branch_subscriptions_status_check
    check (status in ('trialing', 'active', 'past_due', 'unpaid', 'cancelled', 'paused'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'branch_subscriptions_subscription_status_check'
      and conrelid = 'public.branch_subscriptions'::regclass
  ) then
    alter table public.branch_subscriptions
    add constraint branch_subscriptions_subscription_status_check
    check (subscription_status in ('trialing', 'active', 'past_due', 'unpaid', 'cancelled', 'paused'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'branch_subscriptions_payment_status_check'
      and conrelid = 'public.branch_subscriptions'::regclass
  ) then
    alter table public.branch_subscriptions
    add constraint branch_subscriptions_payment_status_check
    check (payment_status in ('not_required', 'pending', 'paid', 'failed', 'manual'));
  end if;
end $$;

update public.branch_subscriptions
set payment_status = case
  when coalesce(subscription_status, status) = 'active' then 'paid'
  when coalesce(subscription_status, status) in ('past_due', 'unpaid') then 'failed'
  else coalesce(nullif(payment_status, ''), 'not_required')
end,
current_period_end = coalesce(current_period_end, current_period_ends_at)
where payment_status is null
   or current_period_end is null;

create or replace function public.current_platform_role()
returns text
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  metadata_role text := coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '');
  table_role text;
begin
  if auth.uid() is null then
    return null;
  end if;

  if metadata_role in ('platform_owner', 'platform_admin', 'support', 'billing_admin', 'security_admin', 'viewer') then
    return metadata_role;
  end if;

  select role
  into table_role
  from public.platform_admins
  where user_id = auth.uid()
    and active = true
  limit 1;

  return table_role;
end;
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_platform_role() in ('platform_owner', 'platform_admin', 'support', 'billing_admin', 'security_admin', 'viewer');
$$;

create or replace function public.get_current_platform_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select public.current_platform_role();
$$;

create or replace function public.get_platform_restaurants()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  result jsonb;
  today_start timestamptz := (timezone('Europe/Vienna', now())::date::timestamp at time zone 'Europe/Vienna');
  today_end timestamptz := (((timezone('Europe/Vienna', now())::date + 1)::timestamp) at time zone 'Europe/Vienna');
begin
  if not public.is_platform_admin() then
    raise exception 'Nicht berechtigt.';
  end if;

  with restaurant_rows as (
    select
      r.id,
      r.name,
      r.slug,
      r.status,
      r.onboarding_status,
      r.created_at,
      r.owner_id,
      r.organization_id,
      r.primary_branch_id as branch_id,
      u.email as owner_email,
      p.full_name as owner_name,
      bs.id as subscription_id,
      coalesce(bs.subscription_status, bs.status, 'trialing') as subscription_status,
      coalesce(bs.payment_status, 'not_required') as payment_status,
      bs.trial_started_at,
      bs.trial_ends_at,
      coalesce(bs.current_period_end, bs.current_period_ends_at) as current_period_end,
      bs.paused_at,
      bs.locked_at,
      bs.lock_reason,
      greatest(ceil(extract(epoch from (bs.trial_ends_at - now())) / 86400.0)::integer, 0) as trial_days_left,
      coalesce(customer_counts.customer_count, 0) as customer_count,
      coalesce(points_today.points_today, 0) as points_today,
      coalesce(points_total.points_total, 0) as points_total,
      coalesce(redemptions.redemptions_count, 0) as redemptions_count,
      last_activity.last_activity_at
    from public.restaurants r
    left join auth.users u on u.id = r.owner_id
    left join public.profiles p on p.id = r.owner_id
    left join public.branches b on b.restaurant_id = r.id
    left join public.branch_subscriptions bs on bs.branch_id = coalesce(r.primary_branch_id, b.id)
    left join lateral (
      select count(*)::integer as customer_count
      from public.customers c
      where c.restaurant_id = r.id
    ) customer_counts on true
    left join lateral (
      select coalesce(sum(pt.points), 0)::integer as points_today
      from public.points_transactions pt
      where pt.restaurant_id = r.id
        and pt.type = 'earn'
        and pt.created_at >= today_start
        and pt.created_at < today_end
    ) points_today on true
    left join lateral (
      select coalesce(sum(pt.points), 0)::integer as points_total
      from public.points_transactions pt
      where pt.restaurant_id = r.id
        and pt.type = 'earn'
    ) points_total on true
    left join lateral (
      select (
        select count(*)::integer
        from public.reward_redemption_events re
        where re.restaurant_id = r.id
      ) + (
        select count(*)::integer
        from public.coupon_redemptions cr
        where cr.restaurant_id = r.id
      ) as redemptions_count
    ) redemptions on true
    left join lateral (
      select max(a.created_at) as last_activity_at
      from public.audit_log a
      where a.restaurant_id = r.id
    ) last_activity on true
  ),
  summary as (
    select jsonb_build_object(
      'restaurants_total', count(*),
      'active_trials', count(*) filter (where subscription_status = 'trialing' and (trial_ends_at is null or trial_ends_at >= now())),
      'expired_trials', count(*) filter (where subscription_status = 'trialing' and trial_ends_at < now()),
      'active_subscriptions', count(*) filter (where subscription_status = 'active'),
      'open_payments', count(*) filter (where payment_status in ('pending', 'failed') or subscription_status in ('past_due', 'unpaid')),
      'points_today', coalesce(sum(points_today), 0),
      'redemptions_today', (
        select count(*)::integer
        from public.reward_redemption_events re
        where re.redeemed_at >= today_start
          and re.redeemed_at < today_end
      ) + (
        select count(*)::integer
        from public.coupon_redemptions cr
        where cr.redeemed_at >= today_start
          and cr.redeemed_at < today_end
      )
    ) as data
    from restaurant_rows
  )
  select jsonb_build_object(
    'summary', coalesce((select data from summary), '{}'::jsonb),
    'restaurants', coalesce(
      (
        select jsonb_agg(to_jsonb(restaurant_rows) order by created_at desc)
        from restaurant_rows
      ),
      '[]'::jsonb
    )
  )
  into result;

  return result;
end;
$$;

create or replace function public.update_platform_restaurant_subscription(
  input_restaurant_id uuid,
  input_subscription_status text default null,
  input_payment_status text default null,
  input_restaurant_status text default null,
  input_trial_extension_days integer default null,
  input_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id_value uuid := auth.uid();
  platform_role_value text := public.current_platform_role();
  restaurant_record public.restaurants%rowtype;
  branch_id_value uuid;
  subscription_record public.branch_subscriptions%rowtype;
  previous_subscription jsonb;
  next_trial_ends_at timestamptz;
begin
  if platform_role_value not in ('platform_owner', 'platform_admin', 'billing_admin') then
    raise exception 'Nicht berechtigt.';
  end if;

  if input_subscription_status is not null
    and input_subscription_status not in ('trialing', 'active', 'past_due', 'unpaid', 'cancelled', 'paused') then
    raise exception 'Abo-Status ist ungültig.';
  end if;

  if input_payment_status is not null
    and input_payment_status not in ('not_required', 'pending', 'paid', 'failed', 'manual') then
    raise exception 'Zahlungsstatus ist ungültig.';
  end if;

  if input_restaurant_status is not null
    and input_restaurant_status not in ('active', 'draft', 'suspended') then
    raise exception 'Restaurantstatus ist ungültig.';
  end if;

  select *
  into restaurant_record
  from public.restaurants
  where id = input_restaurant_id
  for update;

  if restaurant_record.id is null then
    raise exception 'Restaurant wurde nicht gefunden.';
  end if;

  branch_id_value := coalesce(restaurant_record.primary_branch_id, public.ensure_restaurant_branch(restaurant_record.id));

  select *
  into restaurant_record
  from public.restaurants
  where id = input_restaurant_id;

  insert into public.branch_subscriptions (
    organization_id,
    branch_id,
    status,
    plan_key,
    subscription_status,
    trial_started_at,
    trial_ends_at,
    current_period_ends_at,
    current_period_end,
    payment_status
  )
  values (
    restaurant_record.organization_id,
    branch_id_value,
    'trialing',
    'pilot',
    'trialing',
    now(),
    now() + interval '30 days',
    now() + interval '30 days',
    now() + interval '30 days',
    'not_required'
  )
  on conflict (branch_id) do update
  set organization_id = excluded.organization_id
  returning * into subscription_record;

  previous_subscription := to_jsonb(subscription_record);

  if input_trial_extension_days is not null and input_trial_extension_days > 0 then
    next_trial_ends_at := greatest(coalesce(subscription_record.trial_ends_at, now()), now())
      + make_interval(days => input_trial_extension_days);
  else
    next_trial_ends_at := subscription_record.trial_ends_at;
  end if;

  update public.branch_subscriptions
  set subscription_status = coalesce(input_subscription_status, subscription_status),
      status = coalesce(input_subscription_status, status),
      payment_status = coalesce(input_payment_status, payment_status),
      trial_ends_at = next_trial_ends_at,
      current_period_ends_at = coalesce(next_trial_ends_at, current_period_ends_at),
      current_period_end = coalesce(next_trial_ends_at, current_period_end, current_period_ends_at),
      paused_at = case
        when coalesce(input_subscription_status, subscription_status) = 'paused' then coalesce(paused_at, now())
        when input_subscription_status is not null and input_subscription_status <> 'paused' then null
        else paused_at
      end,
      locked_at = case
        when coalesce(input_subscription_status, subscription_status) in ('unpaid', 'paused', 'cancelled') then coalesce(locked_at, now())
        when input_subscription_status is not null and input_subscription_status in ('trialing', 'active', 'past_due') then null
        else locked_at
      end,
      lock_reason = case
        when coalesce(input_subscription_status, subscription_status) in ('unpaid', 'paused', 'cancelled') then nullif(trim(coalesce(input_reason, '')), '')
        when input_subscription_status is not null and input_subscription_status in ('trialing', 'active', 'past_due') then null
        else lock_reason
      end
  where id = subscription_record.id
  returning * into subscription_record;

  if input_restaurant_status is not null then
    update public.restaurants
    set status = input_restaurant_status
    where id = restaurant_record.id
    returning * into restaurant_record;
  end if;

  insert into public.audit_log (
    restaurant_id,
    organization_id,
    branch_id,
    actor_type,
    actor_id,
    action,
    target_table,
    target_id,
    metadata
  )
  values (
    restaurant_record.id,
    restaurant_record.organization_id,
    branch_id_value,
    'admin',
    actor_id_value,
    'platform_subscription_updated',
    'branch_subscriptions',
    subscription_record.id,
    jsonb_build_object(
      'platform_role', platform_role_value,
      'previous_subscription', previous_subscription,
      'next_subscription', to_jsonb(subscription_record),
      'restaurant_status', restaurant_record.status,
      'reason', nullif(trim(coalesce(input_reason, '')), '')
    )
  );

  return jsonb_build_object(
    'restaurant_id', restaurant_record.id,
    'restaurant_status', restaurant_record.status,
    'subscription_status', subscription_record.subscription_status,
    'payment_status', subscription_record.payment_status,
    'trial_ends_at', subscription_record.trial_ends_at
  );
end;
$$;

revoke execute on function public.get_current_platform_role() from public, anon;
revoke execute on function public.get_platform_restaurants() from public, anon;
revoke execute on function public.update_platform_restaurant_subscription(uuid, text, text, text, integer, text) from public, anon;

grant execute on function public.get_current_platform_role() to authenticated;
grant execute on function public.get_platform_restaurants() to authenticated;
grant execute on function public.update_platform_restaurant_subscription(uuid, text, text, text, integer, text) to authenticated;

notify pgrst, 'reload schema';
