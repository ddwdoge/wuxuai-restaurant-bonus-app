do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'platform_admins_role_check'
      and conrelid = 'public.platform_admins'::regclass
  ) then
    alter table public.platform_admins
    drop constraint platform_admins_role_check;
  end if;

  alter table public.platform_admins
  add constraint platform_admins_role_check
  check (role in (
    'platform_owner',
    'platform_admin',
    'app_admin',
    'super_admin',
    'wuxuai_admin',
    'support',
    'billing_admin',
    'security_admin',
    'viewer'
  ));
end $$;

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

  if metadata_role in (
    'platform_owner',
    'platform_admin',
    'app_admin',
    'super_admin',
    'wuxuai_admin',
    'support',
    'billing_admin',
    'security_admin',
    'viewer'
  ) then
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
  select public.current_platform_role() in (
    'platform_owner',
    'platform_admin',
    'app_admin',
    'super_admin',
    'wuxuai_admin',
    'support',
    'billing_admin',
    'security_admin',
    'viewer'
  );
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

create or replace function public.get_platform_restaurant_detail(input_restaurant_id uuid)
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

  if input_restaurant_id is null then
    raise exception 'Restaurant wurde nicht gefunden.';
  end if;

  with restaurant_base as (
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
      r.owner_phone,
      r.restaurant_type,
      r.language,
      u.email as owner_email,
      p.full_name as owner_name,
      bs.id as subscription_id,
      bs.id is not null as subscription_exists,
      bs.subscription_status as subscription_status,
      bs.payment_status as payment_status,
      bs.trial_started_at,
      bs.trial_ends_at,
      coalesce(bs.current_period_end, bs.current_period_ends_at) as current_period_end,
      bs.paused_at,
      bs.locked_at,
      bs.lock_reason,
      case
        when bs.id is null or bs.trial_ends_at is null then null
        else greatest(ceil(extract(epoch from (bs.trial_ends_at - now())) / 86400.0)::integer, 0)
      end as trial_days_left
    from public.restaurants r
    left join auth.users u on u.id = r.owner_id
    left join public.profiles p on p.id = r.owner_id
    left join lateral (
      select b.id
      from public.branches b
      where b.restaurant_id = r.id
      order by (b.id = r.primary_branch_id) desc, b.created_at asc
      limit 1
    ) branch_choice on true
    left join public.branch_subscriptions bs on bs.branch_id = branch_choice.id
    where r.id = input_restaurant_id
  ),
  branding as (
    select jsonb_build_object(
      'logo_url', rb.logo_url,
      'primary_color', rb.primary_color,
      'secondary_color', rb.secondary_color,
      'button_color', rb.button_color
    ) as data
    from public.restaurant_branding rb
    where rb.restaurant_id = input_restaurant_id
    limit 1
  ),
  metrics as (
    select jsonb_build_object(
      'customer_count', (
        select count(*)::integer
        from public.customers c
        where c.restaurant_id = input_restaurant_id
      ),
      'points_transactions_count', (
        select count(*)::integer
        from public.points_transactions pt
        where pt.restaurant_id = input_restaurant_id
      ),
      'points_today', (
        select coalesce(sum(pt.points), 0)::integer
        from public.points_transactions pt
        where pt.restaurant_id = input_restaurant_id
          and pt.type = 'earn'
          and pt.created_at >= today_start
          and pt.created_at < today_end
      ),
      'points_total', (
        select coalesce(sum(pt.points), 0)::integer
        from public.points_transactions pt
        where pt.restaurant_id = input_restaurant_id
          and pt.type = 'earn'
      ),
      'redemptions_today', (
        select count(*)::integer
        from public.reward_redemption_events re
        where re.restaurant_id = input_restaurant_id
          and re.redeemed_at >= today_start
          and re.redeemed_at < today_end
      ) + (
        select count(*)::integer
        from public.coupon_redemptions cr
        where cr.restaurant_id = input_restaurant_id
          and cr.redeemed_at >= today_start
          and cr.redeemed_at < today_end
      ),
      'redemptions_total', (
        select count(*)::integer
        from public.reward_redemption_events re
        where re.restaurant_id = input_restaurant_id
      ) + (
        select count(*)::integer
        from public.coupon_redemptions cr
        where cr.restaurant_id = input_restaurant_id
      ),
      'welcome_gifts_total', (
        select count(*)::integer
        from public.rewards rw
        where rw.restaurant_id = input_restaurant_id
          and coalesce(rw.is_starter_reward, false)
      ),
      'welcome_gifts_active', (
        select count(*)::integer
        from public.rewards rw
        where rw.restaurant_id = input_restaurant_id
          and coalesce(rw.is_starter_reward, false)
          and rw.active
      ),
      'bonus_boosts_active', (
        select count(*)::integer
        from public.customer_bonus_boosts cb
        where cb.restaurant_id = input_restaurant_id
          and cb.status = 'active'
          and cb.active_until > now()
      )
    ) as data
  ),
  audit_entries as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'created_at', a.created_at,
          'action', a.action,
          'actor_type', a.actor_type,
          'actor_id', a.actor_id,
          'target_table', a.target_table,
          'target_id', a.target_id
        )
        order by a.created_at desc
      ),
      '[]'::jsonb
    ) as data
    from (
      select *
      from public.audit_log
      where restaurant_id = input_restaurant_id
      order by created_at desc
      limit 8
    ) a
  )
  select jsonb_build_object(
    'restaurant', to_jsonb(restaurant_base),
    'branding', (select data from branding),
    'metrics', (select data from metrics),
    'audit', (select data from audit_entries)
  )
  into result
  from restaurant_base;

  if result is null then
    raise exception 'Restaurant wurde nicht gefunden.';
  end if;

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
  previous_subscription jsonb := null;
  next_trial_ends_at timestamptz;
begin
  if platform_role_value not in (
    'platform_owner',
    'platform_admin',
    'app_admin',
    'super_admin',
    'wuxuai_admin',
    'billing_admin'
  ) then
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

  select *
  into subscription_record
  from public.branch_subscriptions
  where branch_id = branch_id_value
  for update;

  if subscription_record.id is not null then
    previous_subscription := to_jsonb(subscription_record);
  end if;

  if subscription_record.id is null then
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
    returning * into subscription_record;
  end if;

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
      trial_ends_at = case
        when input_trial_extension_days is not null and input_trial_extension_days > 0 then next_trial_ends_at
        else trial_ends_at
      end,
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
      'actor_user_id', actor_id_value,
      'previous_subscription', previous_subscription,
      'next_subscription', to_jsonb(subscription_record),
      'requested_subscription_status', input_subscription_status,
      'requested_payment_status', input_payment_status,
      'requested_restaurant_status', input_restaurant_status,
      'trial_extension_days', input_trial_extension_days,
      'restaurant_status', restaurant_record.status,
      'reason', nullif(trim(coalesce(input_reason, '')), '')
    )
  );

  return jsonb_build_object(
    'restaurant_id', restaurant_record.id,
    'restaurant_status', restaurant_record.status,
    'subscription_status', subscription_record.subscription_status,
    'payment_status', subscription_record.payment_status,
    'trial_ends_at', subscription_record.trial_ends_at,
    'current_period_end', coalesce(subscription_record.current_period_end, subscription_record.current_period_ends_at)
  );
end;
$$;

revoke execute on function public.current_platform_role() from public, anon;
revoke execute on function public.is_platform_admin() from public, anon;
revoke execute on function public.get_current_platform_role() from public, anon;
revoke execute on function public.get_platform_restaurant_detail(uuid) from public, anon;
revoke execute on function public.update_platform_restaurant_subscription(uuid, text, text, text, integer, text) from public, anon;

grant execute on function public.get_current_platform_role() to authenticated;
grant execute on function public.get_platform_restaurant_detail(uuid) to authenticated;
grant execute on function public.update_platform_restaurant_subscription(uuid, text, text, text, integer, text) to authenticated;

notify pgrst, 'reload schema';
