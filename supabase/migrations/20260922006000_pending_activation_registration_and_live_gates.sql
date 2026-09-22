-- Phase 7C.6B2: pending registration; no provider activation or legacy data rewrite.
begin;
select pg_advisory_xact_lock(hashtextextended('migration:20260922006000', 0));

alter table public.restaurants add column if not exists activation_status text;
alter table public.branch_subscriptions add column if not exists selected_plan text;
alter table public.branch_subscriptions add column if not exists current_period_start timestamptz;
alter table public.branch_subscriptions drop constraint if exists branch_subscriptions_status_check;
alter table public.branch_subscriptions add constraint branch_subscriptions_status_check
  check (status in ('trialing','active','past_due','unpaid','cancelled','paused','pending_activation'));
alter table public.branch_subscriptions drop constraint if exists branch_subscriptions_subscription_status_check;
alter table public.branch_subscriptions add constraint branch_subscriptions_subscription_status_check
  check (subscription_status in ('trialing','active','past_due','unpaid','cancelled','paused','pending_activation'));

-- Existing rows remain NULL. This marker is server-owned and cannot be removed
-- to turn a pending tenant into a legacy tenant.
alter table public.restaurants drop constraint if exists restaurants_activation_status_check;
alter table public.restaurants add constraint restaurants_activation_status_check
  check (activation_status is null or activation_status = 'pending_activation');

create table if not exists public.pending_registration_audit (
  restaurant_ref uuid primary key,
  organization_ref uuid not null,
  branch_ref uuid not null,
  actor_ref uuid not null,
  event text not null default 'OWNER_REGISTRATION_PENDING_ACTIVATION'
    check (event = 'OWNER_REGISTRATION_PENDING_ACTIVATION'),
  created_at timestamptz not null default clock_timestamp()
);
alter table public.pending_registration_audit enable row level security;
revoke all on public.pending_registration_audit from public, anon, authenticated, service_role;
-- Service-role API clients must not forge the private transaction context.
revoke all on public.country_launch_creation_context from service_role;

create or replace function public.protect_pending_registration_audit()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
  raise exception 'PENDING_REGISTRATION_AUDIT_IMMUTABLE' using errcode='42501';
end $$;
revoke all on function public.protect_pending_registration_audit() from public,anon,authenticated,service_role;
drop trigger if exists pending_registration_audit_immutable on public.pending_registration_audit;
create trigger pending_registration_audit_immutable before update or delete or truncate
on public.pending_registration_audit for each statement execute function public.protect_pending_registration_audit();

create or replace function public.resolve_branch_creation_lifecycle_internal(input_restaurant_id uuid)
returns text language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare r public.restaurants%rowtype;
begin
  select * into r from public.restaurants where id=input_restaurant_id;
  if r.id is null then raise exception 'RESTAURANT_NOT_FOUND' using errcode='P0002'; end if;
  if exists(select 1 from public.country_launch_creation_context c
    where c.transaction_id=txid_current() and c.actor_id=auth.uid()
      and c.actor_id=r.owner_id and c.purpose='REGISTRATION'
      and (c.restaurant_id is null or c.restaurant_id=r.id))
    and r.activation_status='pending_activation' then
    return 'PENDING_ACTIVATION';
  end if;
  -- Never repair a damaged pending tenant into a legacy trial.
  if r.activation_status='pending_activation' and not exists(
    select 1 from public.branch_subscriptions s join public.branches b on b.id=s.branch_id
    where b.restaurant_id=r.id and b.id=r.primary_branch_id and b.organization_id=r.organization_id
      and s.organization_id=r.organization_id and s.subscription_status='pending_activation') then
    raise exception 'PENDING_REGISTRATION_CONTEXT_REQUIRED' using errcode='42501';
  end if;
  return 'LEGACY_TRIAL';
end $$;
revoke all on function public.resolve_branch_creation_lifecycle_internal(uuid) from public,anon,authenticated,service_role;

create or replace function public.restaurant_activation_state_internal(input_restaurant_id uuid)
returns jsonb language plpgsql security definer stable set search_path=pg_catalog,pg_temp as $$
declare r public.restaurants%rowtype; b public.branches%rowtype; s public.branch_subscriptions%rowtype;
  pending boolean; bound boolean; country_allowed boolean;
begin
  select * into r from public.restaurants where id=input_restaurant_id;
  select * into b from public.branches where id=r.primary_branch_id
    and restaurant_id=r.id and organization_id=r.organization_id;
  select * into s from public.branch_subscriptions where branch_id=b.id and organization_id=r.organization_id;
  pending:=coalesce(r.activation_status='pending_activation',false)
    or coalesce(s.subscription_status='pending_activation',false);
  bound:=r.id is not null and b.id is not null and s.id is not null
    and s.subscription_status in ('trialing','active','past_due','unpaid','cancelled','paused','pending_activation');
  country_allowed:=exists(select 1 from public.country_launch_policy where country_code=b.country and enabled)
    or (not pending and exists(select 1 from public.country_launch_existing_businesses where restaurant_id=r.id));
  return jsonb_build_object(
    'restaurant_id',input_restaurant_id,'status',case when pending then 'PENDING_ACTIVATION'
      when not bound then 'UNAVAILABLE' else 'LEGACY' end,
    'selected_plan',case when pending then 'BASIC' else s.plan_key end,
    'setup_allowed',bound,'operational',coalesce(bound and not pending and country_allowed
      and r.status='active' and b.status='active',false),
    'country_released',coalesce(country_allowed,false),
    'reason_code',case when pending then 'PENDING_ACTIVATION' when not bound then 'ACTIVATION_STATE_UNAVAILABLE'
      when not country_allowed then 'COUNTRY_NOT_LAUNCHED' else null end);
end $$;
revoke all on function public.restaurant_activation_state_internal(uuid) from public,anon,authenticated,service_role;

create or replace function public.require_restaurant_operational(input_restaurant_id uuid,input_action text)
returns void language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
  if coalesce((public.restaurant_activation_state_internal(input_restaurant_id)->>'operational')::boolean,false) is not true then
    raise exception 'RESTAURANT_NOT_OPERATIONAL' using errcode='42501';
  end if;
end $$;
revoke all on function public.require_restaurant_operational(uuid,text) from public,anon,authenticated,service_role;

create or replace function public.get_restaurant_activation_state(input_restaurant_id uuid)
returns jsonb language plpgsql security definer stable set search_path=pg_catalog,pg_temp as $$
begin
  if auth.uid() is null or not (
    exists(select 1 from public.restaurants r join public.restaurant_members m on m.restaurant_id=r.id
      where r.id=input_restaurant_id and r.owner_id=auth.uid() and m.user_id=auth.uid() and m.role='owner')
    or (exists(select 1 from public.restaurants r where r.id=input_restaurant_id
          and r.activation_status is null) and public.can_manage_restaurant_staff(input_restaurant_id))
    or public.is_platform_admin()) then
    raise exception 'ACTIVATION_READ_FORBIDDEN' using errcode='42501';
  end if;
  return public.restaurant_activation_state_internal(input_restaurant_id);
end $$;
revoke all on function public.get_restaurant_activation_state(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_restaurant_activation_state(uuid) to authenticated;

create or replace function public.guard_pending_activation_transition()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare r public.restaurants%rowtype; j jsonb:=to_jsonb(new);
begin
  if tg_table_name='restaurants' then
    if tg_op='INSERT' then
      if exists(select 1 from public.country_launch_creation_context c where
        c.transaction_id=txid_current() and c.actor_id=auth.uid() and c.actor_id=new.owner_id
        and c.purpose='REGISTRATION') then
        new.activation_status:='pending_activation'; new.status:='draft';
        new.operational_ready:=false; new.security_ready:=false; new.legal_ready:=false;
      elsif new.activation_status is not null then
        raise exception 'PENDING_REGISTRATION_CONTEXT_REQUIRED' using errcode='42501';
      end if;
      return new;
    end if;
    if old.activation_status='pending_activation' then
      if tg_op='DELETE' then raise exception 'PENDING_ACTIVATION_SERVER_ONLY' using errcode='42501'; end if;
      if new.activation_status is distinct from old.activation_status or new.status<>'draft'
        or new.operational_ready or new.legal_ready or new.security_ready
        or new.onboarding_status in ('ready','completed')
        or new.id is distinct from old.id or new.owner_id is distinct from old.owner_id
        or (old.organization_id is not null and new.organization_id is distinct from old.organization_id)
        or (old.primary_branch_id is not null and new.primary_branch_id is distinct from old.primary_branch_id) then
        raise exception 'PENDING_ACTIVATION_SERVER_ONLY' using errcode='42501';
      end if;
    elsif tg_op='UPDATE' and new.activation_status is distinct from old.activation_status then
      raise exception 'ACTIVATION_STATE_SERVER_ONLY' using errcode='42501';
    end if;
  else
    if tg_op='UPDATE' and (new.branch_id is distinct from old.branch_id or new.organization_id is distinct from old.organization_id)
      and exists(select 1 from public.restaurants restaurant join public.branches b on b.restaurant_id=restaurant.id
        where b.id=old.branch_id and restaurant.activation_status='pending_activation') then
      raise exception 'PENDING_TENANT_MOVE_FORBIDDEN' using errcode='42501';
    end if;
    select restaurant.* into r from public.restaurants restaurant
    join public.branches b on b.restaurant_id=restaurant.id where b.id=coalesce(new.branch_id,old.branch_id);
    if r.activation_status='pending_activation' then
      if tg_op='DELETE' or new.status<>'pending_activation' or new.subscription_status<>'pending_activation'
        or new.plan_key<>'BASIC' or new.selected_plan is distinct from 'BASIC'
        or new.payment_status<>'not_required' or new.trial_started_at is not null
        or new.trial_ends_at is not null or new.current_period_start is not null
        or new.current_period_end is not null or new.current_period_ends_at is not null
        or new.stripe_customer_id is not null or new.stripe_subscription_id is not null then
        raise exception 'PENDING_ACTIVATION_SERVER_ONLY' using errcode='42501';
      end if;
      if tg_op='UPDATE' and (new.branch_id<>old.branch_id or new.organization_id<>old.organization_id) then
        raise exception 'PENDING_ACTIVATION_SERVER_ONLY' using errcode='42501';
      end if;
    elsif tg_op<>'DELETE' and new.subscription_status='pending_activation' then
      raise exception 'PENDING_REGISTRATION_CONTEXT_REQUIRED' using errcode='42501';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.guard_pending_activation_transition() from public,anon,authenticated,service_role;
drop trigger if exists pending_activation_transition on public.restaurants;
create trigger pending_activation_transition before insert or update or delete on public.restaurants
for each row execute function public.guard_pending_activation_transition();
drop trigger if exists pending_activation_transition on public.branch_subscriptions;
create trigger pending_activation_transition before insert or update or delete on public.branch_subscriptions
for each row execute function public.guard_pending_activation_transition();

-- Backstop for direct REST/DML and SECURITY DEFINER/service-role entry points.
-- Pending rows may only receive owner-bound, non-operational setup writes.
create or replace function public.guard_pending_activation_operational_write()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare j jsonb:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  oldj jsonb:=to_jsonb(old); tenant uuid; previous_tenant uuid; r public.restaurants%rowtype;
  setup_table boolean; safe boolean:=false;
begin
  if tg_table_name='organizations' then
    select restaurant.id into tenant from public.restaurants restaurant
      where restaurant.organization_id=(j->>'id')::uuid and restaurant.activation_status='pending_activation' limit 1;
  elsif tg_table_name='branches' then tenant:=(j->>'restaurant_id')::uuid;
  elsif j ? 'restaurant_id' then tenant:=(j->>'restaurant_id')::uuid;
  elsif j ? 'subscription_id' then
    select b.restaurant_id into tenant from public.branch_subscriptions s join public.branches b on b.id=s.branch_id
      where s.id=(j->>'subscription_id')::uuid;
  elsif j ? 'organization_id' then
    select restaurant.id into tenant from public.restaurants restaurant
      where restaurant.organization_id=(j->>'organization_id')::uuid and restaurant.activation_status='pending_activation' limit 1;
  end if;
  if tg_op='UPDATE' and oldj ? 'restaurant_id' then
    previous_tenant:=(oldj->>'restaurant_id')::uuid;
    if previous_tenant is distinct from tenant and exists(select 1 from public.restaurants
      where id in (previous_tenant,tenant) and activation_status='pending_activation') then
      raise exception 'PENDING_TENANT_MOVE_FORBIDDEN' using errcode='42501';
    end if;
  end if;
  if tg_op='UPDATE' and oldj ? 'organization_id'
    and j->>'organization_id' is distinct from oldj->>'organization_id'
    and exists(select 1 from public.restaurants where activation_status='pending_activation'
      and organization_id in ((j->>'organization_id')::uuid,(oldj->>'organization_id')::uuid)) then
    raise exception 'PENDING_TENANT_MOVE_FORBIDDEN' using errcode='42501';
  end if;
  select * into r from public.restaurants where id=tenant;
  if r.activation_status is distinct from 'pending_activation' then
    if tg_op='DELETE' then return old; end if; return new;
  end if;
  setup_table:=tg_table_name in ('restaurant_branding','restaurant_onboarding_drafts','loyalty_settings',
    'loyalty_rules','restaurant_legal_profiles','organization_legal_profiles');
  if setup_table then safe:=true;
  elsif tg_table_name='branches' then
    safe:=tg_op<>'DELETE' and j->>'status'='draft' and coalesce((j->>'is_discoverable')::boolean,false)=false;
    if tg_op='UPDATE' and (j->'id' is distinct from oldj->'id' or j->'organization_id' is distinct from oldj->'organization_id') then safe:=false; end if;
  elsif tg_table_name='organizations' then
    safe:=tg_op<>'DELETE' and j->>'status'='draft';
    if tg_op='UPDATE' and (j->'id' is distinct from oldj->'id' or j->'owner_id' is distinct from oldj->'owner_id') then safe:=false; end if;
  elsif tg_table_name='restaurant_members' then
    safe:=tg_op<>'DELETE' and j->>'role'='owner' and (j->>'user_id')::uuid=r.owner_id;
  elsif tg_table_name='rewards' then safe:=coalesce((j->>'active')::boolean,true)=false;
  elsif tg_table_name='coupons' then safe:=j->>'status'='draft';
  elsif tg_table_name='restaurant_offers' then safe:=j->>'status'='DRAFT'
    and coalesce((j->>'is_active')::boolean,false)=false and j->>'published_at' is null;
  elsif tg_table_name='legal_documents' then safe:=j->>'current_published_version_id' is null;
  elsif tg_table_name='legal_document_versions' then safe:=j->>'status'='draft';
  end if;
  if not safe or auth.uid() is distinct from r.owner_id then
    raise exception 'PENDING_ACTIVATION_OPERATION_BLOCKED' using errcode='42501';
  end if;
  if tg_op='DELETE' then return old; end if; return new;
end $$;
revoke all on function public.guard_pending_activation_operational_write() from public,anon,authenticated,service_role;

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
  pending_value boolean;
begin
  select * into restaurant_record from public.restaurants
  where id = input_restaurant_id for update;
  if restaurant_record.id is null then raise exception 'restaurant not found'; end if;
  pending_value := public.resolve_branch_creation_lifecycle_internal(input_restaurant_id) = 'PENDING_ACTIVATION';
  -- Scope/audit helpers also call the creator during setup. Resume the already
  -- validated pending binding without attempting a legacy INSERT before ON CONFLICT.
  if restaurant_record.activation_status='pending_activation' and not pending_value then
    return restaurant_record.primary_branch_id;
  end if;
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
    payment_status, trial_started_at, trial_ends_at, current_period_ends_at, current_period_end, selected_plan
  ) values (
    organization_id_value, branch_id_value,
    case when pending_value then 'pending_activation' else 'trialing' end, 'BASIC',
    case when pending_value then 'pending_activation' else 'trialing' end,
    'not_required', case when not pending_value then now() end,
    case when not pending_value then now() + interval '3 months' end,
    case when not pending_value then now() + interval '3 months' end,
    case when not pending_value then now() + interval '3 months' end,
    case when pending_value then 'BASIC' end
  ) on conflict (branch_id) do nothing;
  return branch_id_value;
end;
$$;
revoke all on function public.ensure_restaurant_branch(uuid) from public,anon,authenticated;
create or replace function public.start_restaurant_owner_trial_country_internal(
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
      status = case when activation_status='pending_activation' then 'draft' when status = 'suspended' then status else 'active' end
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
  if subscription_record.subscription_status='pending_activation' then
    insert into public.pending_registration_audit(restaurant_ref,organization_ref,branch_ref,actor_ref)
    values(restaurant_record.id,restaurant_record.organization_id,branch_id_value,user_id_value)
    on conflict (restaurant_ref) do nothing;
  else
  insert into public.audit_log (restaurant_id, actor_type, actor_id, action, target_table, target_id, metadata)
  values (restaurant_record.id, 'admin', user_id_value, 'owner_trial_started', 'restaurants',
    restaurant_record.id, jsonb_build_object('owner_name', cleaned_owner_name,
      'trial_started_at', subscription_record.trial_started_at, 'trial_ends_at', subscription_record.trial_ends_at,
      'subscription_status', subscription_record.subscription_status, 'idempotent', true));
  end if;
  return jsonb_build_object(
    'restaurant', jsonb_build_object('id', restaurant_record.id, 'name', restaurant_record.name,
      'slug', restaurant_record.slug, 'organization_id', restaurant_record.organization_id, 'branch_id', branch_id_value),
    'subscription', jsonb_build_object('status', subscription_record.subscription_status,
      'trial_started_at', subscription_record.trial_started_at, 'trial_ends_at', subscription_record.trial_ends_at));
end;
$$;
revoke all on function public.start_restaurant_owner_trial_country_internal(text,text,text) from public,anon,authenticated,service_role;

-- No data migrations: attach guards to the existing operational tables.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'organizations','branches','restaurant_branding','restaurant_onboarding_drafts','loyalty_settings',
    'loyalty_rules','restaurant_legal_profiles','organization_legal_profiles','restaurant_members',
    'rewards','coupons','restaurant_offers','legal_documents','legal_document_versions',
    'country_launch_existing_businesses','branch_entitlement_overrides',
    'restaurant_capacity_addon_entitlements','commercial_pro_access_grants',
    'customers','customer_account_memberships','customer_qr_tokens','customer_points_qr_references',
    'customer_rewards','customer_bonus_boosts','customer_devices','customer_consents','customer_legal_acceptances',
    'customer_offer_email_consents','customer_offer_email_deliveries','customer_push_subscriptions',
    'customer_reward_notification_state','customer_transactional_email_deliveries',
    'points_transactions','stamp_transactions','points_collection_requests','points_idempotency_claims',
    'points_reverse_idempotency_claims','redemption_activity_journal','points_redemption_presentations',
    'gift_redemption_presentations','reward_redemption_events','reward_redemption_codes','redemption_codes',
    'coupon_redemptions','referrals','referral_boost_grants','restaurant_daily_pins','daily_pin_attempts',
    'staff_members','staff_sessions','campaigns','campaign_customer_offers','campaign_events',
    'capacity_usage_daily_snapshots','capacity_warning_states','capacity_warning_episodes','capacity_warning_deliveries',
    'expiry_reminders','customer_message_attempts','customer_reward_redemption_attempts',
    'redemption_activation_attempts','restaurant_points_credit_attempts','kassa_redemption_workflows',
    'program_terminations','consent_events','birthday_gift_job_log',
    'restaurant_offer_metrics'
  ] loop
    execute format('drop trigger if exists pending_activation_operational_guard on public.%I',table_name);
    execute format('create trigger pending_activation_operational_guard before insert or update or delete on public.%I for each row execute function public.guard_pending_activation_operational_write()',table_name);
  end loop;
end $$;

create or replace function public.resolve_restaurant_entitlements_internal(input_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
stable
as $function$
declare
  at_value timestamptz := statement_timestamp();
  restaurant_record public.restaurants%rowtype;
  subscription_record public.branch_subscriptions%rowtype;
  basic_plan_record public.commercial_plan_catalog%rowtype;
  effective_plan_record public.commercial_plan_catalog%rowtype;
  override_record public.branch_entitlement_overrides%rowtype;
  lifecycle_value jsonb;
  commercial_release_value jsonb;
  commercial_pro_released boolean := false;
  subscription_pro_valid boolean := false;
  real_business_pilot_valid boolean := false;
  internal_test_only_valid boolean := false;
  effective_pro_valid boolean := false;
  access_grant_id_value uuid;
  access_kind_value text;
  requested_pro boolean := false;
  resolved_plan_key text := 'BASIC';
  source_value text := 'BASIC_FALLBACK';
  reason_code_value text := 'SUBSCRIPTION_MISSING';
  effective_from_value timestamptz;
  effective_until_value timestamptz;
  override_status_value text := 'ABSENT';
  override_plan_valid boolean := false;
  feature_override_active boolean := false;
  safety_plan boolean := false;
  safety_offer_limit boolean := false;
  safety_offer_notifications boolean := false;
  safety_reward_notifications boolean := false;
  basic_offer_limit_value integer := 5;
  effective_offer_limit integer;
  effective_offer_unlimited boolean;
  effective_offer_notifications boolean;
  effective_reward_notifications boolean;
begin
  if public.restaurant_activation_state_internal(input_restaurant_id)->>'status'='PENDING_ACTIVATION' then
    return jsonb_build_object('restaurant_id',input_restaurant_id,'selected_plan','BASIC','effective_plan',null,
      'subscription_status','pending_activation','payment_status','not_required','trial_ends_at',null,
      'entitlement_source','NONE','reason_code','PENDING_ACTIVATION','effective',
      jsonb_build_object('offer_limit',0,'offer_limit_unlimited',false,'offer_notifications',false,
        'reward_notifications',false,'gift_cards',false,'pos_integration',false),
      'commercial_release',public.resolve_commercial_plan_release_internal(input_restaurant_id,'PRO'));
  end if;
  select * into basic_plan_record
  from public.commercial_plan_catalog
  where plan_key = 'BASIC';
  if basic_plan_record.offer_limit between 1 and 5 then
    basic_offer_limit_value := basic_plan_record.offer_limit;
  end if;

  select * into restaurant_record
  from public.restaurants
  where id = input_restaurant_id;

  commercial_release_value := public.resolve_commercial_plan_release_internal(
    input_restaurant_id, 'PRO'
  );
  commercial_pro_released := coalesce(
    (commercial_release_value->>'released')::boolean, false
  );

  if restaurant_record.id is null then
    reason_code_value := 'RESTAURANT_NOT_FOUND';
  elsif restaurant_record.primary_branch_id is null then
    reason_code_value := 'PRIMARY_BRANCH_MISSING';
  else
    select * into subscription_record
    from public.branch_subscriptions
    where branch_id = restaurant_record.primary_branch_id;

    if subscription_record.id is not null then
      select * into override_record
      from public.branch_entitlement_overrides
      where subscription_id = subscription_record.id;

      lifecycle_value := public.resolve_subscription_plan_lifecycle_internal(
        subscription_record.plan_key,
        coalesce(subscription_record.subscription_status, subscription_record.status),
        subscription_record.payment_status,
        subscription_record.trial_started_at,
        subscription_record.trial_ends_at,
        coalesce(subscription_record.current_period_end, subscription_record.current_period_ends_at),
        subscription_record.past_due_started_at,
        subscription_record.created_at,
        at_value
      );

      if override_record.subscription_id is not null then
        if override_record.plan_override_key is null then
          override_status_value := case
            when override_record.expires_at is not null and override_record.expires_at <= at_value then 'EXPIRED'
            when override_record.effective_from is not null and override_record.effective_from > at_value then 'NOT_STARTED'
            else 'FEATURE_ONLY'
          end;
        elsif override_record.plan_override_id is null
          or override_record.plan_effective_from is null or override_record.plan_effective_until is null
          or not isfinite(override_record.plan_effective_from) or not isfinite(override_record.plan_effective_until)
          or override_record.plan_effective_until <= override_record.plan_effective_from then
          override_status_value := 'INVALID_WINDOW';
        elsif override_record.plan_effective_from > at_value then
          override_status_value := 'NOT_STARTED';
        elsif override_record.plan_effective_until <= at_value then
          override_status_value := 'EXPIRED';
        else
          override_status_value := 'VALID';
          override_plan_valid := true;
        end if;

        feature_override_active :=
          coalesce(override_record.effective_from <= at_value, true)
          and coalesce(override_record.expires_at > at_value, true);
      end if;
    end if;

    select
      coalesce(bool_or(block.entitlement_key in ('ALL', 'PLAN')), false),
      coalesce(bool_or(block.entitlement_key in ('ALL', 'OFFER_LIMIT')), false),
      coalesce(bool_or(block.entitlement_key in ('ALL', 'OFFER_NOTIFICATIONS')), false),
      coalesce(bool_or(block.entitlement_key in ('ALL', 'REWARD_NOTIFICATIONS')), false)
    into safety_plan, safety_offer_limit, safety_offer_notifications, safety_reward_notifications
    from public.restaurant_entitlement_safety_blocks block
    where block.revoked_at is null
      and block.starts_at <= at_value
      and (block.expires_at is null or block.expires_at > at_value)
      and (
        block.scope_type = 'GLOBAL'
        or (block.scope_type = 'RESTAURANT' and block.restaurant_id = input_restaurant_id)
      );

    subscription_pro_valid := upper(coalesce(subscription_record.plan_key, '')) = 'PRO'
      and coalesce((lifecycle_value->>'eligible')::boolean, false);

    select grant_row.id into access_grant_id_value
    from public.commercial_pro_access_grants grant_row
    where grant_row.restaurant_id = restaurant_record.id
      and grant_row.organization_id = restaurant_record.organization_id
      and grant_row.access_kind = 'REAL_BUSINESS_PILOT'
      and grant_row.revoked_at is null
      and grant_row.starts_at <= at_value
      and grant_row.expires_at > at_value
    order by grant_row.expires_at desc, grant_row.id
    limit 1;
    real_business_pilot_valid := access_grant_id_value is not null;
    if real_business_pilot_valid then access_kind_value := 'REAL_BUSINESS_PILOT'; end if;

    if not real_business_pilot_valid then
      select grant_row.id into access_grant_id_value
      from public.commercial_pro_access_grants grant_row
      join public.platform_test_tenant_registry marker
        on marker.restaurant_id = restaurant_record.id
       and marker.organization_id = restaurant_record.organization_id
       and marker.restaurant_name = restaurant_record.name
       and marker.owner_user_id = restaurant_record.owner_id
       and marker.deleted_at is null
      where grant_row.restaurant_id = restaurant_record.id
        and grant_row.organization_id = restaurant_record.organization_id
        and grant_row.access_kind = 'INTERNAL_TEST_ONLY'
        and grant_row.revoked_at is null
        and grant_row.starts_at <= at_value
        and grant_row.expires_at > at_value
      order by grant_row.expires_at desc, grant_row.id
      limit 1;
      internal_test_only_valid := access_grant_id_value is not null;
      if internal_test_only_valid then access_kind_value := 'INTERNAL_TEST_ONLY'; end if;
    end if;

    effective_pro_valid := internal_test_only_valid
      or (commercial_pro_released and (
        subscription_pro_valid or real_business_pilot_valid
      ));

    if safety_plan then
      resolved_plan_key := 'BASIC';
      source_value := 'SAFETY_BLOCK';
      reason_code_value := 'PLAN_SAFETY_BLOCKED';
      feature_override_active := false;
    elsif internal_test_only_valid then
      resolved_plan_key := 'PRO';
      source_value := 'INTERNAL_TEST_ONLY';
      reason_code_value := 'INTERNAL_TEST_ONLY_ACTIVE';
    elsif commercial_pro_released and real_business_pilot_valid then
      resolved_plan_key := 'PRO';
      source_value := 'REAL_BUSINESS_PILOT';
      reason_code_value := 'REAL_BUSINESS_PILOT_ACTIVE';
    elsif commercial_pro_released and subscription_pro_valid then
      resolved_plan_key := 'PRO';
      source_value := lifecycle_value->>'source';
      reason_code_value := lifecycle_value->>'reason_code';
      effective_from_value := (lifecycle_value->>'effective_from')::timestamptz;
      effective_until_value := (lifecycle_value->>'effective_until')::timestamptz;
    elsif subscription_record.id is not null then
      reason_code_value := coalesce(lifecycle_value->>'reason_code', 'SUBSCRIPTION_INVALID');
    end if;
  end if;

  if resolved_plan_key not in ('BASIC', 'PRO') then
    resolved_plan_key := 'BASIC';
    source_value := 'BASIC_FALLBACK';
    reason_code_value := 'PLAN_UNKNOWN_OR_UNRELEASED';
    effective_from_value := null;
    effective_until_value := null;
  end if;

  requested_pro := upper(coalesce(subscription_record.plan_key, '')) = 'PRO'
    or upper(coalesce(override_record.plan_override_key, '')) = 'PRO'
    or (feature_override_active and (
      override_record.offer_limit_unlimited is true
      or coalesce(override_record.offer_limit, 0) > basic_offer_limit_value
      or override_record.offer_notifications is true
      or override_record.reward_notifications is true
    ));

  if not effective_pro_valid and (resolved_plan_key = 'PRO' or requested_pro) then
    resolved_plan_key := 'BASIC';
    source_value := 'COMMERCIAL_RELEASE_LOCK';
    reason_code_value := coalesce(
      commercial_release_value->>'reason_code',
      'PRO_COMMERCIAL_POLICY_INVALID'
    );
    effective_from_value := null;
    effective_until_value := null;
  end if;

  select * into effective_plan_record
  from public.commercial_plan_catalog
  where plan_key = resolved_plan_key;

  if feature_override_active and override_record.offer_limit_unlimited is true then
    effective_offer_limit := null;
    effective_offer_unlimited := true;
  elsif feature_override_active and override_record.offer_limit_unlimited is false then
    effective_offer_limit := override_record.offer_limit;
    effective_offer_unlimited := false;
  else
    effective_offer_limit := effective_plan_record.offer_limit;
    effective_offer_unlimited := effective_plan_record.offer_limit is null;
  end if;

  effective_offer_notifications := case
    when feature_override_active and override_record.offer_notifications is not null
      then override_record.offer_notifications
    else coalesce(effective_plan_record.offer_notifications, false)
  end;
  effective_reward_notifications := case
    when feature_override_active and override_record.reward_notifications is not null
      then override_record.reward_notifications
    else coalesce(effective_plan_record.reward_notifications, false)
  end;

  if not effective_pro_valid then
    effective_offer_limit := least(
      coalesce(effective_offer_limit, basic_offer_limit_value),
      basic_offer_limit_value
    );
    effective_offer_unlimited := false;
    effective_offer_notifications := false;
    effective_reward_notifications := false;
  end if;

  if safety_offer_limit then
    effective_offer_limit := basic_offer_limit_value;
    effective_offer_unlimited := false;
  end if;
  if safety_offer_notifications then
    effective_offer_notifications := false;
  end if;
  if safety_reward_notifications then
    effective_reward_notifications := false;
  end if;

  return jsonb_build_object(
    'contract_version', 'restaurant_entitlements_v5',
    'plan_key', resolved_plan_key,
    'effective_plan', resolved_plan_key,
    'stored_plan_key', subscription_record.plan_key,
    'plan_scope', jsonb_build_object(
      'type', 'RESTAURANT_LOCATION',
      'restaurant_id', input_restaurant_id,
      'branch_id', restaurant_record.primary_branch_id
    ),
    'entitlement_source', source_value,
    'effective_from', effective_from_value,
    'effective_until', effective_until_value,
    'reason_code', reason_code_value,
    'commercial_release', commercial_release_value,
    'commercial_access', jsonb_build_object(
      'effective_pro', effective_pro_valid and not safety_plan,
      'paid_or_trial', subscription_pro_valid,
      'real_business_pilot', real_business_pilot_valid,
      'internal_test_only', internal_test_only_valid,
      'access_kind', access_kind_value,
      'access_grant_id', access_grant_id_value
    ),
    'monthly_price_eur_ex_vat', coalesce(effective_plan_record.monthly_price_eur_ex_vat, 59),
    'publicly_available', coalesce(effective_plan_record.publicly_available, false),
    'subscription_status', coalesce(subscription_record.subscription_status, subscription_record.status),
    'payment_status', subscription_record.payment_status,
    'trial_ends_at', subscription_record.trial_ends_at,
    'period_ends_at', coalesce(subscription_record.current_period_end, subscription_record.current_period_ends_at),
    'grace_status', coalesce(lifecycle_value->>'grace_status', 'NOT_APPLICABLE'),
    'override_status', override_status_value,
    'subscription', jsonb_build_object(
      'id', subscription_record.id,
      'status', coalesce(subscription_record.subscription_status, subscription_record.status),
      'payment_status', subscription_record.payment_status,
      'trial_started_at', subscription_record.trial_started_at,
      'trial_ends_at', subscription_record.trial_ends_at,
      'period_ends_at', coalesce(subscription_record.current_period_end, subscription_record.current_period_ends_at),
      'past_due_started_at', subscription_record.past_due_started_at,
      'grace_ends_at', case
        when subscription_record.past_due_started_at is null then null
        else subscription_record.past_due_started_at + interval '7 days'
      end
    ),
    'safety', jsonb_build_object(
      'plan_blocked', safety_plan,
      'offer_limit_blocked', safety_offer_limit,
      'offer_notifications_blocked', safety_offer_notifications,
      'reward_notifications_blocked', safety_reward_notifications
    ),
    'commercial_default', jsonb_build_object(
      'offer_limit', effective_plan_record.offer_limit,
      'offer_limit_unlimited', effective_plan_record.offer_limit is null,
      'offer_notifications', coalesce(effective_plan_record.offer_notifications, false),
      'reward_notifications', coalesce(effective_plan_record.reward_notifications, false),
      'gift_cards', false,
      'pos_integration', false
    ),
    'override', case when override_record.subscription_id is null then null else jsonb_build_object(
      'plan_key', override_record.plan_override_key,
      'id', override_record.plan_override_id,
      'status', override_status_value,
      'effective_from', override_record.plan_effective_from,
      'expires_at', override_record.plan_effective_until,
      'offer_limit', override_record.offer_limit,
      'offer_limit_unlimited', override_record.offer_limit_unlimited,
      'offer_notifications', override_record.offer_notifications,
      'reward_notifications', override_record.reward_notifications,
      'gift_cards', false,
      'pos_integration', false,
      'reason', override_record.reason,
      'changed_by', override_record.changed_by,
      'changed_at', override_record.changed_at
    ) end,
    'effective', jsonb_build_object(
      'offer_limit', effective_offer_limit,
      'offer_limit_unlimited', effective_offer_unlimited,
      'offer_notifications', effective_offer_notifications,
      'reward_notifications', effective_reward_notifications,
      'gift_cards', false,
      'pos_integration', false
    ),
    'subscription_id', subscription_record.id,
    'stripe_mapping', jsonb_build_object(
      'lookup_key', effective_plan_record.stripe_price_lookup_key,
      'configured', false
    )
  );
end;
$function$;

create or replace function public.resolve_restaurant_capacity_internal(
  input_restaurant_id uuid,
  input_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
stable
as $function$
declare
  at_value timestamptz := input_at;
  restaurant_record public.restaurants%rowtype;
  entitlement_value jsonb;
  resolved_plan_key text;
  plan_record public.commercial_capacity_plan_versions%rowtype;
  offer_addon_units bigint := 0;
  customer_addon_units bigint := 0;
  offer_limit_value bigint;
  customer_limit_value bigint;
  offer_usage_value bigint := 0;
  customer_usage_value bigint := 0;
  offer_status_value text;
  customer_status_value text;
begin
  if public.restaurant_activation_state_internal(input_restaurant_id)->>'status'='PENDING_ACTIVATION' then
    return jsonb_build_object('contract_version','restaurant_capacity_v1','as_of',input_at,
      'activation_status','PENDING_ACTIVATION','plan',jsonb_build_object('plan_key',null,'selected_plan','BASIC',
      'subscription_status','pending_activation','payment_status','not_required'),
      'offers',jsonb_build_object('base_limit',0,'addon_units',0,'addon_capacity',0,'effective_limit',0,
        'usage',0,'remaining',0,'usage_percent',0,'status','PENDING_ACTIVATION'),
      'active_customers',jsonb_build_object('base_limit',0,'addon_units',0,'addon_capacity',0,'effective_limit',0,
        'usage',0,'remaining',0,'usage_percent',0,'status','PENDING_ACTIVATION','window_days',365),
      'over_limit',jsonb_build_object('offers',false,'active_customers',false,'any',false),
      'write_enforcement_active',true,'unlimited',false);
  end if;
  if input_restaurant_id is null or at_value is null or not isfinite(at_value) then
    raise exception 'CAPACITY_INPUT_INVALID' using errcode = '22023';
  end if;

  select * into restaurant_record
  from public.restaurants
  where id = input_restaurant_id;
  if restaurant_record.id is null then
    raise exception 'RESTAURANT_NOT_FOUND' using errcode = 'P0002';
  end if;

  entitlement_value := public.resolve_restaurant_entitlements_internal(input_restaurant_id);
  resolved_plan_key := case
    when entitlement_value->>'effective_plan' = 'PRO' then 'PRO'
    else 'BASIC'
  end;

  select * into plan_record
  from public.commercial_capacity_plan_versions plan_version
  where plan_version.plan_key = resolved_plan_key
    and plan_version.effective_from <= at_value
    and (plan_version.effective_until is null or plan_version.effective_until > at_value)
  order by plan_version.effective_from desc, plan_version.version desc
  limit 1;

  if plan_record.id is null and resolved_plan_key <> 'BASIC' then
    resolved_plan_key := 'BASIC';
    select * into plan_record
    from public.commercial_capacity_plan_versions plan_version
    where plan_version.plan_key = 'BASIC'
      and plan_version.effective_from <= at_value
      and (plan_version.effective_until is null or plan_version.effective_until > at_value)
    order by plan_version.effective_from desc, plan_version.version desc
    limit 1;
  end if;
  if plan_record.id is null then
    raise exception 'CAPACITY_PLAN_NOT_CONFIGURED' using errcode = '55000';
  end if;

  with latest_revisions as (
    select distinct on (row.entitlement_key) row.*
    from public.restaurant_capacity_addon_entitlements row
    where row.restaurant_id = input_restaurant_id
    order by row.entitlement_key, row.revision desc, row.created_at desc, row.id desc
  ), active_rows as (
    select row.*
    from latest_revisions row
    where row.organization_id = restaurant_record.organization_id
      and row.branch_id = restaurant_record.primary_branch_id
      and row.effective_from <= at_value
      and (row.effective_until is null or row.effective_until > at_value)
      and (
        row.status = 'ACTIVE'
        or row.status = 'CANCELLED'
        or (
          row.status = 'PAST_DUE'
          and row.past_due_started_at <= at_value
          and row.past_due_started_at + interval '7 days' > at_value
        )
      )
  )
  select
    coalesce(sum(row.units) filter (where row.addon_key = 'OFFER_CAPACITY'), 0),
    coalesce(sum(row.units) filter (where row.addon_key = 'CUSTOMER_CAPACITY'), 0)
  into offer_addon_units, customer_addon_units
  from active_rows row;

  offer_limit_value := plan_record.base_offer_limit + offer_addon_units * 5::bigint;
  customer_limit_value := plan_record.base_customer_limit + customer_addon_units * 5000::bigint;

  select count(*)::bigint into offer_usage_value
  from public.restaurant_offers offer
  where offer.restaurant_id = input_restaurant_id
    and offer.status = 'PUBLISHED'
    and offer.is_active = true
    and offer.valid_to > at_value;

  select count(*)::bigint into customer_usage_value
  from public.list_restaurant_active_customer_capacity_keys_internal(
    input_restaurant_id,
    at_value
  );

  offer_status_value := case when offer_usage_value > offer_limit_value then 'OVER_LIMIT' else 'WITHIN_LIMIT' end;
  customer_status_value := case when customer_usage_value > customer_limit_value then 'OVER_LIMIT' else 'WITHIN_LIMIT' end;

  return jsonb_build_object(
    'contract_version', 'restaurant_capacity_v1',
    'as_of', at_value,
    'scope', jsonb_build_object(
      'restaurant_id', restaurant_record.id,
      'organization_id', restaurant_record.organization_id,
      'branch_id', restaurant_record.primary_branch_id
    ),
    'plan', jsonb_build_object(
      'plan_key', resolved_plan_key,
      'version', plan_record.version,
      'monthly_price_minor', plan_record.monthly_price_minor,
      'currency', plan_record.currency,
      'tax_treatment', plan_record.tax_treatment,
      'entitlement_source', entitlement_value->>'entitlement_source',
      'reason_code', entitlement_value->>'reason_code',
      'subscription_status', entitlement_value->>'subscription_status',
      'payment_status', entitlement_value->>'payment_status'
    ),
    'offers', jsonb_build_object(
      'base_limit', plan_record.base_offer_limit,
      'addon_units', offer_addon_units,
      'addon_capacity_per_unit', 5,
      'effective_limit', offer_limit_value,
      'usage', offer_usage_value,
      'remaining', greatest(offer_limit_value - offer_usage_value, 0),
      'status', offer_status_value
    ),
    'active_customers', jsonb_build_object(
      'window_days', 365,
      'window_from', at_value - interval '365 days',
      'window_to_exclusive', at_value,
      'base_limit', plan_record.base_customer_limit,
      'addon_units', customer_addon_units,
      'addon_capacity_per_unit', 5000,
      'effective_limit', customer_limit_value,
      'usage', customer_usage_value,
      'remaining', greatest(customer_limit_value - customer_usage_value, 0),
      'status', customer_status_value
    ),
    'over_limit', jsonb_build_object(
      'offers', offer_status_value = 'OVER_LIMIT',
      'active_customers', customer_status_value = 'OVER_LIMIT',
      'any', offer_status_value = 'OVER_LIMIT' or customer_status_value = 'OVER_LIMIT'
    ),
    'write_enforcement_active', false,
    'unlimited', false
  );
end;
$function$;

create or replace function public.get_restaurant_capacity(input_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
stable
as $function$
declare
  at_value timestamptz := statement_timestamp();
  capacity_snapshot jsonb;
  entitlement_snapshot jsonb;
  offer_addon_record public.commercial_capacity_addon_versions%rowtype;
  customer_addon_record public.commercial_capacity_addon_versions%rowtype;
  offer_usage bigint;
  offer_limit bigint;
  offer_addon_units bigint;
  customer_usage bigint;
  customer_limit bigint;
  customer_addon_units bigint;
  offer_status text;
  customer_status text;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if not public.is_restaurant_admin(input_restaurant_id)
     and not public.is_platform_admin() then
    raise exception 'CAPACITY_READ_FORBIDDEN' using errcode = '42501';
  end if;

  capacity_snapshot := public.resolve_restaurant_capacity_internal(input_restaurant_id, at_value);
  if capacity_snapshot->>'activation_status'='PENDING_ACTIVATION' then return capacity_snapshot; end if;
  entitlement_snapshot := public.resolve_restaurant_entitlements_internal(input_restaurant_id);

  select * into offer_addon_record
  from public.commercial_capacity_addon_versions addon
  where addon.addon_key = 'OFFER_CAPACITY'
    and addon.effective_from <= at_value
    and (addon.effective_until is null or addon.effective_until > at_value)
  order by addon.effective_from desc, addon.version desc limit 1;
  select * into customer_addon_record
  from public.commercial_capacity_addon_versions addon
  where addon.addon_key = 'CUSTOMER_CAPACITY'
    and addon.effective_from <= at_value
    and (addon.effective_until is null or addon.effective_until > at_value)
  order by addon.effective_from desc, addon.version desc limit 1;
  if offer_addon_record.id is null or customer_addon_record.id is null then
    raise exception 'CAPACITY_ADDON_CATALOG_NOT_CONFIGURED' using errcode = '55000';
  end if;

  offer_usage := (capacity_snapshot #>> '{offers,usage}')::bigint;
  offer_limit := (capacity_snapshot #>> '{offers,effective_limit}')::bigint;
  offer_addon_units := (capacity_snapshot #>> '{offers,addon_units}')::bigint;
  customer_usage := (capacity_snapshot #>> '{active_customers,usage}')::bigint;
  customer_limit := (capacity_snapshot #>> '{active_customers,effective_limit}')::bigint;
  customer_addon_units := (capacity_snapshot #>> '{active_customers,addon_units}')::bigint;
  offer_status := case
    when offer_usage > offer_limit then 'OVER_LIMIT'
    when offer_usage = offer_limit then 'AT_LIMIT'
    when offer_usage * 100 >= offer_limit * 90 then 'WARNING_90'
    when offer_usage * 100 >= offer_limit * 80 then 'WARNING_80'
    else 'AVAILABLE' end;
  customer_status := case
    when customer_usage > customer_limit then 'OVER_LIMIT'
    when customer_usage = customer_limit then 'AT_LIMIT'
    when customer_usage * 100 >= customer_limit * 90 then 'WARNING_90'
    when customer_usage * 100 >= customer_limit * 80 then 'WARNING_80'
    else 'AVAILABLE' end;

  capacity_snapshot := jsonb_set(capacity_snapshot, '{offers,status}', to_jsonb(offer_status), true);
  capacity_snapshot := jsonb_set(capacity_snapshot, '{offers,usage_percent}', to_jsonb(least(100, (offer_usage * 100 / offer_limit)::integer)), true);
  capacity_snapshot := jsonb_set(capacity_snapshot, '{offers,addon_capacity}', to_jsonb(offer_addon_units * offer_addon_record.capacity_per_unit), true);
  capacity_snapshot := jsonb_set(capacity_snapshot, '{active_customers,status}', to_jsonb(customer_status), true);
  capacity_snapshot := jsonb_set(capacity_snapshot, '{active_customers,usage_percent}', to_jsonb(least(100, (customer_usage * 100 / customer_limit)::integer)), true);
  capacity_snapshot := jsonb_set(capacity_snapshot, '{active_customers,addon_capacity}', to_jsonb(customer_addon_units * customer_addon_record.capacity_per_unit), true);
  capacity_snapshot := jsonb_set(capacity_snapshot, '{write_enforcement_active}', 'true'::jsonb, true);
  capacity_snapshot := jsonb_set(capacity_snapshot, '{write_enforcement}', jsonb_build_object('offers', true, 'active_customers', true), true);

  return capacity_snapshot || jsonb_build_object(
    'commercial_release', entitlement_snapshot->'commercial_release',
    'catalog', jsonb_build_object(
      'offer_addon', jsonb_build_object(
        'addon_key', offer_addon_record.addon_key,
        'version', offer_addon_record.version,
        'capacity_per_unit', offer_addon_record.capacity_per_unit,
        'monthly_price_minor', offer_addon_record.monthly_price_minor,
        'currency', offer_addon_record.currency,
        'tax_treatment', offer_addon_record.tax_treatment
      ),
      'customer_addon', jsonb_build_object(
        'addon_key', customer_addon_record.addon_key,
        'version', customer_addon_record.version,
        'capacity_per_unit', customer_addon_record.capacity_per_unit,
        'monthly_price_minor', customer_addon_record.monthly_price_minor,
        'currency', customer_addon_record.currency,
        'tax_treatment', customer_addon_record.tax_treatment
      )
    ),
    'warning_contract', jsonb_build_object(
      'thresholds_percent', jsonb_build_array(80, 90, 100),
      'forecast_horizon_days', 7,
      'minimum_complete_history_days', 28,
      'dispatch_active', true,
      'forecast_active', true,
      'decision_required', false
    )
  );
end;
$function$;

create or replace function public.evaluate_restaurant_capacity_warning_internal(
  input_restaurant_id uuid,
  input_capacity_type text,
  input_run_at timestamptz,
  input_source text,
  input_record_daily_snapshot boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  restaurant_record public.restaurants%rowtype;
  capacity_snapshot jsonb;
  metric jsonb;
  timezone_value text;
  local_date_value date;
  usage_value bigint;
  limit_value bigint;
  remaining_value bigint;
  actual_level text;
  forecast_level text;
  history_usage bigint;
  history_count integer := 0;
  projected_value bigint;
  forecast_basis_date_value date;
  level_record record;
  state_record public.capacity_warning_states%rowtype;
  episode_record public.capacity_warning_episodes%rowtype;
  signal_actual boolean;
  signal_forecast boolean;
  above_current boolean;
  resolve_now boolean;
  resolve_reason_value text;
  episode_created boolean;
  delivery_rows integer;
  reminder_rows integer;
begin
  if public.restaurant_activation_state_internal(input_restaurant_id)->>'status'='PENDING_ACTIVATION' then
    return jsonb_build_object('status','SKIPPED','reason','PENDING_ACTIVATION');
  end if;
  if input_restaurant_id is null
     or input_capacity_type not in ('offer', 'customer')
     or input_run_at is null or not isfinite(input_run_at)
     or input_source not in ('EVENT', 'DAILY', 'MANUAL_TEST') then
    raise exception 'CAPACITY_WARNING_INPUT_INVALID' using errcode = '22023';
  end if;

  select restaurant.* into restaurant_record
  from public.restaurants restaurant
  where restaurant.id = input_restaurant_id;
  if restaurant_record.id is null then
    raise exception 'RESTAURANT_NOT_FOUND' using errcode = 'P0002';
  end if;

  timezone_value := public.capacity_warning_timezone(restaurant_record.timezone_name);
  local_date_value := (input_run_at at time zone timezone_value)::date;

  perform pg_advisory_xact_lock(hashtextextended(
    'capacity-warning:' || input_restaurant_id::text || ':' || input_capacity_type,
    0
  ));

  capacity_snapshot := public.resolve_restaurant_capacity_internal(input_restaurant_id, input_run_at);
  metric := case input_capacity_type
    when 'offer' then capacity_snapshot->'offers'
    else capacity_snapshot->'active_customers'
  end;
  usage_value := (metric->>'usage')::bigint;
  limit_value := (metric->>'effective_limit')::bigint;
  if usage_value is null or usage_value < 0 or limit_value is null or limit_value <= 0 then
    raise exception 'CAPACITY_WARNING_RESOLVER_INVALID' using errcode = '55000';
  end if;
  remaining_value := greatest(limit_value - usage_value, 0);

  if input_record_daily_snapshot then
    insert into public.capacity_usage_daily_snapshots (
      restaurant_id, capacity_type, snapshot_date, usage,
      effective_limit, timezone_name, captured_at
    ) values (
      input_restaurant_id, input_capacity_type, local_date_value - 1,
      usage_value, limit_value, timezone_value, input_run_at
    ) on conflict (restaurant_id, capacity_type, snapshot_date) do nothing;
  end if;

  forecast_basis_date_value := local_date_value - 28;
  select count(*)::integer,
    max(snapshot.usage) filter (where snapshot.snapshot_date = forecast_basis_date_value)
  into history_count, history_usage
  from public.capacity_usage_daily_snapshots snapshot
  where snapshot.restaurant_id = input_restaurant_id
    and snapshot.capacity_type = input_capacity_type
    and snapshot.snapshot_date between forecast_basis_date_value and local_date_value - 1;

  if history_count = 28 and history_usage is not null then
    -- Founder formula: daily_net_growth = (usage_value - history_usage) / 28;
    -- projected_usage_7d = usage_value + max(0, daily_net_growth * 7).
    -- Multiply before dividing so an exact integer projection (for example
    -- 8 + (8 - 0) * 7 / 28 = 10) cannot become 10.000...1 and ceil to 11.
    projected_value := usage_value
      + ceil(greatest(
          0::numeric,
          (usage_value - history_usage)::numeric * 7::numeric / 28::numeric
        ))::bigint;
  else
    projected_value := null;
    forecast_basis_date_value := null;
  end if;

  actual_level := public.capacity_warning_level_for_usage(usage_value, limit_value);
  forecast_level := case when projected_value is null then null
    else public.capacity_warning_level_for_usage(projected_value, limit_value) end;

  for level_record in
    select * from (values
      ('80'::text, 80::integer),
      ('90'::text, 90::integer),
      ('100'::text, 100::integer),
      ('OVER_LIMIT'::text, 101::integer)
    ) level_values(warning_level, threshold_percent)
  loop
    insert into public.capacity_warning_states (
      restaurant_id, capacity_type, warning_level, last_usage,
      last_effective_limit, last_projected_usage_7d, last_evaluated_at
    ) values (
      input_restaurant_id, input_capacity_type, level_record.warning_level,
      usage_value, limit_value, projected_value, input_run_at
    ) on conflict (restaurant_id, capacity_type, warning_level) do nothing;

    select * into state_record
    from public.capacity_warning_states state
    where state.restaurant_id = input_restaurant_id
      and state.capacity_type = input_capacity_type
      and state.warning_level = level_record.warning_level
    for update;

    above_current := case level_record.warning_level
      when 'OVER_LIMIT' then usage_value > limit_value
      else usage_value * 100 >= limit_value * level_record.threshold_percent
    end;
    resolve_now := false;
    resolve_reason_value := null;

    if state_record.active_episode_id is not null and not above_current then
      if state_record.last_effective_limit is not null
         and limit_value > state_record.last_effective_limit then
        resolve_now := true;
        resolve_reason_value := 'CAPACITY_INCREASE';
      elsif state_record.below_since_date is not null
            and local_date_value >= state_record.below_since_date + 7 then
        resolve_now := true;
        resolve_reason_value := 'SEVEN_COMPLETE_DAYS_BELOW';
      end if;

      if resolve_now then
        update public.capacity_warning_episodes episode
        set status = 'RESOLVED', resolved_at = input_run_at,
            resolve_reason = resolve_reason_value, updated_at = input_run_at
        where episode.id = state_record.active_episode_id and episode.status = 'OPEN';
        update public.capacity_warning_deliveries delivery
        set status = 'RESOLVED', resolved_at = input_run_at,
            processing_started_at = null, updated_at = input_run_at
        where delivery.warning_episode_id = state_record.active_episode_id
          and delivery.status <> 'RESOLVED';
        insert into public.capacity_warning_audit (
          restaurant_id, warning_episode_id, capacity_type, warning_level,
          event_type, evaluation_source, details, created_at
        ) values (
          input_restaurant_id, state_record.active_episode_id, input_capacity_type,
          level_record.warning_level, 'EPISODE_RESOLVED', input_source,
          jsonb_build_object('reason', resolve_reason_value, 'usage', usage_value, 'effective_limit', limit_value),
          input_run_at
        );
        update public.capacity_warning_states state
        set active_episode_id = null, below_since_date = null, updated_at = input_run_at
        where state.restaurant_id = input_restaurant_id
          and state.capacity_type = input_capacity_type
          and state.warning_level = level_record.warning_level;
        state_record.active_episode_id := null;
        state_record.below_since_date := null;
      elsif state_record.below_since_date is null then
        update public.capacity_warning_states state
        set below_since_date = local_date_value, updated_at = input_run_at
        where state.restaurant_id = input_restaurant_id
          and state.capacity_type = input_capacity_type
          and state.warning_level = level_record.warning_level;
        state_record.below_since_date := local_date_value;
      end if;
    elsif above_current and state_record.below_since_date is not null then
      update public.capacity_warning_states state
      set below_since_date = null, updated_at = input_run_at
      where state.restaurant_id = input_restaurant_id
        and state.capacity_type = input_capacity_type
        and state.warning_level = level_record.warning_level;
      state_record.below_since_date := null;
    end if;

    signal_actual := actual_level = level_record.warning_level;
    signal_forecast := forecast_level = level_record.warning_level
      and public.capacity_warning_level_rank(forecast_level)
        > public.capacity_warning_level_rank(actual_level);
    episode_created := false;

    if signal_actual or signal_forecast then
      if state_record.active_episode_id is null then
        insert into public.capacity_warning_episodes (
          restaurant_id, capacity_type, warning_level, triggered_by,
          usage, effective_limit, remaining, projected_usage_7d,
          forecast_basis_date, opened_at, actual_reached_at,
          created_at, updated_at
        ) values (
          input_restaurant_id, input_capacity_type, level_record.warning_level,
          case when signal_actual then 'ACTUAL' else 'FORECAST' end,
          usage_value, limit_value, remaining_value, projected_value,
          forecast_basis_date_value, input_run_at,
          case when signal_actual then input_run_at else null end,
          input_run_at, input_run_at
        ) returning * into episode_record;
        episode_created := true;
        update public.capacity_warning_states state
        set active_episode_id = episode_record.id,
            below_since_date = case when above_current then null else local_date_value end,
            updated_at = input_run_at
        where state.restaurant_id = input_restaurant_id
          and state.capacity_type = input_capacity_type
          and state.warning_level = level_record.warning_level;
        state_record.active_episode_id := episode_record.id;

        insert into public.capacity_warning_audit (
          restaurant_id, warning_episode_id, capacity_type, warning_level,
          event_type, evaluation_source, details, created_at
        ) values (
          input_restaurant_id, episode_record.id, input_capacity_type,
          level_record.warning_level, 'EPISODE_OPENED', input_source,
          jsonb_build_object(
            'triggered_by', episode_record.triggered_by,
            'usage', usage_value, 'effective_limit', limit_value,
            'remaining', remaining_value, 'projected_usage_7d', projected_value
          ), input_run_at
        );
      else
        select * into episode_record
        from public.capacity_warning_episodes episode
        where episode.id = state_record.active_episode_id
        for update;
        update public.capacity_warning_episodes episode
        set triggered_by = case when signal_actual then 'ACTUAL' else episode.triggered_by end,
            actual_reached_at = case
              when signal_actual then coalesce(episode.actual_reached_at, input_run_at)
              else episode.actual_reached_at
            end,
            usage = usage_value, effective_limit = limit_value,
            remaining = remaining_value, projected_usage_7d = projected_value,
            forecast_basis_date = forecast_basis_date_value, updated_at = input_run_at
        where episode.id = episode_record.id;
        if signal_actual and episode_record.actual_reached_at is null then
          insert into public.capacity_warning_audit (
            restaurant_id, warning_episode_id, capacity_type, warning_level,
            event_type, evaluation_source, details, created_at
          ) values (
            input_restaurant_id, episode_record.id, input_capacity_type,
            level_record.warning_level, 'ACTUAL_CONFIRMED', input_source,
            jsonb_build_object('usage', usage_value, 'effective_limit', limit_value), input_run_at
          );
        end if;
      end if;

      insert into public.capacity_warning_deliveries (
        warning_episode_id, restaurant_id, recipient_user_id, channel,
        status, available_at, delivered_at, payload, created_at, updated_at
      )
      select episode_record.id, input_restaurant_id, member.user_id, 'app',
        'DELIVERED', input_run_at, input_run_at,
        jsonb_build_object(
          'capacity_type', input_capacity_type,
          'warning_level', level_record.warning_level,
          'usage', usage_value, 'effective_limit', limit_value,
          'remaining', remaining_value, 'projected_usage_7d', projected_value,
          'route', '/admin/settings/tarif-kapazitaet',
          'language', coalesce(nullif(restaurant_record.language, ''), 'de'),
          'automatic_purchase', false
        ), input_run_at, input_run_at
      from public.restaurant_members member
      join auth.users owner_user on owner_user.id = member.user_id
      where member.restaurant_id = input_restaurant_id
        and member.role = 'owner'
        and owner_user.email is not null
        and owner_user.email_confirmed_at is not null
        and (owner_user.banned_until is null or owner_user.banned_until <= input_run_at)
      on conflict (warning_episode_id, recipient_user_id, channel) do nothing;
      get diagnostics delivery_rows = row_count;

      insert into public.capacity_warning_deliveries (
        warning_episode_id, restaurant_id, recipient_user_id, channel,
        status, available_at, payload, created_at, updated_at
      )
      select episode_record.id, input_restaurant_id, member.user_id, 'email',
        'PENDING', public.capacity_warning_email_available_at(input_run_at, timezone_value),
        jsonb_build_object(
          'capacity_type', input_capacity_type,
          'warning_level', level_record.warning_level,
          'usage', usage_value, 'effective_limit', limit_value,
          'remaining', remaining_value, 'projected_usage_7d', projected_value,
          'route', '/admin/settings/tarif-kapazitaet',
          'language', coalesce(nullif(restaurant_record.language, ''), 'de'),
          'automatic_purchase', false
        ), input_run_at, input_run_at
      from public.restaurant_members member
      join auth.users owner_user on owner_user.id = member.user_id
      where member.restaurant_id = input_restaurant_id
        and member.role = 'owner'
        and owner_user.email is not null
        and owner_user.email_confirmed_at is not null
        and (owner_user.banned_until is null or owner_user.banned_until <= input_run_at)
      on conflict (warning_episode_id, recipient_user_id, channel) do nothing;
      get diagnostics reminder_rows = row_count;

      if episode_created and delivery_rows + reminder_rows > 0 then
        insert into public.capacity_warning_audit (
          restaurant_id, warning_episode_id, capacity_type, warning_level,
          event_type, evaluation_source, details, created_at
        ) values (
          input_restaurant_id, episode_record.id, input_capacity_type,
          level_record.warning_level, 'DELIVERY_QUEUED', input_source,
          jsonb_build_object('app', delivery_rows, 'email', reminder_rows), input_run_at
        );
      end if;

      if not episode_created and level_record.warning_level in ('100', 'OVER_LIMIT') then
        update public.capacity_warning_deliveries delivery
        set status = 'DELIVERED', delivered_at = input_run_at,
            acknowledged_at = null, available_at = input_run_at,
            payload = jsonb_set(jsonb_set(jsonb_set(delivery.payload,
              '{usage}', to_jsonb(usage_value), true),
              '{effective_limit}', to_jsonb(limit_value), true),
              '{remaining}', to_jsonb(remaining_value), true),
            updated_at = input_run_at
        where delivery.warning_episode_id = episode_record.id
          and delivery.channel = 'app'
          and delivery.status = 'ACKNOWLEDGED'
          and delivery.delivered_at <= input_run_at - interval '7 days';
        get diagnostics delivery_rows = row_count;

        update public.capacity_warning_deliveries delivery
        set status = 'PENDING', available_at = public.capacity_warning_email_available_at(input_run_at, timezone_value),
            processing_started_at = null, provider_message_id = null,
            last_error_code = null,
            payload = jsonb_set(jsonb_set(jsonb_set(delivery.payload,
              '{usage}', to_jsonb(usage_value), true),
              '{effective_limit}', to_jsonb(limit_value), true),
              '{remaining}', to_jsonb(remaining_value), true),
            updated_at = input_run_at
        where delivery.warning_episode_id = episode_record.id
          and delivery.channel = 'email'
          and delivery.status = 'SENT'
          and delivery.sent_at <= input_run_at - interval '7 days';
        get diagnostics reminder_rows = row_count;

        if delivery_rows + reminder_rows > 0 then
          insert into public.capacity_warning_audit (
            restaurant_id, warning_episode_id, capacity_type, warning_level,
            event_type, evaluation_source, details, created_at
          ) values (
            input_restaurant_id, episode_record.id, input_capacity_type,
            level_record.warning_level, 'REMINDER_QUEUED', input_source,
            jsonb_build_object('app', delivery_rows, 'email', reminder_rows), input_run_at
          );
        end if;
      end if;
    end if;

    update public.capacity_warning_states state
    set last_usage = usage_value,
        last_effective_limit = limit_value,
        last_projected_usage_7d = projected_value,
        last_evaluated_at = input_run_at,
        updated_at = input_run_at
    where state.restaurant_id = input_restaurant_id
      and state.capacity_type = input_capacity_type
      and state.warning_level = level_record.warning_level;
  end loop;

  return jsonb_build_object(
    'restaurant_id', input_restaurant_id,
    'capacity_type', input_capacity_type,
    'usage', usage_value,
    'effective_limit', limit_value,
    'remaining', remaining_value,
    'actual_level', actual_level,
    'projected_usage_7d', projected_value,
    'forecast_level', forecast_level,
    'forecast_basis_date', forecast_basis_date_value,
    'timezone', timezone_value
  );
end;
$function$;

create or replace function public.save_pending_restaurant_setup_internal(
  input_restaurant_id uuid,input_profile jsonb,input_activation jsonb,input_request_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare r public.restaurants%rowtype;
begin
  select * into r from public.restaurants where id=input_restaurant_id for update;
  if r.owner_id is distinct from auth.uid() or r.activation_status is distinct from 'pending_activation' then
    raise exception 'PENDING_SETUP_FORBIDDEN' using errcode='42501';
  end if;
  perform public.require_tenant_launch_country(r.id);
  -- Existing generator's false publication argument produces drafts only.
  perform public.generate_restaurant_legal_package(r.id,input_profile,false);
  update public.restaurants set
    name=coalesce(nullif(trim(input_activation->>'name'),''),name),
    restaurant_type=coalesce(nullif(input_activation->>'restaurant_type',''),restaurant_type),
    language=coalesce(nullif(input_activation->>'language',''),language),
    opening_hours=coalesce(input_activation->'opening_hours',opening_hours),
    special_days=coalesce(input_activation->'special_days',special_days),
    holidays=coalesce(input_activation->'holidays',holidays),
    onboarding_checklist=coalesce(input_activation->'onboarding_checklist','{}'::jsonb)
      || jsonb_build_object('setup_prepared',true)
    where id=r.id returning * into r;
  return jsonb_build_object('restaurant',to_jsonb(r),'activation_status','PENDING_ACTIVATION',
    'already_completed',false,'legal',public.get_restaurant_legal_setup(r.id));
end $$;
revoke all on function public.save_pending_restaurant_setup_internal(uuid,jsonb,jsonb,uuid)
from public,anon,authenticated,service_role;

create or replace function public.complete_restaurant_onboarding(input_restaurant_id uuid,input_profile jsonb,
  input_activation jsonb,input_publication_confirmed boolean default false,input_request_id uuid default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare code text; result jsonb; prior boolean; request uuid:=coalesce(input_request_id,gen_random_uuid());
begin
  if auth.uid() is null or public.is_restaurant_admin(input_restaurant_id) is distinct from true then
    raise exception 'ONBOARDING_NOT_AUTHORIZED' using errcode='42501';
  end if;
  perform 1 from public.restaurants where id=input_restaurant_id for update;
  if public.restaurant_activation_state_internal(input_restaurant_id)->>'status'='PENDING_ACTIVATION' then
    return public.save_pending_restaurant_setup_internal(input_restaurant_id,input_profile,input_activation,input_request_id);
  end if;
  prior:=exists(select 1 from public.country_launch_existing_businesses where restaurant_id=input_restaurant_id);
  if not prior then
    code:=public.require_tenant_launch_country(input_restaurant_id);
    perform public.require_launch_country(input_profile->>'country');
    insert into public.country_launch_creation_context(transaction_id,actor_id,country_code,purpose,restaurant_id)
      values(txid_current(),auth.uid(),code,'ONBOARDING',input_restaurant_id);
  end if;
  result:=public.complete_restaurant_onboarding_country_internal(input_restaurant_id,input_profile,input_activation,input_publication_confirmed,input_request_id);
  if not prior and not exists(select 1 from public.country_launch_audit where restaurant_id=input_restaurant_id and event='COUNTRY_ONBOARDING_ALLOWED') then
    insert into public.country_launch_audit(actor_id,actor_role,event,country_code,restaurant_id,request_id,reason,after_state)
    values(auth.uid(),'owner','COUNTRY_ONBOARDING_ALLOWED',code,input_restaurant_id,request,'Country-validated onboarding completion',
      jsonb_build_object('business_country',code,'legal_country',input_profile->>'country'));
    insert into public.country_launch_existing_businesses values(input_restaurant_id) on conflict do nothing;
  end if;
  delete from public.country_launch_creation_context where transaction_id=txid_current();
  return result;
end $$;


CREATE OR REPLACE FUNCTION public.get_today_restaurant_pin(input_restaurant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  pin_record public.restaurant_daily_pins%rowtype;
begin
  if public.restaurant_activation_state_internal(input_restaurant_id)->>'status'='PENDING_ACTIVATION' then
    perform public.require_restaurant_operational(input_restaurant_id,'get_today_restaurant_pin');
  end if;
  if not public.is_restaurant_member(input_restaurant_id) then
    raise exception 'Nicht berechtigt.';
  end if;

  pin_record := public.ensure_today_restaurant_pin(input_restaurant_id, null);

  return jsonb_build_object(
    'pin_code', pin_record.pin_code,
    'valid_until', pin_record.valid_until
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_restaurant_staff_invitation_for_resend(input_restaurant_id uuid, input_staff_member_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  staff_record public.staff_members%rowtype;
begin
  if public.restaurant_activation_state_internal(input_restaurant_id)->>'status'='PENDING_ACTIVATION' then
    perform public.require_restaurant_operational(input_restaurant_id,'get_restaurant_staff_invitation_for_resend');
  end if;
  if not public.can_manage_restaurant_staff(input_restaurant_id) then
    raise exception using errcode = '42501', message = 'STAFF_MANAGEMENT_NOT_AUTHORIZED';
  end if;
  select * into staff_record from public.staff_members
  where id = input_staff_member_id and restaurant_id = input_restaurant_id
  for update;
  if not found or staff_record.account_status <> 'invited' or staff_record.email is null then
    raise exception using errcode = 'P0002', message = 'STAFF_INVITATION_NOT_FOUND';
  end if;
  if staff_record.last_invited_at > now() - interval '60 seconds' then
    raise exception using errcode = 'P0001', message = 'STAFF_INVITE_RATE_LIMITED';
  end if;
  return jsonb_build_object(
    'success', true,
    'email', staff_record.email,
    'auth_user_id', staff_record.auth_user_id
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_customer_from_public_token(input_restaurant_id uuid, input_customer_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  resolved_customer_id uuid;
begin
  if public.restaurant_activation_state_internal(input_restaurant_id)->>'status'='PENDING_ACTIVATION' then
    perform public.require_restaurant_operational(input_restaurant_id,'resolve_customer_from_public_token');
  end if;
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
$function$;

CREATE OR REPLACE FUNCTION public.create_customer_points_credit_qr(input_restaurant_slug text, input_customer_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare restaurant_record public.restaurants%rowtype; customer_record public.customers%rowtype;
  mode_value text; raw_token text; raw_code text; expiry_value timestamptz := now() + interval '5 minutes';
begin
  if public.restaurant_activation_state_internal((select id from public.restaurants where slug=trim(input_restaurant_slug)))->>'status'='PENDING_ACTIVATION' then
    perform public.require_restaurant_operational((select id from public.restaurants where slug=trim(input_restaurant_slug)),'create_customer_points_credit_qr');
  end if;
  select * into restaurant_record from public.restaurants where slug = trim(input_restaurant_slug) and status = 'active';
  if restaurant_record.id is null then raise exception 'Restaurant wurde nicht gefunden.'; end if;
  select points_collection_mode into mode_value from public.loyalty_settings where restaurant_id = restaurant_record.id and active = true;
  if mode_value not in ('restaurant_controlled_only', 'both') then raise exception 'Dieser Sammelweg ist nicht aktiviert.'; end if;
  select c.* into customer_record from public.customer_qr_tokens t join public.customers c on c.id = t.customer_id
  where t.restaurant_id = restaurant_record.id and t.token_hash = public.hash_public_token(input_customer_token)
    and t.active = true and (t.expires_at is null or t.expires_at > now())
    and c.restaurant_id = restaurant_record.id and c.membership_status = 'active' limit 1;
  if customer_record.id is null then raise exception 'Kundenzugang ist nicht gültig.'; end if;
  if (select count(*) from public.customer_points_qr_references q where q.customer_id = customer_record.id
    and q.created_at > now() - interval '1 minute') >= 5 then raise exception 'Bitte warte kurz und versuche es erneut.'; end if;
  update public.customer_points_qr_references set revoked_at = now()
  where restaurant_id = restaurant_record.id and customer_id = customer_record.id
    and consumed_at is null and revoked_at is null and expires_at > now();
  raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  loop raw_code := public.generate_numeric_code(8);
    exit when not exists (select 1 from public.customer_points_qr_references q
      where q.manual_code_hash = public.hash_public_token(raw_code)); end loop;
  insert into public.customer_points_qr_references (restaurant_id, organization_id, branch_id, customer_id,
    token_hash, manual_code_hash, expires_at) values (restaurant_record.id, restaurant_record.organization_id,
    coalesce(customer_record.branch_id, restaurant_record.primary_branch_id, public.restaurant_primary_branch_id(restaurant_record.id)),
    customer_record.id, public.hash_public_token(raw_token), public.hash_public_token(raw_code), expiry_value);
  return jsonb_build_object('qr_token', raw_token, 'manual_code', raw_code, 'expires_at', expiry_value);
end $function$;

CREATE OR REPLACE FUNCTION public.get_current_portal_access()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with access as (
    select
      exists (
        select 1
        from public.customer_accounts ca
        where ca.auth_user_id = auth.uid()
          and ca.disabled_at is null
      ) as customer_access,
      exists (
        select 1
        from public.restaurant_members rm
        where rm.user_id = auth.uid()
          and rm.role in ('owner', 'admin', 'manager')
      ) as owner_access,
      exists (
        select 1
        from public.restaurant_members rm
        where rm.user_id = auth.uid()
          and not exists (select 1 from public.restaurants pending where pending.id=rm.restaurant_id and pending.activation_status='pending_activation')
          and (
            rm.role in ('owner', 'admin', 'manager')
            or (
              rm.role in ('staff', 'supervisor')
              and exists (
                select 1
                from public.staff_members sm
                where sm.restaurant_id = rm.restaurant_id
                  and sm.auth_user_id = auth.uid()
                  and sm.active = true
                  and sm.account_status = 'active'
                  and sm.archived_at is null
              )
            )
          )
      ) as staff_access,
      exists (
        select 1
        from public.platform_admins pa
        where pa.user_id = auth.uid()
          and pa.active = true
      ) as platform_access
  ), preferred_staff as (
    select r.slug
    from public.restaurant_members rm
    join public.restaurants r on r.id = rm.restaurant_id
    where rm.user_id = auth.uid()
      and r.status = 'active'
      and (
        rm.role in ('owner', 'admin', 'manager')
        or (
          rm.role in ('staff', 'supervisor')
          and exists (
            select 1
            from public.staff_members sm
            where sm.restaurant_id = rm.restaurant_id
              and sm.auth_user_id = auth.uid()
              and sm.active = true
              and sm.account_status = 'active'
              and sm.archived_at is null
          )
        )
      )
    order by r.created_at, r.id
    limit 1
  )
  select case
    when auth.uid() is null then
      jsonb_build_object(
        'authenticated', false,
        'customer_access', false,
        'owner_access', false,
        'staff_access', false,
        'platform_access', false
      )
    else jsonb_strip_nulls(jsonb_build_object(
      'authenticated', true,
      'customer_access', access.customer_access,
      'owner_access', access.owner_access,
      'staff_access', access.staff_access,
      'platform_access', access.platform_access,
      'preferred_staff_slug', preferred_staff.slug
    ))
  end
  from access
  left join preferred_staff on true;
$function$;
create or replace function public.generate_restaurant_legal_package(
  input_restaurant_id uuid,
  input_profile jsonb,
  input_reacceptance_required boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  restaurant_record public.restaurants%rowtype;
  loyalty_record public.loyalty_settings%rowtype;
  template_record public.legal_master_templates%rowtype;
  document_id_value uuid;
  version_id_value uuid;
  version_value text := to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
  profile_value jsonb;
  previous_profile jsonb := '{}'::jsonb;
  changed_profile_fields text[] := '{}'::text[];
  content_value jsonb;
  rendered_value text;
  hash_value text;
  is_trial_context boolean := false;
  pending_setup boolean := false;
  is_austria boolean := false;
  publication_status text;
  legal_ready_value boolean := false;
  selected_template_count integer := 0;
  field_name text;
begin
  if not public.is_restaurant_admin(input_restaurant_id) then
    raise exception using errcode = '42501', message = 'LEGAL_PROFILE_NOT_AUTHORIZED';
  end if;

  select * into restaurant_record
  from public.restaurants
  where id = input_restaurant_id
  for update;

  if restaurant_record.id is null then
    raise exception using errcode = 'P0001', message = 'LEGAL_PROFILE_RESTAURANT_NOT_FOUND';
  end if;

  pending_setup := restaurant_record.activation_status='pending_activation';

  select * into loyalty_record
  from public.loyalty_settings
  where restaurant_id = input_restaurant_id;

  select coalesce(to_jsonb(p), '{}'::jsonb)
  into previous_profile
  from public.organization_legal_profiles p
  where p.organization_id = restaurant_record.organization_id;

  previous_profile := coalesce(previous_profile, '{}'::jsonb);
  profile_value := coalesce(input_profile, '{}'::jsonb);

  select exists (
    select 1
    from public.branches b
    join public.branch_subscriptions s on s.branch_id = b.id
    where b.restaurant_id = input_restaurant_id
      and (
        s.plan_key = 'pilot'
        or (s.plan_key = 'BASIC' and s.status = 'trialing')
      )
  ) into is_trial_context;

  select count(distinct document_type)
  into selected_template_count
  from public.legal_master_templates
  where active
    and language = 'de-AT'
    and (pending_setup or is_trial_context or review_status = 'REVIEWED');

  if selected_template_count < 5 then
    raise exception using errcode = 'P0001', message = 'LEGAL_MASTER_PACKAGE_UNAVAILABLE';
  end if;

  profile_value := public.upsert_organization_legal_profile(
    input_restaurant_id,
    profile_value
  );

  is_austria := lower(trim(profile_value->>'country')) in (
    'at', 'austria', 'osterreich', 'oesterreich', 'österreich'
  );

  foreach field_name in array array[
    'company_name', 'legal_form', 'commercial_register_number', 'vat_id',
    'responsible_person', 'registered_address_source', 'street', 'postal_code',
    'city', 'country'
  ] loop
    if coalesce(previous_profile->>field_name, '') is distinct from coalesce(profile_value->>field_name, '') then
      changed_profile_fields := array_append(changed_profile_fields, field_name);
    end if;
  end loop;

  for template_record in
    select distinct on (document_type) *
    from public.legal_master_templates
    where active
      and language = 'de-AT'
      and (pending_setup or is_trial_context or review_status = 'REVIEWED')
    order by document_type, created_at desc
  loop
    publication_status := 'draft';

    content_value := template_record.content_template
      || jsonb_build_object(
        'program_operator_name', profile_value->>'company_name',
        'program_operator_legal_form', profile_value->>'legal_form',
        'program_operator_address', concat_ws(', ',
          profile_value->>'street',
          concat_ws(' ', profile_value->>'postal_code', profile_value->>'city'),
          profile_value->>'country'
        ),
        'company_registration_number', nullif(trim(profile_value->>'commercial_register_number'), ''),
        'vat_id', nullif(trim(profile_value->>'vat_id'), ''),
        'authorized_representative', nullif(trim(profile_value->>'responsible_person'), ''),
        'contact_email', profile_value->>'email',
        'complaint_contact', profile_value->>'complaint_contact',
        'effective_date', current_date::text,
        'version', template_record.version,
        'template_version', template_record.version,
        'template_review_status', template_record.review_status,
        'loyalty_mode', loyalty_record.loyalty_mode,
        'points_per_euro', loyalty_record.amount_per_point,
        'redemption_rate_percent', loyalty_record.redemption_return_rate,
        'cash_register_boundary',
          'WUXUAI dokumentiert Bonuspunkte und Einlösungsaktivitäten. Das Restaurant erfasst relevante Vorgänge im eigenen Kassensystem.'
      );

    rendered_value := case template_record.document_type
      when 'imprint' then concat_ws(E'\n',
        profile_value->>'company_name',
        profile_value->>'legal_form',
        profile_value->>'street',
        concat_ws(' ', profile_value->>'postal_code', profile_value->>'city'),
        profile_value->>'country',
        case when nullif(trim(profile_value->>'responsible_person'), '') is not null
          then 'Vertretungsberechtigt: ' || trim(profile_value->>'responsible_person') end,
        case when nullif(trim(profile_value->>'commercial_register_number'), '') is not null
          then (case when is_austria then 'Firmenbuchnummer: ' else 'Unternehmensregistrierungsnummer: ' end)
            || trim(profile_value->>'commercial_register_number') end,
        case when nullif(trim(profile_value->>'vat_id'), '') is not null
          then 'Umsatzsteuer-ID: ' || trim(profile_value->>'vat_id') end,
        'Kontakt: ' || (profile_value->>'email')
      )
      else template_record.rendered_text_template
    end;

    hash_value := encode(
      extensions.digest(convert_to(rendered_value || content_value::text, 'UTF8'), 'sha256'),
      'hex'
    );

    insert into public.legal_documents (restaurant_id, document_type, title)
    values (input_restaurant_id, template_record.document_type, template_record.title)
    on conflict (restaurant_id, document_type) do update set title = excluded.title
    returning id into document_id_value;

    if not exists (
      select 1
      from public.legal_document_versions
      where document_id = document_id_value
        and document_hash = hash_value
    ) then
      insert into public.legal_document_versions (
        document_id, restaurant_id, version, language, effective_date, content,
        rendered_text, document_hash, status, reacceptance_required, created_by,
        master_template_id
      ) values (
        document_id_value, input_restaurant_id, version_value, 'de-AT', current_date,
        content_value, rendered_value, hash_value, publication_status,
        input_reacceptance_required, auth.uid(), template_record.id
      )
      returning id into version_id_value;
    else
      select id into version_id_value
      from public.legal_document_versions
      where document_id = document_id_value
        and document_hash = hash_value
      order by created_at desc
      limit 1;
    end if;
  end loop;

  legal_ready_value := public.restaurant_legal_bundle_is_current(input_restaurant_id, current_date);

  update public.restaurants
  set legal_ready = case when pending_setup then false else legal_ready_value end,
      operational_ready = case when pending_setup then false else onboarding_status in ('ready', 'completed') end,
      security_ready = not coalesce(pending_setup,false),
      legal_transition_exempt = false,
      legal_update_required_at = now()
  where id = input_restaurant_id;

  perform public.write_audit_event(
    input_restaurant_id, null, 'admin', auth.uid(),
    'LEGAL_PACKAGE_GENERATED', 'success', 'restaurant_onboarding',
    'legal_documents', null, null,
    jsonb_build_object(
      'master_template_version', '2026.07-pilot-1',
      'publication_mode', case when pending_setup then 'pending_setup' when is_trial_context then 'trial' else 'production' end,
      'published', false,
      'reacceptance_required', input_reacceptance_required,
      'changed_profile_fields', to_jsonb(changed_profile_fields)
    )
  );

  return public.get_restaurant_legal_setup(input_restaurant_id);
end;
$$;
notify pgrst,'reload schema';
commit;
