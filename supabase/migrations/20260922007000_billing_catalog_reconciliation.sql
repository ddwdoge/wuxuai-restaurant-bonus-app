-- Phase 7C.6B3. Local catalog preparation only: no provider activation path.
-- Prices/capacity reference the existing immutable 7C.2 catalog, never copies.
create table if not exists public.billing_product_versions (
  product_code text not null,
  version integer not null check (version > 0),
  product_kind text not null check (product_kind in ('PLAN','ADD_ON')),
  plan_key text,
  addon_key text,
  capacity_version integer not null,
  billing_interval text not null default 'MONTH' check (billing_interval = 'MONTH'),
  trial_calendar_months integer not null,
  active boolean not null default true,
  valid_from timestamptz not null check (isfinite(valid_from)),
  created_at timestamptz not null default statement_timestamp(),
  revision_reason text not null check (length(trim(revision_reason)) >= 10),
  created_by text not null default session_user,
  primary key (product_code, version),
  foreign key (plan_key, capacity_version) references public.commercial_capacity_plan_versions(plan_key, version),
  foreign key (addon_key, capacity_version) references public.commercial_capacity_addon_versions(addon_key, version),
  check ((product_kind='PLAN' and plan_key in ('BASIC','PRO') and plan_key is not null and addon_key is null
    and product_code=plan_key and trial_calendar_months=1)
    or (product_kind='ADD_ON' and addon_key in ('OFFER_CAPACITY','CUSTOMER_CAPACITY') and addon_key is not null
    and plan_key is null and product_code=addon_key and trial_calendar_months=0))
);

insert into public.billing_product_versions
  (product_code,version,product_kind,plan_key,addon_key,capacity_version,trial_calendar_months,valid_from,revision_reason)
values
 ('BASIC',1,'PLAN','BASIC',null,1,1,'2026-09-01Z','Founder billing catalog reconciliation'),
 ('PRO',1,'PLAN','PRO',null,1,1,'2026-09-01Z','Founder billing catalog reconciliation'),
 ('OFFER_CAPACITY',1,'ADD_ON',null,'OFFER_CAPACITY',1,0,'2026-09-01Z','Founder billing catalog reconciliation'),
 ('CUSTOMER_CAPACITY',1,'ADD_ON',null,'CUSTOMER_CAPACITY',1,0,'2026-09-01Z','Founder billing catalog reconciliation')
on conflict do nothing;

create table if not exists public.billing_seller_versions (
  version integer primary key check (version > 0),
  seller_name text not null,
  ip_licensor_name text not null,
  readiness text not null check (readiness in ('PLANNED','TEST_READY','LIVE_READY')),
  company_verification_reference text,
  tax_verification_reference text,
  bank_verification_reference text,
  stripe_verification_reference text,
  valid_from timestamptz not null check (isfinite(valid_from)),
  created_at timestamptz not null default statement_timestamp(),
  created_by text not null default session_user,
  revision_reason text not null check (length(trim(revision_reason)) >= 10),
  check (readiness <> 'LIVE_READY' or (
    nullif(trim(company_verification_reference),'') is not null and
    nullif(trim(tax_verification_reference),'') is not null and
    nullif(trim(bank_verification_reference),'') is not null and
    nullif(trim(stripe_verification_reference),'') is not null))
);
insert into public.billing_seller_versions
 (version,seller_name,ip_licensor_name,readiness,valid_from,revision_reason)
values (1,'WUXUAI Digital & Trading GmbH','WU & XU Group GmbH','PLANNED','2026-09-01Z',
 'Founder: planned company, no verified seller or live billing') on conflict do nothing;

create table if not exists public.billing_provider_binding_versions (
  product_code text not null,
  catalog_version integer not null,
  provider text not null check (provider='STRIPE'),
  environment text not null check (environment in ('TEST','LIVE')),
  revision integer not null check (revision > 0),
  product_id text,
  price_id text,
  binding_status text not null check (binding_status in ('UNBOUND','VERIFIED','RETIRED')),
  verification_reference text,
  valid_from timestamptz not null check (isfinite(valid_from)),
  created_at timestamptz not null default statement_timestamp(),
  created_by text not null default session_user,
  revision_reason text not null check (length(trim(revision_reason)) >= 10),
  primary key (product_code,catalog_version,provider,environment,revision),
  foreign key (product_code,catalog_version) references public.billing_product_versions(product_code,version),
  check ((binding_status='UNBOUND' and product_id is null and price_id is null and verification_reference is null)
    or (binding_status in ('VERIFIED','RETIRED') and product_id is not null and price_id is not null
      and product_id ~ '^prod_[a-zA-Z0-9]+$' and price_id ~ '^price_[a-zA-Z0-9]+$'
      and nullif(trim(verification_reference),'') is not null))
);
insert into public.billing_provider_binding_versions
 (product_code,catalog_version,provider,environment,revision,binding_status,valid_from,revision_reason)
select product_code,version,'STRIPE',environment,1,'UNBOUND','2026-09-01Z',
 'Unbound foundation only; no external provider configured'
from public.billing_product_versions cross join (values ('TEST'),('LIVE')) e(environment)
where version=1 on conflict do nothing;

-- Future verified activation may claim once; this phase exposes NO claim writer.
-- A plan/environment switch cannot bypass either unique company/restaurant key.
create table if not exists public.billing_trial_claims (
  organization_id uuid primary key references public.organizations(id),
  restaurant_id uuid not null unique references public.restaurants(id),
  provider_event_reference text not null unique,
  claimed_at timestamptz not null default statement_timestamp(),
  created_by text not null default session_user
);

do $ddl$ declare relation text; begin
 foreach relation in array array['billing_product_versions','billing_seller_versions',
   'billing_provider_binding_versions','billing_trial_claims'] loop
  execute format('alter table public.%I enable row level security',relation);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',relation);
  execute format('drop trigger if exists billing_immutable on public.%I',relation);
  execute format('create trigger billing_immutable before update or delete or truncate on public.%I
    for each statement execute function public.block_capacity_contract_mutation()',relation);
 end loop;
end $ddl$;

-- Private catalog projection: existing price and capacity revisions stay authoritative.
create or replace view public.billing_catalog_internal as
select b.product_code,b.version,b.product_kind,b.plan_key,b.addon_key,b.capacity_version,
 b.billing_interval,b.trial_calendar_months,b.active,b.valid_from,
 coalesce(p.monthly_price_minor,a.monthly_price_minor) monthly_price_minor,
 coalesce(p.currency,a.currency) currency,coalesce(p.tax_treatment,a.tax_treatment) tax_treatment,
 p.base_offer_limit,p.base_customer_limit,a.capacity_per_unit,a.metric_key
from public.billing_product_versions b
left join public.commercial_capacity_plan_versions p on p.plan_key=b.plan_key and p.version=b.capacity_version
left join public.commercial_capacity_addon_versions a on a.addon_key=b.addon_key and a.version=b.capacity_version;
revoke all on public.billing_catalog_internal from public,anon,authenticated,service_role;

create or replace function public.billing_trial_end_internal(input_activation timestamptz)
returns timestamptz language plpgsql immutable
set search_path=pg_catalog,public,pg_temp as $function$
begin
 if input_activation is null or not isfinite(input_activation) then
  raise exception 'BILLING_ACTIVATION_TIME_INVALID' using errcode='22023';
 end if;
 -- UTC is deterministic across session timezone/DST; PostgreSQL clamps month ends.
 return ((input_activation at time zone 'UTC') + interval '1 month') at time zone 'UTC';
end $function$;
revoke execute on function public.billing_trial_end_internal(timestamptz) from public,anon,authenticated,service_role;

create or replace function public.resolve_billing_product_internal(input_code text,input_environment text)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare p public.billing_catalog_internal%rowtype; b public.billing_provider_binding_versions%rowtype;
 s public.billing_seller_versions%rowtype; ready boolean;
begin
 if input_environment is null or input_environment not in ('TEST','LIVE') then
  raise exception 'BILLING_ENVIRONMENT_INVALID' using errcode='22023';
 end if;
 select * into p from public.billing_catalog_internal where product_code=input_code and valid_from<=statement_timestamp()
 order by version desc limit 1;
 if p.product_code is null or not p.active then
  raise exception 'BILLING_PRODUCT_UNAVAILABLE' using errcode='55000';
 end if;
 select * into s from public.billing_seller_versions where valid_from<=statement_timestamp() order by version desc limit 1;
 select * into b from public.billing_provider_binding_versions where product_code=p.product_code and catalog_version=p.version
 and provider='STRIPE' and environment=input_environment and valid_from<=statement_timestamp() order by revision desc limit 1;
 ready := coalesce(b.binding_status='VERIFIED' and b.product_id is not null and b.price_id is not null
   and (s.readiness='LIVE_READY' or (input_environment='TEST' and s.readiness='TEST_READY')),false);
 return to_jsonb(p) || jsonb_build_object('provider','STRIPE','environment',input_environment,
   'binding_status',coalesce(b.binding_status,'UNBOUND'),'provider_ready',ready,
   'seller_readiness',coalesce(s.readiness,'PLANNED'),'seller_name',s.seller_name,
   'ip_licensor_name',s.ip_licensor_name,'activation_implemented',false,'purchase_allowed',false,
   'trial_policy',jsonb_build_object('calendar_months',p.trial_calendar_months,
     'trigger','VERIFIED_PROVIDER_ACTIVATION','once_per_company',true,'starts_at_registration',false));
end $function$;
revoke execute on function public.resolve_billing_product_internal(text,text) from public,anon,authenticated,service_role;

create or replace function public.get_restaurant_billing_catalog(input_restaurant_id uuid,input_environment text default 'TEST')
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare r public.restaurants%rowtype; capacity jsonb; products jsonb; trial_used boolean;
begin
 select * into r from public.restaurants where id=input_restaurant_id;
 if auth.uid() is null or r.id is null or not (public.is_platform_admin() or
   (r.owner_id=auth.uid() and exists(select 1 from public.restaurant_members m
    where m.restaurant_id=r.id and m.user_id=auth.uid() and m.role='owner'))) then
  raise exception 'BILLING_READ_FORBIDDEN' using errcode='42501';
 end if;
 capacity := public.get_restaurant_capacity(input_restaurant_id);
 select jsonb_agg(public.resolve_billing_product_internal(code,input_environment) order by code) into products
 from unnest(array['BASIC','PRO','OFFER_CAPACITY','CUSTOMER_CAPACITY']) code;
 trial_used := exists(select 1 from public.billing_trial_claims c
   where c.organization_id=r.organization_id or c.restaurant_id=r.id)
   or exists(select 1 from public.branch_subscriptions s
     where s.organization_id=r.organization_id and (s.trial_started_at is not null or s.trial_ends_at is not null));
 return jsonb_build_object('catalog_version',1,'capacity',capacity,'products',products,
   'customer_window_days',365,'trial_previously_used',trial_used,'trial_start_allowed',false,
   'provider_ready',false,'activation_implemented',false);
end $function$;
revoke execute on function public.get_restaurant_billing_catalog(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.get_restaurant_billing_catalog(uuid,text) to authenticated;

-- Compatibility projection for the existing entitlement response; notification
-- policy and country/subscription/grant decisions remain unchanged below.
create or replace view public.billing_plan_presentation_internal as
select p.plan_key,(p.monthly_price_minor / 100)::integer monthly_price_eur_ex_vat,
 p.plan_key='BASIC' publicly_available,p.base_offer_limit::integer offer_limit,
 p.plan_key='PRO' offer_notifications,p.plan_key='PRO' reward_notifications,
 null::text stripe_price_lookup_key
from public.billing_catalog_internal p
where p.product_kind='PLAN' and p.active and p.valid_from<=statement_timestamp()
 and p.version=(select max(v.version) from public.billing_product_versions v
   where v.product_code=p.product_code and v.valid_from<=statement_timestamp());
revoke all on public.billing_plan_presentation_internal from public,anon,authenticated,service_role;
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
  basic_plan_record public.billing_plan_presentation_internal%rowtype;
  effective_plan_record public.billing_plan_presentation_internal%rowtype;
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
  from public.billing_plan_presentation_internal
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
  from public.billing_plan_presentation_internal
  where plan_key = resolved_plan_key;

  if effective_plan_record.plan_key is null then
    raise exception 'BILLING_PLAN_UNAVAILABLE' using errcode='55000';
  end if;
  -- Historical offer overrides remain stored evidence, never unlimited authority.
  effective_offer_limit := effective_plan_record.offer_limit;
  effective_offer_unlimited := false;

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
      'offer_limit_unlimited', false,
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
