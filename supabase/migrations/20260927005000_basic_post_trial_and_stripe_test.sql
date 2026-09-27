-- BASIC V1 only: explicit paid-offer acceptance, TEST-only Stripe lifecycle,
-- and a non-destructive 60-calendar-day redemption grace after trial expiry.
-- No PRO, LIVE, automatic conversion, expiry, deletion or forfeiture contract.
begin;
select pg_advisory_xact_lock(hashtextextended('migration:20260927005000',0));

create table public.basic_paid_offer_acceptances (
  id uuid primary key default extensions.gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  subscription_id uuid not null references public.branch_subscriptions(id) on delete restrict,
  trial_decision_id uuid not null unique references public.manual_basic_trial_decisions(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  catalog_version integer not null,
  amount_minor integer not null check (amount_minor=5900),
  currency text not null check (currency='EUR'),
  billing_interval text not null check (billing_interval='MONTH'),
  terms_version text not null check (length(trim(terms_version)) between 8 and 80),
  request_id uuid not null unique,
  correlation_id uuid not null,
  accepted_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp(),
  unique (restaurant_id,trial_decision_id)
);

create table public.basic_post_trial_redemption_grace (
  trial_decision_id uuid primary key references public.manual_basic_trial_decisions(id) on delete restrict,
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  contract_status text not null default 'REDEMPTION_ONLY_60_CALENDAR_DAYS'
    check (contract_status='REDEMPTION_ONLY_60_CALENDAR_DAYS'),
  forfeiture_authorized boolean not null default false check (forfeiture_authorized=false),
  deletion_authorized boolean not null default false check (deletion_authorized=false),
  created_at timestamptz not null default clock_timestamp(),
  check (ends_at=starts_at+interval '60 days'),
  unique (restaurant_id)
);

insert into public.basic_post_trial_redemption_grace(
  trial_decision_id,restaurant_id,organization_id,branch_id,starts_at,ends_at
)
select d.id,d.restaurant_id,d.organization_id,d.branch_id,d.ends_at,d.ends_at+interval '60 days'
from public.manual_basic_trial_decisions d
on conflict do nothing;

create table public.basic_test_checkout_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  acceptance_id uuid not null references public.basic_paid_offer_acceptances(id) on delete restrict,
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  subscription_id uuid not null references public.branch_subscriptions(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  request_id uuid not null,
  return_route text not null check (return_route='/admin/settings/konto-testphase'),
  payload_sha256 text not null check (payload_sha256~'^[0-9a-f]{64}$'),
  provider text not null default 'STRIPE' check (provider='STRIPE'),
  environment text not null default 'TEST' check (environment='TEST'),
  livemode boolean not null default false check (livemode=false),
  price_id text not null check (price_id~'^price_[A-Za-z0-9_]{8,120}$'),
  provider_session_id text check (provider_session_id~'^cs_test_[A-Za-z0-9_]{8,160}$'),
  provider_customer_id text check (provider_customer_id~'^cus_[A-Za-z0-9_]{8,160}$'),
  provider_subscription_id text check (provider_subscription_id~'^sub_[A-Za-z0-9_]{8,160}$'),
  status text not null default 'PREPARED'
    check (status in ('PREPARED','SESSION_CREATED','COMPLETED','FAILED','CANCELLED')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (restaurant_id,request_id),
  unique (provider_session_id),
  unique (provider_subscription_id)
);

create table public.basic_stripe_test_event_inbox (
  event_id text primary key check (event_id~'^evt_[A-Za-z0-9_]{8,160}$'),
  payload_sha256 text not null check (payload_sha256~'^[0-9a-f]{64}$'),
  event_type text not null check (event_type in ('checkout.session.completed',
    'customer.subscription.created','customer.subscription.updated',
    'customer.subscription.deleted','invoice.paid','invoice.payment_failed')),
  event_created_at timestamptz not null,
  provider_session_id text,
  provider_customer_id text,
  provider_subscription_id text,
  restaurant_id uuid,
  acceptance_id uuid,
  provider_status text,
  period_start timestamptz,
  period_end timestamptz,
  processing_status text not null check (processing_status in
    ('PROCESSED','REPLAY','STALE','UNMATCHED','REJECTED')),
  result_code text not null,
  request_id uuid,
  correlation_id uuid,
  received_at timestamptz not null default clock_timestamp(),
  processed_at timestamptz not null default clock_timestamp(),
  livemode boolean not null check (livemode=false),
  environment text not null check (environment='TEST')
);

create table public.basic_test_billing_write_context (
  transaction_id bigint primary key,
  subscription_id uuid not null,
  event_id text not null,
  action text not null check (action in ('CHECKOUT_BOUND','PAYMENT_CONFIRMED','PAYMENT_FAILED','CANCELLED'))
);

alter table public.basic_paid_offer_acceptances enable row level security;
alter table public.basic_post_trial_redemption_grace enable row level security;
alter table public.basic_test_checkout_requests enable row level security;
alter table public.basic_stripe_test_event_inbox enable row level security;
alter table public.basic_test_billing_write_context enable row level security;
revoke all on public.basic_paid_offer_acceptances,public.basic_post_trial_redemption_grace,
  public.basic_test_checkout_requests,public.basic_stripe_test_event_inbox,
  public.basic_test_billing_write_context from public,anon,authenticated,service_role;

create function public.block_basic_billing_evidence_mutation()
returns trigger language plpgsql set search_path=pg_catalog,pg_temp as $$
begin raise exception 'BASIC_BILLING_EVIDENCE_IMMUTABLE' using errcode='42501'; end $$;
revoke all on function public.block_basic_billing_evidence_mutation() from public,anon,authenticated,service_role;
create trigger basic_acceptance_immutable before update or delete or truncate
  on public.basic_paid_offer_acceptances for each statement execute function public.block_basic_billing_evidence_mutation();
create trigger basic_grace_immutable before update or delete or truncate
  on public.basic_post_trial_redemption_grace for each statement execute function public.block_basic_billing_evidence_mutation();
create trigger basic_event_inbox_immutable before update or delete or truncate
  on public.basic_stripe_test_event_inbox for each statement execute function public.block_basic_billing_evidence_mutation();

create function public.accept_basic_paid_offer(
  input_restaurant_id uuid,input_terms_version text,input_confirmation text,
  input_request_id uuid,input_correlation_id uuid
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,extensions,pg_temp as $function$
declare actor uuid:=auth.uid(); r public.restaurants%rowtype; b public.branches%rowtype;
  s public.branch_subscriptions%rowtype; d public.manual_basic_trial_decisions%rowtype;
  p public.billing_catalog_internal%rowtype; existing public.basic_paid_offer_acceptances%rowtype;
  accepted public.basic_paid_offer_acceptances%rowtype;
begin
  if actor is null or auth.role() is distinct from 'authenticated' then
    raise exception 'BASIC_OFFER_OWNER_REQUIRED' using errcode='42501';
  end if;
  if input_restaurant_id is null or input_request_id is null or input_correlation_id is null
    or length(trim(coalesce(input_terms_version,''))) not between 8 and 80
    or input_confirmation is distinct from 'BASIC KOSTENPFLICHTIG BESTELLEN' then
    raise exception 'BASIC_OFFER_ACCEPTANCE_INVALID' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('basic-offer:'||input_restaurant_id::text,0));
  select restaurant.* into r from public.restaurants restaurant
    join public.restaurant_members m on m.restaurant_id=restaurant.id
      and m.user_id=actor and m.role='owner'
    where restaurant.id=input_restaurant_id and restaurant.owner_id=actor for update of restaurant;
  if r.id is null then raise exception 'BASIC_OFFER_OWNER_REQUIRED' using errcode='42501'; end if;
  select * into b from public.branches where id=r.primary_branch_id and restaurant_id=r.id
    and organization_id=r.organization_id;
  select * into s from public.branch_subscriptions where branch_id=b.id
    and organization_id=r.organization_id for update;
  select * into d from public.manual_basic_trial_decisions where restaurant_id=r.id;
  if d.id is null or s.id is null or s.plan_key<>'BASIC' or s.subscription_status<>'trialing'
    or s.payment_status<>'not_required' or d.ends_at>statement_timestamp()
    or s.stripe_customer_id is not null or s.stripe_subscription_id is not null then
    raise exception 'BASIC_OFFER_TRIAL_ENDED_REQUIRED' using errcode='42501';
  end if;
  select * into p from public.billing_catalog_internal where product_code='BASIC'
    and product_kind='PLAN' and active and valid_from<=statement_timestamp()
    order by version desc limit 1;
  if p.product_code is null or p.monthly_price_minor<>5900 or p.currency<>'EUR' then
    raise exception 'BASIC_OFFER_CATALOG_INVALID' using errcode='55000';
  end if;
  select * into existing from public.basic_paid_offer_acceptances
    where request_id=input_request_id or restaurant_id=r.id order by accepted_at limit 1;
  if existing.id is not null then
    if existing.request_id=input_request_id and existing.restaurant_id=r.id
      and existing.actor_id=actor and existing.terms_version=trim(input_terms_version) then
      return jsonb_build_object('acceptance_id',existing.id,'status','ACCEPTED','idempotent',true);
    end if;
    raise exception 'BASIC_OFFER_ALREADY_ACCEPTED' using errcode='23505';
  end if;
  insert into public.basic_paid_offer_acceptances(restaurant_id,organization_id,branch_id,
    subscription_id,trial_decision_id,actor_id,catalog_version,amount_minor,currency,
    billing_interval,terms_version,request_id,correlation_id)
  values(r.id,r.organization_id,b.id,s.id,d.id,actor,p.version,p.monthly_price_minor,p.currency,
    'MONTH',trim(input_terms_version),input_request_id,input_correlation_id)
  returning * into accepted;
  insert into public.audit_log(restaurant_id,actor_type,actor_id,action,target_table,target_id,metadata)
  values(r.id,'admin',actor,'BASIC_PAID_OFFER_ACCEPTED','basic_paid_offer_acceptances',accepted.id,
    jsonb_build_object('terms_version',accepted.terms_version,'catalog_version',accepted.catalog_version,
      'amount_minor',accepted.amount_minor,'currency',accepted.currency,
      'request_id',accepted.request_id,'correlation_id',accepted.correlation_id));
  return jsonb_build_object('acceptance_id',accepted.id,'status','ACCEPTED','idempotent',false,
    'amount_minor',accepted.amount_minor,'currency',accepted.currency,'billing_interval','MONTH');
end $function$;
revoke all on function public.accept_basic_paid_offer(uuid,text,text,uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.accept_basic_paid_offer(uuid,text,text,uuid,uuid) to authenticated;

create function public.prepare_basic_test_checkout(
  input_acceptance_id uuid,input_request_id uuid,input_return_route text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,extensions,pg_temp as $function$
declare actor uuid:=auth.uid(); a public.basic_paid_offer_acceptances%rowtype;
  existing public.basic_test_checkout_requests%rowtype;
  binding public.billing_provider_binding_versions%rowtype; marker public.platform_test_tenant_registry%rowtype;
  request_hash text; created public.basic_test_checkout_requests%rowtype;
begin
  if actor is null or auth.role() is distinct from 'authenticated' or input_acceptance_id is null
    or input_request_id is null or input_return_route is distinct from '/admin/settings/konto-testphase' then
    raise exception 'BASIC_TEST_CHECKOUT_INVALID' using errcode='42501';
  end if;
  select acceptance.* into a from public.basic_paid_offer_acceptances acceptance
    join public.restaurants r on r.id=acceptance.restaurant_id and r.owner_id=actor
    join public.restaurant_members m on m.restaurant_id=r.id and m.user_id=actor and m.role='owner'
    where acceptance.id=input_acceptance_id;
  if a.id is null then raise exception 'BASIC_TEST_CHECKOUT_OWNER_REQUIRED' using errcode='42501'; end if;
  select * into marker from public.platform_test_tenant_registry
    where restaurant_id=a.restaurant_id and deleted_at is null;
  if marker.restaurant_id is null then
    raise exception 'BASIC_TEST_CHECKOUT_TEST_ONLY_REQUIRED' using errcode='42501';
  end if;
  select * into binding from public.billing_provider_binding_versions
    where product_code='BASIC' and catalog_version=a.catalog_version and provider='STRIPE'
      and environment='TEST' and binding_status='VERIFIED' and price_livemode=false
      and price_currency='EUR' and price_interval='MONTH' and price_amount_minor=a.amount_minor
      and price_usage_type='licensed' and price_billing_scheme='per_unit'
      and valid_from<=statement_timestamp() order by revision desc limit 1;
  if binding.price_id is null then raise exception 'BASIC_TEST_BINDING_UNAVAILABLE' using errcode='55000'; end if;
  request_hash:=encode(extensions.digest(a.id::text||':'||input_return_route,'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('basic-test-checkout:'||a.restaurant_id::text||':'||input_request_id::text,0));
  select * into existing from public.basic_test_checkout_requests
    where restaurant_id=a.restaurant_id and request_id=input_request_id;
  if existing.id is not null then
    if existing.acceptance_id<>a.id or existing.actor_id<>actor or existing.payload_sha256<>request_hash then
      raise exception 'BASIC_TEST_CHECKOUT_PAYLOAD_CONFLICT' using errcode='23505';
    end if;
    return jsonb_build_object('checkout_request_id',existing.id,'status',existing.status,
      'price_id',existing.price_id,'restaurant_id',existing.restaurant_id,
      'acceptance_id',existing.acceptance_id,'correlation_id',a.correlation_id,'idempotent',true);
  end if;
  insert into public.basic_test_checkout_requests(acceptance_id,restaurant_id,subscription_id,
    actor_id,request_id,return_route,payload_sha256,price_id)
  values(a.id,a.restaurant_id,a.subscription_id,actor,input_request_id,input_return_route,
    request_hash,binding.price_id) returning * into created;
  return jsonb_build_object('checkout_request_id',created.id,'status','PREPARED',
    'price_id',created.price_id,'restaurant_id',created.restaurant_id,
    'acceptance_id',created.acceptance_id,'correlation_id',a.correlation_id,'idempotent',false);
end $function$;
revoke all on function public.prepare_basic_test_checkout(uuid,uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function public.prepare_basic_test_checkout(uuid,uuid,text) to authenticated;

create function public.complete_basic_test_checkout(
  input_checkout_request_id uuid,input_provider_session_id text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare c public.basic_test_checkout_requests%rowtype;
begin
  if auth.role() is distinct from 'service_role' or input_checkout_request_id is null
    or input_provider_session_id!~'^cs_test_[A-Za-z0-9_]{8,160}$' then
    raise exception 'BASIC_TEST_CHECKOUT_SERVICE_REQUIRED' using errcode='42501';
  end if;
  select * into c from public.basic_test_checkout_requests where id=input_checkout_request_id for update;
  if c.id is null then raise exception 'BASIC_TEST_CHECKOUT_NOT_FOUND' using errcode='P0002'; end if;
  if c.provider_session_id is not null and c.provider_session_id<>input_provider_session_id then
    raise exception 'BASIC_TEST_CHECKOUT_SESSION_CONFLICT' using errcode='23505';
  end if;
  update public.basic_test_checkout_requests set provider_session_id=input_provider_session_id,
    status='SESSION_CREATED',updated_at=clock_timestamp() where id=c.id;
  return jsonb_build_object('checkout_request_id',c.id,'status','SESSION_CREATED');
end $function$;
revoke all on function public.complete_basic_test_checkout(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.complete_basic_test_checkout(uuid,text) to service_role;

-- The write guard continues to allow the audited manual trial transition and
-- additionally permits only a matching TEST webhook context.
create or replace function public.guard_billing_activation_write()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $function$
declare tenant uuid; actions jsonb; context_record public.basic_test_billing_write_context%rowtype;
  activation_context text:=current_setting('wuxuai.manual_trial_activation_restaurant',true);
begin
  select restaurant_id into tenant from public.branches where id=coalesce(new.branch_id,old.branch_id);
  select * into context_record from public.basic_test_billing_write_context where transaction_id=txid_current();
  if tg_op='UPDATE' and context_record.subscription_id=old.id and auth.role()='service_role'
    and new.id=old.id and new.branch_id=old.branch_id and new.organization_id=old.organization_id
    and new.plan_key='BASIC' and new.selected_plan='BASIC'
    and new.trial_started_at is not distinct from old.trial_started_at
    and new.trial_ends_at is not distinct from old.trial_ends_at then
    if context_record.action='CHECKOUT_BOUND' and new.subscription_status=old.subscription_status
      and new.status=old.status and new.payment_status='pending'
      and new.stripe_customer_id is not null and new.stripe_subscription_id is not null then return new; end if;
    if context_record.action='PAYMENT_CONFIRMED' and new.subscription_status='active'
      and new.status='active' and new.payment_status='paid' and new.current_period_start is not null
      and new.current_period_end>new.current_period_start
      and new.current_period_ends_at=new.current_period_end
      and new.stripe_customer_id is not null and new.stripe_subscription_id is not null then return new; end if;
    if context_record.action='PAYMENT_FAILED' and new.subscription_status='past_due'
      and new.status='past_due' and new.payment_status='failed' then return new; end if;
    if context_record.action='CANCELLED' and new.subscription_status='cancelled'
      and new.status='cancelled' and new.payment_status in ('failed','paid') then return new; end if;
    raise exception 'BASIC_TEST_PROVIDER_TRANSITION_INVALID' using errcode='42501';
  end if;
  if tg_op='UPDATE' and activation_context=tenant::text
    and public.current_platform_role() in ('platform_owner','platform_admin')
    and public.platform_totp_aal2_verified_internal() then
    if old.status='pending_activation' and old.subscription_status='pending_activation'
      and old.payment_status='not_required' and old.trial_started_at is null
      and old.trial_ends_at is null and old.stripe_customer_id is null
      and old.stripe_subscription_id is null and new.id=old.id
      and new.branch_id=old.branch_id and new.organization_id=old.organization_id
      and new.status='trialing' and new.subscription_status='trialing'
      and new.plan_key='BASIC' and new.selected_plan='BASIC'
      and new.payment_status='not_required' and new.trial_started_at is not null
      and new.trial_ends_at in (new.trial_started_at+interval '1 month',new.trial_started_at+interval '3 months')
      and new.current_period_start=new.trial_started_at and new.current_period_end=new.trial_ends_at
      and new.current_period_ends_at=new.trial_ends_at and new.stripe_customer_id is null
      and new.stripe_subscription_id is null
      and exists(select 1 from public.manual_basic_trial_decisions d where d.restaurant_id=tenant
        and d.subscription_id=new.id and d.starts_at=new.trial_started_at and d.ends_at=new.trial_ends_at) then
      return new;
    end if;
    raise exception 'MANUAL_TRIAL_BILLING_TRANSITION_INVALID' using errcode='42501';
  end if;
  if tg_op='INSERT' then
    if new.subscription_status is distinct from 'pending_activation' or new.status is distinct from 'pending_activation'
      or new.payment_status is distinct from 'not_required' or new.trial_started_at is not null
      or new.trial_ends_at is not null or new.stripe_customer_id is not null
      or new.stripe_subscription_id is not null or new.current_period_start is not null
      or new.current_period_end is not null or new.current_period_ends_at is not null then
      raise exception 'BILLING_PROVIDER_ACTIVATION_REQUIRED' using errcode='42501';
    end if; return new;
  end if;
  if new.id is distinct from old.id or new.branch_id is distinct from old.branch_id
    or new.organization_id is distinct from old.organization_id
    or new.payment_status is distinct from old.payment_status
    or new.stripe_customer_id is distinct from old.stripe_customer_id
    or new.stripe_subscription_id is distinct from old.stripe_subscription_id
    or new.current_period_start is distinct from old.current_period_start
    or new.current_period_end is distinct from old.current_period_end
    or new.current_period_ends_at is distinct from old.current_period_ends_at
    or new.trial_started_at is distinct from old.trial_started_at
    or (new.plan_key is distinct from old.plan_key and new.plan_key<>'BASIC')
    or (new.subscription_status is distinct from old.subscription_status and new.subscription_status not in ('paused','cancelled','unpaid'))
    or (new.status is distinct from old.status and new.status not in ('paused','cancelled','unpaid')) then
    raise exception 'BILLING_PROVIDER_ACTIVATION_REQUIRED' using errcode='42501';
  end if;
  if new.trial_ends_at is distinct from old.trial_ends_at then
    actions:=public.billing_admin_actions_internal(tenant);
    if coalesce((actions->>'extend_trial')::boolean,false) is not true
      or new.status<>'trialing' or new.subscription_status<>'trialing'
      or new.plan_key is distinct from old.plan_key or new.trial_ends_at is null
      or not isfinite(new.trial_ends_at) or new.trial_ends_at<=old.trial_ends_at
      or not exists(select 1 from public.billing_admin_write_context c where c.transaction_id=txid_current()
        and c.subscription_id=old.id and c.actor_id=auth.uid() and c.expected_trial_end=new.trial_ends_at) then
      raise exception 'BILLING_HISTORICAL_TRIAL_REQUIRED' using errcode='42501';
    end if;
  end if;
  return new;
end $function$;
revoke all on function public.guard_billing_activation_write() from public,anon,authenticated,service_role;

create function public.record_basic_stripe_test_event(
  input_event_id text,input_payload_sha256 text,input_event_type text,input_event_created_at timestamptz,
  input_provider_session_id text,input_provider_customer_id text,input_provider_subscription_id text,
  input_restaurant_id uuid,input_acceptance_id uuid,input_provider_status text,
  input_period_start timestamptz,input_period_end timestamptz,input_request_id uuid,input_correlation_id uuid,
  input_livemode boolean
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare prior public.basic_stripe_test_event_inbox%rowtype; c public.basic_test_checkout_requests%rowtype;
  a public.basic_paid_offer_acceptances%rowtype; s public.branch_subscriptions%rowtype;
  result text:='UNMATCHED'; action_value text; result_code text:='CHECKOUT_NOT_FOUND';
begin
  if auth.role() is distinct from 'service_role' or input_livemode is distinct from false
    or input_event_id!~'^evt_[A-Za-z0-9_]{8,160}$' or input_payload_sha256!~'^[0-9a-f]{64}$'
    or input_event_type not in ('checkout.session.completed','customer.subscription.created',
      'customer.subscription.updated','customer.subscription.deleted','invoice.paid','invoice.payment_failed')
    or input_event_created_at is null then
    raise exception 'BASIC_TEST_WEBHOOK_INVALID' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('basic-stripe-event:'||input_event_id,0));
  select * into prior from public.basic_stripe_test_event_inbox where event_id=input_event_id;
  if prior.event_id is not null then
    if prior.payload_sha256<>input_payload_sha256 then
      raise exception 'BASIC_TEST_WEBHOOK_HASH_CONFLICT' using errcode='23505';
    end if;
    return jsonb_build_object('event_id',input_event_id,'status',prior.processing_status,'replay',true);
  end if;
  if input_provider_session_id is not null then
    select * into c from public.basic_test_checkout_requests where provider_session_id=input_provider_session_id for update;
  elsif input_provider_subscription_id is not null then
    select * into c from public.basic_test_checkout_requests where provider_subscription_id=input_provider_subscription_id for update;
  end if;
  if c.id is null and input_acceptance_id is not null then
    select * into c from public.basic_test_checkout_requests
      where acceptance_id=input_acceptance_id and status in ('PREPARED','SESSION_CREATED','COMPLETED')
      order by created_at desc,id desc limit 1 for update;
  end if;
  if c.id is not null then
    select * into a from public.basic_paid_offer_acceptances where id=c.acceptance_id;
    select * into s from public.branch_subscriptions where id=c.subscription_id for update;
  end if;
  if c.id is not null and a.id=input_acceptance_id and a.restaurant_id=input_restaurant_id
    and exists(select 1 from public.platform_test_tenant_registry marker
      where marker.restaurant_id=a.restaurant_id and marker.deleted_at is null) then
    if exists(select 1 from public.basic_stripe_test_event_inbox event
      where event.provider_subscription_id=input_provider_subscription_id
        and event.event_created_at>input_event_created_at and event.processing_status='PROCESSED') then
      result:='STALE'; result_code:='OLDER_THAN_PROCESSED_EVENT';
    elsif input_event_type='checkout.session.completed' and input_provider_customer_id~'^cus_[A-Za-z0-9_]{8,160}$'
      and input_provider_subscription_id~'^sub_[A-Za-z0-9_]{8,160}$' then
      action_value:='CHECKOUT_BOUND'; result:='PROCESSED'; result_code:='CHECKOUT_BOUND';
    elsif input_event_type='invoice.paid'
      and input_provider_customer_id~'^cus_[A-Za-z0-9_]{8,160}$'
      and input_provider_subscription_id~'^sub_[A-Za-z0-9_]{8,160}$'
      and input_period_start is not null
      and input_period_end>input_period_start then
      action_value:='PAYMENT_CONFIRMED'; result:='PROCESSED'; result_code:='BASIC_PAYMENT_CONFIRMED';
    elsif input_event_type='invoice.payment_failed' then
      action_value:='PAYMENT_FAILED'; result:='PROCESSED'; result_code:='BASIC_PAYMENT_FAILED';
    elsif input_event_type='customer.subscription.deleted' then
      action_value:='CANCELLED'; result:='PROCESSED'; result_code:='BASIC_SUBSCRIPTION_CANCELLED';
    else result:='REJECTED'; result_code:='EVENT_NOT_STATE_CHANGING';
    end if;
  end if;
  if action_value is not null then
    insert into public.basic_test_billing_write_context(transaction_id,subscription_id,event_id,action)
    values(txid_current(),s.id,input_event_id,action_value);
    if action_value='CHECKOUT_BOUND' then
      update public.basic_test_checkout_requests set provider_customer_id=input_provider_customer_id,
        provider_subscription_id=input_provider_subscription_id,status='COMPLETED',updated_at=clock_timestamp()
        where id=c.id;
      update public.branch_subscriptions set payment_status='pending',
        stripe_customer_id=input_provider_customer_id,stripe_subscription_id=input_provider_subscription_id where id=s.id;
    elsif action_value='PAYMENT_CONFIRMED' then
      update public.basic_test_checkout_requests set
        provider_customer_id=coalesce(provider_customer_id,input_provider_customer_id),
        provider_subscription_id=coalesce(provider_subscription_id,input_provider_subscription_id),
        status='COMPLETED',updated_at=clock_timestamp() where id=c.id;
      update public.branch_subscriptions set status='active',subscription_status='active',payment_status='paid',
        stripe_customer_id=input_provider_customer_id,stripe_subscription_id=input_provider_subscription_id,
        current_period_start=input_period_start,current_period_end=input_period_end,
        current_period_ends_at=input_period_end where id=s.id;
    elsif action_value='PAYMENT_FAILED' then
      update public.branch_subscriptions set status='past_due',subscription_status='past_due',payment_status='failed' where id=s.id;
    elsif action_value='CANCELLED' then
      update public.branch_subscriptions set status='cancelled',subscription_status='cancelled',
        payment_status=case when payment_status='paid' then 'paid' else 'failed' end where id=s.id;
      update public.basic_test_checkout_requests set status='CANCELLED',updated_at=clock_timestamp() where id=c.id;
    end if;
    delete from public.basic_test_billing_write_context where transaction_id=txid_current();
  end if;
  insert into public.basic_stripe_test_event_inbox(event_id,payload_sha256,event_type,event_created_at,
    provider_session_id,provider_customer_id,provider_subscription_id,restaurant_id,acceptance_id,
    provider_status,period_start,period_end,processing_status,result_code,request_id,correlation_id,
    livemode,environment)
  values(input_event_id,input_payload_sha256,input_event_type,input_event_created_at,
    input_provider_session_id,input_provider_customer_id,input_provider_subscription_id,
    input_restaurant_id,input_acceptance_id,input_provider_status,input_period_start,input_period_end,
    result,result_code,input_request_id,input_correlation_id,false,'TEST');
  if c.id is not null then
    insert into public.audit_log(restaurant_id,actor_type,action,target_table,target_id,metadata)
    values(c.restaurant_id,'system',result_code,'basic_stripe_test_event_inbox',null,
      jsonb_build_object('event_id',input_event_id,'event_type',input_event_type,
        'processing_status',result,'request_id',input_request_id,'correlation_id',input_correlation_id));
  end if;
  return jsonb_build_object('event_id',input_event_id,'status',result,'result_code',result_code,'replay',false);
end $function$;
revoke all on function public.record_basic_stripe_test_event(text,text,text,timestamptz,text,text,text,uuid,uuid,text,timestamptz,timestamptz,uuid,uuid,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.record_basic_stripe_test_event(text,text,text,timestamptz,text,text,text,uuid,uuid,text,timestamptz,timestamptz,uuid,uuid,boolean)
  to service_role;

create or replace function public.require_restaurant_operational(input_restaurant_id uuid,input_action text)
returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $function$
declare state jsonb; grace public.basic_post_trial_redemption_grace%rowtype;
begin
  state:=public.restaurant_activation_state_internal(input_restaurant_id);
  if coalesce((state->>'operational')::boolean,false) then return; end if;
  if input_action in ('secure_redemption_start','secure_redemption_finalize') then
    select * into grace from public.basic_post_trial_redemption_grace
      where restaurant_id=input_restaurant_id and starts_at<=statement_timestamp()
        and ends_at>statement_timestamp();
    if grace.restaurant_id is not null then return; end if;
  end if;
  raise exception 'RESTAURANT_NOT_OPERATIONAL' using errcode='42501';
end $function$;
revoke all on function public.require_restaurant_operational(uuid,text) from public,anon,authenticated,service_role;

create function public.guard_basic_post_trial_growth_write()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare activation_status text;
begin
  activation_status:=public.restaurant_activation_state_internal(new.restaurant_id)->>'status';
  if activation_status is distinct from 'TRIAL_ENDED_PAYMENT_ACCEPTANCE_REQUIRED' then
    return new;
  end if;
  if tg_table_name='points_transactions' then
    if not (new.type='redeem' and new.points<0)
      and not (new.type='adjust' and new.points<=0) then
      raise exception 'POST_TRIAL_NEW_POINTS_BLOCKED' using errcode='42501';
    end if;
  elsif tg_table_name in ('customers','stamp_transactions','customer_points_qr_references',
      'points_collection_requests') then
    raise exception 'POST_TRIAL_GROWTH_BLOCKED' using errcode='42501';
  elsif tg_table_name='restaurant_offers' and (
      tg_op='INSERT' or (new.status='PUBLISHED' and new.is_active
        and not (old.status='PUBLISHED' and old.is_active))) then
    raise exception 'POST_TRIAL_NEW_OFFER_BLOCKED' using errcode='42501';
  end if;
  return new;
end $function$;
revoke all on function public.guard_basic_post_trial_growth_write()
  from public,anon,authenticated,service_role;

create trigger guard_basic_post_trial_customer_insert
before insert on public.customers for each row
execute function public.guard_basic_post_trial_growth_write();
create trigger guard_basic_post_trial_points_insert
before insert on public.points_transactions for each row
execute function public.guard_basic_post_trial_growth_write();
create trigger guard_basic_post_trial_stamps_insert
before insert on public.stamp_transactions for each row
execute function public.guard_basic_post_trial_growth_write();
create trigger guard_basic_post_trial_points_qr_insert
before insert on public.customer_points_qr_references for each row
execute function public.guard_basic_post_trial_growth_write();
create trigger guard_basic_post_trial_points_request_insert
before insert on public.points_collection_requests for each row
execute function public.guard_basic_post_trial_growth_write();
create trigger guard_basic_post_trial_offer_write
before insert or update on public.restaurant_offers for each row
execute function public.guard_basic_post_trial_growth_write();

comment on table public.basic_post_trial_redemption_grace is
  'Technical 60-day redemption-only window. No forfeiture or deletion authorization is implied.';
comment on function public.accept_basic_paid_offer(uuid,text,text,uuid,uuid) is
  'Explicit owner acceptance after BASIC trial expiry; never called automatically by trial expiry.';

notify pgrst,'reload schema';
commit;
