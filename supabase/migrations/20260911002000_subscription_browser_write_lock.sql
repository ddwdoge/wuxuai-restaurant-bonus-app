-- Subscription state is server-owned. No existing subscription is rewritten.
begin;

alter table public.branch_subscriptions enable row level security;
revoke insert, update, delete, truncate, references, trigger
  on public.branch_subscriptions from public, anon, authenticated;

-- Table-level REVOKE does not remove independently granted column privileges.
do $$
declare column_names text;
begin
  select string_agg(quote_ident(attname), ', ' order by attnum)
  into column_names
  from pg_attribute
  where attrelid = 'public.branch_subscriptions'::regclass
    and attnum > 0 and not attisdropped;
  execute 'revoke insert (' || column_names || '), update (' || column_names
    || '), references (' || column_names
    || ') on public.branch_subscriptions from public, anon, authenticated';
end;
$$;

drop policy if exists "branch subscriptions admin write" on public.branch_subscriptions;
-- Preserve the existing member SELECT policy; service-role/backend writes remain.

-- Parent deletion cascades must not become a browser subscription-reset path.
-- Identity changes could otherwise redirect the effective subscription lookup.
create or replace function public.guard_subscription_parent_browser_write()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'DELETE' then
      raise exception 'SUBSCRIPTION_PARENT_SERVER_ONLY' using errcode = '42501';
    end if;
    if (to_jsonb(new) -> 'id') is distinct from (to_jsonb(old) -> 'id')
      or (to_jsonb(new) -> 'owner_id') is distinct from (to_jsonb(old) -> 'owner_id')
      or (to_jsonb(new) -> 'restaurant_id') is distinct from (to_jsonb(old) -> 'restaurant_id')
      or (to_jsonb(new) -> 'organization_id') is distinct from (to_jsonb(old) -> 'organization_id')
      or (to_jsonb(new) -> 'primary_branch_id') is distinct from (to_jsonb(old) -> 'primary_branch_id') then
      raise exception 'SUBSCRIPTION_PARENT_SERVER_ONLY' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.guard_subscription_parent_browser_write() from public, anon, authenticated;
create trigger subscription_parent_browser_guard
  before update or delete on public.branches
  for each row execute function public.guard_subscription_parent_browser_write();
create trigger subscription_parent_browser_guard
  before update or delete on public.organizations
  for each row execute function public.guard_subscription_parent_browser_write();
create trigger subscription_parent_browser_guard
  before update or delete on public.restaurants
  for each row execute function public.guard_subscription_parent_browser_write();

create or replace function public.ensure_restaurant_branch(input_restaurant_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  restaurant_record public.restaurants%rowtype;
  organization_id_value uuid;
  branch_id_value uuid;
begin
  select * into restaurant_record from public.restaurants
  where id = input_restaurant_id for update;
  if restaurant_record.id is null then raise exception 'restaurant not found'; end if;
  organization_id_value := restaurant_record.organization_id;
  if organization_id_value is null then
    insert into public.organizations (owner_id, name, status)
    values (restaurant_record.owner_id, restaurant_record.name, restaurant_record.status)
    returning id into organization_id_value;
    update public.restaurants set organization_id = organization_id_value
    where id = restaurant_record.id;
  end if;
  select id into branch_id_value from public.branches
  where restaurant_id = restaurant_record.id limit 1;
  if branch_id_value is null then
    insert into public.branches (organization_id, restaurant_id, name, slug, status)
    values (organization_id_value, restaurant_record.id, restaurant_record.name,
      restaurant_record.slug, restaurant_record.status)
    returning id into branch_id_value;
  end if;
  if not exists (select 1 from public.branches b where b.id = branch_id_value
    and b.restaurant_id = restaurant_record.id and b.organization_id = organization_id_value) then
    raise exception 'SUBSCRIPTION_TENANT_MISMATCH' using errcode = '42501';
  end if;
  update public.restaurants set primary_branch_id = branch_id_value
  where id = restaurant_record.id and primary_branch_id is distinct from branch_id_value;
  insert into public.branch_subscriptions (
    organization_id, branch_id, status, plan_key, subscription_status,
    payment_status, trial_started_at, trial_ends_at, current_period_ends_at, current_period_end
  ) values (
    organization_id_value, branch_id_value, 'trialing', 'BASIC', 'trialing',
    'not_required', now(), now() + interval '3 months',
    now() + interval '3 months', now() + interval '3 months'
  ) on conflict (branch_id) do nothing;
  return branch_id_value;
end;
$$;
revoke all on function public.ensure_restaurant_branch(uuid) from public, anon, authenticated;
revoke all on function public.restaurant_primary_branch_id(uuid) from public, anon, authenticated;

create or replace function public.start_restaurant_owner_trial(
  input_owner_name text, input_restaurant_name text, input_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
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
  if user_id_value is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if cleaned_owner_name is null then raise exception 'owner name required'; end if;
  if cleaned_restaurant_name is null then raise exception 'restaurant name required'; end if;

  -- Serialize even the first registration before a restaurant row exists.
  perform pg_advisory_xact_lock(hashtextextended('owner_trial:' || user_id_value::text, 0));
  insert into public.profiles (id, full_name) values (user_id_value, cleaned_owner_name)
  on conflict (id) do update set full_name = excluded.full_name;

  select * into restaurant_record from public.restaurants
  where owner_id = user_id_value order by created_at asc limit 1 for update;
  if restaurant_record.id is null then
    slug_base := lower(regexp_replace(cleaned_restaurant_name, '[^a-zA-Z0-9]+', '-', 'g'));
    slug_base := regexp_replace(slug_base, '(^-|-$)', '', 'g');
    if slug_base = '' then slug_base := 'restaurant'; end if;
    slug_value := slug_base;
    while exists (select 1 from public.restaurants where slug = slug_value) loop
      slug_value := slug_base || '-' || substr(replace(extensions.gen_random_uuid()::text, '-', ''), 1, 6);
    end loop;
    insert into public.restaurants (owner_id, name, slug, status, restaurant_type,
      language, owner_phone, onboarding_status, onboarding_checklist)
    values (user_id_value, cleaned_restaurant_name, slug_value, 'active', 'restaurant',
      'de', cleaned_phone, 'draft', '{}'::jsonb)
    returning * into restaurant_record;
  else
    update public.restaurants
    set name = coalesce(nullif(name, ''), cleaned_restaurant_name),
      owner_phone = coalesce(owner_phone, cleaned_phone),
      status = case when status = 'suspended' then status else 'active' end
    where id = restaurant_record.id returning * into restaurant_record;
  end if;

  -- Resolve from the owned tenant, never from a client-selected branch.
  branch_id_value := public.ensure_restaurant_branch(restaurant_record.id);
  select * into restaurant_record from public.restaurants where id = restaurant_record.id;
  insert into public.restaurant_members (restaurant_id, organization_id, branch_id, user_id, role)
  values (restaurant_record.id, restaurant_record.organization_id, branch_id_value, user_id_value, 'owner')
  on conflict (restaurant_id, user_id) do update
  set organization_id = excluded.organization_id, branch_id = excluded.branch_id, role = 'owner';

  -- ensure_restaurant_branch only inserts. Existing paid/trial rows are untouched.
  select * into subscription_record from public.branch_subscriptions
  where branch_id = branch_id_value and organization_id = restaurant_record.organization_id;
  if subscription_record.id is null then raise exception 'branch subscription could not be created'; end if;
  insert into public.audit_log (restaurant_id, actor_type, actor_id, action, target_table, target_id, metadata)
  values (restaurant_record.id, 'admin', user_id_value, 'owner_trial_started', 'restaurants',
    restaurant_record.id, jsonb_build_object('owner_name', cleaned_owner_name,
      'trial_started_at', subscription_record.trial_started_at, 'trial_ends_at', subscription_record.trial_ends_at,
      'subscription_status', subscription_record.subscription_status, 'idempotent', true));
  return jsonb_build_object(
    'restaurant', jsonb_build_object('id', restaurant_record.id, 'name', restaurant_record.name,
      'slug', restaurant_record.slug, 'organization_id', restaurant_record.organization_id, 'branch_id', branch_id_value),
    'subscription', jsonb_build_object('status', subscription_record.subscription_status,
      'trial_started_at', subscription_record.trial_started_at, 'trial_ends_at', subscription_record.trial_ends_at));
end;
$$;
revoke all on function public.start_restaurant_owner_trial(text,text,text) from public, anon;
grant execute on function public.start_restaurant_owner_trial(text,text,text) to authenticated;

-- Close the NULL-role bypass before delegating to the existing audited writer.
create or replace function public.update_platform_restaurant_subscription(
  input_restaurant_id uuid, input_subscription_status text default null,
  input_payment_status text default null, input_restaurant_status text default null,
  input_trial_extension_days integer default null, input_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare role_value text := public.current_platform_role();
begin
  if auth.uid() is null or role_value is null or role_value not in (
    'platform_owner', 'platform_admin', 'app_admin', 'super_admin', 'wuxuai_admin', 'billing_admin'
  ) then raise exception 'Not authorized' using errcode = '42501'; end if;
  if length(trim(coalesce(input_reason, ''))) < 10 then
    raise exception 'Reason required' using errcode = '22023';
  end if;
  if input_payment_status is not null or input_restaurant_status is not null then
    raise exception 'PAYMENT_AND_TENANT_LIFECYCLE_NOT_ALLOWED' using errcode = '42501';
  end if;
  return public.update_platform_restaurant_subscription_internal_v1(
    input_restaurant_id, input_subscription_status, null, null, input_trial_extension_days, input_reason);
end;
$$;
revoke all on function public.update_platform_restaurant_subscription(uuid,text,text,text,integer,text) from public, anon;
grant execute on function public.update_platform_restaurant_subscription(uuid,text,text,text,integer,text) to authenticated;
revoke all on function public.update_platform_restaurant_subscription_internal_v1(uuid,text,text,text,integer,text)
  from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
