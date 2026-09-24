-- 7C.6C3A: technical TEST inbox and blocked checkout audit only.
-- No subscription, trial, entitlement or commercial activation writer exists here.
begin;

create table public.billing_checkout_blocked_requests (
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  request_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  plan_key text not null check (plan_key in ('BASIC','PRO')),
  return_route text not null check (return_route = '/admin/settings/tarif-kapazitaet'),
  catalog_version integer not null,
  resolved_amount_minor integer not null check (resolved_amount_minor > 0),
  resolved_currency text not null check (resolved_currency = 'EUR'),
  resolved_price_id text,
  decision text not null default 'BLOCKED' check (decision = 'BLOCKED'),
  blocker_codes text[] not null check (cardinality(blocker_codes) > 0),
  created_at timestamptz not null default clock_timestamp(),
  primary key (restaurant_id, request_id)
);

create table public.billing_test_webhook_inbox (
  event_id text primary key check (event_id ~ '^evt_[A-Za-z0-9_]{8,120}$'),
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  environment text not null default 'TEST' check (environment = 'TEST'),
  provider_account text not null check (provider_account = 'LOCAL_FAKE_ACCOUNT'),
  livemode boolean not null default false check (livemode = false),
  event_type text not null check (length(event_type) between 1 and 100),
  event_created_at timestamptz not null,
  provider_subscription_id text check (provider_subscription_id ~ '^sub_[A-Za-z0-9_]{8,120}$'),
  tenant_ref uuid,
  processing_status text not null check (processing_status in
    ('ACTIVATION_BLOCKED','STALE_EVENT','ORDER_AMBIGUOUS','TENANT_CONFLICT','UNKNOWN_EVENT')),
  blocker_codes text[] not null default '{}',
  attempt_count integer not null default 1 check (attempt_count = 1),
  received_at timestamptz not null default clock_timestamp(),
  processed_at timestamptz not null default clock_timestamp(),
  check (processing_status <> 'ACTIVATION_BLOCKED' or cardinality(blocker_codes) > 0)
);
create index billing_test_webhook_inbox_order_idx
  on public.billing_test_webhook_inbox(provider_subscription_id,event_created_at desc)
  where provider_subscription_id is not null;

alter table public.billing_checkout_blocked_requests enable row level security;
alter table public.billing_test_webhook_inbox enable row level security;
revoke all on public.billing_checkout_blocked_requests,public.billing_test_webhook_inbox
  from public,anon,authenticated,service_role;
create trigger billing_checkout_blocked_immutable before update or delete or truncate
  on public.billing_checkout_blocked_requests for each statement
  execute function public.block_capacity_contract_mutation();
create trigger billing_test_webhook_inbox_immutable before update or delete or truncate
  on public.billing_test_webhook_inbox for each statement
  execute function public.block_capacity_contract_mutation();

-- Browser parameters are deliberately limited to plan, request UUID and a
-- fixed relative return route. The tenant and price are always DB-resolved.
create function public.request_blocked_test_checkout(
  input_plan_key text,input_request_id uuid,input_return_route text
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare
  actor uuid := auth.uid();
  r public.restaurants%rowtype;
  branch_record public.branches%rowtype;
  subscription_record public.branch_subscriptions%rowtype;
  catalog_record public.billing_catalog_internal%rowtype;
  binding_record public.billing_provider_binding_versions%rowtype;
  seller_record public.billing_seller_versions%rowtype;
  tax_record public.billing_tax_readiness_versions%rowtype;
  existing public.billing_checkout_blocked_requests%rowtype;
  blockers text[] := array[]::text[];
  binding_result jsonb;
begin
  if actor is null or auth.role() is distinct from 'authenticated' then
    raise exception 'CHECKOUT_OWNER_REQUIRED' using errcode='42501';
  end if;
  if input_plan_key not in ('BASIC','PRO') or input_plan_key is null
    or input_request_id is null or input_return_route is distinct from '/admin/settings/tarif-kapazitaet' then
    raise exception 'CHECKOUT_REQUEST_INVALID' using errcode='22023';
  end if;
  if (select count(*) from public.restaurants x join public.restaurant_members m
      on m.restaurant_id=x.id and m.user_id=actor and m.role='owner'
      where x.owner_id=actor) is distinct from 1 then
    raise exception 'CHECKOUT_OWNER_TENANT_UNAVAILABLE' using errcode='42501';
  end if;
  select x.* into r from public.restaurants x join public.restaurant_members m
    on m.restaurant_id=x.id and m.user_id=actor and m.role='owner'
    where x.owner_id=actor for update of x;
  if r.organization_id is null then
    raise exception 'CHECKOUT_TENANT_UNAVAILABLE' using errcode='42501';
  end if;
  select * into existing from public.billing_checkout_blocked_requests
    where restaurant_id=r.id and request_id=input_request_id;
  if existing.restaurant_id is not null then
    if existing.plan_key is distinct from input_plan_key or existing.return_route is distinct from input_return_route
      or existing.actor_id is distinct from actor then
      raise exception 'CHECKOUT_REQUEST_PAYLOAD_CONFLICT' using errcode='23505';
    end if;
    return jsonb_build_object('status','BLOCKED','blocker_code',existing.blocker_codes[1],
      'blockers',existing.blocker_codes,'request_id',input_request_id);
  end if;
  select * into branch_record from public.branches
    where id=r.primary_branch_id and restaurant_id=r.id and organization_id=r.organization_id;
  select * into subscription_record from public.branch_subscriptions
    where branch_id=branch_record.id and organization_id=r.organization_id;
  select * into catalog_record from public.billing_catalog_internal
    where product_code=input_plan_key and product_kind='PLAN' and active
      and valid_from<=statement_timestamp() order by version desc limit 1;
  if catalog_record.product_code is null or catalog_record.monthly_price_minor is null
    or catalog_record.currency is distinct from 'EUR' then
    raise exception 'CHECKOUT_CATALOG_UNAVAILABLE' using errcode='55000';
  end if;
  select * into seller_record from public.billing_seller_versions
    where valid_from<=statement_timestamp() order by version desc limit 1;
  select * into tax_record from public.billing_tax_readiness_versions
    where seller_version=seller_record.version and provider='STRIPE' and environment='TEST'
    order by revision desc limit 1;
  select * into binding_record from public.billing_provider_binding_versions
    where product_code=catalog_record.product_code and catalog_version=catalog_record.version
      and provider='STRIPE' and environment='TEST' and valid_from<=statement_timestamp()
    order by revision desc limit 1;
  if binding_record.binding_status is distinct from 'VERIFIED' then
    blockers:=array_append(blockers,'PROVIDER_NOT_VERIFIED');
  else
    begin
      binding_result:=public.resolve_test_billing_binding_internal(input_plan_key,'TEST',
        binding_record.price_id,catalog_record.monthly_price_minor::integer,catalog_record.currency,
        binding_record.lookup_key,false);
    exception when sqlstate '55000' then
      blockers:=array_append(blockers,'PROVIDER_BINDING_MISMATCH');
    end;
  end if;
  -- KYB verification is not implemented. A browser or fake adapter may not
  -- supply substitute evidence.
  blockers:=array_append(blockers,'KYB_NOT_VERIFIED');
  if branch_record.id is null or not exists(select 1 from public.country_launch_policy p
      where p.country_code=branch_record.country and p.enabled and p.market_status='live'
        and (public.country_launch_readiness_snapshot(p.country_code)->>'ready')::boolean) then
    blockers:=array_append(blockers,'COUNTRY_NOT_RELEASED');
  end if;
  if seller_record.readiness is distinct from 'LIVE_READY' then
    blockers:=array_append(blockers,'SELLER_NOT_VERIFIED');
  end if;
  if tax_record.readiness_status is distinct from 'VERIFIED' then
    blockers:=array_append(blockers,'TAX_NOT_READY');
  end if;
  if binding_result is null or (binding_result->>'commercial_activation_allowed')::boolean is distinct from true then
    blockers:=array_append(blockers,'COMMERCIAL_ACTIVATION_DISABLED');
  end if;
  if r.activation_status='pending_activation' or subscription_record.subscription_status='pending_activation' then
    blockers:=array_append(blockers,'PENDING_ACTIVATION');
  end if;
  if input_plan_key='PRO' and not exists(select 1 from public.commercial_plan_release_policy p
      where p.country_code=branch_record.country and p.plan_key='PRO' and p.release_state='RELEASED') then
    blockers:=array_append(blockers,'PRO_LOCKED');
  end if;
  -- This phase has no positive path, even if future evidence changes. A new
  -- reviewed migration is required before a provider can ever be called.
  blockers:=array_append(blockers,'ARCHITECTURE_ONLY');
  insert into public.billing_checkout_blocked_requests
    (restaurant_id,request_id,organization_id,actor_id,plan_key,return_route,catalog_version,
     resolved_amount_minor,resolved_currency,resolved_price_id,blocker_codes)
    values(r.id,input_request_id,r.organization_id,actor,input_plan_key,input_return_route,
      catalog_record.version,catalog_record.monthly_price_minor,catalog_record.currency,
      binding_record.price_id,blockers);
  return jsonb_build_object('status','BLOCKED','blocker_code',blockers[1],
    'blockers',blockers,'request_id',input_request_id);
end $function$;
revoke all on function public.request_blocked_test_checkout(text,uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function public.request_blocked_test_checkout(text,uuid,text) to authenticated;

-- Called only by the local raw-body signature-verifying server endpoint.
-- This is a technical inbox, never a subscription/entitlement writer.
create function public.record_local_fake_billing_webhook(
  input_event_id text,input_payload_sha256 text,input_event_type text,
  input_event_created_at timestamptz,input_provider_subscription_id text,
  input_tenant_ref uuid,input_account text,input_livemode boolean
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare
  existing public.billing_test_webhook_inbox%rowtype;
  latest public.billing_test_webhook_inbox%rowtype;
  seller_record public.billing_seller_versions%rowtype;
  tax_record public.billing_tax_readiness_versions%rowtype;
  country_ready boolean := false;
  outcome text;
  blockers text[] := array['KYB_NOT_VERIFIED'];
begin
  if auth.role() is distinct from 'service_role' or input_account is distinct from 'LOCAL_FAKE_ACCOUNT'
    or input_livemode is distinct from false then
    raise exception 'WEBHOOK_TEST_ENVIRONMENT_REQUIRED' using errcode='42501';
  end if;
  if input_event_id is null or input_event_id !~ '^evt_[A-Za-z0-9_]{8,120}$'
    or input_payload_sha256 is null or input_payload_sha256 !~ '^[0-9a-f]{64}$'
    or input_event_type is null or length(input_event_type) not between 1 and 100
    or input_event_created_at is null or not isfinite(input_event_created_at)
    or (input_provider_subscription_id is not null
      and input_provider_subscription_id !~ '^sub_[A-Za-z0-9_]{8,120}$') then
    raise exception 'WEBHOOK_EVENT_INVALID' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('billing:event:'||input_event_id,0));
  select * into existing from public.billing_test_webhook_inbox where event_id=input_event_id;
  if existing.event_id is not null then
    if existing.payload_sha256 is distinct from input_payload_sha256 then
      raise exception 'WEBHOOK_EVENT_HASH_CONFLICT' using errcode='23505';
    end if;
    return jsonb_build_object('event_id',input_event_id,'status',existing.processing_status,'replay',true);
  end if;
  if input_provider_subscription_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('billing:subscription:'||input_provider_subscription_id,0));
    select * into latest from public.billing_test_webhook_inbox
      where provider_subscription_id=input_provider_subscription_id
      order by event_created_at desc,event_id desc limit 1;
  end if;
  if input_tenant_ref is not null then
    select p.enabled and p.market_status='live'
      and (public.country_launch_readiness_snapshot(p.country_code)->>'ready')::boolean
      into country_ready
    from public.restaurants r join public.branches b
      on b.id=r.primary_branch_id and b.restaurant_id=r.id and b.organization_id=r.organization_id
    join public.country_launch_policy p on p.country_code=b.country
    where r.id=input_tenant_ref;
  end if;
  if country_ready is distinct from true then blockers:=array_append(blockers,'COUNTRY_NOT_RELEASED'); end if;
  select * into seller_record from public.billing_seller_versions
    where valid_from<=statement_timestamp() order by version desc limit 1;
  if seller_record.readiness is distinct from 'LIVE_READY' then
    blockers:=array_append(blockers,'SELLER_NOT_VERIFIED');
  end if;
  select * into tax_record from public.billing_tax_readiness_versions
    where seller_version=seller_record.version and provider='STRIPE' and environment='TEST'
    order by revision desc limit 1;
  if tax_record.readiness_status is distinct from 'VERIFIED' then
    blockers:=array_append(blockers,'TAX_NOT_READY');
  end if;
  -- Migration 166 exposes commercial_activation_allowed=false. This inbox
  -- has no activation writer even if readiness evidence changes later.
  blockers:=array_append(blockers,'COMMERCIAL_ACTIVATION_DISABLED');
  blockers:=array_append(blockers,'ARCHITECTURE_ONLY');
  if input_event_type not in ('checkout.session.completed','customer.subscription.created',
      'customer.subscription.updated','customer.subscription.deleted','invoice.paid','invoice.payment_failed') then
    outcome:='UNKNOWN_EVENT';
  elsif latest.event_id is not null and latest.tenant_ref is not null
    and input_tenant_ref is distinct from latest.tenant_ref then
    outcome:='TENANT_CONFLICT';
  elsif latest.event_id is not null and input_event_created_at < latest.event_created_at then
    outcome:='STALE_EVENT';
  elsif latest.event_id is not null and input_event_created_at = latest.event_created_at then
    outcome:='ORDER_AMBIGUOUS';
  else
    outcome:='ACTIVATION_BLOCKED';
  end if;
  insert into public.billing_test_webhook_inbox
    (event_id,payload_sha256,event_type,event_created_at,provider_subscription_id,tenant_ref,
     provider_account,livemode,processing_status,blocker_codes)
    values(input_event_id,input_payload_sha256,input_event_type,input_event_created_at,
      input_provider_subscription_id,input_tenant_ref,input_account,false,outcome,
      case when outcome='ACTIVATION_BLOCKED' then blockers else '{}'::text[] end);
  return jsonb_build_object('event_id',input_event_id,'status',outcome,'replay',false,
    'blockers',case when outcome='ACTIVATION_BLOCKED' then blockers else '{}'::text[] end);
end $function$;
revoke all on function public.record_local_fake_billing_webhook(text,text,text,timestamptz,text,uuid,text,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.record_local_fake_billing_webhook(text,text,text,timestamptz,text,uuid,text,boolean)
  to service_role;

notify pgrst,'reload schema';
commit;
