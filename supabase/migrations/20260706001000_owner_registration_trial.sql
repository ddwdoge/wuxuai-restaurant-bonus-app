alter table public.restaurants
add column if not exists owner_phone text;

alter table public.branch_subscriptions
add column if not exists trial_started_at timestamptz,
add column if not exists trial_ends_at timestamptz,
add column if not exists subscription_status text not null default 'trialing';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'branch_subscriptions_subscription_status_check'
      and conrelid = 'public.branch_subscriptions'::regclass
  ) then
    alter table public.branch_subscriptions
    add constraint branch_subscriptions_subscription_status_check
    check (subscription_status in ('trialing', 'active', 'past_due', 'cancelled', 'paused'));
  end if;
end;
$$;

update public.branch_subscriptions
set subscription_status = status
where subscription_status is distinct from status;

update public.branch_subscriptions
set trial_started_at = coalesce(trial_started_at, created_at),
    trial_ends_at = coalesce(trial_ends_at, current_period_ends_at, created_at + interval '30 days'),
    current_period_ends_at = coalesce(current_period_ends_at, trial_ends_at, created_at + interval '30 days')
where status = 'trialing';

create or replace function public.start_restaurant_owner_trial(
  input_owner_name text,
  input_restaurant_name text,
  input_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  user_id_value uuid := auth.uid();
  cleaned_owner_name text := nullif(trim(input_owner_name), '');
  cleaned_restaurant_name text := nullif(trim(input_restaurant_name), '');
  cleaned_phone text := nullif(trim(input_phone), '');
  slug_base text;
  slug_value text;
  restaurant_record public.restaurants%rowtype;
  branch_id_value uuid;
  subscription_record public.branch_subscriptions%rowtype;
begin
  if user_id_value is null then
    raise exception 'not authenticated';
  end if;

  if cleaned_owner_name is null then
    raise exception 'owner name required';
  end if;

  if cleaned_restaurant_name is null then
    raise exception 'restaurant name required';
  end if;

  slug_base := lower(regexp_replace(cleaned_restaurant_name, '[^a-zA-Z0-9]+', '-', 'g'));
  slug_base := regexp_replace(slug_base, '(^-|-$)', '', 'g');

  if slug_base = '' then
    slug_base := 'restaurant';
  end if;

  slug_value := slug_base;

  while exists (select 1 from public.restaurants where slug = slug_value) loop
    slug_value := slug_base || '-' || substr(replace(extensions.gen_random_uuid()::text, '-', ''), 1, 6);
  end loop;

  insert into public.profiles (id, full_name)
  values (user_id_value, cleaned_owner_name)
  on conflict (id) do update
  set full_name = excluded.full_name;

  insert into public.restaurants (
    owner_id,
    name,
    slug,
    status,
    restaurant_type,
    language,
    owner_phone,
    onboarding_status,
    onboarding_checklist
  )
  values (
    user_id_value,
    cleaned_restaurant_name,
    slug_value,
    'active',
    'restaurant',
    'de',
    cleaned_phone,
    'draft',
    '{}'::jsonb
  )
  returning * into restaurant_record;

  branch_id_value := public.ensure_restaurant_branch(restaurant_record.id);

  insert into public.restaurant_members (
    restaurant_id,
    organization_id,
    branch_id,
    user_id,
    role
  )
  values (
    restaurant_record.id,
    restaurant_record.organization_id,
    branch_id_value,
    user_id_value,
    'owner'
  )
  on conflict (restaurant_id, user_id) do update
  set role = 'owner';

  update public.branch_subscriptions
  set status = 'trialing',
      subscription_status = 'trialing',
      trial_started_at = coalesce(trial_started_at, now()),
      trial_ends_at = coalesce(trial_ends_at, now() + interval '30 days'),
      current_period_ends_at = coalesce(current_period_ends_at, now() + interval '30 days')
  where branch_id = branch_id_value
  returning * into subscription_record;

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
    'admin',
    user_id_value,
    'owner_trial_started',
    'restaurants',
    restaurant_record.id,
    jsonb_build_object(
      'owner_name', cleaned_owner_name,
      'trial_started_at', subscription_record.trial_started_at,
      'trial_ends_at', subscription_record.trial_ends_at,
      'subscription_status', subscription_record.subscription_status
    )
  );

  return jsonb_build_object(
    'restaurant', jsonb_build_object(
      'id', restaurant_record.id,
      'name', restaurant_record.name,
      'slug', restaurant_record.slug,
      'organization_id', restaurant_record.organization_id,
      'branch_id', branch_id_value
    ),
    'subscription', jsonb_build_object(
      'status', subscription_record.subscription_status,
      'trial_started_at', subscription_record.trial_started_at,
      'trial_ends_at', subscription_record.trial_ends_at
    )
  );
end;
$$;

revoke execute on function public.start_restaurant_owner_trial(text, text, text)
from public, anon;

grant execute on function public.start_restaurant_owner_trial(text, text, text)
to authenticated;
