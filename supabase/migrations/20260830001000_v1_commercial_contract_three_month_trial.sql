-- WUXUAI Bonus V1 commercial contract: new owner trials run for three calendar months.
-- Existing subscriptions and their recorded trial end dates remain unchanged.

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
  trial_started_at_value timestamptz := now();
  trial_ends_at_value timestamptz := now() + interval '3 months';
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

  insert into public.profiles (id, full_name)
  values (user_id_value, cleaned_owner_name)
  on conflict (id) do update
  set full_name = excluded.full_name;

  select *
  into restaurant_record
  from public.restaurants
  where owner_id = user_id_value
  order by created_at asc
  limit 1;

  if restaurant_record.id is null then
    slug_base := lower(regexp_replace(cleaned_restaurant_name, '[^a-zA-Z0-9]+', '-', 'g'));
    slug_base := regexp_replace(slug_base, '(^-|-$)', '', 'g');

    if slug_base = '' then
      slug_base := 'restaurant';
    end if;

    slug_value := slug_base;

    while exists (select 1 from public.restaurants where slug = slug_value) loop
      slug_value := slug_base || '-' || substr(replace(extensions.gen_random_uuid()::text, '-', ''), 1, 6);
    end loop;

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
  else
    update public.restaurants
    set name = coalesce(nullif(name, ''), cleaned_restaurant_name),
        owner_phone = coalesce(owner_phone, cleaned_phone),
        status = case when status = 'suspended' then status else 'active' end
    where id = restaurant_record.id
    returning * into restaurant_record;
  end if;

  branch_id_value := coalesce(restaurant_record.primary_branch_id, public.ensure_restaurant_branch(restaurant_record.id));

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
  set organization_id = excluded.organization_id,
      branch_id = excluded.branch_id,
      role = 'owner';

  insert into public.branch_subscriptions (
    organization_id,
    branch_id,
    status,
    plan_key,
    subscription_status,
    trial_started_at,
    trial_ends_at,
    current_period_ends_at
  )
  values (
    restaurant_record.organization_id,
    branch_id_value,
    'trialing',
    'pilot',
    'trialing',
    trial_started_at_value,
    trial_ends_at_value,
    trial_ends_at_value
  )
  on conflict (branch_id) do update
  set organization_id = excluded.organization_id,
      status = coalesce(branch_subscriptions.status, excluded.status),
      subscription_status = coalesce(branch_subscriptions.subscription_status, excluded.subscription_status),
      trial_started_at = coalesce(branch_subscriptions.trial_started_at, excluded.trial_started_at),
      trial_ends_at = coalesce(branch_subscriptions.trial_ends_at, excluded.trial_ends_at),
      current_period_ends_at = coalesce(branch_subscriptions.current_period_ends_at, excluded.current_period_ends_at)
  returning * into subscription_record;

  if subscription_record.id is null then
    raise exception 'branch subscription could not be created';
  end if;

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
      'subscription_status', subscription_record.subscription_status,
      'idempotent', true
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
